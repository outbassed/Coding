import { describe, expect, it } from 'vitest';
import { allocate, formatMoney, parseMoney } from './money';
import { demoSplit, normalizeSplit, owedFor, settle, summarize } from './model';

describe('dinheiro em centavos', () => {
  it.each([['1.234,56', 123456], ['1234,5', 123450], ['1234.56', 123456], ['R$ 10', 1000], ['0,01', 1], ['abc', null], ['1.000', 100000]] as [string, number | null][])('%s', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });
  it('divisão sempre soma exatamente o total (maior resto)', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    for (let t = 0; t < 300; t++) {
      const total = Math.floor(Math.random() * 1e7);
      const weights = [1, 2, 3, 0, 5].map((x) => Math.floor(Math.random() * x * 100) + 1);
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
    expect(formatMoney(123456)).toMatch(/1\.234,56/);
  });
});
describe('racha-conta', () => {
  it('saldos fecham em zero e acertos quitam todo mundo', () => {
    const s = demoSplit();
    const sum = summarize(s);
    expect(sum.total).toBe(200640);
    expect(Object.values(sum.balance).reduce((a, b) => a + b, 0)).toBe(0);
    const t = settle(sum.balance, s.people.map((p) => p.id));
    expect(t.length).toBeLessThanOrEqual(s.people.length - 1);
    const after = { ...sum.balance };
    for (const x of t) { after[x.from]! += x.amount; after[x.to]! -= x.amount; }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
  it('porcentagens e valores precisam fechar o total', () => {
    const s = demoSplit();
    const e = { ...s.expenses[2]!, shares: {} };
    expect(owedFor(e, s.people).error).toContain('100%');
    const c = { ...s.expenses[3]!, shares: { [s.people[0]!.id]: 100 } };
    expect(owedFor(c, s.people).error).toContain('Faltam');
  });
  it('normaliza dados estranhos sem perder a estrutura', () => {
    const s = normalizeSplit({ people: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }], expenses: [{ amount: 1.5, payer: 'zz' }] });
    expect(s.people[1]!.id).not.toBe('x');
    expect(s.expenses[0]!.amount).toBe(0);
    expect(s.expenses[0]!.payer).toBe('x');
  });
});
