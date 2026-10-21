import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS } from './model';
import { paginate } from './paginate';

describe('paginação (mesma regra do Coding atual)', () => {
  it('agrupa em linhas de `cols` e quebra de folha sem separar etiquetas', () => {
    const r = paginate({ heights: [100], copies: [5], cols: 2, gapPx: 10, capacityPx: 250 });
    expect(r.pages.map((rows) => rows.map((row) => row.length))).toEqual([[2, 2], [1]]);
    expect(r.labelCount).toBe(5);
  });
  it('a altura da linha é a da maior etiqueta', () => {
    const r = paginate({ heights: [50, 200], copies: [1, 1], cols: 2, gapPx: 0, capacityPx: 150 });
    expect(r.oversized).toEqual([1]);
    expect(r.pages).toHaveLength(1);
  });
  it('documento vazio tem uma folha vazia', () => {
    expect(paginate({ heights: [], copies: [], cols: 1, gapPx: 0, capacityPx: 100 }).pages).toEqual([[]]);
  });
  it('corta em 2000 etiquetas mas informa o total pedido', () => {
    const r = paginate({ heights: [1], copies: [500, 500, 500, 500, 500], cols: 3, gapPx: 0, capacityPx: 100000 });
    expect(r.labelCount).toBe(MAX_BLOCKS);
    expect(r.total).toBe(2500);
  });
  it('mais cópias nunca diminuem o número de folhas', () => {
    let last = 0;
    for (let copies = 1; copies <= 60; copies += 7) {
      const n = paginate({ heights: [80], copies: [copies], cols: 3, gapPx: 5, capacityPx: 400 }).pages.length;
      expect(n).toBeGreaterThanOrEqual(last); last = n;
    }
  });
});
