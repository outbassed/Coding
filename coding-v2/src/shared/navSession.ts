import type { Router } from 'vue-router';
import { copyExists } from './copyExists';
import { LAUNCHER_PATH } from './links';
import {
  NAV_DONE_KEY, NAV_ORIGIN_KEY, WRITE_EVERY_MS, decideResume, isBackToLauncher, isColdEntry, isPhone, launcherTarget,
  normalizeTarget, originLabel, readFresh, readRecord, resolveOrigin, sessionStore, touch
} from './navMemory';

/** Parte do navegador da memória de navegação: eventos, redirecionamentos e o link "voltar". A lógica pura está em navMemory.ts. */

const navType = (): string | undefined => (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;

/**
 * Registra a atividade real (toque, tecla, rolagem, volta ao app) sem gravar a cada movimento: no máximo uma gravação
 * a cada 15 s, mais uma ao esconder ou fechar a página. `getHere` devolve a tela atual (ou undefined para não trocar).
 */
export function trackActivity(getHere: () => string | null | undefined, now: () => number = Date.now): () => void {
  let latest = now();
  let lastWrite = 0;
  let pending = 0;
  let lastHere: string | null = null;
  const write = (): void => {
    clearTimeout(pending); pending = 0; lastWrite = now();
    const here = getHere();
    if (here) lastHere = here;
    touch(latest, { here });
  };
  const mark = (): void => {
    latest = now();
    const wait = WRITE_EVERY_MS - (latest - lastWrite);
    if (wait <= 0) write();
    else if (!pending) pending = window.setTimeout(write, wait);
  };
  const onHide = (): void => { if (document.visibilityState === 'hidden') write(); };
  const onShow = (event: PageTransitionEvent): void => { if (event.persisted) { mark(); write(); } };
  const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
  for (const name of events) window.addEventListener(name, mark, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', write);
  window.addEventListener('pageshow', onShow);
  write(); // abrir a página já conta como atividade
  // O app troca o endereço sozinho quando cria o documento (?doc=): grava a mudança sem esperar a próxima atividade.
  const watch = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const here = getHere();
    if (here && here !== lastHere) write();
  }, 2000);
  return () => {
    clearInterval(watch);
    for (const name of events) window.removeEventListener(name, mark, { capture: true } as EventListenerOptions);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', write);
    window.removeEventListener('pageshow', onShow);
    clearTimeout(pending);
  };
}

// --------------------------------------------------------------------------------------------- Launcher
/**
 * Antes de montar o Launcher: no celular, entrada fria e sem endereço pedido, volta à tela ou ao aplicativo (com o
 * documento) da última sessão com menos de 20 min. Devolve `true` se saiu para outra página (não montar o Launcher).
 * Avaliada uma única vez por aba, o que impede qualquer laço de redirecionamento.
 */
export async function resumeAtStartup(): Promise<boolean> {
  const session = sessionStore();
  try { if (session?.getItem(NAV_DONE_KEY)) return false; session?.setItem(NAV_DONE_KEY, '1'); } catch { /* sem sessionStorage: segue */ }
  const now = Date.now();
  const target = decideResume(readRecord(), {
    now,
    phone: isPhone(),
    coldEntry: isColdEntry(navType(), document.referrer),
    explicit: (location.hash !== '' && location.hash !== '#') || location.search !== ''
  });
  if (!target) return false;
  const t = normalizeTarget(target);
  if (!t) return false;
  if (t.kind === 'launcher') { history.replaceState(null, '', t.url); return false; }
  if (t.doc && !(await copyExists(t.doc))) return false; // documento apagado: abre o Início, não uma tela de erro
  location.replace(t.url);
  return true;
}

/** Depois de montar o Launcher: acompanha a tela atual (para retomar e para saber a origem dos apps). */
export function installLauncherNavMemory(router: Router): void {
  const here = (): string | undefined => {
    const route = router.currentRoute.value;
    if (!route.matched.length || route.name === 'not-found') return undefined; // ainda sem rota, ou tela de erro: nunca guarda
    return launcherTarget(LAUNCHER_PATH + '#' + route.path) ?? undefined;
  };
  trackActivity(here);
  router.afterEach(() => { touch(Date.now(), { here: here() }); });
}

// --------------------------------------------------------------------------------------------- aplicativos
function currentOrigin(): string | null {
  const rec = readFresh(Date.now());
  if (!rec) return null; // sessão vencida: nunca reaproveita uma origem antiga
  let stored: string | null = null;
  try { stored = launcherTarget(sessionStore()?.getItem(NAV_ORIGIN_KEY) ?? null); } catch { /* ignora */ }
  return stored ?? rec.origin;
}

function onBackClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
  if (!isBackToLauncher(link.href, location.href)) return;
  const origin = currentOrigin();
  if (!origin || new URL(link.href).hash === new URL(origin, location.origin).hash) return;
  event.preventDefault();
  location.assign(origin);
}

/** Troca só o rótulo acessível e a dica do botão voltar (o texto visível e o endereço original continuam). */
function labelBackLinks(): void {
  const origin = currentOrigin();
  if (!origin) return;
  const label = originLabel(origin);
  if (label === 'Início') return;
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (!isBackToLauncher(a.href, location.href) || a.dataset.navLabeled) return;
    a.dataset.navLabeled = '1';
    a.title = 'Voltar para ' + label;
    a.setAttribute('aria-label', 'Voltar para ' + label);
  });
}

/**
 * Chamada uma vez por aplicativo, depois de montar. Registra onde o app está (com o documento), de onde ele foi aberto
 * e faz o link "Início" voltar à tela de origem do Launcher. Não mexe na lógica nem na tela do aplicativo.
 */
export function installAppNavMemory(): void {
  const now = Date.now();
  let referrerPath = '';
  try { const r = new URL(document.referrer); if (r.origin === location.origin) referrerPath = r.pathname; } catch { /* sem referrer */ }
  const session = sessionStore();
  let sessionOrigin: string | null = null;
  try { sessionOrigin = session?.getItem(NAV_ORIGIN_KEY) ?? null; } catch { /* ignora */ }
  const origin = resolveOrigin({ navType: navType(), referrerPath, record: readFresh(now), sessionOrigin });
  touch(now, { here: normalizeTarget(location.pathname + location.search)?.url, origin });
  try { if (origin) session?.setItem(NAV_ORIGIN_KEY, origin); else session?.removeItem(NAV_ORIGIN_KEY); } catch { /* ignora */ }

  trackActivity(() => normalizeTarget(location.pathname + location.search)?.url);
  document.addEventListener('click', onBackClick, true);

  labelBackLinks();
  const observer = new MutationObserver(labelBackLinks);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 6000);
}

