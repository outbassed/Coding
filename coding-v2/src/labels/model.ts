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
export type LabelMode = 'code' | 'boxes';
export interface BoxShop { id: string; name: string; short: string }
export interface BoxPrintLayout {
  cols: number; rows: number; orientation: Orientation;
  gapMm: number; marginMm: number; cutLines: boolean;
  font: string; destSize: number; nfSize: number; boxesSize: number; nameSize: number; dateSize: number;
  destAlign: Align; infoAlign: Align; dateAlign: Align;
  destBold: boolean; infoBold: boolean;
}
export function defaultBoxLayout(): BoxPrintLayout {
  return {
    cols: 2, rows: 4, orientation: 'portrait', gapMm: 2.5, marginMm: 7, cutLines: true,
    font: 'Arial', destSize: 17, nfSize: 12, boxesSize: 12, nameSize: 12, dateSize: 9,
    destAlign: 'center', infoAlign: 'left', dateAlign: 'center', destBold: true, infoBold: true
  };
}
export function normalizeBoxLayout(raw: unknown): BoxPrintLayout {
  const base = defaultBoxLayout();
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    cols: toInt(s.cols, base.cols, 1, 3), rows: toInt(s.rows, base.rows, 1, 8),
    orientation: s.orientation === 'landscape' ? 'landscape' : 'portrait',
    gapMm: toInt(s.gapMm, base.gapMm, 0, 25),
    marginMm: toInt(s.marginMm, base.marginMm, 0, 20),
    cutLines: toBool(s.cutLines, base.cutLines),
    font: toFont(s.font, base.font),
    destSize: toInt(s.destSize, base.destSize, 8, 96),
    nfSize: toInt(s.nfSize, base.nfSize, 8, 96),
    boxesSize: toInt(s.boxesSize, base.boxesSize, 8, 96),
    nameSize: toInt(s.nameSize, base.nameSize, 8, 96),
    dateSize: toInt(s.dateSize, base.dateSize, 8, 96),
    destAlign: toAlign(s.destAlign, base.destAlign),
    infoAlign: toAlign(s.infoAlign, base.infoAlign),
    dateAlign: toAlign(s.dateAlign, base.dateAlign),
    destBold: toBool(s.destBold, base.destBold),
    infoBold: toBool(s.infoBold, base.infoBold)
  };
}
export interface BoxData {
  stores: BoxShop[]; nf: string; total: number; person: string;
  /** Opcional: em novos documentos começa oculto; documentos antigos preservam a exibição. */
  showDateTime: boolean;
  timeMode: 'auto' | 'manual'; manualDate: string; manualTime: string;
  layout: BoxPrintLayout;
}
export const DEFAULT_BOX_SHOPS: readonly BoxShop[] = [
  { id: 'vila-velha', name: 'Vila Velha', short: 'VILA VELHA' },
  { id: 'cariacica', name: 'Cariacica', short: 'CARIACICA' },
  { id: 'serra', name: 'Serra', short: 'SERRA' },
  { id: 'guarapari', name: 'Guarapari', short: 'GUARAPARI' },
  { id: 'barra', name: 'Barra do Jucu', short: 'BARRA' },
  { id: 'cachoeiro', name: 'Cachoeiro de Itapemirim', short: 'CACHOEIRO' }
];
export function defaultBoxes(): BoxData {
  return {
    stores: [DEFAULT_BOX_SHOPS[1]!, DEFAULT_BOX_SHOPS[0]!].map((shop) => ({ ...shop })),
    nf: '10000', total: 2, person: 'Seu Nome',
    showDateTime: false, timeMode: 'auto', manualDate: '', manualTime: '', layout: defaultBoxLayout()
  };
}
export function normalizeShop(input: unknown): BoxShop | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const s = input as Record<string, unknown>;
  const id = toText(s.id, '', 80).trim();
  const name = toText(s.name, '', 100).trim();
  const short = toText(s.short, '', 100).trim();
  return id && name && short ? { id, name, short } : null;
}
export function normalizeBoxes(raw: unknown): BoxData {
  const base = defaultBoxes();
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const stores: BoxShop[] = [];
  if (Array.isArray(s.stores)) for (const entry of s.stores.slice(0, 200)) {
    const shop = normalizeShop(entry);
    if (shop && !stores.some((old) => old.id === shop.id)) stores.push(shop);
  }
  return {
    stores: Array.isArray(s.stores) ? stores : base.stores,
    nf: toText(s.nf, base.nf, 24).replace(/[^0-9]/g, ''),
    total: toInt(s.total, base.total, 1, MAX_BLOCKS),
    person: toText(s.person, base.person, 120),
    showDateTime: typeof s.showDateTime === 'boolean' ? s.showDateTime : ('nf' in s ? true : base.showDateTime),
    layout: normalizeBoxLayout(s.layout),
    timeMode: s.timeMode === 'manual' ? 'manual' : 'auto',
    manualDate: toText(s.manualDate, '', 10),
    manualTime: toText(s.manualTime, '', 5)
  };
}
export interface LabelsState {
  name: string;
  mode: LabelMode;
  boxes: BoxData;
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
    mode: 'code', boxes: defaultBoxes(),
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
    mode: o.mode === 'boxes' ? 'boxes' : 'code', boxes: normalizeBoxes(o.boxes),
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
