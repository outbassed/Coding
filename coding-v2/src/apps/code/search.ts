/** Localizar e substituir (texto literal, sem expressões regulares: o que se digita é o que se procura). */
export interface Hit { path: string; start: number; length: number; line: number; col: number; preview: string }
export interface SearchResult { hits: Hit[]; total: number; truncated: boolean }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const makeRe = (query: string, caseSensitive: boolean): RegExp => new RegExp(escapeRe(query), caseSensitive ? 'g' : 'gi');

export function lineCol(text: string, index: number): { line: number; col: number } {
  let line = 1, last = -1;
  for (let i = text.indexOf('\n'); i >= 0 && i < index; i = text.indexOf('\n', i + 1)) { line++; last = i; }
  return { line, col: index - last };
}

export function findHits(files: readonly { path: string; text: string }[], query: string, caseSensitive: boolean, limit = 500): SearchResult {
  const hits: Hit[] = [];
  let total = 0;
  if (!query) return { hits, total, truncated: false };
  for (const f of files) {
    const re = makeRe(query, caseSensitive);
    for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
      total++;
      if (hits.length < limit) {
        const { line, col } = lineCol(f.text, m.index);
        const from = f.text.lastIndexOf('\n', m.index - 1) + 1;
        let to = f.text.indexOf('\n', m.index); if (to < 0) to = f.text.length;
        hits.push({ path: f.path, start: m.index, length: m[0].length, line, col, preview: f.text.slice(from, to).trim().slice(0, 120) });
      }
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return { hits, total, truncated: total > hits.length };
}

export function replaceAllIn(text: string, query: string, replacement: string, caseSensitive: boolean): { text: string; count: number } {
  if (!query) return { text, count: 0 };
  let count = 0;
  const out = text.replace(makeRe(query, caseSensitive), () => { count++; return replacement; });
  return { text: out, count };
}
