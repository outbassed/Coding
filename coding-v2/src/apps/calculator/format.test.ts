import { describe, expect, it } from 'vitest';
import { formatNumber, plainNumber } from './format';

describe('formato dos números da calculadora', () => {
  it('padrão brasileiro com milhar e vírgula', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(-0.25)).toBe('-0,25');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1 / 3)).toBe('0,3333333333');
  });
  it('casas fixas e arredondamento', () => {
    expect(formatNumber(2, 2)).toBe('2,00');
    expect(formatNumber(1234.5678, 2)).toBe('1.234,57');
    expect(formatNumber(0, 2)).toBe('0,00');
    expect(formatNumber(-0.001, 2)).toBe('0,00');
    expect(formatNumber(10.5, 0)).toBe('11');
  });
  it('números enormes e minúsculos viram notação científica legível', () => {
    expect(formatNumber(1e21)).toBe('1e+21');
    expect(formatNumber(1.5e21)).toBe('1,5e+21');
    expect(formatNumber(2.5e-12)).toBe('2,5e-12');
  });
  it('valores inválidos não quebram', () => {
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });
  it('texto simples para voltar à expressão', () => {
    expect(plainNumber(1234.5)).toBe('1234,5');
    expect(plainNumber(0.1 + 0.2)).toBe('0,3');
    expect(plainNumber(-0)).toBe('0');
    expect(plainNumber(1e21)).toBe('1e21');
  });
});
