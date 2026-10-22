import { describe, expect, it } from 'vitest';
import { TextHistory } from './history';

const snap = (html: string, at = 0) => ({ html, start: at, end: at });

describe('histórico do Texto', () => {
  it('desfaz e refaz com o cursor de cada passo', () => {
    const h = new TextHistory(snap('<p>a</p>'));
    h.record(snap('<p>ab</p>', 2), '');
    h.record(snap('<p>abc</p>', 3), '');
    expect(h.undo()).toEqual(snap('<p>ab</p>', 2));
    expect(h.undo()).toEqual(snap('<p>a</p>'));
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toEqual(snap('<p>ab</p>', 2));
    expect(h.canRedo).toBe(true);
  });
  it('digitação seguida vira um passo; comando separado não', () => {
    const h = new TextHistory(snap('x'));
    h.record(snap('xa'), 'typing', 100);
    h.record(snap('xab'), 'typing', 300);
    h.record(snap('xabc'), 'typing', 500);
    expect(h.size).toBe(1);
    h.record(snap('<b>xabc</b>'), '', 600);
    expect(h.size).toBe(2);
    h.record(snap('<b>xabcd</b>'), 'typing', 700);
    expect(h.size).toBe(3);
  });
  it('pausa longa começa um novo passo de digitação', () => {
    const h = new TextHistory(snap('x'));
    h.record(snap('xa'), 'typing', 100);
    h.record(snap('xab'), 'typing', 5000);
    expect(h.size).toBe(2);
  });
  it('mudança nova apaga o refazer; igual é ignorada', () => {
    const h = new TextHistory(snap('1'));
    h.record(snap('2'), '');
    h.undo();
    expect(h.record(snap('1'), '')).toBe(false);
    h.record(snap('3'), '');
    expect(h.canRedo).toBe(false);
  });
  it('limita pelo tamanho total do HTML, sem perder o passo mais recente', () => {
    const h = new TextHistory(snap('a'), 80, 100);
    for (let i = 0; i < 20; i += 1) h.record(snap('x'.repeat(30) + i), '');
    expect(h.size).toBeLessThanOrEqual(4);
    expect(h.undo()?.html).toContain('x'.repeat(30) + '18');
  });
  it('reset limpa tudo', () => {
    const h = new TextHistory(snap('a'));
    h.record(snap('b'), '');
    h.reset(snap('c'));
    expect(h.canUndo || h.canRedo).toBe(false);
    expect(h.current.html).toBe('c');
  });
});
