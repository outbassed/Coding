import type { CopySummary, Source } from '../storage/documents';
import { findTool, type ToolId } from '../shared/catalog';
import { formatBytes } from '../shared/bytes';

/** Tipos gravados pelo Coding atual → ferramentas do catálogo 2.0. */
const TYPE_TO_TOOL: Record<string, ToolId> = {
  labels: 'labels', texts: 'texts', calc: 'calc', images: 'images', pdf: 'pdf',
  codes: 'codes', sheet: 'labels', draw: 'draw', split: 'split'
};

export function toolIdForType(type: unknown): ToolId | null {
  return typeof type === 'string' && Object.hasOwn(TYPE_TO_TOOL, type) ? (TYPE_TO_TOOL[type] ?? null) : null;
}
/** Tipo do app removido “Planilha → Etiquetas”: os documentos continuam na Biblioteca e podem virar Etiquetas. */
export const LEGACY_SHEET_LABEL = 'Planilha → Etiquetas (descontinuado)';
export const isLegacySheet = (type: unknown): boolean => type === 'sheet';
export function typeLabel(type: unknown): string {
  if (isLegacySheet(type)) return LEGACY_SHEET_LABEL;
  const id = toolIdForType(type);
  return id ? (findTool(id)?.name ?? 'Documento') : 'Tipo desconhecido';
}
export const originLabels: Record<Source, string> = {
  indexeddb: 'Coding atual (IndexedDB)',
  localStorage: 'Coding atual (localStorage)',
  backup: 'Backup importado',
  v2: 'Criado na v2'
};

/** Histórico: documentos da v2 anteriores ao contrato de origem usavam 'backup' com prefixo 'v2-labels-'. */
export const originText = (copy: { source: Source; legacyId: string }): string =>
  copy.legacyId.startsWith('v2-labels-') ? 'Criado na v2' : originLabels[copy.source];
export type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'type' | 'images';
export const sortLabels: Record<SortKey, string> = {
  recent: 'Atualização mais recente',
  oldest: 'Atualização mais antiga',
  'name-asc': 'Nome (A a Z)',
  'name-desc': 'Nome (Z a A)',
  type: 'Tipo de documento',
  images: 'Mais imagens'
};
export interface LibraryFilters {
  q: string;
  tool: ToolId | 'all';
  origin: Source | 'all';
  sort: SortKey;
}
export const defaultFilters = (): LibraryFilters => ({ q: '', tool: 'all', origin: 'all', sort: 'recent' });

export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

export function copyTool(copy: Pick<CopySummary, 'type'>): ToolId | null {
  return toolIdForType(copy.type);
}

export function applyFilters(copies: readonly CopySummary[], filters: LibraryFilters): CopySummary[] {
  const terms = normalize(filters.q.trim()).split(/\s+/).filter(Boolean);
  const list = copies.filter((copy) => {
    if (terms.length) {
      const haystack = normalize(copy.label + ' ' + typeLabel(copy.type));
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (filters.tool !== 'all' && copyTool(copy) !== filters.tool) return false;
    if (filters.origin !== 'all' && copy.source !== filters.origin) return false;
    return true;
  });
  const byName = (a: CopySummary, b: CopySummary) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true });
  switch (filters.sort) {
    case 'oldest': return list.sort((a, b) => a.updatedAt - b.updatedAt);
    case 'name-asc': return list.sort(byName);
    case 'name-desc': return list.sort((a, b) => byName(b, a));
    case 'type': return list.sort((a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type), 'pt-BR') || byName(a, b));
    case 'images': return list.sort((a, b) => b.imageCount - a.imageCount || b.updatedAt - a.updatedAt);
    default: return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/** Endereço do editor quando a cópia pode ser aberta nele; nulo para tipos que ainda não têm editor na v2. */
/** Apps 2.0 que abrem documentos criados na v2 (prefixo do legacyId) — formatos antigos do 1.0 não são reinterpretados. */
const V2_APPS: Record<string, { path: string; prefix: string }> = {
  texts: { path: '/apps/texto/', prefix: 'v2-texts-' },
  calc: { path: '/apps/planilhas/', prefix: 'v2-calc-' },
  images: { path: '/apps/imagens/', prefix: 'v2-images-' },
  pdf: { path: '/apps/pdf/', prefix: 'v2-pdf-' },
  codes: { path: '/apps/qr/', prefix: 'v2-codes-' },
  draw: { path: '/apps/sorteio/', prefix: 'v2-draw-' },
  split: { path: '/apps/racha-conta/', prefix: 'v2-split-' }
};
export function openHref(copy: Pick<CopySummary, 'id' | 'type' | 'legacyId'>): string | null {
  if (copy.type === 'labels') return '/apps/etiquetas/?doc=' + encodeURIComponent(copy.id);
  const app = typeof copy.type === 'string' && Object.hasOwn(V2_APPS, copy.type) ? V2_APPS[copy.type] : undefined;
  if (app && copy.legacyId.startsWith(app.prefix)) return app.path + '?doc=' + encodeURIComponent(copy.id);
  return null;
}
export const openEditorName = (type: unknown): string => typeLabel(type);

export function toolsPresent(copies: readonly Pick<CopySummary, 'type'>[]): ToolId[] {
  const found = new Set<ToolId>();
  for (const copy of copies) { const id = copyTool(copy); if (id) found.add(id); }
  return [...found];
}

const SORTS = Object.keys(sortLabels) as SortKey[];
const ORIGINS: Source[] = ['indexeddb', 'localStorage', 'backup', 'v2'];
const one = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Lê os filtros da URL ignorando valores desconhecidos. */
export function filtersFromQuery(query: Record<string, unknown>): LibraryFilters {
  const result = defaultFilters();
  result.q = one(query.busca).slice(0, 120);
  const tool = one(query.ferramenta);
  if (tool && Object.values(TYPE_TO_TOOL).includes(tool as ToolId)) result.tool = tool as ToolId;
  const origin = one(query.origem);
  if (ORIGINS.includes(origin as Source)) result.origin = origin as Source;
  const sort = one(query.ordem);
  if (SORTS.includes(sort as SortKey)) result.sort = sort as SortKey;
  return result;
}
export function filtersToQuery(filters: LibraryFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.q.trim()) query.busca = filters.q.trim();
  if (filters.tool !== 'all') query.ferramenta = filters.tool;
  if (filters.origin !== 'all') query.origem = filters.origin;
  if (filters.sort !== 'recent') query.ordem = filters.sort;
  return query;
}
export const activeFilterCount = (filters: LibraryFilters): number =>
  (filters.tool !== 'all' ? 1 : 0) + (filters.origin !== 'all' ? 1 : 0) + (filters.sort !== 'recent' ? 1 : 0);

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDate = (timestamp: number): string => (Number.isFinite(timestamp) ? dateFormat.format(new Date(timestamp)) : 'data desconhecida');
export const imagesText = (count: number): string => (count === 1 ? '1 imagem' : count + ' imagens');
export { formatBytes };
/** Tamanho das imagens; cópias antigas podem não ter o total registrado. */
export const imagesSizeText = (count: number, bytes: number | null): string =>
  count === 0 ? 'sem imagens' : bytes === null ? 'tamanho não registrado' : formatBytes(bytes);
