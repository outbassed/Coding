/** Pesquisa de texto do Visualizador: sem diferenciar maiúsculas nem acentos, mantendo as posições do texto original. */

/** Minúsculas e sem acento, uma letra por letra (o tamanho do texto não muda, então as posições continuam valendo). */
export function fold(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const base = (c.normalize('NFD')[0] ?? c).toLowerCase();
    out += base.length === 1 ? base : c;
  }
  return out;
}

/** Posições (sem sobreposição) em que `needle` aparece em `haystack`; ambos já passados por `fold`. */
export function findAll(haystack: string, needle: string, limit = 5000): number[] {
  const found: number[] = [];
  if (!needle) return found;
  let from = 0;
  while (found.length < limit) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    found.push(at);
    from = at + needle.length;
  }
  return found;
}

export interface LineMatch { line: number; col: number }

/** Ocorrências por linha; `len` é o tamanho da consulta (as marcas na tela usam linha, coluna e tamanho). */
export function lineMatches(lines: readonly string[], query: string, limit = 5000): LineMatch[] {
  const needle = fold(query.trim());
  const out: LineMatch[] = [];
  if (!needle) return out;
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i]!;
    if (line.length < needle.length) continue;
    for (const col of findAll(fold(line), needle, limit - out.length)) out.push({ line: i, col });
  }
  return out;
}

/** Quebra uma linha em pedaços alternados (texto comum / trecho encontrado) para destacar com <mark>. */
export function splitLine(line: string, cols: readonly number[], len: number): { text: string; hit: number }[] {
  const parts: { text: string; hit: number }[] = [];
  let at = 0;
  cols.forEach((col, k) => {
    if (col < at) return;
    if (col > at) parts.push({ text: line.slice(at, col), hit: -1 });
    parts.push({ text: line.slice(col, col + len), hit: k });
    at = col + len;
  });
  if (at < line.length) parts.push({ text: line.slice(at), hit: -1 });
  return parts.length ? parts : [{ text: line, hit: -1 }];
}
