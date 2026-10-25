import { describe, expect, it } from 'vitest';
import { blankSize, normalizePdf, parseRanges, toPdfSpace, winAnsi } from './model';
import { pdfTemplates } from './kind';

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
  it('páginas em branco: tamanhos, orientação e limites', () => {
    expect(blankSize('a4', 'portrait')).toEqual({ w: 595.28, h: 841.89 });
    expect(blankSize('a4', 'landscape')).toEqual({ w: 841.89, h: 595.28 });
    expect(blankSize('letter', 'portrait')).toEqual({ w: 612, h: 792 });
    expect(blankSize('a3', 'landscape').w).toBeCloseTo(1190.55, 1);
    const custom = blankSize('custom', 'portrait', { w: 100, h: 200 });
    expect(custom.w).toBeCloseTo(283.46, 1);
    expect(custom.h).toBeCloseTo(566.93, 1);
    expect(blankSize('custom', 'portrait', { w: 1, h: 99999 })).toEqual({ w: 72, h: 3000 });
  });
  it('projeto só com páginas em branco é válido e reabre igual (sem arquivos de origem)', () => {
    const raw = { name: 'Brancos', sources: [], pages: [{ id: 'b1', src: '', index: 0, rotate: 90, blank: { w: 841.89, h: 595.28 } }, { id: 'b2', src: '', index: 0, rotate: 0, blank: { w: 612, h: 792 } }], annotations: [{ id: 'a1', page: 'b1', kind: 'text', x: 0.2, y: 0.3, text: 'Olá' }, { id: 'a2', page: 'zz', kind: 'text' }] };
    const s = normalizePdf(raw);
    expect(s.pages).toHaveLength(2);
    expect(s.pages[0]).toEqual({ id: 'b1', src: '', index: 0, rotate: 90, blank: { w: 841.89, h: 595.28 } });
    expect(s.annotations.map((a) => a.id)).toEqual(['a1']);
    expect(normalizePdf(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('páginas em branco inválidas são limitadas ou descartadas', () => {
    const s = normalizePdf({ pages: [{ id: 'x', blank: { w: 'abc', h: 10 } }, { id: 'y', blank: { w: 1, h: 99999 } }] });
    expect(s.pages).toHaveLength(1);
    expect(s.pages[0]!.blank).toEqual({ w: 72, h: 3000 });
  });
  it('modelos em branco geram páginas A4 retrato e paisagem', () => {
    const a = pdfTemplates.find((t) => t.id === 'branco-a4')!.create();
    const b = pdfTemplates.find((t) => t.id === 'branco-a4-paisagem')!.create();
    expect(a.pages[0]!.blank!.h).toBeGreaterThan(a.pages[0]!.blank!.w);
    expect(b.pages[0]!.blank!.w).toBeGreaterThan(b.pages[0]!.blank!.h);
  });
});
