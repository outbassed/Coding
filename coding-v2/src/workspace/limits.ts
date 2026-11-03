/**
 * Limite de projetos SALVOS por app (contagem, não bytes). Cada app tem o seu limite e a sua contagem:
 * nunca existe um limite somado de todos os apps. Valores permitidos: 32, 64, 128, 256, 512 e 1024.
 *
 * Modo Automático: sugere 32, 64 ou 128 a partir de sinais "no melhor esforço" do navegador. Esses sinais NÃO medem a
 * memória real nem o espaço livre garantido (muitos navegadores nem os informam); sem sinais, a sugestão é 64.
 * Modo Manual: uma preferência global (valor aplicado a cada app separadamente) e, se o usuário quiser, um valor próprio por app.
 * Nenhum limite apaga documentos: um valor menor que a quantidade já salva nunca é aceito, e no Automático o limite efetivo
 * sobe para a próxima faixa que comporte o que já existe.
 */
export const TIERS = [32, 64, 128, 256, 512, 1024] as const;
export type Tier = typeof TIERS[number];
export const MAX_TIER: Tier = 1024;
export const DEFAULT_RECOMMENDATION: Tier = 64;

export type LimitMode = 'auto' | 'manual';
export interface LimitSettings { v: 1; mode: LimitMode; tier: Tier; overrides: Record<string, Tier> }
export const DEFAULT_SETTINGS: LimitSettings = { v: 1, mode: 'auto', tier: 64, overrides: {} };

export const isTier = (value: unknown): value is Tier => typeof value === 'number' && (TIERS as readonly number[]).includes(value);

export function normalizeLimitSettings(raw: unknown): LimitSettings {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const overrides: Record<string, Tier> = {};
  if (s.overrides && typeof s.overrides === 'object' && !Array.isArray(s.overrides)) {
    for (const [key, value] of Object.entries(s.overrides as Record<string, unknown>)) {
      if (/^[a-z][a-z0-9-]{0,30}$/.test(key) && isTier(value)) overrides[key] = value;
    }
  }
  return { v: 1, mode: s.mode === 'manual' ? 'manual' : 'auto', tier: isTier(s.tier) ? s.tier : 64, overrides };
}

export interface Signals {
  /** navigator.deviceMemory (GB, valor arredondado e limitado a 8 pelos navegadores). */
  deviceMemory?: number | null;
  cores?: number | null;
  /** navigator.storage.estimate().quota, em bytes. */
  quotaBytes?: number | null;
  /** Ponteiro grosseiro (toque) costuma indicar celular ou tablet. */
  coarsePointer?: boolean | null;
}
const GB = 1024 ** 3;
/** Sugestão conservadora. Só sobe para 128 com vários sinais fortes; só desce para 32 com sinais claros de pouco recurso. */
export function recommendTier(signals: Signals): Tier {
  const memory = typeof signals.deviceMemory === 'number' && signals.deviceMemory > 0 ? signals.deviceMemory : null;
  const cores = typeof signals.cores === 'number' && signals.cores > 0 ? signals.cores : null;
  const quota = typeof signals.quotaBytes === 'number' && signals.quotaBytes > 0 ? signals.quotaBytes : null;
  const weak = (memory !== null && memory <= 2) || (quota !== null && quota < 1 * GB) || (cores !== null && cores <= 2);
  if (weak) return 32;
  const strong = [memory !== null && memory >= 8, cores !== null && cores >= 8, quota !== null && quota >= 8 * GB].filter(Boolean).length;
  if (strong >= 2 && signals.coarsePointer !== true) return 128;
  return DEFAULT_RECOMMENDATION;
}

/** Menor faixa que comporta a quantidade já salva; nulo se passar de 1024. */
export function minTierFor(saved: number): Tier | null {
  const n = Math.max(0, Math.floor(saved));
  return TIERS.find((t) => t >= n) ?? null;
}

export interface TierOption { tier: Tier; disabled: boolean; reason: string }
/** Todas as faixas ficam visíveis; as menores que a quantidade salva ficam desativadas, com o motivo. */
export function tierOptions(saved: number): TierOption[] {
  const n = Math.max(0, Math.floor(saved));
  return TIERS.map((tier) => {
    const blocked = tier < n && tier !== MAX_TIER;
    return {
      tier, disabled: blocked,
      reason: blocked ? 'Você tem ' + n + (n === 1 ? ' projeto salvo' : ' projetos salvos') + ' neste app; o limite não pode ficar abaixo disso. Exclua projetos para liberar esta opção.' : ''
    };
  });
}

export interface Effective {
  limit: Tier;
  /** O que foi pedido (automático, global ou do app). */
  requested: Tier;
  source: 'auto' | 'manual' | 'app';
  /** O limite efetivo foi elevado porque já existem mais projetos salvos que o valor pedido. */
  elevated: boolean;
  used: number;
  free: number;
  full: boolean;
}
export function effectiveLimit(settings: LimitSettings, appKey: string, saved: number, recommended: Tier = DEFAULT_RECOMMENDATION): Effective {
  const override = settings.overrides[appKey];
  const source: Effective['source'] = override ? 'app' : settings.mode === 'manual' ? 'manual' : 'auto';
  const requested: Tier = override ?? (settings.mode === 'manual' ? settings.tier : recommended);
  const used = Math.max(0, Math.floor(saved));
  const min = minTierFor(used) ?? MAX_TIER;
  const limit: Tier = requested >= min ? requested : min;
  return { limit, requested, source, elevated: limit !== requested, used, free: Math.max(0, limit - used), full: used >= limit };
}
export const canAdd = (e: Effective, adding = 1): boolean => e.used + adding <= e.limit;

export function explainElevation(e: Effective): string {
  return e.elevated
    ? 'O limite pedido era ' + e.requested + ', mas há ' + e.used + ' projetos salvos; o limite efetivo é ' + e.limit + '. Nada foi apagado.'
    : '';
}
export function explainFull(e: Effective): string {
  return e.full
    ? 'Este app chegou ao limite de ' + e.limit + ' projetos salvos. Exclua um projeto para liberar uma vaga' + (e.limit < MAX_TIER ? ' ou aumente o limite em Ajustes.' : '.')
    : '';
}

export type ChooseResult = { ok: true; settings: LimitSettings } | { ok: false; error: string };
/** Define o valor de um app (ou o global, com appKey nulo). Recusa valores abaixo da quantidade salva. */
export function chooseTier(settings: LimitSettings, appKey: string | null, tier: number, saved: number): ChooseResult {
  if (!isTier(tier)) return { ok: false, error: 'Escolha um dos valores permitidos: ' + TIERS.join(', ') + '.' };
  if (tier < saved && tier !== MAX_TIER) return { ok: false, error: 'Há ' + saved + ' projetos salvos; o limite não pode ser ' + tier + '.' };
  if (appKey === null) return { ok: true, settings: { ...settings, mode: 'manual', tier } };
  return { ok: true, settings: { ...settings, overrides: { ...settings.overrides, [appKey]: tier } } };
}
export const clearOverride = (settings: LimitSettings, appKey: string): LimitSettings => {
  const overrides = { ...settings.overrides };
  delete overrides[appKey];
  return { ...settings, overrides };
};
export const useAutomatic = (settings: LimitSettings): LimitSettings => ({ ...settings, mode: 'auto' });

/** Tipo gravado no documento → chave do app (o tipo antigo "sheet" pertence a Etiquetas). */
export function appKeyForType(type: unknown): string {
  if (typeof type !== 'string' || !type) return 'outros';
  return type === 'sheet' ? 'labels' : type;
}

export class LimitReached extends Error {
  readonly limit: number;
  constructor(limit: number, app = 'neste app') {
    super('Limite de ' + limit + ' projetos salvos ' + app + ' atingido. Exclua um projeto na Biblioteca ou aumente o limite em Ajustes (até 1024). Nada foi salvo pela metade.');
    this.name = 'LimitReached';
    this.limit = limit;
  }
}
