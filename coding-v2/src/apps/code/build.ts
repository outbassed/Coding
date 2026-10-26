import { baseName, dirName, entryPage, isHtmlPath, isTextPath, mimeOf, resolveRef, textOf, type CodeState } from './model';

/**
 * Montagem do documento que o quadro de visualização executa.
 *
 * Isolamento (a parte que importa): o <iframe> usa `sandbox="allow-scripts"` SEM `allow-same-origin`, então o código do
 * usuário roda numa origem opaca, sem acesso ao armazenamento, aos documentos nem à página do Coding. Além disso o
 * documento começa com uma política CSP que bloqueia qualquer rede (fetch, imagens e scripts externos, formulários,
 * frames), de modo que um projeto também não consegue enviar dados para fora. Esta política vem ANTES de todo o conteúdo
 * do usuário (inclusive de um <head> ou comentário dele), por isso o conteúdo não consegue deslocá-la.
 *
 * Vários arquivos: não há servidor. Os arquivos do projeto referenciados pela página (CSS, JavaScript clássico, imagens,
 * fontes, SVG) são embutidos no documento; `fetch("dados/x.json")` lê os arquivos de texto do projeto; links para outras
 * páginas HTML do projeto trocam a página mostrada. Módulos ES com `import` entre arquivos NÃO são resolvidos.
 */
export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";
export const MESSAGE_SOURCE = 'coding-code-console';
export const SANDBOX = 'allow-scripts';

export interface BuildContext {
  /** URL `data:` de um recurso binário do projeto (imagem, fonte…), se existir. */
  assetUrl?: (path: string) => string | undefined;
  /** Página a executar; por padrão a do projeto (index.html ou a primeira). */
  page?: string | null;
}
export interface BuildResult { doc: string; page: string | null; warnings: string[] }

const jsonForScript = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Console do quadro → página, navegação entre páginas do projeto e leitura dos arquivos do projeto por fetch. */
function shim(page: string, htmlPaths: string[], files: Record<string, { t: string; m: string }>): string {
  return `(function(){var S=${JSON.stringify(MESSAGE_SOURCE)},P=${jsonForScript(page)},H=${jsonForScript(htmlPaths)},F=${jsonForScript(files)};` +
    `function str(v){if(typeof v==='string')return v;if(v instanceof Error)return v.name+': '+v.message;try{var j=JSON.stringify(v);if(j!==undefined)return j}catch(e){}try{return String(v)}catch(e){return '[objeto]'}}` +
    `function send(l,a){try{parent.postMessage({source:S,level:l,text:Array.prototype.map.call(a,str).join(' ').slice(0,2000)},'*')}catch(e){}}` +
    `['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){send(k==='debug'?'log':k,arguments);try{o.apply(console,arguments)}catch(e){}}});` +
    `window.addEventListener('error',function(e){send('error',[(e.message||'Erro')+(e.lineno?' (linha '+e.lineno+')':'')])});` +
    `window.addEventListener('unhandledrejection',function(e){send('error',['Promessa rejeitada: '+str(e.reason)])});` +
    `function norm(href){if(!href||/^([a-z][a-z0-9+.-]*:|\\/\\/|#)/i.test(href))return null;var h=href.split('#')[0].split('?')[0];var b=h.charAt(0)==='/'?[]:P.split('/').slice(0,-1);var ok=true;h.replace(/^\\//,'').split('/').forEach(function(p){if(p===''||p==='.')return;if(p==='..'){if(!b.length){ok=false;return}b.pop();return}try{p=decodeURIComponent(p)}catch(e){}b.push(p)});return ok?b.join('/'):null}` +
    `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey)return;var p=norm(a.getAttribute('href'));if(p!==null&&H.indexOf(p)>=0){e.preventDefault();try{parent.postMessage({source:S,nav:p},'*')}catch(x){}}},true);` +
    `window.fetch=function(u){var raw=typeof u==='string'?u:(u&&u.url)||String(u);var p=norm(raw);if(p!==null&&Object.prototype.hasOwnProperty.call(F,p))return Promise.resolve(new Response(F[p].t,{status:200,headers:{'content-type':F[p].m}}));return Promise.reject(new TypeError('Sem rede: só arquivos de texto do projeto podem ser lidos com fetch ("'+raw+'" não foi encontrado).'))};` +
    `})();`;
}

const esc = (code: string, tag: 'script' | 'style'): string => code.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);
const ATTR = (name: string): RegExp => new RegExp('(\\s' + name + '\\s*=\\s*)(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
const getAttr = (tag: string, name: string): string | undefined => { const m = ATTR(name).exec(tag); return m ? (m[2] ?? m[3] ?? m[4]) : undefined; };
const setAttr = (tag: string, name: string, value: string): string => tag.replace(ATTR(name), (_m, pre: string) => pre + '"' + value + '"');
const hasFlag = (tag: string, name: string): boolean => new RegExp('\\s' + name + '(?=[\\s=>/])', 'i').test(tag);

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Env { state: CodeState; ctx: BuildContext; warnings: string[]; warned: Set<string> }
const warn = (env: Env, text: string): void => { if (!env.warned.has(text)) { env.warned.add(text); env.warnings.push(text); } };

/** URL `data:` de um arquivo do projeto, ou undefined (externo, inexistente ou grande demais). */
function dataUrl(env: Env, from: string, ref: string): string | undefined {
  const path = resolveRef(from, ref);
  if (path === null) return undefined;
  const t = textOf(env.state, path);
  if (t !== undefined) return 'data:' + mimeOf(path) + ';base64,' + toBase64(new TextEncoder().encode(t));
  const a = env.ctx.assetUrl?.(path);
  if (a) return a;
  if (env.state.assets.some((x) => x.path === path)) return undefined;
  warn(env, 'Arquivo não encontrado: “' + path + '” (usado em ' + from + ').');
  return undefined;
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^)\s;]+))\s*\)?[^;]*;/gi;

function resolveCss(env: Env, css: string, from: string, depth = 0, stack: string[] = []): string {
  let out = css;
  if (depth < 5) {
    out = out.replace(CSS_IMPORT, (whole, a?: string, b?: string, c?: string) => {
      const ref = a ?? b ?? c ?? '';
      const path = resolveRef(from, ref);
      if (path === null) return whole;
      const text = textOf(env.state, path);
      if (text === undefined) { warn(env, 'Arquivo CSS não encontrado: “' + path + '” (@import em ' + from + ').'); return ''; }
      if (stack.includes(path) || path === from) { warn(env, 'Importação circular de CSS em “' + path + '”.'); return ''; }
      return resolveCss(env, text, path, depth + 1, [...stack, from]);
    });
  }
  return out.replace(CSS_URL, (whole, a?: string, b?: string, c?: string) => {
    const ref = a ?? b ?? c ?? '';
    if (/^(data:|#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref.trim())) return whole;
    const url = dataUrl(env, from, ref);
    return url ? 'url("' + url + '")' : whole;
  });
}

/** Referências de uma página a arquivos do projeto (para saber se style.css e script.js já estão ligados). */
export function pageRefs(html: string, page: string): Set<string> {
  const refs = new Set<string>();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) { const h = getAttr(m[0], 'href'); const p = h ? resolveRef(page, h) : null; if (p) refs.add(p); }
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) { const h = getAttr(m[0], 'src'); const p = h ? resolveRef(page, h) : null; if (p) refs.add(p); }
  return refs;
}

/** Conveniência herdada: style.css e script.js da raiz valem para a página inicial mesmo sem <link>/<script>. */
function implicitRoot(state: CodeState, page: string): { css: boolean; js: boolean } {
  if (dirName(page) !== '' || page !== entryPage(state)) return { css: false, js: false };
  const html = textOf(state, page) ?? '';
  const refs = pageRefs(html, page);
  return {
    css: !refs.has('style.css') && (textOf(state, 'style.css') ?? '').trim() !== '',
    js: !refs.has('script.js') && (textOf(state, 'script.js') ?? '').trim() !== ''
  };
}

function resolveHtml(env: Env, html: string, page: string): string {
  const tail: string[] = [];
  // blocos <style> do próprio HTML primeiro (os CSS ligados já chegam resolvidos pelos seus caminhos)
  let out = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, open: string, css: string, close: string) => open + resolveCss(env, css, page, 0, [page]) + close);
  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = getAttr(tag, 'href');
    if (!href || /^(data:|#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(href.trim())) return tag;
    const rel = (getAttr(tag, 'rel') ?? '').toLowerCase();
    if (rel.split(/\s+/).includes('stylesheet')) {
      const path = resolveRef(page, href);
      if (path === null) return tag;
      const text = textOf(env.state, path);
      if (text === undefined) { warn(env, 'Arquivo CSS não encontrado: “' + path + '” (ligado em ' + page + ').'); return ''; }
      return '<style>' + esc(resolveCss(env, text, path, 0, [page]), 'style') + '</style>';
    }
    if (/icon|preload|manifest/.test(rel)) { const u = dataUrl(env, page, href); return u ? setAttr(tag, 'href', u) : tag; }
    return tag;
  });
  out = out.replace(/<script\b([^>]*)>\s*<\/script\s*>/gi, (tag) => {
    const src = getAttr(tag, 'src');
    if (!src || /^(data:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(src.trim())) return tag;
    const path = resolveRef(page, src);
    if (path === null) return tag;
    const text = textOf(env.state, path);
    if (text === undefined) { warn(env, 'Arquivo JavaScript não encontrado: “' + path + '” (ligado em ' + page + ').'); return ''; }
    const isModule = /\btype\s*=\s*["']?module["']?/i.test(tag);
    const inline = '<script' + (isModule ? ' type="module"' : '') + '>' + esc(text, 'script') + '</script>';
    // "defer" e "async" não existem em scripts embutidos: o código vai para o fim do documento (mesma ordem de execução).
    if (hasFlag(tag, 'defer') || hasFlag(tag, 'async')) { tail.push(inline); return ''; }
    return inline;
  });
  out = out.replace(/<(img|source|video|audio|track|embed|input)\b[^>]*>/gi, (tag) => {
    let t = tag;
    for (const name of ['src', 'poster']) {
      const v = getAttr(t, name);
      if (!v || /^(data:|blob:|#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(v.trim())) continue;
      const u = dataUrl(env, page, v);
      if (u) t = setAttr(t, name, u);
    }
    return t;
  });
  return out + tail.join('');
}

function assemble(state: CodeState, ctx: BuildContext, protectedPreview: boolean): BuildResult {
  const warnings: string[] = [];
  const env: Env = { state, ctx, warnings, warned: new Set() };
  const wanted = ctx.page && textOf(state, ctx.page) !== undefined && isHtmlPath(ctx.page) ? ctx.page : entryPage(state);
  if (!wanted) {
    const msg = '<p style="font:16px system-ui;padding:1rem">Este projeto não tem nenhuma página HTML. Crie um arquivo <b>index.html</b> na lista de arquivos.</p>';
    return { doc: (protectedPreview ? '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><meta charset="utf-8">' : '<!doctype html>') + msg, page: null, warnings };
  }
  const implicit = implicitRoot(state, wanted);
  const body = resolveHtml(env, textOf(state, wanted) ?? '', wanted);
  const css = implicit.css ? '<style>' + esc(resolveCss(env, textOf(state, 'style.css') ?? '', 'style.css'), 'style') + '</style>' : '';
  const js = implicit.js ? '<script>' + esc(textOf(state, 'script.js') ?? '', 'script') + '</script>' : '';
  let head = '<!doctype html>';
  if (protectedPreview) {
    // arquivos de texto lidos por fetch: os do projeto, até um limite de tamanho
    const files: Record<string, { t: string; m: string }> = {};
    let budget = 400_000;
    for (const f of state.files) {
      if (f.path === wanted || !isTextPath(f.path) || f.text.length > budget) continue;
      budget -= f.text.length; files[f.path] = { t: f.text, m: mimeOf(f.path) + '; charset=utf-8' };
    }
    head = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><meta charset="utf-8"><script>' +
      shim(wanted, state.files.filter((f) => isHtmlPath(f.path)).map((f) => f.path), files) + '</script>';
  }
  return { doc: head + css + body + js, page: wanted, warnings };
}

/** Documento da visualização: com política sem rede, console capturado e leitura dos arquivos do projeto. */
export const buildPreview = (state: CodeState, ctx: BuildContext = {}): BuildResult => assemble(state, ctx, true);
export const buildPreviewDoc = (state: CodeState, ctx: BuildContext = {}): string => buildPreview(state, ctx).doc;
/** Página única para baixar: tudo embutido, sem política nem captura de console. */
export const buildStandalone = (state: CodeState, ctx: BuildContext = {}): string => assemble(state, ctx, false).doc;

/** Recursos binários que a página (e os CSS dela) podem usar: o nome do arquivo aparece em algum texto do projeto. */
export function usedAssets(state: CodeState): string[] {
  if (!state.assets.length) return [];
  const corpus = state.files.map((f) => f.text).join('\n').toLowerCase();
  return state.assets.filter((a) => corpus.includes(baseName(a.path).toLowerCase())).map((a) => a.path);
}

export interface ExportFile { name: string; text: string }

/** Arquivos de texto do ZIP. A página inicial sempre liga style.css e script.js da raiz, como a visualização faz. */
export function exportFiles(state: CodeState): ExportFile[] {
  const page = entryPage(state);
  const implicit = page ? implicitRoot(state, page) : { css: false, js: false };
  return state.files.map((f) => {
    if (f.path !== page || (!implicit.css && !implicit.js)) return { name: f.path, text: f.text };
    let html = f.text;
    if (implicit.css) {
      const link = '<link rel="stylesheet" href="style.css">';
      html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, () => link + '\n</head>') : link + '\n' + html;
    }
    if (implicit.js) {
      const tag = '<script src="script.js"></script>';
      html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => tag + '\n</body>') : html + '\n' + tag + '\n';
    }
    if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html>\n' + html;
    return { name: f.path, text: html };
  });
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
/** Pedido do quadro para mostrar outra página do projeto (só vale se o arquivo existir e for HTML). */
export function parseNavMessage(data: unknown, state: CodeState): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.source !== MESSAGE_SOURCE || typeof d.nav !== 'string') return null;
  return isHtmlPath(d.nav) && textOf(state, d.nav) !== undefined ? d.nav : null;
}
