import { describe, expect, it } from 'vitest';
import { positionFor, readMemory, readView, withPosition, writeMemory, writeView } from './view';

function fake(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
describe('memória da biblioteca', () => {
  it('guarda e restaura a posição de cada aplicativo de forma independente', () => {
    const s = fake();
    let memory = readMemory(s);
    memory = withPosition(withPosition(memory, 'labels', 3), 'texts', 2);
    writeMemory({ ...memory, tool: 'labels' }, s);
    const back = readMemory(s);
    expect(back.tool).toBe('labels');
    expect(positionFor(back, 'labels', 5)).toBe(3);
    expect(positionFor(back, 'texts', 5)).toBe(2);
    expect(positionFor(back, 'all', 5)).toBe(1);
  });
  it('limita a posição ao total de páginas e remove a posição 1', () => {
    const m = withPosition({ positions: {}, tool: 'all' }, 'all', 9);
    expect(positionFor(m, 'all', 4)).toBe(4);
    expect(withPosition(m, 'all', 1).positions).toEqual({});
  });
  it('ignora dados corrompidos ou hostis', () => {
    const s = fake();
    s.data['coding-v2:library:memory'] = '{"positions":{"<x>":3,"ok":-2,"fine":4.5,"labels":7},"tool":"<script>"}';
    expect(readMemory(s)).toEqual({ positions: { labels: 7 }, tool: 'all' });
    s.data['coding-v2:library:memory'] = 'não é json';
    expect(readMemory(s)).toEqual({ positions: {}, tool: 'all' });
  });
  it('sem armazenamento disponível nada quebra', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(readMemory(broken).tool).toBe('all');
    expect(() => writeMemory({ positions: {}, tool: 'all' }, broken)).not.toThrow();
    expect(readView(broken)).toBe('grid');
    expect(() => writeView('list', broken)).not.toThrow();
  });
  it('modo de exibição: grade por padrão e lista quando escolhida', () => {
    const s = fake();
    expect(readView(s)).toBe('grid');
    writeView('list', s);
    expect(readView(s)).toBe('list');
  });
});
