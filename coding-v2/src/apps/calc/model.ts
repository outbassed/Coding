import { cellName, evaluate, formatGeneral, isError, offsetFormula, parse, parseNumber, shiftFormula, tokenize, type Node, type Value, type Shift } from './formula';

export type CellFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'text';
export type Align = 'left' | 'center' | 'right' | '';
/** Cor em #rrggbb, ou 'none' para "sem cor" explícito (tira a cor herdada da coluna). */
export type CellColor = string;
export interface CellStyle { fg?: CellColor; bg?: CellColor }
export interface Cell { v: string; f?: CellFormat; b?: boolean; a?: Align; /** cor da fonte */ fg?: CellColor; /** preenchimento */ bg?: CellColor }
export interface Sheet {
  id: string; name: string; rows: number; cols: number; cells: Record<string, Cell>; widths: Record<string, number>;
  /** Estilo de coluna inteira (índice da coluna → cores). A célula tem prioridade sobre a coluna. */
  colStyle?: Record<string, CellStyle>;
}
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const cleanColor = (value: unknown): CellColor | undefined => (isHexColor(value) ? value.toLowerCase() : value === 'none' ? 'none' : undefined);
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
        const fg = cleanColor(cell.fg), bg = cleanColor(cell.bg);
        if (fg) out.fg = fg;
        if (bg) out.bg = bg;
        if (!v && !out.f && !out.b && !out.a && !out.fg && !out.bg) continue;
        if (++total > MAX_CELLS) break;
        cells[k] = out;
      }
    }
    const widths: Record<string, number> = {};
    if (s.widths && typeof s.widths === 'object') for (const [k, w] of Object.entries(s.widths)) if (/^\d{1,2}$/.test(k) && Number(k) < cols) widths[k] = Math.min(600, Math.max(40, Math.round(Number(w)) || 100));
    const colStyle: Record<string, CellStyle> = {};
    if (s.colStyle && typeof s.colStyle === 'object') {
      for (const [k, st] of Object.entries(s.colStyle)) {
        if (!/^\d{1,2}$/.test(k) || Number(k) >= cols || !st || typeof st !== 'object') continue;
        const fg = cleanColor(st.fg), bg = cleanColor(st.bg);
        if (fg || bg) colStyle[k] = { ...(fg ? { fg } : {}), ...(bg ? { bg } : {}) };
      }
    }
    sheets.push({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 20) : sheetId(), name, rows, cols, cells, widths, ...(Object.keys(colStyle).length ? { colStyle } : {}) });
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
  if (s.colStyle) {
    const moved: Record<string, CellStyle> = {};
    for (const [k, st] of Object.entries(s.colStyle)) { const c = Number(k); moved[String(c >= at ? c + count : c)] = st; }
    s.colStyle = moved;
  }
  rewriteAll(state, { axis: 'col', at, delta: count, sheet: s.name });
  return true;
}
export function deleteCols(state: CalcState, si: number, at: number, count = 1): boolean {
  const s = state.sheets[si]; if (!s || s.cols - count < 1) return false;
  remapCells(s, (r, c) => (c >= at && c < at + count ? null : [r, c >= at + count ? c - count : c]));
  const widths: Record<string, number> = {};
  for (const [k, w] of Object.entries(s.widths)) { const c = Number(k); if (c < at) widths[k] = w; else if (c >= at + count) widths[String(c - count)] = w; }
  s.widths = widths;
  if (s.colStyle) {
    const kept: Record<string, CellStyle> = {};
    for (const [k, st] of Object.entries(s.colStyle)) { const c = Number(k); if (c < at) kept[k] = st; else if (c >= at + count) kept[String(c - count)] = st; }
    s.colStyle = kept;
  }
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

/** Preenche o intervalo com a primeira linha (para baixo) ou a primeira coluna (para a direita), ajustando fórmulas. */
export function fillRange(state: CalcState, si: number, r1: number, c1: number, r2: number, c2: number, dir: 'down' | 'right'): number {
  const s = state.sheets[si]; if (!s) return 0;
  let n = 0;
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const sr = dir === 'down' ? r1 : r, sc = dir === 'down' ? c : c1;
    if (r === sr && c === sc) continue;
    const src = s.cells[key(sr, sc)];
    if (!src) { delete s.cells[key(r, c)]; continue; }
    const v = src.v.startsWith('=') ? '=' + offsetFormula(src.v.slice(1), r - sr, c - sc) : src.v;
    s.cells[key(r, c)] = { ...src, v };
    n++;
  }
  return n;
}
/** Ordena as linhas r1..r2 pelo valor da coluna `col` (números antes de textos, vazias no fim). */
export function sortRows(state: CalcState, si: number, r1: number, r2: number, col: number, desc: boolean): void {
  const s = state.sheets[si]; if (!s || r2 <= r1) return;
  const ev = new Evaluator(state);
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const cells: Record<number, Cell> = {};
    for (let c = 0; c < s.cols; c++) { const cell = s.cells[key(r, c)]; if (cell) cells[c] = cell; }
    rows.push({ cells, v: ev.value(si, r, col) });
  }
  const rank = (v: Value | null) => (v === null || v === '' ? 2 : typeof v === 'number' ? 0 : 1);
  rows.sort((a, b) => {
    const ra = rank(a.v), rb = rank(b.v);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return 0;
    const cmp = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(display(a.v, undefined)).localeCompare(String(display(b.v, undefined)), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return desc ? -cmp : cmp;
  });
  for (let r = r1; r <= r2; r++) for (let c = 0; c < s.cols; c++) delete s.cells[key(r, c)];
  rows.forEach((row, i) => { for (const [c, cell] of Object.entries(row.cells)) s.cells[key(r1 + i, Number(c))] = cell; });
}

// ---------- cores (fonte e preenchimento) ----------
export type StyleProp = 'fg' | 'bg';
export interface Rect { r1: number; c1: number; r2: number; c2: number }
/** A seleção cobre colunas inteiras (da primeira à última linha)? */
export const wholeColumns = (s: Sheet, g: Rect): boolean => g.r1 === 0 && g.r2 >= s.rows - 1;
/** A seleção cobre linhas inteiras (da primeira à última coluna)? */
export const wholeRows = (s: Sheet, g: Rect): boolean => g.c1 === 0 && g.c2 >= s.cols - 1;

/** Cor efetiva de uma célula: a da própria célula, senão a da coluna. 'none' (ou nada) = sem cor. */
export function effectiveColor(s: Sheet, r: number, c: number, prop: StyleProp): string | undefined {
  const own = s.cells[key(r, c)]?.[prop];
  const value = own ?? s.colStyle?.[String(c)]?.[prop];
  return value && value !== 'none' ? value : undefined;
}
/** Escolhe preto ou branco para o texto sobre um fundo, pela luminância (WCAG). */
export function readableOn(background: string): string {
  const n = parseInt(background.slice(1), 16);
  const lin = (v: number): number => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.179 ? '#000000' : '#ffffff';
}
/** Cor da fonte exibida: a escolhida; se só há preenchimento, preto/branco legível sobre ele. */
export function shownColors(s: Sheet, r: number, c: number): { fg?: string; bg?: string } {
  const bg = effectiveColor(s, r, c, 'bg');
  const fg = effectiveColor(s, r, c, 'fg') ?? (bg ? readableOn(bg) : undefined);
  return { ...(fg ? { fg } : {}), ...(bg ? { bg } : {}) };
}
function dropEmpty(sheet: Sheet, k: string): void {
  const cell = sheet.cells[k];
  if (cell && !cell.v && !cell.f && !cell.b && !cell.a && !cell.fg && !cell.bg) delete sheet.cells[k];
}
/**
 * Aplica (ou, com null, remove) uma cor na seleção.
 * Colunas inteiras guardam a cor na própria coluna (vale também para células novas) e limpam as exceções das células;
 * o restante grava nas células. Devolve quantas células/colunas foram afetadas.
 */
export function applyColor(sheet: Sheet, g: Rect, prop: StyleProp, color: string | null): number {
  const value = color === null ? null : isHexColor(color) ? color.toLowerCase() : null;
  if (color !== null && value === null) return 0;
  const r1 = Math.max(0, g.r1), c1 = Math.max(0, g.c1), r2 = Math.min(sheet.rows - 1, g.r2), c2 = Math.min(sheet.cols - 1, g.c2);
  if (r1 > r2 || c1 > c2) return 0;
  if (wholeColumns(sheet, { r1, c1, r2, c2 })) {
    const styles = (sheet.colStyle ??= {});
    for (let c = c1; c <= c2; c++) {
      const st = (styles[String(c)] ??= {});
      if (value) st[prop] = value; else delete st[prop];
      if (!st.fg && !st.bg) delete styles[String(c)];
    }
    for (const k of Object.keys(sheet.cells)) {
      const [, c] = parseKey(k);
      if (c < c1 || c > c2) continue;
      delete sheet.cells[k]![prop];
      dropEmpty(sheet, k);
    }
    if (!Object.keys(styles).length) delete sheet.colStyle;
    return c2 - c1 + 1;
  }
  let n = 0;
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const k = key(r, c);
    const inherited = sheet.colStyle?.[String(c)]?.[prop];
    const cell = sheet.cells[k] ?? { v: '' };
    if (value) cell[prop] = value;
    else if (inherited && inherited !== 'none') cell[prop] = 'none'; // sem cor aqui, mesmo com a coluna colorida
    else delete cell[prop];
    sheet.cells[k] = cell;
    dropEmpty(sheet, k);
    n++;
  }
  return n;
}
/** Tira todas as cores da seleção (usado por "Limpar formatação"). */
export function clearColors(sheet: Sheet, g: Rect): void {
  applyColor(sheet, g, 'fg', null);
  applyColor(sheet, g, 'bg', null);
  // "none" explícito que sobrou numa célula não faz sentido sem cor de coluna
  for (const [k, cell] of Object.entries(sheet.cells)) {
    const [r, c] = parseKey(k);
    if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) continue;
    for (const prop of ['fg', 'bg'] as const) if (cell[prop] === 'none' && !sheet.colStyle?.[String(c)]?.[prop]) delete cell[prop];
    dropEmpty(sheet, k);
  }
}
