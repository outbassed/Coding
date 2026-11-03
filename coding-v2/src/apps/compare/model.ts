import { DEFAULT_OPTIONS, type TextOptions } from './diff';

export const MAX_TEXT_CHARS = 2_000_000;
export const MAX_BINARY_BYTES = 50 * 1024 * 1024;
export type SourceKind = 'empty' | 'text' | 'binary';
export interface Source { name: string; kind: SourceKind; text: string; size: number; blobId: string }
export type ViewMode = 'side' | 'unified';
export interface CompareState { name: string; a: Source; b: Source; options: TextOptions; view: ViewMode; onlyDiffs: boolean }

export const emptySource = (name = ''): Source => ({ name, kind: 'empty', text: '', size: 0, blobId: '' });
export const textSource = (name: string, text: string): Source => ({ name, kind: text === '' ? 'empty' : 'text', text, size: new TextEncoder().encode(text).length, blobId: '' });
export const emptyCompare = (name = 'Comparação de arquivos'): CompareState => ({ name, a: emptySource('Arquivo A'), b: emptySource('Arquivo B'), options: { ...DEFAULT_OPTIONS }, view: 'side', onlyDiffs: false });

function normalizeSource(raw: unknown, fallbackName: string): Source {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const name = typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 160) : fallbackName;
  const blobId = typeof s.blobId === 'string' ? s.blobId.slice(0, 80) : '';
  const text = typeof s.text === 'string' ? s.text.slice(0, MAX_TEXT_CHARS) : '';
  const size = typeof s.size === 'number' && Number.isFinite(s.size) && s.size >= 0 ? Math.floor(s.size) : 0;
  if (s.kind === 'binary' && blobId) return { name, kind: 'binary', text: '', size, blobId };
  if (text !== '') return { name, kind: 'text', text, size: size || new TextEncoder().encode(text).length, blobId: '' };
  return { name, kind: 'empty', text: '', size: 0, blobId: '' };
}
export function normalizeCompare(raw: unknown): CompareState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const o = (s.options && typeof s.options === 'object' ? s.options : {}) as Record<string, unknown>;
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Comparação de arquivos',
    a: normalizeSource(s.a, 'Arquivo A'),
    b: normalizeSource(s.b, 'Arquivo B'),
    options: { ignoreCase: o.ignoreCase === true, ignoreSpace: o.ignoreSpace === true, ignoreBlank: o.ignoreBlank === true },
    view: s.view === 'unified' ? 'unified' : 'side',
    onlyDiffs: s.onlyDiffs === true
  };
}
export const bothTextual = (state: CompareState): boolean => state.a.kind !== 'binary' && state.b.kind !== 'binary';

/** Linhas visíveis: só as diferentes e 3 de contexto, com "N linhas iguais" no lugar do resto. */
export function collapseRows<T extends { kind: string }>(rows: readonly T[], context = 3): ({ row: T; index: number } | { skipped: number })[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((r, i) => { if (r.kind !== 'eq') for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true; });
  const out: ({ row: T; index: number } | { skipped: number })[] = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    if (keep[index]) { if (skipped) { out.push({ skipped }); skipped = 0; } out.push({ row, index }); } else skipped++;
  });
  if (skipped) out.push({ skipped });
  return out;
}
