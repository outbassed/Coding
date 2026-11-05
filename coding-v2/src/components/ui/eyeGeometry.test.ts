import { describe, expect, it } from 'vitest';
import { EDGE_MARGIN, EYE_CENTER, IRIS_RADIUS, fits, maxTravel, offsetFor } from './eyeGeometry';

describe('geometria do olho do Visualizador', () => {
  it('a íris cabe no centro e não cabe fora do branco', () => {
    expect(fits(EYE_CENTER.x, EYE_CENTER.y)).toBe(true);
    expect(fits(EYE_CENTER.x + 20, EYE_CENTER.y)).toBe(false);
    expect(fits(EYE_CENTER.x, EYE_CENTER.y + 9)).toBe(false); // metade da íris passaria da pálpebra
  });
  it('o deslocamento máximo, em todas as direções, mantém a íris inteira no branco', () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const t = maxTravel(Math.cos(rad), Math.sin(rad));
      expect(t).toBeGreaterThan(0.2); // sempre sobra um pouco de movimento
      expect(fits(EYE_CENTER.x + Math.cos(rad) * t, EYE_CENTER.y + Math.sin(rad) * t, IRIS_RADIUS)).toBe(true);
      // e um passo a mais já ultrapassaria a folga
      expect(fits(EYE_CENTER.x + Math.cos(rad) * (t + 0.5), EYE_CENTER.y + Math.sin(rad) * (t + 0.5), IRIS_RADIUS + EDGE_MARGIN)).toBe(false);
    }
  });
  it('permite mais movimento na horizontal do que na vertical', () => {
    expect(maxTravel(1, 0)).toBeGreaterThan(maxTravel(0, 1));
    expect(maxTravel(1, 0)).toBeGreaterThan(4); // a animação de abertura usa ±4
  });
  it('o deslocamento é simétrico e proporcional à direção do cursor', () => {
    const a = offsetFor(300, 0), b = offsetFor(-300, 0);
    expect(a.x).toBeCloseTo(-b.x, 6);
    expect(Math.abs(a.y)).toBeLessThan(1e-9);
    const d = offsetFor(200, 200);
    expect(d.x).toBeCloseTo(d.y, 6); // mesma direção diagonal
    expect(offsetFor(10, 0).x).toBeLessThan(offsetFor(300, 0).x); // mais perto, menos movimento
  });
  it('cursor sobre o centro ou valores inválidos centralizam', () => {
    expect(offsetFor(0, 0)).toEqual({ x: 0, y: 0 });
    expect(offsetFor(Number.NaN, 4)).toEqual({ x: 0, y: 0 });
  });
  it('qualquer cursor, de qualquer lugar, resulta numa íris dentro do branco', () => {
    for (const [x, y] of [[1e4, 0], [0, 1e4], [-500, 120], [80, -300], [3, 2], [-1, -1e5]] as const) {
      const o = offsetFor(x, y);
      expect(fits(EYE_CENTER.x + o.x, EYE_CENTER.y + o.y)).toBe(true);
    }
  });
});
