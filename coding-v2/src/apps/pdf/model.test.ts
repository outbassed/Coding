import { describe, expect, it } from 'vitest';
import { normalizePdf, parseRanges, toPdfSpace, winAnsi } from './model';

describe('Editor PDF', () => {
  it('converte coordenadas da página girada para o espaço do PDF', () => {
    expect(toPdfSpace(10, 20, 595, 842, 0)).toEqual({ x: 10, y: 822 });
    expect(toPdfSpace(10, 20, 595, 842, 90)).toEqual({ x: 20, y: 10 });
    expect(toPdfSpace(10, 20, 595, 842, 180)).toEqual({ x: 585, y: 20 });
    expect(toPdfSpace(10, 20, 595, 842, 270)).toEqual({ x: 575, y: 832 });
  });
  it('intervalos de páginas com mensagens claras', () => {
    expect(parseRanges('1-3, 5', 6)).toEqual([0, 1, 2, 4]);
    expect(parseRanges('7', 6)).toMatch(/não existe/);
    expect(parseRanges('a', 6)).toMatch(/Use números/);
  });
  it('texto compatível com a fonte padrão do PDF', () => {
    expect(winAnsi('Ação “ok” — 😀')).toBe('Ação "ok" - ?');
  });
  it('normaliza projeto: páginas sem arquivo e anotações órfãs saem', () => {
    const s = normalizePdf({ sources: [{ id: 'a', name: 'a.pdf', pages: 2 }, { id: 'b', name: 'b.pdf', pages: 1 }], pages: [{ id: 'p1', src: 'a', index: 9, rotate: 45 }, { id: 'p2', src: 'zz', index: 0 }], annotations: [{ page: 'p1', kind: 'text', text: 'x' }, { page: 'p2' }] });
    expect(s.pages).toEqual([{ id: 'p1', src: 'a', index: 1, rotate: 0 }]);
    expect(s.sources.map((x) => x.id)).toEqual(['a']);
    expect(s.annotations).toHaveLength(1);
  });
});
