import { tools } from './catalog';
import { LAUNCHER_PATH } from './links';

/**
 * Memória de navegação do Coding (sem servidor, só neste navegador e neste endereço).
 *
 * Guarda, em UM registro pequeno no localStorage, três coisas: `at` (a última atividade real), `here` (a tela ou o
 * aplicativo em uso, com o id do documento) e `origin` (a tela do Launcher de onde um aplicativo foi aberto).
 * Serve a duas funções:
 *  - Retomada (só celular): se o navegador ou o PWA for fechado e reaberto em menos de 20 min da última atividade,
 *    o Launcher volta para `here`; passado esse tempo abre normalmente no Início.
 *  - Voltar à origem: o link "Início" dos aplicativos leva de volta à tela do Launcher de onde vieram.
 *
 * Nunca guarda conteúdo, nunca apaga documentos, favoritos, histórico nem configurações, e só aceita endereços internos
 * conhecidos (lista fechada), o que impede redirecionamentos para qualquer outro lugar.
 */
export const NAV_KEY = 'coding-v2-session';
/** sessionStorage: origem desta aba (vale mais que a do registro quando várias abas estão abertas). */
export const NAV_ORIGIN_KEY = 'coding-v2-origin';
/** sessionStorage: a retomada já foi avaliada nesta aba; impede qualquer repetição ou laço. */
export const NAV_DONE_KEY = 'coding-v2-resume-done';
export const SESSION_TTL_MS = 20 * 60 * 1000;
/** Intervalo mínimo entre gravações por atividade. */
export const WRITE_EVERY_MS = 15_000;

const LAUNCHER_ROUTES: readonly string[] = ['/', '/meus-apps', '/catalogo', '/documentos', '/ajustes'];
const APP_PATHS: ReadonlyMap<string, string> = new Map(tools.flatMap((t) => (t.path ? [[t.path, t.id] as [string, string]] : [])));
const TOOL_IDS: ReadonlySet<string> = new Set(tools.map((t) => t.id));
const DOC_ID = /^[A-Za-z0-9_.:-]{1,120}$/;

export interface Target { kind: 'launcher' | 'app'; url: string; /** Id do documento, quando o endereço é de um app com documento. */ doc: string | null }

/**
 * Valida e normaliza um endereço interno. Só passam: telas conhecidas do Launcher (`/launcher/#/rota`) e páginas de
 * aplicativos do catálogo (`/apps/x/` com, no máximo, `?doc=id`). Qualquer outra coisa (outro site, esquema estranho,
 * rota inexistente, parâmetros extras) vira `null`.
 */
export function normalizeTarget(input: unknown): Target | null {
  if (typeof input !== 'string' || input.length > 400 || !input.startsWith('/') || input.startsWith('//') || /[\\\u0000-\u001f]/.test(input)) return null;
  let url: URL;
  try { url = new URL(input, 'https://coding.invalid'); } catch { return null; }
  if (url.origin !== 'https://coding.invalid') return null;
  if (url.pathname === LAUNCHER_PATH) {
    const route = (url.hash.replace(/^#/, '') || '/').split('?')[0]!;
    const app = /^\/app\/([a-z]+)$/.exec(route);
    if (LAUNCHER_ROUTES.includes(route) || (app && TOOL_IDS.has(app[1]!))) return { kind: 'launcher', url: LAUNCHER_PATH + '#' + route, doc: null };
    return null;
  }
  if (APP_PATHS.has(url.pathname)) {
    const doc = url.searchParams.get('doc');
    if (doc !== null && !DOC_ID.test(doc)) return { kind: 'app', url: url.pathname, doc: null };
    return { kind: 'app', url: url.pathname + (doc ? '?doc=' + encodeURIComponent(doc) : ''), doc: doc || null };
  }
  return null;
}
export const launcherTarget = (input: unknown): string | null => { const t = normalizeTarget(input); return t && t.kind === 'launcher' ? t.url : null; };

export interface NavRecord { at: number; here: string | null; origin: string | null }

export function parseRecord(raw: string | null): NavRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || v.v !== 1 || typeof v.at !== 'number' || !Number.isFinite(v.at) || v.at <= 0) return null;
    const here = normalizeTarget(v.here);
    return { at: v.at, here: here ? here.url : null, origin: launcherTarget(v.origin) };
  } catch { return null; }
}

/** Vale enquanto passaram menos de 20 min desde a última atividade; relógio adiantado demais também invalida. */
export function isFresh(at: number, now: number): boolean {
  const age = now - at;
  return age < SESSION_TTL_MS && age > -SESSION_TTL_MS;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const safe = (get: () => Storage): Store | null => { try { return get(); } catch { return null; } };
export const localStore = (): Store | null => safe(() => localStorage);
export const sessionStore = (): Store | null => safe(() => sessionStorage);

export function readRecord(store: Store | null = localStore()): NavRecord | null {
  try { return parseRecord(store?.getItem(NAV_KEY) ?? null); } catch { return null; }
}
/** Registro só se ainda estiver dentro dos 20 min. */
export function readFresh(now: number, store: Store | null = localStore()): NavRecord | null {
  const rec = readRecord(store);
  return rec && isFresh(rec.at, now) ? rec : null;
}

/**
 * Registra atividade em `now` e, se pedido, troca `here` e/ou `origin`. Se o registro anterior já tinha vencido, ele é
 * descartado por inteiro (inclusive a origem antiga) e recomeça agora.
 */
export function touch(now: number, patch: { here?: string | null; origin?: string | null } = {}, store: Store | null = localStore()): void {
  if (!store) return;
  try {
    const cur = readRecord(store);
    const base: NavRecord = cur && isFresh(cur.at, now) ? cur : { at: now, here: null, origin: null };
    const here = patch.here !== undefined ? (patch.here === null ? null : normalizeTarget(patch.here)?.url ?? base.here) : base.here;
    const origin = patch.origin !== undefined ? launcherTarget(patch.origin) : base.origin;
    store.setItem(NAV_KEY, JSON.stringify({ v: 1, at: now, here, origin }));
  } catch { /* armazenamento indisponível ou cheio: a navegação segue sem memória */ }
}

// --------------------------------------------------------------------------------------------- retomada (celular)
/** Celular: toque como ponteiro principal e tela pequena. Tablets e computadores não retomam. */
export function isPhone(win: { matchMedia?: Window['matchMedia']; screen?: { width: number; height: number } } = window): boolean {
  try {
    const coarse = !!win.matchMedia?.('(pointer: coarse)').matches;
    const small = !!win.screen && Math.min(win.screen.width, win.screen.height) < 768;
    return coarse && small;
  } catch { return false; }
}

export interface ResumeContext {
  now: number;
  phone: boolean;
  /** Entrada "fria": o navegador/PWA acabou de abrir, sem link, recarga nem navegação interna. */
  coldEntry: boolean;
  /** O endereço aberto foi pedido explicitamente (tem rota no hash ou parâmetros)? Então ele manda. */
  explicit: boolean;
}

/** Para onde retomar, ou `null` para abrir normalmente no Início. */
export function decideResume(rec: NavRecord | null, ctx: ResumeContext): string | null {
  if (!ctx.phone || !ctx.coldEntry || ctx.explicit || !rec || !isFresh(rec.at, ctx.now) || !rec.here) return null;
  const t = normalizeTarget(rec.here);
  if (!t) return null;
  if (t.kind === 'launcher' && t.url === LAUNCHER_PATH + '#/') return null; // já é onde abre
  return t.url;
}

/** Entrada fria = nova navegação (não recarga nem histórico), sem página de origem ou vinda da tela de abertura `/`. */
export function isColdEntry(navType: string | undefined, referrer: string): boolean {
  if (navType !== undefined && navType !== 'navigate') return false;
  if (!referrer) return true;
  try { const r = new URL(referrer); return r.origin === location.origin && (r.pathname === '/' || r.pathname === '/index.html'); } catch { return false; }
}

// --------------------------------------------------------------------------------------------- voltar à origem
export interface OriginContext {
  navType: string | undefined;
  /** Caminho (sem domínio) da página que levou até aqui, ou '' se nenhuma. */
  referrerPath: string;
  record: NavRecord | null; // já filtrado por 20 min
  sessionOrigin: string | null;
}

/**
 * Decide a origem ao carregar um aplicativo:
 *  - veio do Launcher: a tela do Launcher em uso (guardada em `here`);
 *  - recarga, histórico, outro app ou retomada: mantém a origem que já existia;
 *  - acesso direto (sem página de origem): nenhuma. Nada de inventar uma origem falsa.
 */
export function resolveOrigin(c: OriginContext): string | null {
  const kept = launcherTarget(c.sessionOrigin) ?? c.record?.origin ?? null;
  if (c.navType === 'reload' || c.navType === 'back_forward') return kept;
  if (c.referrerPath === LAUNCHER_PATH) {
    const here = c.record?.here ? normalizeTarget(c.record.here) : null;
    if (here && here.kind === 'launcher') return here.url;
    return kept; // retomada: a origem original continua valendo
  }
  if (APP_PATHS.has(c.referrerPath)) return kept; // de um app para outro (ex.: Visualizador → Código)
  return null;
}

/** Rótulo curto da origem, para dica do botão voltar. */
export function originLabel(origin: string): string {
  const route = origin.replace(LAUNCHER_PATH + '#', '');
  if (route === '/') return 'Início';
  if (route === '/meus-apps') return 'Meus apps';
  if (route === '/catalogo') return 'Catálogo';
  if (route === '/documentos') return 'Documentos';
  if (route === '/ajustes') return 'Ajustes';
  const id = /^\/app\/(.+)$/.exec(route)?.[1];
  const tool = tools.find((t) => t.id === id);
  return tool ? 'Detalhes de ' + tool.name : 'Início';
}

/** O link leva ao Launcher (Início ou detalhes de um app)? Só esses são "voltar" e podem ser trocados pela origem. */
export function isBackToLauncher(href: string, base: string): boolean {
  try {
    const u = new URL(href, base);
    return u.origin === new URL(base).origin && u.pathname === LAUNCHER_PATH && (u.hash === '#/' || /^#\/app\/[a-z]+$/.test(u.hash));
  } catch { return false; }
}
