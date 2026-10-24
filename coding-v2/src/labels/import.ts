import { MAX_BLOCKS, MAX_COPIES, MAX_ITEMS, uid, type LabelItem } from './model';

/** Mapeamento de colunas de uma planilha para etiquetas: índice da coluna ou -1 (não usar). */
export interface ColumnMap { code: number; desc: number; qty: number }
export interface RowIssue { row: number; message: string }
export interface Conversion { items: LabelItem[]; issues: RowIssue[]; ignored: number; totalLabels: number; trimmed: boolean; overBlocks: boolean }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CODE = ['codigo', 'cod', 'code', 'sku', 'ref', 'referencia', 'ean', 'gtin', 'item', 'id'];
const DESC = ['descricao', 'desc', 'description', 'produto', 'nome', 'name', 'titulo', 'material'];
const QTY = ['quantidade', 'qtd', 'qtde', 'qty', 'quant', 'copias', 'etiquetas', 'unidades', 'quantity'];
/** Adivinha as colunas pelo cabeçalho (sem acento e sem caixa). Sem cabeçalho: 1ª, 2ª e 3ª colunas. */
export function guessMapping(headers: readonly string[], hasHeader: boolean): ColumnMap {
  if (!hasHeader) return { code: headers.length > 0 ? 0 : -1, desc: headers.length > 1 ? 1 : -1, qty: headers.length > 2 ? 2 : -1 };
  const find = (words: string[]) => {
    const strong = headers.findIndex((h) => { const n = norm(h); return words.some((w) => n === w || n.startsWith(w + ' ') || n.startsWith(w + '.')); });
    return strong >= 0 ? strong : headers.findIndex((h) => { const n = norm(h); return words.some((w) => n.includes(w)); });
  };
  let code = find(CODE), desc = find(DESC), qty = find(QTY);
  if (desc === code) desc = -1;
  if (qty === code || qty === desc) qty = -1;
  if (code < 0 && desc < 0 && headers.length) code = 0;
  return { code, desc, qty };
}
/** Lê quantidade em português: "3", "3,0", "10 un". Devolve null se não for inteiro positivo. */
export function parseQty(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s*(un|unid|unidades|pcs|pç|x)\.?$/, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
export function convertRows(rows: readonly (readonly string[])[], map: ColumnMap, opts: { hasHeader: boolean; defaultQty: number }): Conversion {
  const items: LabelItem[] = [];
  const issues: RowIssue[] = [];
  let ignored = 0, total = 0, trimmed = false;
  const start = opts.hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]!;
    const lineNo = i + 1;
    const code = map.code >= 0 ? (row[map.code] ?? '').trim() : '';
    const description = map.desc >= 0 ? (row[map.desc] ?? '').trim() : '';
    if (!code && !description) { ignored++; continue; }
    let copies = opts.defaultQty;
    if (map.qty >= 0) {
      const raw = (row[map.qty] ?? '').trim();
      if (raw) {
        const q = parseQty(raw);
        if (q === null) { issues.push({ row: lineNo, message: 'Linha ' + lineNo + ': quantidade “' + raw + '” não é um número inteiro maior que zero.' }); continue; }
        if (q > MAX_COPIES) { issues.push({ row: lineNo, message: 'Linha ' + lineNo + ': quantidade ' + q + ' acima do máximo de ' + MAX_COPIES + ' por item.' }); continue; }
        copies = q;
      }
    }
    if (code.length > 160) { issues.push({ row: lineNo, message: 'Linha ' + lineNo + ': código com mais de 160 caracteres.' }); continue; }
    if (items.length >= MAX_ITEMS) { trimmed = true; break; }
    items.push({ id: uid(), code, description: description.slice(0, 2000), copies });
    total += copies;
  }
  return { items, issues, ignored, totalLabels: total, trimmed, overBlocks: total > MAX_BLOCKS };
}
