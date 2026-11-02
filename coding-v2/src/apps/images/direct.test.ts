import { describe, expect, it } from 'vitest';
import { cropByEdges, resizeByHandle, toLocal } from './direct';
import { noFilters, type Layer } from './model';

const image = (over: Partial<Layer> = {}): Layer => ({ id: 'a', name: 'Foto', kind: 'image', imageId: 'i', crop: { x: 0, y: 0, w: 1, h: 1 }, x: 100, y: 50, w: 400, h: 200, rotation: 0, flipX: false, flipY: false, opacity: 1, visible: true, filters: noFilters(), ...over });

describe('resizeByHandle', () => {
  it('canto: o canto oposto fica parado e a proporção pode ser mantida', () => {
    const r = resizeByHandle({ x: 100, y: 100, w: 200, h: 100, rotation: 0 }, 1, 1, { x: 500, y: 300 }, false);
    expect(r).toEqual({ x: 100, y: 100, w: 400, h: 200 });
    const k = resizeByHandle({ x: 100, y: 100, w: 200, h: 100, rotation: 0 }, 1, 1, { x: 500, y: 150 }, true);
    expect(k.w / k.h).toBeCloseTo(2, 1);
    expect(k.x).toBe(100);
    expect(k.y).toBe(100);
  });
  it('borda direita: muda só a largura e a borda esquerda não se move', () => {
    const r = resizeByHandle({ x: 100, y: 100, w: 200, h: 100, rotation: 0 }, 1, 0, { x: 450, y: 999 }, true);
    expect(r).toEqual({ x: 100, y: 100, w: 350, h: 100 });
  });
  it('borda de cima: muda só a altura e a de baixo não se move', () => {
    const r = resizeByHandle({ x: 100, y: 100, w: 200, h: 100, rotation: 0 }, 0, -1, { x: 0, y: 40 }, false);
    expect(r).toEqual({ x: 100, y: 40, w: 200, h: 160 });
  });
  it('rotacionada 90°: a "largura" cresce na direção da tela em que o eixo aponta', () => {
    // centro (200,150); girada 90°, o eixo x da camada aponta para baixo na tela
    const r = resizeByHandle({ x: 100, y: 100, w: 200, h: 100, rotation: 90 }, 1, 0, { x: 200, y: 350 }, false);
    expect(r.w).toBe(300);
    expect(r.h).toBe(100);
    expect(r.x + r.w / 2).toBeCloseTo(200, 0);
    expect(r.y + r.h / 2).toBeCloseTo(200, 0);
  });
  it('nunca passa do tamanho mínimo', () => {
    expect(resizeByHandle({ x: 0, y: 0, w: 100, h: 100, rotation: 0 }, 1, 0, { x: -50, y: 0 }, false).w).toBe(8);
  });
});

describe('cropByEdges', () => {
  it('borda esquerda para dentro: o que sobra não se move na tela e a escala não muda', () => {
    const r = cropByEdges(image(), -1, 0, 100, 0)!;
    expect(r.crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
    expect(r.w).toBe(300);
    expect(r.x).toBe(200);
    expect(r.y).toBe(50);
    expect(r.h).toBe(200);
  });
  it('borda direita e de baixo para dentro', () => {
    const r = cropByEdges(image(), 1, 1, 100, 50)!;
    expect(r.crop).toEqual({ x: 0, y: 0, w: 0.75, h: 0.75 });
    expect(r).toMatchObject({ x: 100, y: 50, w: 300, h: 150 });
  });
  it('arrastar para fora devolve o que estava cortado, até o limite da imagem', () => {
    const cropped = image({ crop: { x: 0.25, y: 0, w: 0.75, h: 1 }, x: 200, w: 300 });
    const back = cropByEdges(cropped, -1, 0, -100, 0)!;
    expect(back.crop.x).toBe(0);
    expect(back.crop.w).toBe(1);
    expect(back.x).toBe(100);
    const over = cropByEdges(cropped, -1, 0, -9999, 0)!;
    expect(over.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(over.w).toBe(400);
  });
  it('com espelhamento, a esquerda da tela é a direita da imagem', () => {
    const r = cropByEdges(image({ flipX: true }), -1, 0, 100, 0)!;
    expect(r.crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    expect(r).toMatchObject({ x: 200, w: 300 });
  });
  it('respeita o recorte mínimo', () => {
    const r = cropByEdges(image(), -1, 0, 9999, 0)!;
    expect(r.crop.w).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(r.w).toBeGreaterThanOrEqual(8);
  });
  it('camada girada: o centro anda no eixo da camada', () => {
    const r = cropByEdges(image({ rotation: 90 }), -1, 0, 100, 0)!;
    // eixo x da camada aponta para baixo na tela: o centro desce 50 px (de 150 para 200) e a largura cai 100 px
    expect(r.w).toBe(300);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    expect(cx).toBeCloseTo(300, 0);
    expect(cy).toBeCloseTo(200, 0);
  });
  it('só vale para imagens', () => {
    expect(cropByEdges({ ...image(), kind: 'rect', crop: undefined }, -1, 0, 10, 0)).toBeNull();
  });
});

describe('toLocal', () => {
  it('sem rotação não muda; girado 90° troca os eixos', () => {
    expect(toLocal(0, 10, 5)).toEqual({ x: 10, y: 5 });
    const t = toLocal(90, 10, 0);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(-10);
  });
});
