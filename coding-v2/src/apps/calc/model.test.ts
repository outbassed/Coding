import { describe, expect, it } from 'vitest';
import { budgetTemplate, deleteRows, display, Evaluator, insertCols, insertRows, normalizeCalc, renameSheet, type CalcState } from './model';

describe('planilha', () => {
  it('modelo de orçamento calcula totais, % e textos', () => {
    const s = budgetTemplate();
    const ev = new Evaluator(s);
    const v = (r: number, c: number) => display(ev.value(0, r, c), s.sheets[0]!.cells[r + ':' + c]?.f);
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
});
