import { beforeEach, describe, expect, it } from 'vitest';
import { LruCache, TaskQueue } from './cache';
import { buildPreview, labelsPreview, textPreview, previewable, MAX_PREVIEW_BLOCKS } from './model';
import { budgetTemplate } from '../apps/calc/model';
import { demoSplit } from '../apps/split/model';
import { demoCodes } from '../apps/codes/model';
import { demoDraw } from '../apps/draw/model';
import { demoImages } from '../apps/images/model';
import { defaults } from '../labels/model';

describe('cache LRU', () => {
  it('descarta o menos usado e respeita acessos recentes', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(2);
  });
});
describe('fila de tarefas', () => {
  it('limita a concorrência', async () => {
    const q = new TaskQueue(2);
    let active = 0, peak = 0;
    const task = async (): Promise<void> => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; };
    await Promise.all(Array.from({ length: 6 }, () => q.run(task)));
    expect(peak).toBe(2);
  });
});
describe('modelos de prévia', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('etiquetas: só itens com conteúdo e limite de blocos', () => {
    const state = { ...defaults(), items: [
      { id: 'a', code: 'X1', description: 'um', copies: 500 },
      { id: 'b', code: '', description: '', copies: 3 },
      { id: 'c', code: 'X2', description: '', copies: 2 }
    ] };
    const p = labelsPreview(state);
    expect(p.kind).toBe('labels');
    if (p.kind === 'labels') {
      expect(p.blocks).toBe(MAX_PREVIEW_BLOCKS);
      expect(p.state.items.map(i => i.code)).toEqual(['X1']);
      expect(state.items[0]!.copies).toBe(500);
    }
  });
  it('texto: corta o início, mantém formatação e remove o que é perigoso', () => {
    const long = Array.from({ length: 200 }, (_, i) => '<p>Parágrafo ' + i + ' ' + 'x'.repeat(80) + '</p>').join('');
    const p = textPreview({ name: 'T', html: '<h1 onclick="x()">Título</h1><p style="font-size: 20px; color: #c0392b">Olá</p><script>1</script>' + long });
    expect(p.kind).toBe('text');
    if (p.kind === 'text') {
      expect(p.html).toContain('<h1>Título</h1>');
      expect(p.html).toContain('font-size');
      expect(p.html).not.toMatch(/script|onclick/);
      expect(p.html.length).toBeLessThan(6000);
    }
  });
  it('texto puro e parágrafo gigante também produzem miniatura útil e limitada', () => {
    const plain = textPreview({ name: 'T', html: 'Documento de texto simples' });
    if (plain.kind === 'text') expect(plain.html).toContain('Documento de texto simples');
    const imageOnly = textPreview({ name: 'T', html: '<img src="data:image/png;base64,AAAA">' });
    if (imageOnly.kind === 'text') expect(imageOnly.html).toContain('<img');
    const giant = textPreview({ name: 'T', html: '<p>' + 'x'.repeat(100_000) + '</p>' });
    if (giant.kind === 'text') {
      expect(giant.html).toContain('x'.repeat(200));
      expect(giant.html.length).toBeLessThan(2500);
    }
  });
  it('texto: imagens grandes ficam fora da prévia', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(200_000);
    const p = textPreview({ name: 'T', html: '<p>oi</p><p><img src="' + big + '"></p>' });
    if (p.kind === 'text') expect(p.html).not.toContain('<img');
  });
  it('rejeita estado inválido e reconhece tipos com prévia', () => {
    expect(() => textPreview(null)).toThrow();
    expect(previewable('labels')).toBe(true);
    expect(previewable('texts')).toBe(true);
    expect(previewable('sheet')).toBe(true);
    expect(previewable('desconhecido')).toBe(false);
  });
  it('prévias dos apps novos usam os dados reais e recusam formatos antigos do 1.0', () => {
    const calc = buildPreview('calc', budgetTemplate());
    expect(calc.kind === 'table' && calc.rows.flat().map((v) => v.replace(/\u00a0/g, ' '))).toContain('R$ 4.120,00');
    expect(() => buildPreview('calc', { name: 'planilha antiga do Coding 1.0', data: [[1, 2]] })).toThrow();
    const split = buildPreview('split', demoSplit());
    expect(split.kind === 'summary' && split.lines[0]).toEqual(['Total', expect.stringContaining('2.006,40')]);
    const codes = buildPreview('codes', demoCodes());
    expect(codes.kind === 'codes' && codes.svgs.length).toBe(3);
    expect(buildPreview('draw', demoDraw()).kind).toBe('summary');
    expect(buildPreview('images', demoImages()).kind).toBe('summary');
  });
});
