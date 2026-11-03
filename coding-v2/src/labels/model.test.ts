import { describe, expect, it } from 'vitest';
import { MAX_COPIES, MAX_ITEMS, activeItems, countLabels, defaults, normalize } from './model';

describe('modelo de Etiquetas (idêntico ao Coding atual)', () => {
  it('modelo inicial: um item de exemplo pronto para editar', () => {
    const d = defaults();
    expect(d).toMatchObject({ name: 'Documento sem título', prefix: 'COD: ', orientation: 'portrait', cols: 1, gap: 1, border: true, codeSize: 40, descSize: 34, codeBold: true, codeAlign: 'center' });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ code: '123', description: 'Sua descrição aqui', copies: 3 });
  });
  it('normaliza lixo sem lançar e respeita os limites do original', () => {
    expect(normalize(null).items).toHaveLength(1);
    expect(normalize('x')).toEqual(expect.objectContaining({ cols: 1 }));
    const n = normalize({ cols: 99, gap: -4, codeSize: 1000, descSize: 1, orientation: 'x', codeFont: 'Comic', descAlign: 'justify', items: [{ code: 'a'.repeat(500), copies: 99999 }] });
    expect(n.cols).toBe(3); expect(n.gap).toBe(0); expect(n.codeSize).toBe(96); expect(n.descSize).toBe(8);
    expect(n.orientation).toBe('portrait'); expect(n.codeFont).toBe('Arial'); expect(n.descAlign).toBe('center');
    expect(n.items[0]!.code).toHaveLength(160); expect(n.items[0]!.copies).toBe(MAX_COPIES);
  });
  it('limita a 200 itens e nunca deixa a lista vazia', () => {
    expect(normalize({ items: Array.from({ length: 500 }, () => ({ code: 'x' })) }).items).toHaveLength(MAX_ITEMS);
    expect(normalize({ items: [] }).items).toHaveLength(1);
  });
  it('abre projetos da versão 1 (código único com "repeats") sem borda', () => {
    const n = normalize({ name: 'Antigo', code: '77', description: 'D', repeats: 4 });
    expect(n.items).toHaveLength(1);
    expect(n.items[0]).toMatchObject({ code: '77', description: 'D', copies: 4 });
    expect(n.border).toBe(false);
  });
  it('preserva os ids dos itens (identidade estável na edição)', () => {
    const n = normalize({ items: [{ id: 'abc', code: '1' }] });
    expect(n.items[0]!.id).toBe('abc');
  });
  it('itens vazios não contam como etiquetas', () => {
    const n = normalize({ items: [{ code: '', description: '  ', copies: 9 }, { code: 'A', copies: 2 }, { description: 'B', copies: 3 }] });
    expect(activeItems(n)).toHaveLength(2);
    expect(countLabels(n)).toBe(5);
  });
  it('é idempotente', () => {
    const once = normalize({ name: 'N', items: [{ code: 'x', copies: 2 }], cols: 2 });
    expect(normalize(once)).toEqual(once);
  });
});
