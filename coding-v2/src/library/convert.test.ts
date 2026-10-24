import { describe, expect, it } from 'vitest';
import { convertCalc, convertCodes, convertDraw, convertImages, convertPdf, convertSheet, convertSplit, converterFor } from './convert';
import { normalizePdf } from '../apps/pdf/model';
import { normalizeImages } from '../apps/images/model';
import { normalizeCalc, Evaluator, display } from '../apps/calc/model';
import { normalizeSplit, summarize } from '../apps/split/model';
import { normalizeDraw } from '../apps/draw/model';
import { normalizeCodes } from '../apps/codes/model';
import { normalizeSheetLabels } from '../apps/sheet-labels/model';

describe('conversão de documentos do Coding 1.0', () => {
  it('planilha: células, fórmulas, formatos e alinhamento', () => {
    const s = normalizeCalc(convertCalc({ name: 'Antiga', rows: 10, cols: 5, cells: { '0,0': { v: '2' }, '1,0': { v: '3', n: 'brl', a: 'r', b: true }, '2,0': { v: '=SOMA(A1:A2)' } } }));
    const ev = new Evaluator(s);
    expect(ev.value(0, 2, 0)).toBe(5);
    expect(s.sheets[0]!.cells['1:0']).toEqual({ v: '3', f: 'currency', a: 'right', b: true });
    expect(display(5, 'currency').replace(/ /g, ' ')).toBe('R$ 5,00');
  });
  it('racha-conta: conta dividida igualmente com gorjeta e por itens', () => {
    const eq = normalizeSplit(convertSplit({ tab: 'eq', total: '100,00', people: 4, tip: 10 }));
    expect(summarize(eq).total).toBe(11000);
    expect(eq.people).toHaveLength(4);
    const items = normalizeSplit(convertSplit({ tab: 'items', names: ['Ana', 'Rui'], items: [{ name: 'Pizza', price: '50', who: [0, 1] }, { name: 'Suco', price: '8', who: [1] }], tip2: 10 }));
    const sum = summarize(items);
    expect(sum.total).toBe(5800 + 580);
    expect(sum.owed[items.people[1]!.id]).toBe(2500 + 800 + 290);
  });
  it('sorteio, códigos e planilha→etiquetas', () => {
    const d = normalizeDraw(convertDraw({ tab: 'names', names: 'Ana\nBia\n\nCaio', remove: true, winners: ['Bia'] }));
    expect(d.participants).toEqual(['Ana', 'Bia', 'Caio']);
    expect(d.drawn).toEqual(['Bia']);
    const c = normalizeCodes(convertCodes({ kind: 'ean13', items: [{ content: '789123456789', label: 'Café', copies: 3 }], cols: 3 }));
    expect(c.items[0]).toMatchObject({ kind: 'ean13', value: '789123456789', caption: 'Café', copies: 3 });
    const sl = normalizeSheetLabels(convertSheet({ rows: [['A', 'B'], ['1', 'x']], header: true, colCode: 0, colDesc: 1, colCopies: -1, defCopies: 2 }));
    expect(sl.map).toEqual({ code: 0, desc: 1, qty: -1 });
    expect(sl.defaultQty).toBe(2);
  });
  it('só documentos do 1.0 precisam de conversão', () => {
    expect(converterFor({ type: 'calc', legacyId: 'antigo-1' })).not.toBeNull();
    expect(converterFor({ type: 'calc', legacyId: 'v2-calc-1' })).toBeNull();
    expect(converterFor({ type: 'images', legacyId: 'x' })).not.toBeNull();
    expect(converterFor({ type: 'images', legacyId: 'v2-images-1' })).toBeNull();
  });
  it('PDF e Imagens do 1.0 mantêm arquivos, páginas, giros e textos', () => {
    const pdf = normalizePdf(convertPdf({ files: [{ id: 'abcd1234', name: 'a.pdf' }], pages: [{ src: 0, idx: 2, extra: 90, ann: [{ type: 'text', u: 0.1, v: 0.2, text: 'Oi', size: 0.03 }] }, { src: 5, idx: 0 }] }));
    expect(pdf.pages).toEqual([{ id: 'p1', src: 'abcd1234', index: 2, rotate: 90 }]);
    expect(pdf.sources[0]).toEqual({ id: 'abcd1234', name: 'a.pdf', pages: 3 });
    expect(pdf.annotations[0]).toMatchObject({ kind: 'text', text: 'Oi', size: 18 });
    const img = normalizeImages(convertImages({ w: 800, h: 600, curId: 'foto1234', filter: { id: 'bw' }, objects: [{ t: 'text', text: 'Olá', x: 400, y: 300, size: 50 }] }));
    expect(img.layers.map((l) => l.kind)).toEqual(['image', 'text']);
    expect(img.layers[0]!.filters.grayscale).toBe(100);
    expect(img.layers[1]!.text).toBe('Olá');
  });
});
