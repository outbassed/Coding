/**
 * Preferências pequenas da área de trabalho, em localStorage (leitura síncrona): abas abertas por app, projeto ativo,
 * comportamento ao abrir e limites de projetos. Os documentos e arquivos grandes ficam no IndexedDB, nunca aqui.
 * Toda leitura é defensiva: dado ausente, corrompido ou sem acesso ao armazenamento volta ao padrão sem lançar erro.
 */
import { DEFAULT_RECOMMENDATION, DEFAULT_SETTINGS, isTier, normalizeLimitSettings, recommendTier, type LimitSettings, type Signals, type Tier } from './limits';
import { closeMany, normalizeTabs, type TabsState } from './tabs';

export interface KV { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; readonly length: number; key(index: number): string | null }
const store = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export const TABS_PREFIX = 'coding-v2-tabs:';
export const LIMITS_KEY = 'coding-v2-limits';
export const RECOMMENDED_KEY = 'coding-v2-limit-recommended';
export const STARTUP_KEY = 'coding-v2-startup';

function readJson(key: string, kv: KV | null): unknown {
  try { const raw = kv?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown, kv: KV | null): boolean {
  try { kv?.setItem(key, JSON.stringify(value)); return !!kv; } catch { return false; }
}

// ---- abas
export const loadTabs = (appKey: string, kv: KV | null = store()): TabsState => normalizeTabs(readJson(TABS_PREFIX + appKey, kv));
export const saveTabs = (appKey: string, state: TabsState, kv: KV | null = store()): boolean => writeJson(TABS_PREFIX + appKey, state, kv);
/** Lê, aplica a mudança e grava na hora (síncrono: duas janelas só colidem se gravarem no mesmo instante). */
export function updateTabs(appKey: string, change: (s: TabsState) => TabsState, kv: KV | null = store()): TabsState {
  const next = change(loadTabs(appKey, kv));
  saveTabs(appKey, next, kv);
  return next;
}
/** Documento excluído: some das abas de qualquer app. */
export function forgetDocument(id: string, kv: KV | null = store()): void {
  if (!kv) return;
  const keys: string[] = [];
  for (let i = 0; i < kv.length; i++) { const k = kv.key(i); if (k && k.startsWith(TABS_PREFIX)) keys.push(k); }
  for (const key of keys) {
    const current = normalizeTabs(readJson(key, kv));
    if (current.open.some((t) => t.id === id)) writeJson(key, closeMany(current, [id]), kv);
  }
}

// ---- ao abrir
export type Startup = 'continue' | 'library' | 'new';
export const STARTUP_OPTIONS: readonly { id: Startup; label: string; help: string }[] = [
  { id: 'continue', label: 'Continuar de onde parei', help: 'Cada app abre no último projeto em que você estava.' },
  { id: 'new', label: 'Começar um projeto novo', help: 'Cada app abre em branco. Seus projetos abertos continuam nas abas.' },
  { id: 'library', label: 'Abrir pela Biblioteca', help: 'O app abre em branco e você escolhe o projeto na Biblioteca.' }
];
export function getStartup(kv: KV | null = store()): Startup {
  try { const v = kv?.getItem(STARTUP_KEY); return v === 'new' || v === 'library' ? v : 'continue'; } catch { return 'continue'; }
}
export function setStartup(value: Startup, kv: KV | null = store()): void { try { kv?.setItem(STARTUP_KEY, value); } catch { /* sem armazenamento */ } }
/** Documento a reabrir automaticamente neste app, ou nulo. */
export function restoreTarget(appKey: string, kv: KV | null = store()): string | null {
  if (getStartup(kv) !== 'continue') return null;
  return loadTabs(appKey, kv).active;
}

// ---- limites
export const loadLimitSettings = (kv: KV | null = store()): LimitSettings => {
  const raw = readJson(LIMITS_KEY, kv);
  return raw ? normalizeLimitSettings(raw) : { ...DEFAULT_SETTINGS, overrides: {} };
};
export const saveLimitSettings = (settings: LimitSettings, kv: KV | null = store()): boolean => writeJson(LIMITS_KEY, normalizeLimitSettings(settings), kv);
export function loadRecommended(kv: KV | null = store()): Tier {
  try { const n = Number(kv?.getItem(RECOMMENDED_KEY)); return isTier(n) && n <= 128 ? n : DEFAULT_RECOMMENDATION; } catch { return DEFAULT_RECOMMENDATION; }
}

/** Reúne os sinais do navegador, quando existem. Nenhum deles mede memória ou espaço livre reais. */
export async function readSignals(): Promise<Signals> {
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number };
  let quotaBytes: number | null = null;
  try { const est = await nav.storage?.estimate?.(); if (est && typeof est.quota === 'number') quotaBytes = est.quota; } catch { /* sem estimativa */ }
  let coarse: boolean | null = null;
  try { coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : null; } catch { /* sem matchMedia */ }
  return { deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null, cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null, quotaBytes, coarsePointer: coarse };
}
/** Recalcula e guarda a sugestão automática (chamar ao abrir o Launcher e os apps; não bloqueia nada). */
export async function refreshRecommendation(kv: KV | null = store()): Promise<Tier> {
  const tier = recommendTier(await readSignals());
  try { kv?.setItem(RECOMMENDED_KEY, String(tier)); } catch { /* sem armazenamento */ }
  return tier;
}
