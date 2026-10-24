import { describe, expect, it } from 'vitest';
import { available, demoDraw, drawNumbers, makeTeams, randomBelow, rollDice, wheelAngle } from './model';

describe('sorteio', () => {
  it('aleatoriedade sem viés e dentro do intervalo', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[randomBelow(3)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(1700);
    expect(rollDice({ count: 50, sides: 6 }).every((v) => v >= 1 && v <= 6)).toBe(true);
  });
  it('não repete quem já saiu quando a opção está ligada', () => {
    const s = demoDraw();
    s.drawn = ['Ana', 'Bruno'];
    expect(available(s)).not.toContain('Ana');
    expect(available(s)).toHaveLength(6);
    s.excludeDrawn = false;
    expect(available(s)).toHaveLength(8);
  });
  it('números únicos e validação', () => {
    expect(drawNumbers({ min: 1, max: 5, count: 5, unique: true }).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(() => drawNumbers({ min: 1, max: 3, count: 4, unique: true })).toThrow();
  });
  it('equipes equilibradas e ângulo da roleta aponta o segmento sorteado', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd', 'e'], 2);
    expect(Math.abs(teams[0]!.length - teams[1]!.length)).toBeLessThanOrEqual(1);
    expect(teams.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(wheelAngle(2, 8, 0) % 360).toBe(360 - (2 * 45 + 22.5));
  });
});
