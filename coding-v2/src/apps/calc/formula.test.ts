import { describe, expect, it } from 'vitest';
import { evaluate, formatGeneral, parse, parseNumber, shiftFormula, toExcelFormula, tokenize, type Value } from './formula';

const grid: Record<string, Value> = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 'abc', '1,1': 10 };
const other: Record<string, Value> = { '0,0': 100 };
const ctx = { maxRows: 1000, maxCols: 52, cell: (s: string | null, r: number, c: number): Value | null => (s === null ? grid[r + ',' + c] ?? null : s === 'Plan 2' ? other[r + ',' + c] ?? null : { error: '#REF!' }) };
const ev = (f: string) => evaluate(parse(tokenize(f)), ctx);

describe('motor de fórmulas', () => {
  it.each([
    ['SOMA(A1:A3)', 6], ['SUM(A1:A3,4)', 10], ['MÉDIA(A1:A3)', 2], ['MIN(A1:A3)', 1], ['MÁXIMO(A1:A3)', 3],
    ['A1+B2*2', 21], ['(A1+B2)*2', 22], ['-A1^2', 1], ['50%*A3', 1.5], ["'Plan 2'!A1+1", 101],
    ['CONT.NÚM(A1:B3)', 4], ['CONT.VALORES(A1:B3)', 5], ['SOMASE(A1:A3;">1")', 5], ['SE(A1>0;"sim";"não")', 'sim'],
    ['A1&"x"', '1x'], ['ARRED(2,345;2)', 2.35], ['ARRED(2.345,2)', 2.35], ['SEERRO(1/0;0)', 0], ['MOD(-3;5)', 2], ['"a"="A"', true]
  ] as [string, Value][])('%s', (f, expected) => { expect(ev(f)).toEqual(expected); });
  it('erros no padrão das planilhas', () => {
    expect(ev('10/0')).toEqual({ error: '#DIV/0!' });
    expect(ev('B1*2')).toEqual({ error: '#VALOR!' });
    expect(ev('FOO(1)')).toEqual({ error: '#NOME?' });
    expect(ev('Q!A1')).toEqual({ error: '#REF!' });
    expect(() => parse(tokenize('SOMA(A1'))).toThrow();
  });
  it('números digitados em português e em inglês', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('50%')).toBe(0.5);
    expect(parseNumber('R$ 10')).toBe(10);
    expect(parseNumber('abc')).toBeNull();
    expect(formatGeneral(0.1 + 0.2)).toBe('0,3');
  });
  it('inserir e excluir linhas/colunas ajusta referências', () => {
    expect(shiftFormula('SOMA(A1:A3)+B2', 'P', { axis: 'row', at: 1, delta: 1, sheet: 'P' })).toBe('SOMA(A1:A4)+B3');
    expect(shiftFormula('A2*2', 'P', { axis: 'row', at: 1, delta: -1, sheet: 'P' })).toBe('#REF!*2');
    expect(shiftFormula('C1+$D$4', 'P', { axis: 'col', at: 0, delta: 1, sheet: 'P' })).toBe('D1+$E$4');
    expect(shiftFormula('A1', 'P', { axis: 'row', at: 0, delta: 1, sheet: 'Outra' })).toBe('A1');
  });
  it('exporta no dialeto do Excel', () => {
    expect(toExcelFormula('SOMA(A1:A3;2,5)+MÉDIA(B1:B2)')).toBe('SUM(A1:A3,2.5)+AVERAGE(B1:B2)');
    expect(toExcelFormula('SE(A1>0;"a";"b")')).toBe('IF(A1>0,"a","b")');
    expect(toExcelFormula('SOMA(')).toBeNull();
  });
});
