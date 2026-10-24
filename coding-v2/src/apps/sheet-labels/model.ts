import { defaults, normalize as normalizeLabels, type LabelsState } from '../../labels/model';
import { convertRows, guessMapping, type ColumnMap } from '../../labels/import';
import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';

export type LabelFormat = Omit<LabelsState, 'name' | 'items'>;
export interface SheetLabelsState { name: string; rows: string[][]; hasHeader: boolean; map: ColumnMap; defaultQty: number; format: LabelFormat; source: string }
export const MAX_TABLE_ROWS = 2000, MAX_TABLE_COLS = 20;

export function formatOf(state: LabelsState): LabelFormat { const { name: _n, items: _i, ...rest } = state; void _n; void _i; return rest; }
const idx = (v: unknown, cols: number) => { const n = Math.round(Number(v)); return Number.isInteger(n) && n >= -1 && n < cols ? n : -1; };
export function normalizeSheetLabels(raw: unknown): SheetLabelsState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<SheetLabelsState>;
  const rows = (Array.isArray(s.rows) ? s.rows : []).slice(0, MAX_TABLE_ROWS).map((r) => (Array.isArray(r) ? r.slice(0, MAX_TABLE_COLS).map((v) => (typeof v === 'string' ? v.slice(0, 2000) : typeof v === 'number' ? String(v) : '')) : []));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const m = (s.map ?? {}) as Partial<ColumnMap>;
  const fmt = formatOf(normalizeLabels({ ...(s.format ?? {}), items: [] }));
  return {
    name: typeof s.name === 'string' ? s.name.slice(0, 250) : 'Etiquetas da planilha',
    rows: rows.length ? rows : [['Código', 'Descrição', 'Quantidade']],
    hasHeader: s.hasHeader !== false,
    map: { code: idx(m.code, cols), desc: idx(m.desc, cols), qty: idx(m.qty, cols) },
    defaultQty: Math.min(500, Math.max(1, Math.round(Number(s.defaultQty)) || 1)),
    format: fmt,
    source: typeof s.source === 'string' ? s.source.slice(0, 120) : ''
  };
}
/** Estado de Etiquetas gerado pela planilha: usa o MESMO motor (modelo, paginação e impressão) do app Etiquetas. */
export function toLabels(state: SheetLabelsState) {
  const conv = convertRows(state.rows, state.map, { hasHeader: state.hasHeader, defaultQty: state.defaultQty });
  const labels: LabelsState = normalizeLabels({ ...state.format, name: (state.name || 'Etiquetas da planilha').slice(0, 80), items: conv.items.length ? conv.items : [{ code: '', description: '', copies: 1 }] });
  return { labels, conv };
}
function example(): SheetLabelsState {
  const rows = [
    ['Código', 'Descrição', 'Quantidade'],
    ['PAR-001', 'Parafuso sextavado 8 mm', '4'],
    ['POR-014', 'Porca 8 mm', '4'],
    ['ARR-220', 'Arruela lisa', '2'],
    ['BUC-006', 'Bucha nylon 6 mm', '2'],
    ['TOR-100', 'Torneira de jardim', '1']
  ];
  const fmt = formatOf({ ...defaults(), cols: 2, gap: 4, codeSize: 26, descSize: 16, prefix: '' });
  return { name: 'Estoque da oficina', rows, hasHeader: true, map: guessMapping(rows[0]!, true), defaultQty: 1, format: fmt, source: 'Exemplo' };
}
export const sheetLabelsKind: DocKind<SheetLabelsState> = { type: 'sheet', prefix: 'v2-sheet-', appName: 'Planilha → Etiquetas', normalize: normalizeSheetLabels, label: (s) => cleanLabel(s.name, 'Etiquetas da planilha') };
export const sheetLabelsTemplates: DocTemplate<SheetLabelsState>[] = [
  { id: 'exemplo', name: 'Planilha de exemplo', description: '5 produtos com código, descrição e quantidade', create: example },
  { id: 'prateleiras', name: 'Prateleiras (3 colunas)', description: 'Endereços de estoque em etiquetas pequenas', create: () => {
    const rows = [['Endereço', 'Setor'], ...['A', 'B', 'C'].flatMap((l) => [1, 2, 3, 4].map((n) => [l + '-0' + n, 'Corredor ' + l]))];
    return { name: 'Endereços de prateleira', rows, hasHeader: true, map: { code: 0, desc: 1, qty: -1 }, defaultQty: 1, format: formatOf({ ...defaults(), cols: 3, gap: 3, codeSize: 30, descSize: 12, prefix: '' }), source: 'Modelo' };
  } },
  { id: 'em-branco', name: 'Em branco', description: 'Tabela vazia para colar ou importar', create: () => normalizeSheetLabels({ name: 'Nova planilha de etiquetas', rows: [['Código', 'Descrição', 'Quantidade'], ['', '', '']], map: { code: 0, desc: 1, qty: 2 } }) }
];
