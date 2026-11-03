import { describe, expect, it } from 'vitest';
import { applyColor, budgetTemplate, clearColors, deleteCols, deleteRows, display, effectiveColor, Evaluator, fillRange, insertCols, insertRows, normalizeCalc, readableOn, renameSheet, shownColors, sortRows, wholeColumns, wholeRows, type CalcState, type Sheet } from './model';

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

describe('Planilhas · cores de fonte e preenchimento', () => {
  const blank = (): Sheet => normalizeCalc({ sheets: [{ name: 'A', rows: 10, cols: 5, cells: { '0:0': { v: 'x' } }, widths: {} }] }).sheets[0]!;
  it('célula e intervalo: grava no modelo, sem mexer no valor', () => {
    const s = blank();
    expect(applyColor(s, { r1: 0, c1: 0, r2: 1, c2: 1 }, 'bg', '#FFEE00')).toBe(4);
    expect(s.cells['0:0']).toEqual({ v: 'x', bg: '#ffee00' });
    expect(s.cells['1:1']).toEqual({ v: '', bg: '#ffee00' }); // célula vazia só com preenchimento é mantida
    applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'fg', '#ff0000');
    expect(effectiveColor(s, 0, 0, 'fg')).toBe('#ff0000');
    expect(effectiveColor(s, 0, 0, 'bg')).toBe('#ffee00');
  });
  it('remover a cor apaga a célula que ficou vazia', () => {
    const s = blank();
    applyColor(s, { r1: 3, c1: 3, r2: 3, c2: 3 }, 'bg', '#00ff00');
    expect(Object.keys(s.cells)).toContain('3:3');
    applyColor(s, { r1: 3, c1: 3, r2: 3, c2: 3 }, 'bg', null);
    expect(Object.keys(s.cells)).not.toContain('3:3');
    expect(s.cells['0:0']!.v).toBe('x');
  });
  it('coluna inteira: a cor fica na coluna (vale para células novas) e limpa as exceções', () => {
    const s = blank();
    applyColor(s, { r1: 2, c1: 1, r2: 2, c2: 1 }, 'bg', '#ff0000'); // exceção na coluna B
    expect(wholeColumns(s, { r1: 0, c1: 1, r2: 9, c2: 1 })).toBe(true);
    applyColor(s, { r1: 0, c1: 1, r2: 9, c2: 2 }, 'bg', '#0000ff'); // colunas B e C
    expect(s.colStyle).toEqual({ '1': { bg: '#0000ff' }, '2': { bg: '#0000ff' } });
    expect(s.cells['2:1']).toBeUndefined();
    expect(effectiveColor(s, 7, 2, 'bg')).toBe('#0000ff'); // linha qualquer, célula que nunca existiu
    expect(effectiveColor(s, 7, 3, 'bg')).toBeUndefined();
  });
  it('célula dentro de coluna colorida: "sem cor" vira exceção explícita e não herda', () => {
    const s = blank();
    applyColor(s, { r1: 0, c1: 2, r2: 9, c2: 2 }, 'bg', '#123456');
    applyColor(s, { r1: 4, c1: 2, r2: 4, c2: 2 }, 'bg', null);
    expect(s.cells['4:2']).toEqual({ v: '', bg: 'none' });
    expect(effectiveColor(s, 4, 2, 'bg')).toBeUndefined();
    expect(effectiveColor(s, 5, 2, 'bg')).toBe('#123456');
    applyColor(s, { r1: 4, c1: 2, r2: 4, c2: 2 }, 'bg', '#abcdef'); // cor própria vence a da coluna
    expect(effectiveColor(s, 4, 2, 'bg')).toBe('#abcdef');
  });
  it('linha inteira grava em cada célula e vence a coluna; coluna depois vence a linha', () => {
    const s = blank();
    applyColor(s, { r1: 0, c1: 0, r2: 9, c2: 0 }, 'bg', '#111111');
    expect(wholeRows(s, { r1: 3, c1: 0, r2: 3, c2: 4 })).toBe(true);
    applyColor(s, { r1: 3, c1: 0, r2: 3, c2: 4 }, 'bg', '#222222');
    expect(effectiveColor(s, 3, 0, 'bg')).toBe('#222222');
    expect(effectiveColor(s, 3, 4, 'bg')).toBe('#222222');
    applyColor(s, { r1: 0, c1: 0, r2: 9, c2: 0 }, 'bg', '#333333');
    expect(effectiveColor(s, 3, 0, 'bg')).toBe('#333333');
  });
  it('entradas inválidas não entram: nome de cor, url, tamanho errado', () => {
    const s = blank();
    expect(applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'fg', 'red')).toBe(0);
    expect(applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'bg', 'url(javascript:1)')).toBe(0);
    expect(applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'bg', '#fff')).toBe(0);
    expect(s.cells['0:0']).toEqual({ v: 'x' });
  });
  it('inserir e excluir colunas levam o estilo de coluna junto', () => {
    const state = normalizeCalc({ sheets: [{ name: 'A', rows: 10, cols: 5, cells: {}, widths: {}, colStyle: { '1': { bg: '#ff0000' }, '3': { fg: '#00ff00' } } }] });
    insertCols(state, 0, 1, 1);
    expect(state.sheets[0]!.colStyle).toEqual({ '2': { bg: '#ff0000' }, '4': { fg: '#00ff00' } });
    deleteCols(state, 0, 2, 1);
    expect(state.sheets[0]!.colStyle).toEqual({ '3': { fg: '#00ff00' } });
  });
  it('persistência: normalize mantém cores válidas e descarta as inválidas', () => {
    const state = normalizeCalc({ sheets: [{ name: 'A', rows: 10, cols: 5, widths: {},
      cells: { '0:0': { v: '1', fg: '#ABCDEF', bg: 'none' }, '1:1': { v: '', bg: '#00ff00' }, '2:2': { v: '', bg: 'red' }, '3:3': { v: 'a', fg: 'javascript:alert(1)' } },
      colStyle: { '0': { bg: '#112233' }, '9': { bg: '#445566' }, '1': { bg: 'blue' } } }] });
    const s = state.sheets[0]!;
    expect(s.cells['0:0']).toEqual({ v: '1', fg: '#abcdef', bg: 'none' });
    expect(s.cells['1:1']).toEqual({ v: '', bg: '#00ff00' });
    expect(s.cells['2:2']).toBeUndefined();
    expect(s.cells['3:3']).toEqual({ v: 'a' });
    expect(s.colStyle).toEqual({ '0': { bg: '#112233' } }); // coluna 9 fora da aba e cor "blue" descartadas
    const again = normalizeCalc(JSON.parse(JSON.stringify(state)));
    expect(again).toEqual(state);
  });
  it('texto legível sobre o preenchimento: preto no claro, branco no escuro', () => {
    expect(readableOn('#ffff00')).toBe('#000000');
    expect(readableOn('#000080')).toBe('#ffffff');
    const s = blank();
    applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'bg', '#202020');
    expect(shownColors(s, 0, 0)).toEqual({ fg: '#ffffff', bg: '#202020' });
    applyColor(s, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'fg', '#ff00ff');
    expect(shownColors(s, 0, 0).fg).toBe('#ff00ff');
  });
  it('limpar formatação tira as cores da seleção', () => {
    const s = blank();
    applyColor(s, { r1: 0, c1: 0, r2: 2, c2: 2 }, 'bg', '#ff0000');
    applyColor(s, { r1: 0, c1: 0, r2: 2, c2: 2 }, 'fg', '#00ff00');
    clearColors(s, { r1: 0, c1: 0, r2: 2, c2: 2 });
    expect(s.cells).toEqual({ '0:0': { v: 'x' } });
  });
});
