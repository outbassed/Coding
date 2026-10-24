import { cellName, evaluate, formatGeneral, isError, parse, parseNumber, shiftFormula, tokenize, type Node, type Value, type Shift } from './formula';

export type CellFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'text';
export type Align = 'left' | 'center' | 'right' | '';
export interface Cell { v: string; f?: CellFormat; b?: boolean; a?: Align }
export interface Sheet { id: string; name: string; rows: number; cols: number; cells: Record<string, Cell>; widths: Record<string, number> }
export interface CalcState { name: string; sheets: Sheet[]; active: number }
export const MAX_ROWS = 1000, MAX_COLS = 52, MAX_SHEETS = 20, MAX_CELLS = 60_000, MAX_CELL_CHARS = 5000;
const FORMATS: CellFormat[] = ['general', 'number', 'integer', 'currency', 'percent', 'text'];
export const key = (r: number, c: number): string => r + ':' + c;
export const parseKey = (k: string): [number, number] => { const [r, c] = k.split(':').map(Number); return [r!, c!]; };
export const sheetId = (): string => 's' + Math.random().toString(36).slice(2, 8);

export function normalizeCalc(raw: unknown): CalcState {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<CalcState>;
  const sheets: Sheet[] = [];
  const names = new Set<string>();
  let total = 0;
  for (const s of Array.isArray(src.sheets) ? src.sheets.slice(0, MAX_SHEETS) : []) {
    if (!s || typeof s !== 'object') continue;
    let name = (typeof s.name === 'string' ? s.name.replace(/[!'[\]*?/\\:]/g, ' ').trim().slice(0, 31) : '') || 'Planilha ' + (sheets.length + 1);
    while (names.has(name.toLowerCase())) name = (name.slice(0, 28) + ' ' + (sheets.length + 1)).trim();
    names.add(name.toLowerCase());
    const rows = Math.min(MAX_ROWS, Math.max(1, Math.round(Number(s.rows)) || 50));
    const cols = Math.min(MAX_COLS, Math.max(1, Math.round(Number(s.cols)) || 12));
    const cells: Record<string, Cell> = {};
    if (s.cells && typeof s.cells === 'object') {
      for (const [k, cell] of Object.entries(s.cells)) {
        if (!/^\d{1,4}:\d{1,2}$/.test(k) || !cell || typeof cell !== 'object') continue;
        const [r, c] = parseKey(k);
        if (r >= rows || c >= cols) continue;
        const v = typeof cell.v === 'string' ? cell.v.slice(0, MAX_CELL_CHARS) : typeof cell.v === 'number' ? String(cell.v) : '';
        const out: Cell = { v };
        if (cell.f && FORMATS.includes(cell.f) && cell.f !== 'general') out.f = cell.f;
        if (cell.b === true) out.b = true;
        if (cell.a === 'left' || cell.a === 'center' || cell.a === 'right') out.a = cell.a;
        if (!v && !out.f && !out.b && !out.a) continue;
        if (++total > MAX_CELLS) break;
        cells[k] = out;
      }
    }
    const widths: Record<string, number> = {};
    if (s.widths && typeof s.widths === 'object') for (const [k, w] of Object.entries(s.widths)) if (/^\d{1,2}$/.test(k) && Number(k) < cols) widths[k] = Math.min(600, Math.max(40, Math.round(Number(w)) || 100));
    sheets.push({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 20) : sheetId(), name, rows, cols, cells, widths });
  }
  if (!sheets.length) sheets.push({ id: sheetId(), name: 'Planilha 1', rows: 50, cols: 12, cells: {}, widths: {} });
  const active = Math.min(sheets.length - 1, Math.max(0, Math.round(Number(src.active)) || 0));
  return { name: typeof src.name === 'string' ? src.name.slice(0, 250) : 'Planilha', sheets, active };
}

/** Avaliador com cache por versão: recalcula tudo quando o documento muda (planilhas de até 60 mil células). */
export class Evaluator {
  private cache = new Map<string, Value>();
  private parsed = new Map<string, Node | SyntaxError>();
  private stack = new Set<string>();
  constructor(private readonly state: CalcState) {}
  private sheetIndex(name: string | null, own: number): number {
    if (name === null) return own;
    const lower = name.toLowerCase();
    return this.state.sheets.findIndex((s) => s.name.toLowerCase() === lower);
  }
  value(si: number, r: number, c: number): Value | null {
    const sheet = this.state.sheets[si];
    if (!sheet) return { error: '#REF!' };
    const cell = sheet.cells[key(r, c)];
    if (!cell || cell.v === '') return null;
    if (cell.f === 'text') return cell.v;
    if (!cell.v.startsWith('=') || cell.v.length < 2) {
      const n = parseNumber(cell.v);
      if (n !== null) return n;
      const u = cell.v.trim().toUpperCase();
      if (u === 'VERDADEIRO' || u === 'TRUE') return true;
      if (u === 'FALSO' || u === 'FALSE') return false;
      return cell.v;
    }
    const id = si + ':' + r + ':' + c;
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    if (this.stack.has(id)) return { error: '#CIRC!' };
    let node = this.parsed.get(cell.v);
    if (!node) {
      try { node = parse(tokenize(cell.v.slice(1))); } catch (e) { node = e instanceof SyntaxError ? e : new SyntaxError('Fórmula inválida.'); }
      this.parsed.set(cell.v, node);
    }
    let result: Value;
    if (node instanceof SyntaxError) result = { error: '#NOME?' };
    else {
      this.stack.add(id);
      try {
        result = evaluate(node, {
          maxRows: MAX_ROWS, maxCols: MAX_COLS,
          cell: (name, rr, cc) => {
            const idx = this.sheetIndex(name, si);
            if (idx < 0) return { error: '#REF!' };
            const target = this.state.sheets[idx]!;
            if (rr >= target.rows || cc >= target.cols) return null;
            return this.value(idx, rr, cc);
          }
        });
      } finally { this.stack.delete(id); }
      if (this.stack.size === 0 || !isError(result) || result.error !== '#CIRC!') this.cache.set(id, result);
    }
    return result;
  }
  syntaxError(si: number, r: number, c: number): string | null {
    const cell = this.state.sheets[si]?.cells[key(r, c)];
    if (!cell?.v.startsWith('=')) return null;
    try { parse(tokenize(cell.v.slice(1))); return null; } catch (e) { return (e as Error).message; }
  }
}

const NF: Record<string, Intl.NumberFormat> = {
  number: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  integer: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
  currency: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  percent: new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 })
};
export function display(value: Value | null, format: CellFormat | undefined): string {
  if (value === null) return '';
  if (isError(value)) return value.error;
  if (typeof value === 'boolean') return value ? 'VERDADEIRO' : 'FALSO';
  if (typeof value === 'number') {
    const f = format && format !== 'general' && format !== 'text' ? NF[format] : null;
    return f ? f.format(value) : formatGeneral(value);
  }
  return value;
}
export const isNumeric = (v: Value | null): boolean => typeof v === 'number';

// ---------- edição estrutural ----------
function remapCells(sheet: Sheet, map: (r: number, c: number) => [number, number] | null): void {
  const next: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(sheet.cells)) {
    const [r, c] = parseKey(k);
    const to = map(r, c);
    if (to && to[0] < sheet.rows && to[1] < sheet.cols) next[key(to[0], to[1])] = cell;
  }
  sheet.cells = next;
}
function rewriteAll(state: CalcState, shift: Shift): void {
  for (const s of state.sheets) for (const cell of Object.values(s.cells)) if (cell.v.startsWith('=')) cell.v = '=' + shiftFormula(cell.v.slice(1), s.name, shift);
}
export function insertRows(state: CalcState, si: number, at: number, count = 1): boolean {
  const s = state.sheets[si]; if (!s || s.rows + count > MAX_ROWS) return false;
  s.rows += count;
  remapCells(s, (r, c) => [r >= at ? r + count : r, c]);
  rewriteAll(state, { axis: 'row', at, delta: count, sheet: s.name });
  return true;
}
export function deleteRows(state: CalcState, si: number, at: number, count = 1): boolean {
  const s = state.sheets[si]; if (!s || s.rows - count < 1) return false;
  remapCells(s, (r, c) => (r >= at && r < at + count ? null : [r >= at + count ? r - count : r, c]));
  s.rows -= count;
  rewriteAll(state, { axis: 'row', at, delta: -count, sheet: s.name });
  return true;
}
export function insertCols(state: CalcState, si: number, at: number, count = 1): boolean {
  const s = state.sheets[si]; if (!s || s.cols + count > MAX_COLS) return false;
  s.cols += count;
  remapCells(s, (r, c) => [r, c >= at ? c + count : c]);
  const widths: Record<string, number> = {};
  for (const [k, w] of Object.entries(s.widths)) { const c = Number(k); widths[String(c >= at ? c + count : c)] = w; }
  s.widths = widths;
  rewriteAll(state, { axis: 'col', at, delta: count, sheet: s.name });
  return true;
}
export function deleteCols(state: CalcState, si: number, at: number, count = 1): boolean {
  const s = state.sheets[si]; if (!s || s.cols - count < 1) return false;
  remapCells(s, (r, c) => (c >= at && c < at + count ? null : [r, c >= at + count ? c - count : c]));
  const widths: Record<string, number> = {};
  for (const [k, w] of Object.entries(s.widths)) { const c = Number(k); if (c < at) widths[k] = w; else if (c >= at + count) widths[String(c - count)] = w; }
  s.widths = widths;
  s.cols -= count;
  rewriteAll(state, { axis: 'col', at, delta: -count, sheet: s.name });
  return true;
}
/** Renomeia a aba e atualiza referências que apontam para ela. */
export function renameSheet(state: CalcState, si: number, name: string): string | null {
  const clean = name.replace(/[!'[\]*?/\\:]/g, ' ').trim().slice(0, 31);
  if (!clean) return 'Digite um nome para a aba.';
  if (state.sheets.some((s, i) => i !== si && s.name.toLowerCase() === clean.toLowerCase())) return 'Já existe uma aba com esse nome.';
  const s = state.sheets[si]; if (!s) return 'Aba inexistente.';
  const old = s.name;
  const quoted = (n: string) => (/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");
  for (const sh of state.sheets) for (const cell of Object.values(sh.cells)) {
    if (!cell.v.startsWith('=') || !cell.v.toLowerCase().includes(old.toLowerCase())) continue;
    try {
      const tokens = tokenize(cell.v.slice(1));
      if (tokens.some((t) => t.t === 'ref' && t.sheet?.toLowerCase() === old.toLowerCase())) {
        cell.v = '=' + tokens.map((t) => (t.t === 'ref' && t.sheet?.toLowerCase() === old.toLowerCase() ? quoted(clean) + '!' + t.raw.slice(t.raw.indexOf('!') + 1) : null)).reduce<string>((acc, part, i) => acc + (part ?? rawOf(tokens[i]!, cell.v.includes(';'))), '');
      }
    } catch { /* fórmula inválida fica como está */ }
  }
  s.name = clean;
  return null;
}
function rawOf(t: ReturnType<typeof tokenize>[number], semicolon: boolean): string {
  switch (t.t) {
    case 'num': return semicolon ? String(t.v).replace('.', ',') : String(t.v);
    case 'str': return '"' + t.v.replace(/"/g, '""') + '"';
    case 'bool': case 'ref': case 'fn': return t.raw;
    case 'op': return t.v;
    case '(': return '(';
    case ')': return ')';
    case 'sep': return semicolon ? ';' : ',';
    case 'err': return t.v;
  }
}
export const rangeName = (r1: number, c1: number, r2: number, c2: number): string =>
  r1 === r2 && c1 === c2 ? cellName(r1, c1) : cellName(Math.min(r1, r2), Math.min(c1, c2)) + ':' + cellName(Math.max(r1, r2), Math.max(c1, c2));

export function budgetTemplate(): CalcState {
  const cells: Record<string, Cell> = {};
  const put = (r: number, c: number, v: string, extra: Partial<Cell> = {}) => { cells[key(r, c)] = { v, ...extra }; };
  ['Categoria', 'Previsto', 'Realizado', 'Diferença', '% do total'].forEach((h, c) => put(0, c, h, { b: true }));
  const rows: [string, number, number][] = [['Aluguel', 1800, 1800], ['Mercado', 950, 1032.4], ['Transporte', 400, 356.9], ['Contas (luz, água, internet)', 420, 447.15], ['Lazer', 300, 215], ['Saúde', 250, 180]];
  rows.forEach(([name, plan, real], i) => {
    const r = i + 1;
    put(r, 0, name); put(r, 1, String(plan).replace('.', ','), { f: 'currency' }); put(r, 2, String(real).replace('.', ','), { f: 'currency' });
    put(r, 3, `=C${r + 1}-B${r + 1}`, { f: 'currency' }); put(r, 4, `=C${r + 1}/C$${rows.length + 2}`, { f: 'percent' });
  });
  const t = rows.length + 1;
  put(t, 0, 'Total', { b: true });
  put(t, 1, `=SOMA(B2:B${t})`, { f: 'currency', b: true }); put(t, 2, `=SOMA(C2:C${t})`, { f: 'currency', b: true });
  put(t, 3, `=C${t + 1}-B${t + 1}`, { f: 'currency', b: true }); put(t, 4, `=C${t + 1}/C${t + 1}`, { f: 'percent', b: true });
  put(t + 2, 0, 'Maior gasto'); put(t + 2, 2, `=MÁXIMO(C2:C${t})`, { f: 'currency' });
  put(t + 3, 0, 'Gasto médio'); put(t + 3, 2, `=MÉDIA(C2:C${t})`, { f: 'currency' });
  put(t + 4, 0, 'Situação'); put(t + 4, 2, `=SE(C${t + 1}<=B${t + 1};"Dentro do previsto";"Acima do previsto")`);
  return { name: 'Orçamento do mês', active: 0, sheets: [{ id: sheetId(), name: 'Orçamento', rows: 40, cols: 10, cells, widths: { '0': 220, '1': 120, '2': 120, '3': 120, '4': 110 } }] };
}
export function productsTemplate(): CalcState {
  const cells: Record<string, Cell> = {};
  const put = (r: number, c: number, v: string, extra: Partial<Cell> = {}) => { cells[key(r, c)] = { v, ...extra }; };
  ['Código', 'Produto', 'Quantidade', 'Preço unitário', 'Total'].forEach((h, c) => put(0, c, h, { b: true }));
  const items: [string, string, number, string][] = [['PAR-001', 'Parafuso sextavado 8 mm', 120, '0,45'], ['POR-014', 'Porca 8 mm', 120, '0,18'], ['ARR-220', 'Arruela lisa', 200, '0,09'], ['BUC-006', 'Bucha nylon 6 mm', 80, '0,22']];
  items.forEach(([code, name, qty, price], i) => {
    const r = i + 1;
    put(r, 0, code, { f: 'text' }); put(r, 1, name); put(r, 2, String(qty), { f: 'integer' }); put(r, 3, price, { f: 'currency' }); put(r, 4, `=C${r + 1}*D${r + 1}`, { f: 'currency' });
  });
  const t = items.length + 1;
  put(t, 3, 'Total geral', { b: true, a: 'right' }); put(t, 4, `=SOMA(E2:E${t})`, { f: 'currency', b: true });
  return { name: 'Tabela de produtos', active: 0, sheets: [{ id: sheetId(), name: 'Produtos', rows: 40, cols: 8, cells, widths: { '0': 110, '1': 230, '2': 110, '3': 130, '4': 120 } }] };
}
export function blankCalc(): CalcState { return { name: 'Planilha sem título', active: 0, sheets: [{ id: sheetId(), name: 'Planilha 1', rows: 50, cols: 12, cells: {}, widths: {} }] }; }
