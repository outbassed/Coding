import type { CopySummary, Source } from '../storage/documents';
import { findTool, type ToolId } from '../shared/catalog';

/** Tipos gravados pelo Coding atual → ferramentas do catálogo 2.0. */
const TYPE_TO_TOOL: Record<string, ToolId> = {
  labels: 'labels', texts: 'texts', calc: 'calc', images: 'images', pdf: 'pdf',
  codes: 'codes', sheet: 'sheet-labels', draw: 'draw', split: 'split'
};

export function toolIdForType(type: unknown): ToolId | null {
  return typeof type === 'string' && Object.hasOwn(TYPE_TO_TOOL, type) ? (TYPE_TO_TOOL[type] ?? null) : null;
}
export function typeLabel(type: unknown): string {
  const id = toolIdForType(type);
  return id ? (findTool(id)?.name ?? 'Documento') : 'Tipo desconhecido';
}
export const originLabels: Record<Source, string> = {
  indexeddb: 'Coding atual (IndexedDB)',
  localStorage: 'Coding atual (localStorage)',
  backup: 'Backup importado'
};

export type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc';
export const sortLabels: Record<SortKey, string> = {
  recent: 'Atualização mais recente',
  oldest: 'Atualização mais antiga',
  'name-asc': 'Nome (A a Z)',
  'name-desc': 'Nome (Z a A)'
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
  const q = normalize(filters.q.trim());
  const list = copies.filter((copy) => {
    if (q && !normalize(copy.label).includes(q)) return false;
    if (filters.tool !== 'all' && copyTool(copy) !== filters.tool) return false;
    if (filters.origin !== 'all' && copy.source !== filters.origin) return false;
    return true;
  });
  const byName = (a: CopySummary, b: CopySummary) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true });
  switch (filters.sort) {
    case 'oldest': return list.sort((a, b) => a.updatedAt - b.updatedAt);
    case 'name-asc': return list.sort(byName);
    case 'name-desc': return list.sort((a, b) => byName(b, a));
    default: return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export function toolsPresent(copies: readonly Pick<CopySummary, 'type'>[]): ToolId[] {
  const found = new Set<ToolId>();
  for (const copy of copies) { const id = copyTool(copy); if (id) found.add(id); }
  return [...found];
}

const SORTS = Object.keys(sortLabels) as SortKey[];
const ORIGINS: Source[] = ['indexeddb', 'localStorage', 'backup'];
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
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}
/** Tamanho das imagens; cópias antigas podem não ter o total registrado. */
export const imagesSizeText = (count: number, bytes: number | null): string =>
  count === 0 ? 'sem imagens' : bytes === null ? 'tamanho não registrado' : formatBytes(bytes);
