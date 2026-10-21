import { describe, expect, it } from 'vitest';
import type { CopySummary } from '../storage/documents';
import { applyFilters, defaultFilters, filtersFromQuery, filtersToQuery, imagesSizeText, normalize, toolIdForType, toolsPresent } from './model';

function copy(id: string, label: string, type: string, updatedAt: number, source: CopySummary['source'] = 'backup'): CopySummary {
  return { id, legacyId: id, source, label, revision: 1, createdAt: 1, updatedAt, type, imageCount: 0, imageBytes: null };
}
const list = [
  copy('1', 'Zebra', 'labels', 10), copy('2', 'Ação rápida', 'texts', 30, 'indexeddb'),
  copy('3', 'amostra 10', 'sheet', 20), copy('4', 'amostra 2', 'images', 40, 'localStorage')
];

describe('modelo da biblioteca', () => {
  it('mapeia tipos antigos para as ferramentas do catálogo', () => {
    expect(toolIdForType('sheet')).toBe('sheet-labels');
    expect(toolIdForType('labels')).toBe('labels');
    expect(toolIdForType('desconhecido')).toBeNull();
    expect(toolIdForType('toString')).toBeNull();
    expect(toolIdForType(undefined)).toBeNull();
  });
  it('busca ignora acentos e caixa', () => {
    expect(normalize('AÇÃO')).toBe('acao');
    expect(applyFilters(list, { ...defaultFilters(), q: 'ACAO' }).map((c) => c.id)).toEqual(['2']);
    expect(applyFilters(list, { ...defaultFilters(), q: 'zzz' })).toEqual([]);
  });
  it('filtra por ferramenta e origem', () => {
    expect(applyFilters(list, { ...defaultFilters(), tool: 'sheet-labels' }).map((c) => c.id)).toEqual(['3']);
    expect(applyFilters(list, { ...defaultFilters(), origin: 'indexeddb' }).map((c) => c.id)).toEqual(['2']);
  });
  it('ordena por atualização e por nome (numérico, sem acento)', () => {
    expect(applyFilters(list, defaultFilters()).map((c) => c.id)).toEqual(['4', '2', '3', '1']);
    expect(applyFilters(list, { ...defaultFilters(), sort: 'oldest' }).map((c) => c.id)).toEqual(['1', '3', '2', '4']);
    expect(applyFilters(list, { ...defaultFilters(), sort: 'name-asc' }).map((c) => c.id)).toEqual(['2', '4', '3', '1']);
    expect(applyFilters(list, { ...defaultFilters(), sort: 'name-desc' }).map((c) => c.id)).toEqual(['1', '3', '4', '2']);
  });
  it('não altera a lista original', () => {
    const before = list.map((c) => c.id);
    applyFilters(list, { ...defaultFilters(), sort: 'name-desc' });
    expect(list.map((c) => c.id)).toEqual(before);
  });
  it('lista só as ferramentas presentes', () => {
    expect(toolsPresent(list).sort()).toEqual(['images', 'labels', 'sheet-labels', 'texts']);
  });
  it('filtros vão e voltam pela URL e valores inválidos são ignorados', () => {
    const f = { q: 'x', tool: 'labels' as const, origin: 'backup' as const, sort: 'name-asc' as const };
    expect(filtersFromQuery(filtersToQuery(f))).toEqual(f);
    expect(filtersToQuery(defaultFilters())).toEqual({});
    expect(filtersFromQuery({ ferramenta: 'hack', origem: '<x>', ordem: 'nope', busca: ['a'] })).toEqual(defaultFilters());
  });
  it('tamanho das imagens: sem imagens, não registrado ou formatado', () => {
    expect(imagesSizeText(0, null)).toBe('sem imagens');
    expect(imagesSizeText(2, null)).toBe('tamanho não registrado');
    expect(imagesSizeText(1, 3 * 1024 * 1024)).toBe('3,0 MB');
  });
});
