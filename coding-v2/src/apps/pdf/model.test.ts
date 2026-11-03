import { describe, expect, it } from 'vitest';
import { blankSize, MAX_INK_POINTS, normalizePdf, parseRanges, thinPoints, toPdfSpace, winAnsi } from './model';
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
  describe('anotações: elipse, linha, desenho livre e imagem', () => {
    const base = { sources: [], pages: [{ id: 'b1', src: '', index: 0, rotate: 0, blank: { w: 595, h: 842 } }] };
    it('mantém espessura, diagonal e traço, limitando valores absurdos', () => {
      const s = normalizePdf({ ...base, annotations: [
        { id: 'e', page: 'b1', kind: 'ellipse', stroke: 999 },
        { id: 'l', page: 'b1', kind: 'line', flip: true, stroke: -4 },
        { id: 'i', page: 'b1', kind: 'ink', points: [0, 0, 2, -1, 0.5, 0.5], stroke: 3 }
      ] });
      expect(s.annotations.map((a) => a.kind)).toEqual(['ellipse', 'line', 'ink']);
      expect(s.annotations[0]!.stroke).toBe(24);
      expect(s.annotations[1]).toMatchObject({ flip: true, stroke: 0.5 });
      expect(s.annotations[2]!.points).toEqual([0, 0, 1, 0, 0.5, 0.5]);
    });
    it('desenho sem pelo menos dois pontos e imagem sem arquivo são descartados', () => {
      const s = normalizePdf({ ...base, annotations: [
        { id: 'i1', page: 'b1', kind: 'ink', points: [0.1, 0.1] }, { id: 'i2', page: 'b1', kind: 'ink' },
        { id: 'm1', page: 'b1', kind: 'image' }, { id: 'm2', page: 'b1', kind: 'image', img: 'pdfimg-1' }
      ] });
      expect(s.annotations.map((a) => a.id)).toEqual(['m2']);
      expect(s.annotations[0]!.img).toBe('pdfimg-1');
    });
    it('tipo desconhecido vira texto; texto não ganha campos de forma; reabre igual', () => {
      const s = normalizePdf({ ...base, annotations: [{ id: 't', page: 'b1', kind: 'foguete', text: 'oi', stroke: 5, points: [1, 2, 3, 4] }, { id: 'r', page: 'b1', kind: 'rect' }] });
      expect('stroke' in s.annotations[0]!).toBe(false);
      expect('points' in s.annotations[0]!).toBe(false);
      expect(s.annotations[1]!.stroke).toBe(2);
      expect(normalizePdf(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });
    it('traços longos são reduzidos mantendo início e fim', () => {
      const pts: number[] = [];
      for (let i = 0; i < 5000; i++) pts.push(i / 4999, (i % 10) / 10);
      const thin = thinPoints(pts);
      expect(thin).toHaveLength(MAX_INK_POINTS * 2);
      expect(thin.slice(0, 2)).toEqual([0, 0]);
      expect(thin.slice(-2)).toEqual([1, (4999 % 10) / 10]);
      expect(thinPoints([0.1, 0.2, 0.3, 0.4])).toEqual([0.1, 0.2, 0.3, 0.4]);
    });
  });
});
