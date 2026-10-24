import { describe, expect, it } from 'vitest';
import { convertRows, guessMapping, parseQty } from './import';

describe('importação de planilha para etiquetas', () => {
  it('adivinha colunas pelo cabeçalho', () => {
    expect(guessMapping(['Código do item', 'Descrição', 'Qtd.'], true)).toEqual({ code: 0, desc: 1, qty: 2 });
    expect(guessMapping(['Produto', 'SKU', 'Quantidade'], true)).toEqual({ code: 1, desc: 0, qty: 2 });
    expect(guessMapping(['a', 'b'], false)).toEqual({ code: 0, desc: 1, qty: -1 });
  });
  it('valida quantidades e ignora linhas vazias', () => {
    const r = convertRows([['Código', 'Descrição', 'Qtd'], ['A1', 'Parafuso', '3'], ['', '', ''], ['A2', 'Porca', 'x'], ['A3', '', '2,0'], ['A4', 'Arruela', '']], { code: 0, desc: 1, qty: 2 }, { hasHeader: true, defaultQty: 1 });
    expect(r.items.map((i) => i.code + ':' + i.copies)).toEqual(['A1:3', 'A3:2', 'A4:1']);
    expect(r.issues.map((i) => i.row)).toEqual([4]);
    expect(r.ignored).toBe(1);
    expect(r.totalLabels).toBe(6);
    expect(parseQty('10 un')).toBe(10);
    expect(parseQty('1,5')).toBeNull();
  });
});
