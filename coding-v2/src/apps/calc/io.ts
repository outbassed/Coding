import { readTableFile, readXlsx, writeXlsx, type XlsxFormat, type XlsxOutCell } from '../../shared/files/xlsx';
import { parseCsv, toCsv } from '../../shared/files/csv';
import { toExcelFormula, isError } from './formula';
import { display, Evaluator, key, MAX_COLS, MAX_ROWS, MAX_SHEETS, sheetId, type CalcState, type Cell, type Sheet } from './model';

/** Importa CSV ou XLSX como novas abas (fórmulas do Excel são mantidas, em sintaxe inglesa). */
export async function importFile(file: File, state: CalcState): Promise<{ added: number; truncated: boolean }> {
  const lower = file.name.toLowerCase();
  let tables: { name: string; rows: { v: string; formula?: string }[][] }[];
  if (lower.endsWith('.xlsx') || (await file.slice(0, 2).text()) === 'PK') {
    const sheets = await readXlsx(new Uint8Array(await file.arrayBuffer()));
    tables = sheets.map((s) => ({ name: s.name, rows: s.rows.map((row) => row.map((c) => ({ v: c?.value ?? '', formula: c?.formula }))) }));
  } else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt') || file.type.startsWith('text/')) {
    tables = [{ name: file.name.replace(/\.[^.]+$/, '') || 'Importada', rows: parseCsv(await file.text()).map((r) => r.map((v) => ({ v }))) }];
  } else {
    const any = await readTableFile(file);
    tables = any.map((t) => ({ name: t.name, rows: t.rows.map((r) => r.map((v) => ({ v }))) }));
  }
  let added = 0, truncated = false;
  for (const t of tables) {
    if (state.sheets.length >= MAX_SHEETS) { truncated = true; break; }
    const rows = Math.min(MAX_ROWS, Math.max(20, t.rows.length + 5));
    const width = Math.max(1, ...t.rows.map((r) => r.length));
    const cols = Math.min(MAX_COLS, Math.max(8, width));
    if (t.rows.length > MAX_ROWS || width > MAX_COLS) truncated = true;
    const cells: Record<string, Cell> = {};
    t.rows.slice(0, MAX_ROWS).forEach((row, r) => row.slice(0, MAX_COLS).forEach((c, ci) => {
      const v = c.formula ? '=' + c.formula : c.v;
      if (v !== '') cells[key(r, ci)] = { v: v.slice(0, 5000) };
    }));
    let name = t.name.replace(/[!'[\]*?/\\:]/g, ' ').trim().slice(0, 31) || 'Importada';
    let n = 2;
    while (state.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name = (t.name.slice(0, 27) + ' ' + n++).trim();
    state.sheets.push({ id: sheetId(), name, rows, cols, cells, widths: {} });
    added++;
  }
  if (added) state.active = state.sheets.length - added;
  return { added, truncated };
}
const usedBounds = (s: Sheet): { rows: number; cols: number } => {
  let rows = 0, cols = 0;
  for (const k of Object.keys(s.cells)) { const [r, c] = k.split(':').map(Number); if (s.cells[k]!.v !== '') { rows = Math.max(rows, r! + 1); cols = Math.max(cols, c! + 1); } }
  return { rows, cols };
};
const XFMT: Record<string, XlsxFormat> = { number: 'number', integer: 'integer', currency: 'currency', percent: 'percent', text: 'text' };

export async function exportXlsx(state: CalcState): Promise<Uint8Array> {
  const ev = new Evaluator(state);
  return writeXlsx(state.sheets.map((s, si) => {
    const { rows, cols } = usedBounds(s);
    const out: (XlsxOutCell | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: (XlsxOutCell | null)[] = [];
      for (let c = 0; c < cols; c++) {
        const cell = s.cells[key(r, c)];
        if (!cell || cell.v === '') { row.push(null); continue; }
        const value = ev.value(si, r, c);
        const plain = value === null ? '' : isError(value) ? value.error : value;
        const formula = cell.v.startsWith('=') && cell.f !== 'text' ? toExcelFormula(cell.v.slice(1)) ?? undefined : undefined;
        row.push({ value: plain, formula, format: cell.f ? XFMT[cell.f] : undefined, bold: cell.b });
      }
      out.push(row);
    }
    const widths = Array.from({ length: cols }, (_, c) => (s.widths[String(c)] ?? 100) / 7);
    return { name: s.name, rows: out, widths };
  }));
}
export function exportCsv(state: CalcState, si: number): string {
  const s = state.sheets[si]!;
  const ev = new Evaluator(state);
  const { rows, cols } = usedBounds(s);
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = s.cells[key(r, c)];
      const v = ev.value(si, r, c);
      // CSV leva o valor calculado; moeda/porcentagem viram número simples para outros programas lerem
      row.push(typeof v === 'number' ? String(v).replace('.', ',') : display(v, cell?.f));
    }
    out.push(row);
  }
  return toCsv(out, ';');
}
