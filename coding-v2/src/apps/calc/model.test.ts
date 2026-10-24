import { describe, expect, it } from 'vitest';
import { budgetTemplate, deleteRows, display, Evaluator, fillRange, insertCols, insertRows, normalizeCalc, renameSheet, sortRows, type CalcState } from './model';

describe('planilha', () => {
  it('modelo de orçamento calcula totais, % e textos', () => {
    const s = budgetTemplate();
    const ev = new Evaluator(s);
    // Intl usa espaço não separável entre R$ e o número
    const v = (r: number, c: number) => display(ev.value(0, r, c), s.sheets[0]!.cells[r + ':' + c]?.f).replace(/\u00a0/g, ' ');
    expect(v(7, 1)).toBe('R$ 4.120,00');
    expect(v(7, 2)).toBe('R$ 4.031,45');
    expect(v(11, 2)).toBe('Dentro do previsto');
  });
  it('referência circular vira #CIRC! e aba inexistente #REF!', () => {
    const s: CalcState = { name: 'x', active: 0, sheets: [{ id: 'a', name: 'P', rows: 5, cols: 5, widths: {}, cells: { '0:0': { v: '=B1' }, '0:1': { v: '=A1+1' }, '1:0': { v: '=Q!A1' } } }] };
    const ev = new Evaluator(s);
    expect(ev.value(0, 0, 0)).toEqual({ error: '#CIRC!' });
    expect(ev.value(0, 1, 0)).toEqual({ error: '#REF!' });
  });
  it('linhas e colunas inseridas/excluídas mantêm as fórmulas certas', () => {
    const s = budgetTemplate();
    insertRows(s, 0, 3, 1);
    expect(s.sheets[0]!.cells['8:1']!.v).toBe('=SOMA(B2:B8)');
    deleteRows(s, 0, 3, 1);
    expect(s.sheets[0]!.cells['7:1']!.v).toBe('=SOMA(B2:B7)');
    insertCols(s, 0, 0, 1);
    expect(s.sheets[0]!.cells['7:2']!.v).toBe('=SOMA(C2:C7)');
  });
  it('renomear aba atualiza referências de outras abas', () => {
    const s: CalcState = { name: 'x', active: 0, sheets: [{ id: 'a', name: 'P', rows: 5, cols: 5, cells: {}, widths: {} }, { id: 'b', name: 'Q', rows: 5, cols: 5, widths: {}, cells: { '0:0': { v: '=P!A1*2+SOMA(P!A1:A2;1)' } } }] };
    expect(renameSheet(s, 0, 'Vendas 2026')).toBeNull();
    expect(s.sheets[1]!.cells['0:0']!.v).toBe("='Vendas 2026'!A1*2+SOMA('Vendas 2026'!A1:A2;1)");
    expect(renameSheet(s, 1, 'vendas 2026')).toContain('Já existe');
  });
  it('normalização descarta células fora da aba e chaves inválidas', () => {
    const s = normalizeCalc({ sheets: [{ name: 'a!b', rows: 3, cols: 3, cells: { '9:9': { v: 'x' }, '1:1': { v: 5 }, bad: { v: 'y' } } }] });
    expect(s.sheets[0]!.name).toBe('a b');
    expect(Object.keys(s.sheets[0]!.cells)).toEqual(['1:1']);
    expect(normalizeCalc(null).sheets).toHaveLength(1);
  });
  it('preencher para baixo ajusta fórmulas relativas e mantém as absolutas', () => {
    const s: CalcState = { name: 'x', active: 0, sheets: [{ id: 'a', name: 'P', rows: 10, cols: 5, widths: {}, cells: { '0:0': { v: '=B1*$C$1' } } }] };
    fillRange(s, 0, 0, 0, 2, 0, 'down');
    expect(s.sheets[0]!.cells['2:0']!.v).toBe('=B3*$C$1');
  });
  it('classificar ordena números e textos e deixa vazias no fim', () => {
    const s: CalcState = { name: 'x', active: 0, sheets: [{ id: 'a', name: 'P', rows: 10, cols: 3, widths: {}, cells: { '0:0': { v: 'Nome' }, '1:0': { v: 'Caio' }, '1:1': { v: '3' }, '2:0': { v: 'ana' }, '2:1': { v: '1' }, '3:0': { v: 'Bia' }, '3:1': { v: '2' } } }] };
    sortRows(s, 0, 1, 3, 0, false);
    expect([1, 2, 3].map((r) => s.sheets[0]!.cells[r + ':0']!.v)).toEqual(['ana', 'Bia', 'Caio']);
    expect(s.sheets[0]!.cells['1:1']!.v).toBe('1');
    sortRows(s, 0, 1, 3, 1, true);
    expect(s.sheets[0]!.cells['1:0']!.v).toBe('Caio');
  });
});
