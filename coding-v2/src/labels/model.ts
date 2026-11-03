/**
 * Modelo de dados de Etiquetas — IDÊNTICO ao do Coding atual (labels.js).
 * Nada aqui inventa formato: os campos, limites e a normalização vêm do editor original,
 * então documentos antigos e copias v2 abrem sem conversão.
 */
export const FONTS = ['Arial', 'Arial Black', 'Impact', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS', 'Tahoma'] as const;
export type Align = 'left' | 'center' | 'right';
export type Orientation = 'portrait' | 'landscape';
/** Código gráfico opcional gerado a partir do código de cada etiqueta. */
export type LabelBarcode = 'none' | 'qr' | 'code128' | 'ean13';
export const BARCODES: LabelBarcode[] = ['none', 'qr', 'code128', 'ean13'];

export const MAX_ITEMS = 200;
export const MAX_COPIES = 500;
export const MAX_BLOCKS = 2000;
export const MIN_COLS = 1;
export const MAX_COLS = 3;
export const MAX_GAP_MM = 25;
export const MIN_SIZE_PT = 8;
export const MAX_SIZE_PT = 96;
export const PAPER = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } } as const;
export const MARGIN_X_MM = 14;
export const MARGIN_Y_MM = 15;

export interface LabelItem { id: string; code: string; description: string; copies: number }
export interface LabelsState {
  name: string;
  items: LabelItem[];
  prefix: string;
  orientation: Orientation;
  cols: number;
  gap: number;
  border: boolean;
  barcode: LabelBarcode;
  codeFont: string; codeSize: number; codeBold: boolean; codeItalic: boolean; codeAlign: Align;
  descFont: string; descSize: number; descBold: boolean; descItalic: boolean; descAlign: Align;
}

export const uid = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : fallback;
}
const toText = (value: unknown, fallback: string, limit: number): string => (typeof value === 'string' ? value.slice(0, limit) : fallback);
const toBool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const toFont = (value: unknown, fallback: string): string => (typeof value === 'string' && (FONTS as readonly string[]).includes(value) ? value : fallback);
const toAlign = (value: unknown, fallback: Align): Align => (value === 'left' || value === 'center' || value === 'right' ? value : fallback);

export function defaults(): LabelsState {
  return {
    name: 'Documento sem título',
    items: [{ id: uid(), code: '123', description: 'Sua descrição aqui', copies: 3 }],
    prefix: 'COD: ',
    orientation: 'portrait',
    cols: 1,
    gap: 1,
    border: true,
    barcode: 'none',
    codeFont: 'Arial', codeSize: 40, codeBold: true, codeItalic: false, codeAlign: 'center',
    descFont: 'Arial', descSize: 34, descBold: false, descItalic: false, descAlign: 'center'
  };
}

export function normalizeItem(raw: unknown): LabelItem {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof o.id === 'string' && o.id && o.id.length <= 40 ? o.id : uid(),
    code: toText(o.code, '', 160),
    description: toText(o.description, '', 2000),
    copies: toInt(o.copies, 1, 1, MAX_COPIES)
  };
}

/** Aceita o estado atual, o de projetos da versão 1 (um código com "repeats") e lixo. Nunca lança. */
export function normalize(source: unknown): LabelsState {
  const base = defaults();
  const o = source && typeof source === 'object' && !Array.isArray(source) ? (source as Record<string, unknown>) : {};
  const legacy = !Array.isArray(o.items);
  let items: LabelItem[];
  if (Array.isArray(o.items)) items = o.items.slice(0, MAX_ITEMS).map(normalizeItem);
  else if ('code' in o || 'description' in o) items = [normalizeItem({ code: o.code, description: o.description, copies: o.repeats })];
  else items = base.items;
  if (!items.length) items = [normalizeItem({})];
  return {
    name: toText(o.name, base.name, 80),
    items,
    prefix: toText(o.prefix, base.prefix, 30),
    orientation: o.orientation === 'landscape' ? 'landscape' : 'portrait',
    cols: toInt(o.cols, base.cols, MIN_COLS, MAX_COLS),
    gap: toInt(o.gap, base.gap, 0, MAX_GAP_MM),
    border: toBool(o.border, legacy ? false : base.border),
    barcode: BARCODES.includes(o.barcode as LabelBarcode) ? (o.barcode as LabelBarcode) : 'none',
    codeFont: toFont(o.codeFont, base.codeFont),
    codeSize: toInt(o.codeSize, base.codeSize, MIN_SIZE_PT, MAX_SIZE_PT),
    codeBold: toBool(o.codeBold, base.codeBold),
    codeItalic: toBool(o.codeItalic, base.codeItalic),
    codeAlign: toAlign(o.codeAlign, base.codeAlign),
    descFont: toFont(o.descFont, base.descFont),
    descSize: toInt(o.descSize, base.descSize, MIN_SIZE_PT, MAX_SIZE_PT),
    descBold: toBool(o.descBold, base.descBold),
    descItalic: toBool(o.descItalic, base.descItalic),
    descAlign: toAlign(o.descAlign, base.descAlign)
  };
}

export const hasContent = (item: LabelItem): boolean => item.code.trim() !== '' || item.description.trim() !== '';
export const activeItems = (state: LabelsState): LabelItem[] => state.items.filter(hasContent);
/** Total de etiquetas que o documento imprimiria (sem o limite de blocos). */
export const countLabels = (state: LabelsState): number => activeItems(state).reduce((sum, item) => sum + item.copies, 0);
export const cloneState = (state: LabelsState): LabelsState => JSON.parse(JSON.stringify(state)) as LabelsState;
export const sameState = (a: LabelsState, b: LabelsState): boolean => JSON.stringify(a) === JSON.stringify(b);
export const paperSize = (state: LabelsState) => PAPER[state.orientation];
