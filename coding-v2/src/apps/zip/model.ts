import { MAX_ENTRIES, safeEntryName } from './zip';

export interface ZipFile { id: string; path: string; size: number; modified: number }
export interface ZipState { name: string; compress: boolean; files: ZipFile[] }

export const emptyZip = (name = 'Arquivos compactados'): ZipState => ({ name, compress: true, files: [] });

export function normalizeZip(raw: unknown): ZipState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const files: ZipFile[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  if (Array.isArray(s.files)) {
    for (const item of s.files) {
      if (files.length >= MAX_ENTRIES) break;
      const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const id = typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 80 ? o.id : '';
      const path = typeof o.path === 'string' ? safeEntryName(o.path) : '';
      if (!id || !path || ids.has(id) || paths.has(path.toLowerCase())) continue;
      ids.add(id); paths.add(path.toLowerCase());
      const size = typeof o.size === 'number' && Number.isFinite(o.size) && o.size >= 0 ? Math.floor(o.size) : 0;
      const modified = typeof o.modified === 'number' && Number.isFinite(o.modified) && o.modified >= 0 ? Math.floor(o.modified) : 0;
      files.push({ id, path, size, modified });
    }
  }
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Arquivos compactados',
    compress: s.compress === false ? false : true,
    files
  };
}

export const totalSize = (state: ZipState): number => state.files.reduce((sum, f) => sum + f.size, 0);

/** "62% menor", "sem ganho" ou "maior" (quando os dados já estavam compactados). */
export function savingsText(original: number, packed: number): string {
  if (original <= 0) return 'sem dados';
  const pct = Math.round((1 - packed / original) * 100);
  if (pct > 0) return pct + '% menor';
  if (pct === 0) return 'sem ganho';
  return 'maior que o original';
}

/** Nome do .zip a partir do nome do projeto. */
export function zipFileName(name: string): string {
  const base = name.normalize('NFC').replace(/\.zip$/i, '').replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/\s+/g, ' ').trim().replace(/^[-. ]+|[-. ]+$/g, '').slice(0, 80);
  return (base || 'arquivos') + '.zip';
}
