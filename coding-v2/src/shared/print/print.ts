import { layoutPage, printCss, type PageBox, type PrintPageSpec } from './layout';

/**
 * Impressão nativa compartilhada (veja IMPRESSAO.md).
 *
 * Um aplicativo declara UMA das duas formas de imprimir:
 *  - `built`: o app entrega as páginas prontas (canvas, imagem, texto) e esta infraestrutura monta uma árvore própria só para a impressão,
 *    esconde todo o resto (menus, cabeçalhos, painéis, botões) e abre a janela nativa do navegador.
 *  - `dom`: o app já tem a folha na tela com CSS `@media print` próprio (Etiquetas, Texto, Planilhas…) e só precisa chamar `window.print()`.
 * Apps sem provedor não têm o que imprimir: Ctrl+P avisa em vez de imprimir a interface.
 */
export interface PrintPage extends PrintPageSpec { el: HTMLElement }
export interface PrintJob { title: string; pages: PrintPage[] }

interface Common {
  /** `false`: o botão e o atalho ficam sem efeito e a pessoa vê `reason()`. */
  enabled?: () => boolean;
  reason?: () => string;
  /** Mensagem ao usuário (por exemplo `doc.say`). Sem isso, um aviso próprio aparece na tela. */
  notify?: (message: string) => void;
}
export interface BuiltProvider extends Common {
  kind: 'built';
  build: () => PrintJob | null | Promise<PrintJob | null>;
  /** Montagem síncrona, usada quando a pessoa imprime pelo menu do navegador (o evento `beforeprint` não espera). */
  buildSync?: () => PrintJob | null;
}
export interface DomProvider extends Common {
  kind: 'dom';
  print?: () => void | Promise<void>;
}
export type PrintProvider = BuiltProvider | DomProvider;

const ROOT_ID = 'coding-print-root';
const STYLE_ID = 'coding-print-style';
const BASE_CSS = [
  '@media screen { #' + ROOT_ID + ' { display: none !important; } }',
  '@media print {',
  '  html[data-print-mode="built"] body > *:not(#' + ROOT_ID + '):not(style):not(script) { display: none !important; }',
  '  html[data-print-mode="built"], html[data-print-mode="built"] body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }',
  '  #' + ROOT_ID + ' { display: block !important; position: static !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #000; background: #fff; }',
  '  #' + ROOT_ID + ' .cp-page { box-sizing: border-box; overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }',
  '  #' + ROOT_ID + ' .cp-page:last-child { break-after: auto; page-break-after: auto; }',
  '  #' + ROOT_ID + ' .cp-page[data-fit="contain"] { display: flex; align-items: center; justify-content: center; }',
  '  #' + ROOT_ID + ' .cp-content { display: block; flex: none; }',
  '  #' + ROOT_ID + ' .cp-content > img, #' + ROOT_ID + ' .cp-content > canvas, #' + ROOT_ID + ' .cp-content > svg { display: block; width: 100%; height: 100%; object-fit: contain; }',
  '  #' + ROOT_ID + ' .cp-page[data-fit="flow"] { overflow: visible; }',
  '  #' + ROOT_ID + ' .cp-notice { font: 14pt/1.5 system-ui, sans-serif; padding: 20mm; }',
  '}'
].join('\n');

let provider: PrintProvider | null = null;
let appId = '';
let mounted: { by: 'request' | 'beforeprint' } | null = null;
let savedTitle: string | null = null;
let toast: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function setPrintProvider(p: PrintProvider | null): void { provider = p; }
export function getPrintProvider(): PrintProvider | null { return provider; }
/** O aplicativo aberto tem como imprimir? (usado pelo menu de contexto) */
export function canPrint(): boolean { return !!provider && (provider.enabled ? provider.enabled() : true); }

function ensureBaseStyle(): void {
  if (document.getElementById(STYLE_ID + '-base')) return;
  const s = document.createElement('style');
  s.id = STYLE_ID + '-base';
  s.textContent = BASE_CSS;
  document.head.append(s);
}
function setJobStyle(css: string): void {
  let s = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!s) { s = document.createElement('style'); s.id = STYLE_ID; document.head.append(s); }
  s.textContent = css;
}

function say(message: string): void {
  if (provider?.notify) { provider.notify(message); return; }
  if (!toast) {
    toast = document.createElement('div');
    toast.dataset.testid = 'print-notice';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);max-width:min(92vw,520px);padding:10px 16px;border-radius:12px;background:#141922;color:#fff;font:600 14px/1.4 system-ui,sans-serif;z-index:2147483000;box-shadow:0 6px 24px #0006;';
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (toast) toast.hidden = true; }, 5000);
}

/** Remove a árvore de impressão e restaura o título e o modo. */
export function clearPrint(): void {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  delete document.documentElement.dataset.printMode;
  if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; }
  mounted = null;
}

function safeTitle(t: string): string { return t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Coding'; }

/** Monta as páginas do trabalho numa árvore própria. Devolve o número de páginas. */
export function mountJob(job: PrintJob, by: 'request' | 'beforeprint' = 'request'): number {
  clearPrint();
  ensureBaseStyle();
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.testid = 'print-job';
  root.setAttribute('aria-hidden', 'true');
  const boxes: PageBox[] = [];
  for (const page of job.pages) {
    const box = layoutPage(page);
    boxes.push(box);
    const wrap = document.createElement('div');
    wrap.className = 'cp-page';
    wrap.dataset.pageKey = box.key;
    wrap.dataset.fit = box.fit;
    wrap.dataset.testid = 'print-page';
    if (box.fit === 'contain') {
      wrap.style.width = box.availW + 'mm';
      wrap.style.height = box.availH + 'mm';
      const content = document.createElement('div');
      content.className = 'cp-content';
      content.style.width = box.contentW + 'mm';
      content.style.height = box.contentH + 'mm';
      content.append(page.el);
      wrap.append(content);
    } else {
      wrap.style.width = box.availW + 'mm';
      wrap.append(page.el);
    }
    root.append(wrap);
  }
  document.body.append(root);
  setJobStyle(printCss(boxes));
  document.documentElement.dataset.printMode = 'built';
  savedTitle = document.title;
  document.title = safeTitle(job.title);
  mounted = { by };
  return job.pages.length;
}

function mountNotice(text: string): void {
  const p = document.createElement('p');
  p.className = 'cp-notice';
  p.textContent = text;
  mountJob({ title: 'Coding', pages: [{ el: p, fit: 'flow' }] }, 'beforeprint');
}

/** Espera as imagens da árvore terminarem de carregar e decodificar: imprimir antes disso sai em branco. */
async function settleImages(): Promise<void> {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#' + ROOT_ID + ' img'));
  await Promise.all(imgs.map(async (img) => { try { await img.decode(); } catch { /* imagem quebrada: a página sai sem ela */ } }));
}

let busy = false;
/** Imprime pelo provedor do aplicativo. Devolve `true` se a janela de impressão foi aberta. */
export async function requestPrint(): Promise<boolean> {
  if (busy) return false;
  const p = provider;
  if (!p) { say('Este aplicativo não tem conteúdo para imprimir.'); return false; }
  if (p.enabled && !p.enabled()) { say(p.reason?.() || 'Não há nada para imprimir agora.'); return false; }
  busy = true;
  try {
    if (p.kind === 'dom') {
      if (p.print) await p.print(); else window.print();
      return true;
    }
    const job = await p.build();
    if (!job || !job.pages.length) { say(p.reason?.() || 'Não há nada para imprimir agora.'); return false; }
    mountJob(job, 'request');
    await settleImages();
    window.print();
    return true;
  } catch (error) {
    clearPrint();
    say('Não foi possível preparar a impressão. ' + (error instanceof Error ? error.message : ''));
    return false;
  } finally { busy = false; }
}

function onBeforePrint(): void {
  if (mounted?.by === 'request') return;
  const p = provider;
  if (!p || p.kind === 'dom') return;
  if (p.enabled && !p.enabled()) { mountNotice(p.reason?.() || 'Não há nada para imprimir agora.'); return; }
  let job: PrintJob | null = null;
  try { job = p.buildSync ? p.buildSync() : null; } catch { job = null; }
  if (job && job.pages.length) mountJob(job, 'beforeprint');
  else mountNotice('Para imprimir este conteúdo, use o botão Imprimir do aplicativo (ou Ctrl+P).');
}
function onAfterPrint(): void { if (mounted) clearPrint(); }

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'p') return;
  // Em diálogos abertos pelo próprio navegador/app, deixa o comportamento padrão.
  event.preventDefault();
  event.stopImmediatePropagation();
  void requestPrint();
}

let installed = false;
/** Liga Ctrl+P / Cmd+P e o tratamento do menu de impressão do navegador. Chame uma vez por página de aplicativo. */
export function installPrint(app: string): void {
  appId = app;
  if (installed) return;
  installed = true;
  ensureBaseStyle();
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  document.addEventListener('keydown', onKeyDown, true);
}
export function printApp(): string { return appId; }

/** Só para testes. */
export function resetPrintForTests(): void {
  provider = null; installed = false; busy = false;
  clearPrint();
  window.removeEventListener('beforeprint', onBeforePrint);
  window.removeEventListener('afterprint', onAfterPrint);
  document.removeEventListener('keydown', onKeyDown, true);
}
