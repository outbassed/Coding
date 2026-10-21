import { describe, expect, it } from 'vitest';
import { History } from './history';
import { defaults, type LabelsState } from './model';

const withName = (name: string): LabelsState => ({ ...defaults(), name });

describe('desfazer/refazer', () => {
  it('desfaz e refaz passo a passo', () => {
    const base = withName('a');
    const h = new History(base);
    h.record(withName('b'), '', 0); h.record(withName('c'), '', 5000);
    expect(h.undo()!.name).toBe('b');
    expect(h.undo()!.name).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()!.name).toBe('b');
    expect(h.canRedo).toBe(true);
  });
  it('digitação contínua no mesmo campo vira um passo só', () => {
    const h = new History(withName(''));
    h.record(withName('o'), 'f:name', 0);
    h.record(withName('ol'), 'f:name', 300);
    h.record(withName('olá'), 'f:name', 600);
    expect(h.undo()!.name).toBe('');
    expect(h.canUndo).toBe(false);
  });
  it('pausa longa ou outro campo começam um novo passo', () => {
    const h = new History(withName(''));
    h.record(withName('a'), 'f:name', 0);
    h.record(withName('ab'), 'f:name', 5000);
    expect(h.undo()!.name).toBe('a');
  });
  it('mudança nova apaga o "refazer" e mudança igual é ignorada', () => {
    const h = new History(withName('a'));
    h.record(withName('b'), '', 0);
    h.undo();
    expect(h.record(withName('a'), '', 10)).toBe(false);
    h.record(withName('z'), '', 20);
    expect(h.canRedo).toBe(false);
  });
  it('respeita o limite de passos', () => {
    const h = new History(withName('0'), 3);
    for (let i = 1; i <= 10; i++) h.record(withName(String(i)), '', i * 10000);
    let steps = 0; while (h.undo()) steps++;
    expect(steps).toBe(3);
  });
  it('não compartilha referências com o estado ativo', () => {
    const live = withName('x');
    const h = new History(live);
    live.items[0]!.code = 'mutado';
    h.record(withName('y'), '', 0);
    expect(h.undo()!.items[0]!.code).toBe('123');
  });
});
