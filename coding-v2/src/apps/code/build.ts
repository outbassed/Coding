import { CODE_FILES, FILE_NAMES, type CodeState } from './model';

/**
 * Montagem do documento que o quadro de visualização executa.
 *
 * Isolamento (a parte que importa): o <iframe> usa `sandbox="allow-scripts"` SEM `allow-same-origin`, então o código do
 * usuário roda numa origem opaca, sem acesso ao armazenamento, aos documentos nem à página do Coding. Além disso o
 * documento começa com uma política CSP que bloqueia qualquer rede (fetch, imagens e scripts externos, formulários,
 * frames), de modo que um projeto também não consegue enviar dados para fora. Esta política vem ANTES de todo o conteúdo
 * do usuário (inclusive de um <head> ou comentário dele), por isso o conteúdo não consegue deslocá-la.
 */
export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";
export const MESSAGE_SOURCE = 'coding-code-console';
export const SANDBOX = 'allow-scripts';

/** Console do quadro → página: console.* e erros viram mensagens que a página mostra. */
const SHIM = `(function(){var S=${JSON.stringify(MESSAGE_SOURCE)};function str(v){if(typeof v==='string')return v;if(v instanceof Error)return v.name+': '+v.message;try{var j=JSON.stringify(v);if(j!==undefined)return j}catch(e){}try{return String(v)}catch(e){return '[objeto]'}}function send(l,a){try{parent.postMessage({source:S,level:l,text:Array.prototype.map.call(a,str).join(' ').slice(0,2000)},'*')}catch(e){}}['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){send(k==='debug'?'log':k,arguments);try{o.apply(console,arguments)}catch(e){}}});window.addEventListener('error',function(e){send('error',[(e.message||'Erro')+(e.lineno?' (linha '+e.lineno+')':'')])});window.addEventListener('unhandledrejection',function(e){send('error',['Promessa rejeitada: '+str(e.reason)])})})();`;

const esc = (code: string, tag: 'script' | 'style'): string => code.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);

const LINK_CSS = /<link\b[^>]*\bhref\s*=\s*["']?(?:\.\/)?style\.css["']?[^>]*>/gi;
const SCRIPT_JS = /<script\b[^>]*\bsrc\s*=\s*["']?(?:\.\/)?script\.js["']?[^>]*>\s*<\/script\s*>/gi;
const hasAttr = (tag: string, name: string): boolean => new RegExp('\\s' + name + '(?=[\\s=>/])', 'i').test(tag);

interface Resolved { html: string; cssUsed: boolean; jsUsed: boolean; deferredJs: boolean }

/** Troca as referências a style.css e script.js pelo conteúdo, como se os arquivos estivessem na mesma pasta. */
function resolveReferences(state: CodeState): Resolved {
  let cssUsed = false, jsUsed = false, deferredJs = false;
  let html = state.html.replace(LINK_CSS, () => { cssUsed = true; return '<style>' + esc(state.css, 'style') + '</style>'; });
  html = html.replace(SCRIPT_JS, (tag) => {
    jsUsed = true;
    // "defer" e "async" não existem em scripts embutidos: o código vai para o fim do documento (mesma ordem de execução).
    if (hasAttr(tag, 'defer') || hasAttr(tag, 'async')) { deferredJs = true; return ''; }
    const module = /\btype\s*=\s*["']?module["']?/i.test(tag) ? ' type="module"' : '';
    return '<script' + module + '>' + esc(state.js, 'script') + '</script>';
  });
  return { html, cssUsed, jsUsed, deferredJs };
}

function assemble(state: CodeState, protectedPreview: boolean): string {
  const r = resolveReferences(state);
  const head = protectedPreview
    ? '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><meta charset="utf-8"><script>' + SHIM + '</script>'
    : '<!doctype html>';
  const css = !r.cssUsed && state.css.trim() ? '<style>' + esc(state.css, 'style') + '</style>' : '';
  const jsAtEnd = (!r.jsUsed && state.js.trim()) || (r.jsUsed && r.deferredJs);
  const js = jsAtEnd ? '<script>' + esc(state.js, 'script') + '</script>' : '';
  return head + css + r.html + js;
}

/** Documento da visualização: com política sem rede e console capturado. */
export const buildPreviewDoc = (state: CodeState): string => assemble(state, true);
/** Página única para baixar: tudo embutido, sem política nem captura de console. */
export const buildStandalone = (state: CodeState): string => assemble(state, false);

export interface ExportFile { name: string; text: string }

/** Arquivos do ZIP. O index.html sempre liga style.css e script.js, mesmo que o usuário não tenha escrito essas linhas. */
export function exportFiles(state: CodeState): ExportFile[] {
  let html = state.html;
  const hasCss = new RegExp(LINK_CSS.source, 'i').test(html);
  const hasJs = new RegExp(SCRIPT_JS.source, 'i').test(html);
  if (!hasCss && state.css.trim()) {
    const link = '<link rel="stylesheet" href="style.css">';
    html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, () => link + '\n</head>') : link + '\n' + html;
  }
  if (!hasJs && state.js.trim()) {
    const tag = '<script src="script.js"></script>';
    html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => tag + '\n</body>') : html + '\n' + tag + '\n';
  }
  if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html>\n' + html;
  return CODE_FILES.map((f) => ({ name: FILE_NAMES[f], text: f === 'html' ? html : state[f] }));
}

/** Só aceita mensagens do console que vieram do nosso quadro e com o formato esperado. */
export interface ConsoleLine { level: 'log' | 'info' | 'warn' | 'error'; text: string }
export function parseConsoleMessage(data: unknown): ConsoleLine | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.source !== MESSAGE_SOURCE || typeof d.text !== 'string') return null;
  const level = d.level === 'warn' || d.level === 'error' || d.level === 'info' ? d.level : 'log';
  return { level, text: d.text.slice(0, 2000) };
}
