/**
 * Limites de tamanho de arquivos importados (hoje usados pelo Versos: música/vídeo de referência e imagens de fundo).
 * Ficam nos Ajustes do Launcher (Ajustes → Projetos), em localStorage, e valem para qualquer app que importe mídia.
 *
 * Padrões conservadores. Dá para alterar cada valor ou desligar a verificação por completo. Desligar NÃO remove os limites
 * reais do navegador e do aparelho (memória, codecs, espaço): o app só deixa de bloquear por tamanho e continua tratando os erros.
 */
import type { KV } from './prefs';

export const IMPORT_LIMITS_KEY = 'coding-v2-import-limits';
export type ImportKind = 'audio' | 'video' | 'image';
export interface SizeRule { /** Acima disso, só avisa (MB). */ warn: number; /** Acima disso, bloqueia (MB). */ max: number }
export interface ImportLimits { v: 1; enabled: boolean; audio: SizeRule; video: SizeRule; image: SizeRule }

export const MB = 1024 * 1024;
export const MIN_LIMIT_MB = 1;
export const MAX_LIMIT_MB = 20_480;
export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  v: 1, enabled: true,
  audio: { warn: 20, max: 100 },
  video: { warn: 100, max: 500 },
  image: { warn: 10, max: 40 }
};
export const KIND_LABEL: Record<ImportKind, string> = { audio: 'áudio', video: 'vídeo', image: 'imagem' };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
function rule(raw: unknown, fallback: SizeRule): SizeRule {
  const r = obj(raw);
  const pick = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_LIMIT_MB, Math.max(MIN_LIMIT_MB, Math.round(v * 10) / 10)) : d);
  const max = pick(r.max, fallback.max);
  return { warn: Math.min(pick(r.warn, fallback.warn), max), max };
}
export function normalizeImportLimits(raw: unknown): ImportLimits {
  const s = obj(raw), d = DEFAULT_IMPORT_LIMITS;
  return { v: 1, enabled: s.enabled !== false, audio: rule(s.audio, d.audio), video: rule(s.video, d.video), image: rule(s.image, d.image) };
}
const store = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
export function loadImportLimits(kv: KV | null = store()): ImportLimits {
  try { const raw = kv?.getItem(IMPORT_LIMITS_KEY); return normalizeImportLimits(raw ? JSON.parse(raw) : null); } catch { return normalizeImportLimits(null); }
}
export function saveImportLimits(limits: ImportLimits, kv: KV | null = store()): boolean {
  try { if (!kv) return false; kv.setItem(IMPORT_LIMITS_KEY, JSON.stringify(normalizeImportLimits(limits))); return true; } catch { return false; }
}
export function resetImportLimits(kv: KV | null = store()): ImportLimits {
  try { kv?.removeItem(IMPORT_LIMITS_KEY); } catch { /* sem acesso: segue com os padrões */ }
  return normalizeImportLimits(null);
}

export const formatMB = (bytes: number): string => {
  const mb = bytes / MB;
  return (mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10).toString().replace('.', ',') + ' MB';
};
export interface ImportCheck { level: 'ok' | 'warn' | 'block'; message: string }
/** Decide se um arquivo pode ser importado. Com os limites desligados nunca bloqueia nem avisa por tamanho. */
export function checkImport(kind: ImportKind, bytes: number, limits: ImportLimits): ImportCheck {
  if (!limits.enabled) return { level: 'ok', message: '' };
  const r = limits[kind], label = KIND_LABEL[kind];
  if (bytes > r.max * MB) {
    return { level: 'block', message: 'Este arquivo de ' + label + ' tem ' + formatMB(bytes) + ' e passa do limite de ' + r.max.toString().replace('.', ',') + ' MB. Você pode mudar ou desligar o limite em Ajustes → Projetos.' };
  }
  if (bytes > r.warn * MB) {
    return { level: 'warn', message: 'Arquivo grande (' + formatMB(bytes) + '): pode demorar para abrir e usar bastante memória.' };
  }
  return { level: 'ok', message: '' };
}
