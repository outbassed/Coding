import { KIND_LABELS, type ViewKind } from './kinds';

export interface ViewerFile { id: string; name: string; kind: ViewKind; mime: string; size: number; blobId: string }
export interface ViewerState { name: string; files: ViewerFile[]; activeId: string }
export const MAX_FILES = 30;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const emptyViewer = (name = 'Arquivos para visualizar'): ViewerState => ({ name, files: [], activeId: '' });

export function normalizeViewer(raw: unknown): ViewerState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const files: ViewerFile[] = [];
  const ids = new Set<string>();
  if (Array.isArray(s.files)) {
    for (const item of s.files) {
      if (files.length >= MAX_FILES) break;
      const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const id = typeof o.id === 'string' && /^[\w-]{1,80}$/.test(o.id) ? o.id : '';
      const blobId = typeof o.blobId === 'string' ? o.blobId.slice(0, 80) : '';
      const kind = typeof o.kind === 'string' && Object.hasOwn(KIND_LABELS, o.kind) ? (o.kind as ViewKind) : 'unknown';
      if (!id || ids.has(id) || !blobId) continue;
      ids.add(id);
      files.push({
        id, blobId, kind,
        name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 160) : 'arquivo',
        mime: typeof o.mime === 'string' ? o.mime.slice(0, 100) : '',
        size: typeof o.size === 'number' && Number.isFinite(o.size) && o.size >= 0 ? Math.floor(o.size) : 0
      });
    }
  }
  const activeId = typeof s.activeId === 'string' && ids.has(s.activeId) ? s.activeId : (files[0]?.id ?? '');
  return { name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Arquivos para visualizar', files, activeId };
}

/** Texto do arquivo sem estourar a memória: decodifica como UTF-8 e cai para Latin-1 se houver bytes inválidos. */
export const MAX_TEXT_BYTES = 4 * 1024 * 1024;
export function decodeText(bytes: Uint8Array): { text: string; truncated: boolean; encoding: 'UTF-8' | 'Latin-1' } {
  const truncated = bytes.length > MAX_TEXT_BYTES;
  const part = truncated ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes;
  try {
    let text = new TextDecoder('utf-8', { fatal: true }).decode(part);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text, truncated, encoding: 'UTF-8' };
  } catch {
    if (truncated) {
      // o corte pode ter caído no meio de um caractere: tenta de novo sem os últimos bytes
      for (let cut = 1; cut <= 3; cut++) {
        try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(part.subarray(0, part.length - cut)), truncated, encoding: 'UTF-8' }; } catch { /* segue */ }
      }
    }
    return { text: new TextDecoder('latin1').decode(part), truncated, encoding: 'Latin-1' };
  }
}
export function prettyJson(text: string): string | null {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return null; }
}
export function hexDump(bytes: Uint8Array, max = 256): string {
  const lines: string[] = [];
  const n = Math.min(bytes.length, max);
  for (let i = 0; i < n; i += 16) {
    const row = bytes.subarray(i, Math.min(n, i + 16));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const asc = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(i.toString(16).padStart(8, '0') + '  ' + hex + '  ' + asc);
  }
  return lines.join('\n');
}
export function countLines(text: string): number { let n = 1; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }
