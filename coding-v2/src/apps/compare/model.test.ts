import { describe, expect, it } from 'vitest';
import { bothTextual, collapseRows, emptyCompare, normalizeCompare, textSource } from './model';
import { compareKind, compareTemplates } from './kind';
import { compareText } from './diff';

describe('comparador · documento', () => {
  it('normaliza dados corrompidos', () => {
    for (const raw of [null, undefined, 4, 'x', [], {}, { a: 3, b: 'x', options: 5, view: 'zzz' }]) {
      const s = normalizeCompare(raw);
      expect(s.a.kind).toBe('empty');
      expect(s.view).toBe('side');
      expect(s.options).toEqual({ ignoreCase: false, ignoreSpace: false, ignoreBlank: false });
    }
  });
  it('binário só vale com blobId; texto vazio vira "empty"', () => {
    expect(normalizeCompare({ a: { kind: 'binary', name: 'x.bin', size: 5 } }).a.kind).toBe('empty');
    const s = normalizeCompare({ a: { kind: 'binary', name: 'x.bin', size: 5, blobId: 'cb-1', text: 'ignorado' }, b: { kind: 'text', text: 'oi' } });
    expect(s.a).toEqual({ name: 'x.bin', kind: 'binary', text: '', size: 5, blobId: 'cb-1' });
    expect(s.b.kind).toBe('text');
    expect(s.b.size).toBe(2);
    expect(bothTextual(s)).toBe(false);
    expect(bothTextual(emptyCompare())).toBe(true);
  });
  it('vai e volta pelo JSON e os modelos são válidos', () => {
    const s = normalizeCompare({ a: textSource('a.txt', 'olá\n'), view: 'unified', onlyDiffs: true, options: { ignoreCase: true } });
    expect(normalizeCompare(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(s.view).toBe('unified');
    expect(compareKind.type).toBe('compare');
    expect(compareKind.prefix).toBe('v2-compare-');
    for (const t of compareTemplates) { const m = t.create(); expect(normalizeCompare(m)).toEqual(m); }
  });
  it('modelo de versões realmente tem diferenças e o de listas fica quase igual com as opções', () => {
    const v = compareTemplates.find((t) => t.id === 'versoes')!.create();
    expect(compareText(v.a.text, v.b.text, v.options).stats).toMatchObject({ changed: 2, added: 1, same: 2 });
    const l = compareTemplates.find((t) => t.id === 'listas')!.create();
    const r = compareText(l.a.text, l.b.text, l.options);
    expect(r.stats.same).toBe(3);
    expect(r.stats.changed).toBe(1);
  });
});

describe('comparador · linhas visíveis', () => {
  const rows = (kinds: string): { kind: string }[] => kinds.split('').map((k) => ({ kind: k === '.' ? 'eq' : 'add' }));
  it('mostra 3 linhas de contexto e resume o resto', () => {
    const out = collapseRows(rows('..........x..........'));
    expect(out.filter((x) => 'skipped' in x)).toEqual([{ skipped: 7 }, { skipped: 7 }]);
    expect(out.filter((x) => 'row' in x)).toHaveLength(7);
  });
  it('sem diferenças tudo vira um resumo; tudo diferente não resume nada', () => {
    expect(collapseRows(rows('.....'))).toEqual([{ skipped: 5 }]);
    expect(collapseRows(rows('xxxx')).every((x) => 'row' in x)).toBe(true);
    expect(collapseRows([])).toEqual([]);
  });
});
