/** CSV: detecção de separador (, ; tab), aspas, BOM e quebras de linha dentro de campos. */
export const MAX_CSV_ROWS = 20000;
export const MAX_CSV_COLS = 200;

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.slice(0, 4000).split(/\r?\n/).slice(0, 10);
  const score = (d: string) => {
    const counts = sample.filter(Boolean).map((line) => line.split(d).length - 1);
    if (!counts.length) return 0;
    const same = counts.every((c) => c === counts[0]);
    return (counts[0] ?? 0) * (same ? 2 : 1);
  };
  const options: Array<',' | ';' | '\t'> = ['\t', ';', ','];
  let best: ',' | ';' | '\t' = ',', bestScore = 0;
  for (const d of options) { const s = score(d); if (s > bestScore) { best = d; bestScore = s; } }
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === '"' && field === '') { quoted = true; continue; }
    if (c === d) { row.push(field); field = ''; if (row.length > MAX_CSV_COLS) throw new Error('O arquivo tem colunas demais (máximo ' + MAX_CSV_COLS + ').'); continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      if (rows.length > MAX_CSV_ROWS) throw new Error('O arquivo tem linhas demais (máximo ' + MAX_CSV_ROWS + ').');
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // remove linhas totalmente vazias do fim
  while (rows.length && rows[rows.length - 1]!.every((v) => v.trim() === '')) rows.pop();
  return rows;
}

const needsQuote = (value: string, d: string) => value.includes(d) || /["\r\n]/.test(value) || /^\s|\s$/.test(value);
export function toCsv(rows: readonly (readonly string[])[], delimiter = ';'): string {
  return '﻿' + rows.map((row) => row.map((v) => (needsQuote(v, delimiter) ? '"' + v.replace(/"/g, '""') + '"' : v))
    // Evita injeção de fórmulas ao abrir no Excel (=, +, -, @ no início de texto).
    .map((v) => (/^[=+\-@]/.test(v) && !/^[-+]?\d/.test(v) ? "'" + v : v)).join(delimiter)).join('\r\n') + '\r\n';
}
