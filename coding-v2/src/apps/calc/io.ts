import { readTableFile, readXlsx, writeXlsx, type XlsxCell, type XlsxFormat, type XlsxOutCell, type XlsxStyle } from '../../shared/files/xlsx';
import { parseCsv, toCsv } from '../../shared/files/csv';
import { toExcelFormula, isError } from './formula';
import { display, effectiveColor, Evaluator, isHexColor, key, MAX_COLS, MAX_ROWS, MAX_SHEETS, sheetId, type CalcState, type Cell, type CellStyle, type Sheet } from './model';

export interface ImportCell { v: string; formula?: string; style?: XlsxStyle }
export interface ImportTable { name: string; rows: ImportCell[][]; colStyles?: Record<number, XlsxStyle> }
export function tablesFromXlsx(sheets: { name: string; rows: (XlsxCell | undefined)[][]; colStyles?: Record<number, XlsxStyle> }[]): ImportTable[] {
  return sheets.map((s) => ({
    name: s.name, colStyles: s.colStyles,
    rows: s.rows.map((row) => row.map((c) => {
      // Número vindo do XLSX entra com vírgula decimal, como o resto do app, para "1.234" não virar 1234.
      const v = c?.number !== undefined && !String(c.number).includes('e') ? String(c.number).replace('.', ',') : c?.value ?? '';
      return { v, formula: c?.formula, style: c?.style };
    }))
  }));
}
/** Monta uma aba a partir de uma tabela lida (valores, fórmulas, cores, negrito, formato e estilo de coluna). */
export function tableToSheet(t: ImportTable): { sheet: Sheet; truncated: boolean } {
  const rows = Math.min(MAX_ROWS, Math.max(20, t.rows.length + 5));
  const width = Math.max(1, ...t.rows.map((r) => r.length), ...(t.colStyles ? Object.keys(t.colStyles).map((k) => Number(k) + 1) : [0]));
  const cols = Math.min(MAX_COLS, Math.max(8, width));
  const truncated = t.rows.length > MAX_ROWS || width > MAX_COLS;
  const cells: Record<string, Cell> = {};
  t.rows.slice(0, MAX_ROWS).forEach((row, r) => row.slice(0, MAX_COLS).forEach((c, ci) => {
    const v = (c.formula ? '=' + c.formula : c.v).slice(0, 5000);
    const cell: Cell = { v };
    const st = c.style;
    if (st?.bold) cell.b = true;
    if (st?.fg && isHexColor(st.fg)) cell.fg = st.fg.toLowerCase();
    if (st?.bg && isHexColor(st.bg)) cell.bg = st.bg.toLowerCase();
    if (st?.format && st.format !== 'general') cell.f = st.format;
    if (v !== '' || cell.b || cell.fg || cell.bg) cells[key(r, ci)] = cell;
  }));
  const colStyle: Record<string, CellStyle> = {};
  for (const [k, st] of Object.entries(t.colStyles ?? {})) {
    const c = Number(k);
    if (c >= cols) continue;
    const one: CellStyle = {};
    if (st.fg && isHexColor(st.fg)) one.fg = st.fg.toLowerCase();
    if (st.bg && isHexColor(st.bg)) one.bg = st.bg.toLowerCase();
    if (one.fg || one.bg) colStyle[String(c)] = one;
  }
  return { sheet: { id: sheetId(), name: t.name, rows, cols, cells, widths: {}, ...(Object.keys(colStyle).length ? { colStyle } : {}) }, truncated };
}

/** Importa CSV ou XLSX como novas abas (fórmulas do Excel são mantidas, em sintaxe inglesa). */
export async function importFile(file: File, state: CalcState): Promise<{ added: number; truncated: boolean }> {
  const lower = file.name.toLowerCase();
  let tables: ImportTable[];
  if (lower.endsWith('.xlsx') || (await file.slice(0, 2).text()) === 'PK') {
    tables = tablesFromXlsx(await readXlsx(new Uint8Array(await file.arrayBuffer())));
  } else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt') || file.type.startsWith('text/')) {
    tables = [{ name: file.name.replace(/\.[^.]+$/, '') || 'Importada', rows: parseCsv(await file.text()).map((r) => r.map((v) => ({ v }))) }];
  } else {
    const any = await readTableFile(file);
    tables = any.map((t) => ({ name: t.name, rows: t.rows.map((r) => r.map((v) => ({ v }))) }));
  }
  let added = 0, truncated = false;
  for (const t of tables) {
    if (state.sheets.length >= MAX_SHEETS) { truncated = true; break; }
    const built = tableToSheet(t);
    if (built.truncated) truncated = true;
    let name = t.name.replace(/[!'[\]*?/\\:]/g, ' ').trim().slice(0, 31) || 'Importada';
    let n = 2;
    while (state.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name = (t.name.slice(0, 27) + ' ' + n++).trim();
    state.sheets.push({ ...built.sheet, name });
    added++;
  }
  if (added) state.active = state.sheets.length - added;
  return { added, truncated };
}
const usedBounds = (s: Sheet): { rows: number; cols: number } => {
  let rows = 0, cols = 0;
  for (const k of Object.keys(s.cells)) {
    const [r, c] = k.split(':').map(Number);
    const cell = s.cells[k]!;
    if (cell.v !== '' || cell.bg || cell.fg) { rows = Math.max(rows, r! + 1); cols = Math.max(cols, c! + 1); }
  }
  return { rows, cols };
};
const solid = (v: string | undefined): string | undefined => (v && v !== 'none' ? v : undefined);
const XFMT: Record<string, XlsxFormat> = { number: 'number', integer: 'integer', currency: 'currency', percent: 'percent', text: 'text' };

export async function exportXlsx(state: CalcState): Promise<Uint8Array> {
  const ev = new Evaluator(state);
  return writeXlsx(state.sheets.map((s, si) => {
    const used = usedBounds(s);
    const lastStyledCol = Math.max(-1, ...Object.keys(s.colStyle ?? {}).map(Number));
    const rows = used.rows, cols = Math.max(used.cols, lastStyledCol + 1);
    const out: (XlsxOutCell | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: (XlsxOutCell | null)[] = [];
      for (let c = 0; c < cols; c++) {
        const cell = s.cells[key(r, c)];
        if (!cell) { row.push(null); continue; }
        // A célula leva a cor efetiva (a própria ou a da coluna): no Excel o estilo da célula substitui o da coluna.
        const fg = solid(effectiveColor(s, r, c, 'fg')), bg = solid(effectiveColor(s, r, c, 'bg'));
        if (cell.v === '') { row.push(fg || bg || cell.b ? { value: null, bold: cell.b, fg, bg } : null); continue; }
        const value = ev.value(si, r, c);
        const plain = value === null ? '' : isError(value) ? value.error : value;
        const formula = cell.v.startsWith('=') && cell.f !== 'text' ? toExcelFormula(cell.v.slice(1)) ?? undefined : undefined;
        row.push({ value: plain, formula, format: cell.f ? XFMT[cell.f] : undefined, bold: cell.b, fg, bg });
      }
      out.push(row);
    }
    const widths = Array.from({ length: cols }, (_, c) => (s.widths[String(c)] ?? 100) / 7);
    const colStyles = Array.from({ length: cols }, (_, c): XlsxStyle | undefined => {
      const st = s.colStyle?.[String(c)];
      const fg = solid(st?.fg), bg = solid(st?.bg);
      return fg || bg ? { fg, bg } : undefined;
    });
    return { name: s.name, rows: out, widths, colStyles };
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
