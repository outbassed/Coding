import { describe, expect, it } from 'vitest';
import { DEFAULT_MARGIN_MM, layoutPage, paperOf, printCss } from './layout';

describe('layoutPage', () => {
  it('imagem retrato cabe em A4 retrato respeitando a proporção e as margens', () => {
    const b = layoutPage({ aspect: 1080 / 1350 });
    expect([b.paperW, b.paperH]).toEqual([210, 297]);
    expect(b.margin).toBe(DEFAULT_MARGIN_MM);
    expect(b.contentW / b.contentH).toBeCloseTo(1080 / 1350, 2);
    expect(b.contentW).toBeLessThanOrEqual(b.availW);
    expect(b.contentH).toBeLessThanOrEqual(b.availH);
  });
  it('orientação automática: imagem larga vira paisagem', () => {
    const b = layoutPage({ aspect: 1920 / 1080 });
    expect([b.paperW, b.paperH]).toEqual([297, 210]);
    expect(b.contentW).toBe(b.availW);
    expect(b.contentH).toBeLessThan(b.availH);
  });
  it('quadrada usa retrato e preenche a largura útil', () => {
    const b = layoutPage({ aspect: 1 });
    expect(b.paperH).toBeGreaterThan(b.paperW);
    expect(b.contentW).toBe(b.contentH);
    expect(b.contentW).toBe(b.availW);
  });
  it('orientação explícita vence a automática', () => {
    expect(layoutPage({ aspect: 3, orientation: 'portrait' }).paperW).toBe(210);
    expect(layoutPage({ aspect: 0.2, orientation: 'landscape' }).paperW).toBe(297);
  });
  it('conteúdo em fluxo (texto) fica em retrato e não encolhe', () => {
    const b = layoutPage({ fit: 'flow', aspect: 5 });
    expect(b.paperW).toBe(210);
    expect(b.contentW).toBe(b.availW);
    expect(b.contentH).toBe(b.availH);
  });
  it('a área útil tem folga contra folha em branco', () => {
    const b = layoutPage({ aspect: 0.1 });
    expect(b.contentH).toBeLessThan(297 - 2 * 10);
  });
  it('margem é limitada a um quarto do lado menor', () => {
    expect(layoutPage({ aspect: 1, marginMm: 500 }).margin).toBe(52.5);
    expect(layoutPage({ aspect: 1, marginMm: -4 }).margin).toBe(0);
  });
  it('proporção inválida cai em 1', () => {
    expect(layoutPage({ aspect: Number.NaN }).contentW).toBe(layoutPage({ aspect: 1 }).contentW);
    expect(layoutPage({ aspect: 0 }).contentW).toBe(layoutPage({ aspect: 1 }).contentW);
  });
  it('papel personalizado e nomeado', () => {
    expect(paperOf('Letter').w).toBe(215.9);
    expect(paperOf({ w: 100, h: 150 })).toEqual({ w: 100, h: 150 });
    expect(paperOf(undefined).w).toBe(210);
  });
});

describe('printCss', () => {
  it('uma regra @page nomeada por combinação, mais o padrão da primeira página', () => {
    const a = layoutPage({ aspect: 1 }), b = layoutPage({ aspect: 2 }), c = layoutPage({ aspect: 0.5 });
    const css = printCss([a, b, c]);
    expect(css.startsWith('@page { size: 210mm 297mm;')).toBe(true);
    expect((css.match(/@page cp-/g) ?? []).length).toBe(2);
    expect(css).toContain('page: ' + b.key);
  });
  it('sem páginas não gera CSS', () => { expect(printCss([])).toBe(''); });
});
