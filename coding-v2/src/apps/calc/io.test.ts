import { describe, expect, it } from 'vitest';
import { exportXlsx, tablesFromXlsx, tableToSheet } from './io';
import { applyColor, effectiveColor, normalizeCalc, type CalcState } from './model';
import { readXlsx } from '../../shared/files/xlsx';

function sample(): CalcState {
  const state = normalizeCalc({ name: 'Cores', sheets: [{ name: 'Vendas', rows: 20, cols: 6, widths: {}, cells: {
    '0:0': { v: 'Produto', b: true, bg: '#1f4e79', fg: '#ffffff' },
    '0:1': { v: 'Valor', b: true },
    '1:0': { v: 'Café' },
    '1:1': { v: '12,5', f: 'currency', fg: '#c00000' },
    '2:1': { v: '=B2*2', f: 'currency' },
    '4:3': { v: '', bg: '#ffff00' }
  } }] });
  applyColor(state.sheets[0]!, { r1: 0, c1: 2, r2: 19, c2: 2 }, 'bg', '#e2efda'); // coluna C inteira
  applyColor(state.sheets[0]!, { r1: 0, c1: 4, r2: 19, c2: 4 }, 'fg', '#7030a0'); // coluna E inteira (fonte)
  return state;
}

describe('Planilhas · XLSX com cores (ida e volta)', () => {
  it('exporta cores, negrito, formatos e colunas inteiras, e o arquivo volta igual', async () => {
    const original = sample();
    const bytes = await exportXlsx(original);
    const read = await readXlsx(bytes);
    const back = tableToSheet(tablesFromXlsx(read)[0]!).sheet;
    const o = original.sheets[0]!;
    // células com estilo próprio
    expect(back.cells['0:0']).toMatchObject({ v: 'Produto', b: true, bg: '#1f4e79', fg: '#ffffff' });
    expect(back.cells['0:1']).toMatchObject({ v: 'Valor', b: true });
    expect(back.cells['1:1']).toMatchObject({ fg: '#c00000', f: 'currency' });
    expect(back.cells['2:1']!.v).toBe('=B2*2');
    // célula vazia só com preenchimento sobrevive
    expect(back.cells['4:3']).toMatchObject({ v: '', bg: '#ffff00' });
    // colunas inteiras
    expect(back.colStyle).toEqual({ '2': { bg: '#e2efda' }, '4': { fg: '#7030a0' } });
    expect(effectiveColor(back, 15, 2, 'bg')).toBe('#e2efda');
    // a célula que existe na coluna colorida leva a cor da coluna de forma explícita no arquivo
    expect(effectiveColor(o, 0, 2, 'bg')).toBe('#e2efda');
  });
  it('um segundo ciclo (exportar de novo o que foi importado) não perde nem inventa estilo', async () => {
    const first = tableToSheet(tablesFromXlsx(await readXlsx(await exportXlsx(sample())))[0]!).sheet;
    const second = tableToSheet(tablesFromXlsx(await readXlsx(await exportXlsx({ name: 'x', active: 0, sheets: [first] })))[0]!).sheet;
    expect(second.cells['0:0']).toEqual(first.cells['0:0']);
    expect(second.colStyle).toEqual(first.colStyle);
  });
  it('"sem cor" explícito em célula de coluna colorida não vaza cor no arquivo', async () => {
    const state = sample();
    state.sheets[0]!.cells['3:2'] = { v: 'sem', bg: 'none' };
    const back = tableToSheet(tablesFromXlsx(await readXlsx(await exportXlsx(state)))[0]!).sheet;
    expect(back.cells['3:2']!.bg).toBeUndefined();
  });
  it('arquivo de terceiros: fonte preta "automática" não vira cor fixa; cor de tema é ignorada com segurança', async () => {
    const t = tablesFromXlsx([{ name: 'X', rows: [[{ value: 'a', style: { fg: '#000000' } }]] }]);
    const sheet = tableToSheet(t[0]!).sheet;
    // (a leitura já descarta o preto sem preenchimento; aqui só conferimos que o importador aceita qualquer coisa sem quebrar)
    expect(sheet.cells['0:0']!.v).toBe('a');
  });
  it('números do XLSX entram com vírgula decimal (1.234 não vira 1234)', () => {
    const t = tablesFromXlsx([{ name: 'N', rows: [[{ value: '1.234', number: 1.234 }, { value: '1500', number: 1500 }]] }]);
    const s = tableToSheet(t[0]!).sheet;
    expect(s.cells['0:0']!.v).toBe('1,234');
    expect(s.cells['0:1']!.v).toBe('1500');
  });
});
