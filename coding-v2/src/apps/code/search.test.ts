import { describe, expect, it } from 'vitest';
import { findHits, lineCol, replaceAllIn } from './search';

const files = [{ path: 'a.js', text: 'foo Foo\nbar FOO\n' }, { path: 'b/c.css', text: 'x foo.y' }];

describe('Código · localizar e substituir', () => {
  it('acha em todos os arquivos com linha e coluna, com e sem diferenciar maiúsculas', () => {
    const all = findHits(files, 'foo', false);
    expect(all.total).toBe(4);
    expect(all.hits.map((h) => [h.path, h.line, h.col])).toEqual([['a.js', 1, 1], ['a.js', 1, 5], ['a.js', 2, 5], ['b/c.css', 1, 3]]);
    expect(findHits(files, 'foo', true).total).toBe(2);
    expect(findHits(files, 'FOO', true).hits[0]).toMatchObject({ path: 'a.js', line: 2, preview: 'bar FOO' });
  });
  it('consulta vazia não acha nada; símbolos de regex são literais; o limite de resultados vale', () => {
    expect(findHits(files, '', false).total).toBe(0);
    expect(findHits([{ path: 'x', text: 'a.b a*b (a)' }], '.', false).total).toBe(1);
    expect(findHits([{ path: 'x', text: 'a*b a*b' }], 'a*b', false).total).toBe(2);
    const many = findHits([{ path: 'x', text: 'ab'.repeat(1000) }], 'a', false, 10);
    expect([many.hits.length, many.total, many.truncated]).toEqual([10, 1000, true]);
  });
  it('substitui tudo, conta e trata $ literalmente', () => {
    expect(replaceAllIn('foo Foo FOO', 'foo', 'bar', false)).toEqual({ text: 'bar bar bar', count: 3 });
    expect(replaceAllIn('foo Foo FOO', 'foo', 'bar', true)).toEqual({ text: 'bar Foo FOO', count: 1 });
    expect(replaceAllIn('a b', 'a', '$&$1', false).text).toBe('$&$1 b');
    expect(replaceAllIn('abc', '', 'x', false)).toEqual({ text: 'abc', count: 0 });
  });
  it('lineCol conta linhas a partir de 1', () => {
    expect(lineCol('ab\ncd\n', 0)).toEqual({ line: 1, col: 1 });
    expect(lineCol('ab\ncd\n', 4)).toEqual({ line: 2, col: 2 });
  });
});
