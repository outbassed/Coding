import { describe, expect, it } from 'vitest';
import { findAll, fold, lineMatches, splitLine } from './search';
import { boxOf, buildPageText, findMatches, rangesFor, toTextItem } from './pdf-search';

describe('Visualizador · pesquisa de texto', () => {
  it('tira acentos e maiúsculas sem mudar o tamanho', () => {
    expect(fold('Ação Çá')).toBe('acao ca');
    expect(fold('Ação')).toHaveLength(4);
  });
  it('acha ocorrências sem sobreposição', () => {
    expect(findAll('abcabc', 'abc')).toEqual([0, 3]);
    expect(findAll('aaaa', 'aa')).toEqual([0, 2]);
    expect(findAll('abc', '')).toEqual([]);
  });
  it('acha por linha e coluna', () => {
    expect(lineMatches(['Olá mundo', 'MUNDO mundo'], 'mundo')).toEqual([{ line: 0, col: 4 }, { line: 1, col: 0 }, { line: 1, col: 6 }]);
    expect(lineMatches(['abc'], '   ')).toEqual([]);
  });
  it('divide a linha para destacar', () => {
    expect(splitLine('abc mundo x', [4], 5)).toEqual([{ text: 'abc ', hit: -1 }, { text: 'mundo', hit: 0 }, { text: ' x', hit: -1 }]);
    expect(splitLine('abc', [], 3)).toEqual([{ text: 'abc', hit: -1 }]);
  });
});

describe('Visualizador · pesquisa em PDF', () => {
  const items = [{ str: 'Hello ', x: 10, y: 100, w: 60, h: 12 }, { str: 'World', x: 70, y: 100, w: 50, h: 12 }];
  it('junta os pedaços e acha frases que atravessam itens', () => {
    const page = buildPageText(items);
    expect(page.text).toBe('Hello World');
    expect(page.starts).toEqual([0, 6]);
    expect(findMatches(page, 'O w')).toEqual([{ start: 4, end: 7 }]);
    expect(findMatches(page, '  ')).toEqual([]);
  });
  it('mostra qual parte de cada item destacar', () => {
    const page = buildPageText(items);
    const r = rangesFor(page, { start: 4, end: 7 });
    expect(r).toHaveLength(2);
    expect(r[0]!.item).toBe(0);
    expect(r[0]!.f0).toBeCloseTo(4 / 6);
    expect(r[0]!.f1).toBe(1);
    expect(r[1]!.item).toBe(1);
    expect(r[1]!.f0).toBe(0);
    expect(r[1]!.f1).toBeCloseTo(1 / 5);
  });
  it('converte o item do pdf.js e recusa os inválidos', () => {
    expect(toTextItem({ str: 'x', transform: [1, 0, 0, 1, 5, 6], width: 10, height: 12 })).toEqual({ str: 'x', x: 5, y: 6, w: 10, h: 12 });
    expect(toTextItem({ str: 'x', transform: [1, 0, 0, -9, 5, 6], width: 10, height: 0 })!.h).toBe(9);
    expect(toTextItem({ str: 3, transform: [1, 0, 0, 1, 5, 6], width: 1, height: 1 })).toBeNull();
    expect(toTextItem({ str: 'x', transform: [1, 2], width: 1, height: 1 })).toBeNull();
  });
  it('calcula o retângulo em pixels pela matriz do viewport', () => {
    const box = boxOf(items[0]!, { item: 0, f0: 0, f1: 1 }, [1, 0, 0, -1, 0, 200]);
    expect(box).toEqual({ x: 10, y: 88, w: 60, h: 12 });
  });
});
