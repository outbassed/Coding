import { describe, expect, it } from 'vitest';
import type { CopySummary } from '../storage/documents';
import { applyFilters, defaultFilters, filtersFromQuery, filtersToQuery, imagesSizeText, normalize, openHref, toolIdForType, toolsPresent, typeLabel } from './model';

function copy(id: string, label: string, type: string, updatedAt: number, source: CopySummary['source'] = 'backup'): CopySummary {
  return { id, legacyId: id, source, label, revision: 1, createdAt: 1, updatedAt, type, imageCount: 0, imageBytes: null };
}
const list = [
  copy('1', 'Zebra', 'labels', 10), copy('2', 'Ação rápida', 'texts', 30, 'indexeddb'),
  copy('3', 'amostra 10', 'sheet', 20), copy('4', 'amostra 2', 'images', 40, 'localStorage')
];

describe('modelo da biblioteca', () => {
  it('mapeia tipos antigos para as ferramentas do catálogo', () => {
    expect(toolIdForType('sheet')).toBe('labels');
    expect(typeLabel('sheet')).toContain('descontinuado');
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
    expect(applyFilters(list, { ...defaultFilters(), tool: 'labels' }).map((c) => c.id)).toContain('3');
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
    expect(toolsPresent(list).sort()).toEqual(['images', 'labels', 'texts']);
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
  it('busca com vários termos exige todos, em qualquer ordem, e considera o tipo', () => {
    const l = [copy('1', 'Caixa do estoque', 'labels', 1), copy('2', 'Estoque geral', 'texts', 2), copy('3', 'Caixa', 'texts', 3)];
    expect(applyFilters(l, { ...defaultFilters(), q: 'estoque caixa' }).map((c) => c.id)).toEqual(['1']);
    expect(applyFilters(l, { ...defaultFilters(), q: '  CAIXA   texto ' }).map((c) => c.id)).toEqual(['3']);
    expect(applyFilters(l, { ...defaultFilters(), q: 'etiquetas' }).map((c) => c.id)).toEqual(['1']);
  });
  it('ordena por tipo e por quantidade de imagens sem alterar a lista original', () => {
    const l = [
      { ...copy('1', 'B', 'texts', 1), imageCount: 0 }, { ...copy('2', 'A', 'labels', 2), imageCount: 3 },
      { ...copy('3', 'C', 'labels', 3), imageCount: 3 }, { ...copy('4', 'D', 'texts', 4), imageCount: 1 }
    ];
    expect(applyFilters(l, { ...defaultFilters(), sort: 'type' }).map((c) => c.id)).toEqual(['2', '3', '1', '4']);
    expect(applyFilters(l, { ...defaultFilters(), sort: 'images' }).map((c) => c.id)).toEqual(['3', '2', '4', '1']);
    expect(l.map((c) => c.id)).toEqual(['1', '2', '3', '4']);
    expect(filtersFromQuery({ ordem: 'images' }).sort).toBe('images');
  });
  it('só oferece editor para cópias que a v2 realmente sabe abrir', () => {
    expect(openHref({ id: 'a b', type: 'labels', legacyId: 'x' })).toBe('/apps/etiquetas/?doc=a%20b');
    expect(openHref({ id: 'a', type: 'texts', legacyId: 'v2-texts-1' })).toBe('/apps/texto/?doc=a');
    expect(openHref({ id: 'a', type: 'texts', legacyId: 'txt-1' })).toBeNull();
    expect(openHref({ id: 'a', type: 'images', legacyId: 'i' })).toBeNull();
    expect(openHref({ id: 'a', type: 'images', legacyId: 'v2-images-1' })).toBe('/apps/imagens/?doc=a');
    expect(openHref({ id: 'a', type: 'sheet', legacyId: 'v2-sheet-1' })).toBeNull();
    expect(openHref({ id: 'a', type: 'calc', legacyId: 'legado-calc' })).toBeNull();
  });
});

describe('Versos na Biblioteca', () => {
  it('o tipo versos aponta para /apps/versos/ e tem nome no catálogo', () => {
    expect(toolIdForType('versos')).toBe('versos');
    expect(typeLabel('versos')).toBe('Versos');
    expect(openHref({ id: 'z', type: 'versos', legacyId: 'v2-versos-1' })).toBe('/apps/versos/?doc=z');
    expect(openHref({ id: 'z', type: 'versos', legacyId: 'outro-id' })).toBeNull();
  });
});
