import { describe, expect, it } from 'vitest';
import { boundedPage, pageCount, pageShortcuts } from './pagination';
describe('Biblioteca · navegação entre páginas', () => {
  it('primeira, metade e última adaptam-se sem números repetidos', () => {
    expect(pageShortcuts(1)).toEqual([1]);
    expect(pageShortcuts(2)).toEqual([1,2]);
    expect(pageShortcuts(17)).toEqual([1,9,17]);
    expect(pageShortcuts(100)).toEqual([1,50,100]);
    expect(pageShortcuts(237)).toEqual([1,119,237]);
  });
  it('clamps saltos de uma ou cinco páginas', () => {
    expect(boundedPage(-4,17)).toBe(1);
    expect(boundedPage(24,17)).toBe(17);
    expect(boundedPage(12,17)).toBe(12);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(2401)).toBe(101);
  });
});