import { describe, expect, it } from 'vitest';
import { compareBytes, compareText, decodeText, detectEol, diffSequences, hexWindow, myersOps, sha256Hex, splitLines, unifiedDiff, wordDiff, MAX_LINES } from './diff';

/** Gerador pseudoaleatório determinístico. */
function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; }; }
function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
  return dp[a.length]![b.length]!;
}
function apply(a: string[], b: string[], ops: { t: string; a: number; b: number }[]): string[] {
  const out: string[] = [];
  for (const op of ops) { if (op.t === 'eq') out.push(a[op.a]!); else if (op.t === 'add') out.push(b[op.b]!); }
  return out;
}

describe('comparador · Myers', () => {
  it('casos simples', () => {
    expect(myersOps([], [])).toEqual([]);
    expect(myersOps(['a'], ['a'])).toEqual([{ t: 'eq', a: 0, b: 0 }]);
    expect(myersOps([], ['x', 'y'])!.map((o) => o.t)).toEqual(['add', 'add']);
    expect(myersOps(['x', 'y'], [])!.map((o) => o.t)).toEqual(['del', 'del']);
  });
  it('é mínimo (igual ao LCS) e reconstrói B, em 300 sequências aleatórias', () => {
    const r = rng(42);
    for (let n = 0; n < 300; n++) {
      const a = Array.from({ length: Math.floor(r() * 14) }, () => 'abcd'[Math.floor(r() * 4)]!);
      const b = Array.from({ length: Math.floor(r() * 14) }, () => 'abcd'[Math.floor(r() * 4)]!);
      const ops = myersOps(a, b)!;
      expect(apply(a, b, ops)).toEqual(b);
      const edits = ops.filter((o) => o.t !== 'eq').length;
      expect(edits).toBe(a.length + b.length - 2 * lcs(a, b));
      // índices crescentes e todos os de A e de B usados uma vez
      expect(ops.filter((o) => o.t !== 'add').map((o) => o.a)).toEqual(a.map((_, i) => i));
      expect(ops.filter((o) => o.t !== 'del').map((o) => o.b)).toEqual(b.map((_, i) => i));
    }
  });
  it('limite de diferenças devolve nulo e o diffSequences continua correto (aproximado)', () => {
    const a = Array.from({ length: 3000 }, (_, i) => 'a' + i), b = Array.from({ length: 3000 }, (_, i) => 'b' + i);
    expect(myersOps(a, b)).toBeNull();
    const d = diffSequences(a, b);
    expect(d.approximate).toBe(true);
    expect(apply(a, b, d.ops)).toEqual(b);
  });
  it('arquivos grandes quase iguais são rápidos', () => {
    const a = Array.from({ length: 40_000 }, (_, i) => 'linha ' + i);
    const b = a.slice(); b[100] = 'mudou'; b.splice(20_000, 1); b.push('fim');
    const t0 = Date.now();
    const d = diffSequences(a, b);
    expect(d.approximate).toBe(false);
    expect(d.ops.filter((o) => o.t !== 'eq')).toHaveLength(4);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('comparador · texto', () => {
  it('divide linhas e reconhece o final de linha', () => {
    expect(splitLines('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitLines('a\n')).toEqual(['a']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
    expect(detectEol('a\r\nb\r\n')).toBe('crlf');
    expect(detectEol('a\nb')).toBe('lf');
    expect(detectEol('a\r\nb\nc')).toBe('mixed');
    expect(detectEol('sem')).toBe('none');
  });
  it('textos iguais, mesmo com final de linha diferente', () => {
    const r = compareText('um\ndois\ntres\n', 'um\r\ndois\r\ntres');
    expect(r.identical).toBe(true);
    expect(r.stats.similarity).toBe(100);
    expect(r.stats.same).toBe(3);
    expect(r.eolA).toBe('lf'); expect(r.eolB).toBe('crlf');
  });
  it('conta linhas trocadas, removidas e acrescentadas, com número de linha', () => {
    const r = compareText('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\nf\n');
    expect(r.identical).toBe(false);
    expect(r.stats).toMatchObject({ changed: 1, added: 2, removed: 0, same: 3, linesA: 4, linesB: 6, differences: 2 });
    const chg = r.rows.find((x) => x.kind === 'chg')!;
    expect(chg.a).toEqual({ n: 2, text: 'b' });
    expect(chg.b).toEqual({ n: 2, text: 'B' });
    expect(r.rows.filter((x) => x.kind === 'add').map((x) => x.b!.n)).toEqual([5, 6]);
    expect(r.stats.similarity).toBe(Math.floor((3 * 2 * 100) / 10));
  });
  it('diferença por palavras destaca só o que mudou', () => {
    const w = wordDiff('O gato preto dorme', 'O gato branco dorme');
    expect(w.a.filter((s) => s.changed).map((s) => s.text)).toEqual(['preto']);
    expect(w.b.filter((s) => s.changed).map((s) => s.text)).toEqual(['branco']);
    expect(w.a.map((s) => s.text).join('')).toBe('O gato preto dorme');
    expect(w.b.map((s) => s.text).join('')).toBe('O gato branco dorme');
  });
  it('opções: maiúsculas, espaços e linhas em branco', () => {
    expect(compareText('Olá  Mundo', 'olá mundo').identical).toBe(false);
    expect(compareText('Olá  Mundo', 'olá mundo', { ignoreCase: true, ignoreSpace: true, ignoreBlank: false }).identical).toBe(true);
    expect(compareText('a\n\n\nb', 'a\nb').identical).toBe(false);
    expect(compareText('a\n\n\nb', 'a\nb', { ignoreCase: false, ignoreSpace: false, ignoreBlank: true }).identical).toBe(true);
    // com acentos, ignorar maiúsculas respeita o português
    expect(compareText('ÁRVORE', 'árvore', { ignoreCase: true, ignoreSpace: false, ignoreBlank: false }).identical).toBe(true);
  });
  it('vazio contra texto e limite de linhas', () => {
    const r = compareText('', 'a\nb');
    expect(r.stats).toMatchObject({ added: 2, same: 0, similarity: 0 });
    expect(compareText('', '').identical).toBe(true);
    const big = compareText('x\n'.repeat(MAX_LINES + 1), 'x');
    expect(big.tooLarge).toBe(true);
  });
});

describe('comparador · unified diff', () => {
  // Os resultados esperados abaixo foram conferidos contra o `diff -u` do GNU diffutils.
  it('junta mudanças próximas num trecho só', () => {
    const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].join('\n') + '\n';
    const b = ['1', '2', '3', 'quatro', '5', '6', '7', '8', '9', '10', '11'].join('\n') + '\n';
    expect(unifiedDiff(a, b, 'a.txt', 'b.txt')).toBe(
      '--- a.txt\n+++ b.txt\n@@ -1,10 +1,11 @@\n 1\n 2\n 3\n-4\n+quatro\n 5\n 6\n 7\n 8\n 9\n 10\n+11\n'
    );
  });
  it('separa em trechos quando as mudanças estão longe', () => {
    const a = Array.from({ length: 20 }, (_, i) => String(i + 1)).join('\n') + '\n';
    const b = a.replace('\n3\n', '\ntres\n').replace('\n18\n', '\ndezoito\n');
    expect(unifiedDiff(a, b, 'a.txt', 'b.txt')).toBe(
      '--- a.txt\n+++ b.txt\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+tres\n 4\n 5\n 6\n@@ -15,6 +15,6 @@\n 15\n 16\n 17\n-18\n+dezoito\n 19\n 20\n'
    );
  });
  it('sem diferenças só traz os cabeçalhos; arquivo novo e arquivo apagado', () => {
    expect(unifiedDiff('a\n', 'a\n', 'x', 'y')).toBe('--- x\n+++ y\n');
    expect(unifiedDiff('', 'novo\n', 'x', 'y')).toBe('--- x\n+++ y\n@@ -0,0 +1 @@\n+novo\n');
    expect(unifiedDiff('velho\n', '', 'x', 'y')).toBe('--- x\n+++ y\n@@ -1 +0,0 @@\n-velho\n');
  });
});

describe('comparador · binário e hash', () => {
  it('bytes iguais, diferentes e de tamanhos diferentes', () => {
    const a = Uint8Array.from([1, 2, 3, 4, 5]);
    expect(compareBytes(a, a.slice()).identical).toBe(true);
    const b = Uint8Array.from([1, 2, 9, 4, 8]);
    const r = compareBytes(a, b);
    expect(r).toMatchObject({ identical: false, firstDifference: 2, differentBytes: 2, comparedBytes: 5, windowStart: 0 });
    expect(hexWindow(r.windowA)).toBe('01 02 03 04 05');
    const longer = compareBytes(a, Uint8Array.from([1, 2, 3, 4, 5, 6, 7]));
    expect(longer).toMatchObject({ identical: false, firstDifference: 5, differentBytes: 2, sizeA: 5, sizeB: 7 });
    expect(compareBytes(new Uint8Array(0), new Uint8Array(0)).identical).toBe(true);
  });
  it('SHA-256 conhecido', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('distingue texto de binário', () => {
    expect(decodeText(new TextEncoder().encode('olá'))).toBe('olá');
    expect(decodeText(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1]))).toBeNull();
    expect(decodeText(Uint8Array.from([0xff, 0xfe, 0xfd]))).toBeNull();
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });
});
