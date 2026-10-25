import { describe, expect, it } from 'vitest';
import { floodMask, growMask, maskSize } from './fill';
import { blankPaint, hexToRgba, MAX_LAYERS, MAX_SIDE, normalizePaint } from './model';
import { boxFrom, constrainLine, stamps } from './shapes';
import { UndoStack } from './undo';

/** Imagem w×h preenchida com uma cor RGBA. */
function image(w: number, h: number, rgba: [number, number, number, number] = [255, 255, 255, 255]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
  return d;
}
const paintRect = (d: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number]): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.set(rgba, (y * w + x) * 4);
};

describe('Pintar · balde de tinta', () => {
  it('preenche toda a região contínua e para nas bordas', () => {
    const w = 10, h = 10, d = image(w, h);
    paintRect(d, w, 5, 0, 5, 9, [0, 0, 0, 255]); // parede vertical
    const m = floodMask(d, w, h, 0, 0, 0);
    expect(maskSize(m)).toBe(50);
    expect(m[0 * w + 4]).toBe(1);
    expect(m[0 * w + 5]).toBe(0);
    expect(m[0 * w + 6]).toBe(0);
  });
  it('não atravessa uma parede fechada, mas entra por uma abertura', () => {
    const w = 8, h = 8, d = image(w, h);
    paintRect(d, w, 3, 0, 3, 6, [0, 0, 0, 255]); // parede com abertura na última linha
    expect(maskSize(floodMask(d, w, h, 0, 0, 0))).toBe(64 - 7);
    paintRect(d, w, 3, 7, 3, 7, [0, 0, 0, 255]);
    expect(maskSize(floodMask(d, w, h, 0, 0, 0))).toBe(24);
  });
  it('a tolerância une cores parecidas e separa as diferentes', () => {
    const w = 4, h = 1, d = image(w, h);
    d.set([250, 250, 250, 255], 4); d.set([100, 100, 100, 255], 8);
    expect(maskSize(floodMask(d, w, h, 0, 0, 0))).toBe(1);
    expect(maskSize(floodMask(d, w, h, 0, 0, 10))).toBe(2);
    expect(maskSize(floodMask(d, w, h, 0, 0, 255))).toBe(4);
  });
  it('transparente é uma cor: preenche só a área transparente', () => {
    const w = 6, h = 6, d = image(w, h, [0, 0, 0, 0]);
    paintRect(d, w, 2, 2, 3, 3, [255, 0, 0, 255]);
    expect(maskSize(floodMask(d, w, h, 0, 0, 0))).toBe(32);
    expect(maskSize(floodMask(d, w, h, 2, 2, 0))).toBe(4);
  });
  it('fora da imagem não faz nada e telas grandes não estouram a pilha', () => {
    const d = image(4, 4);
    expect(maskSize(floodMask(d, 4, 4, -1, 0, 0))).toBe(0);
    expect(maskSize(floodMask(d, 4, 4, 4, 0, 0))).toBe(0);
    const big = image(1500, 1500);
    expect(maskSize(floodMask(big, 1500, 1500, 750, 750, 0))).toBe(1500 * 1500);
  });
  it('espiral de uma célula de largura é preenchida sem recursão', () => {
    const w = 31, h = 31, d = image(w, h, [0, 0, 0, 255]);
    // corredor em zigue-zague
    for (let y = 0; y < h; y += 2) paintRect(d, w, 0, y, w - 1, y, [255, 255, 255, 255]);
    for (let y = 1; y < h; y += 4) paintRect(d, w, w - 1, y, w - 1, y + 1, [255, 255, 255, 255]);
    for (let y = 3; y < h; y += 4) paintRect(d, w, 0, y, 0, y + 1, [255, 255, 255, 255]);
    const m = floodMask(d, w, h, 0, 0, 0);
    expect(m[(h - 1) * w + (w - 1)] || m[(h - 1) * w]).toBe(1);
  });
  it('engordar a máscara cobre 1 pixel de borda', () => {
    const w = 5, h = 5, mask = new Uint8Array(25); mask[12] = 1;
    expect(maskSize(growMask(mask, w, h, 1))).toBe(5);
    expect(maskSize(growMask(mask, w, h, 2))).toBe(13);
  });
});

describe('Pintar · modelo', () => {
  it('normaliza lixo e garante ao menos uma camada ativa', () => {
    const s = normalizePaint(null);
    expect(s.layers).toHaveLength(1);
    expect(s.activeId).toBe(s.layers[0]!.id);
    expect(s.width).toBe(1280);
    const t = normalizePaint({ width: 99999, height: -4, background: 'vermelho', layers: [{ id: 'a', opacity: 7 }, { id: 'a', visible: false, name: 'x'.repeat(200) }, 3], activeId: 'nenhuma' });
    expect(t.width).toBe(MAX_SIDE);
    expect(t.height).toBe(16);
    expect(t.background).toBe('#ffffff');
    expect(new Set(t.layers.map((l) => l.id)).size).toBe(t.layers.length);
    expect(t.layers[0]!.opacity).toBe(1);
    expect(t.layers[1]!.visible).toBe(false);
    expect(t.layers[1]!.name).toHaveLength(60);
    expect(t.layers.some((l) => l.id === t.activeId)).toBe(true);
  });
  it('limita o número de camadas e mantém fundo transparente', () => {
    expect(normalizePaint({ layers: Array.from({ length: 50 }, (_, i) => ({ id: 'l' + i })) }).layers).toHaveLength(MAX_LAYERS);
    expect(normalizePaint({ background: 'transparent' }).background).toBe('transparent');
    expect(normalizePaint(blankPaint(300, 200))).toMatchObject({ width: 300, height: 200 });
  });
  it('hexToRgba', () => {
    expect(hexToRgba('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(hexToRgba('inválida', 10)).toEqual([0, 0, 0, 10]);
  });
});

describe('Pintar · formas e desfazer', () => {
  it('linha com Shift prende em 45°', () => {
    const p = constrainLine({ x: 0, y: 0 }, { x: 10, y: 2 });
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.x).toBeCloseTo(Math.hypot(10, 2), 5);
    const q = constrainLine({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(q.x).toBeCloseTo(q.y, 5);
    expect(constrainLine({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
  });
  it('caixa a partir de dois cantos, em qualquer direção, e quadrada com Shift', () => {
    expect(boxFrom({ x: 10, y: 10 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, w: 6, h: 8 });
    expect(boxFrom({ x: 10, y: 10 }, { x: 4, y: 2 }, true)).toEqual({ x: 2, y: 2, w: 8, h: 8 });
  });
  it('carimbos a cada N pixels terminam exatamente no ponto final', () => {
    const s = stamps({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(s).toHaveLength(5);
    expect(s[s.length - 1]).toEqual({ x: 10, y: 0 });
    expect(stamps({ x: 1, y: 1 }, { x: 1, y: 1 }, 2)).toEqual([{ x: 1, y: 1 }]);
  });
  it('pilha: desfaz, refaz, descarta o refazer ao fazer algo novo e respeita o orçamento', () => {
    const log: string[] = [];
    const entry = (name: string, cost = 1) => ({ label: name, cost, undo: () => log.push('-' + name), redo: () => log.push('+' + name) });
    const u = new UndoStack(10, 100);
    u.push(entry('a')); u.push(entry('b'));
    expect(u.undo()).toBe('b'); expect(u.undo()).toBe('a'); expect(u.undo()).toBeNull();
    expect(u.redo()).toBe('a');
    u.push(entry('c'));
    expect(u.canRedo).toBe(false);
    expect(log).toEqual(['-b', '-a', '+a']);
    const small = new UndoStack(10, 100);
    for (let i = 0; i < 5; i++) small.push(entry('x' + i, 4));
    expect(small.size).toBe(2); // 2 × 4 = 8 ≤ 10; o terceiro passaria
    const capped = new UndoStack(1e9, 3);
    for (let i = 0; i < 6; i++) capped.push(entry('y' + i));
    expect(capped.size).toBe(3);
    capped.clear();
    expect(capped.canUndo).toBe(false);
  });
});
