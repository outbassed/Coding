import { describe, expect, it } from 'vitest';
import { buildZip, crc32, extractEntry, listZip, safeEntryName, uniqueName, ZipError, MAX_ENTRIES } from './zip';
import { emptyZip, normalizeZip, savingsText, totalSize, zipFileName } from './model';
import { zipKind, zipTemplates } from './kind';

const enc = new TextEncoder();
const dec = new TextDecoder();
const text = (s: string): Uint8Array => enc.encode(s);

describe('zip · CRC-32', () => {
  it('valores conhecidos', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(text('a'))).toBe(0xe8b7be43);
  });
});

describe('zip · nomes', () => {
  it('remove .., raiz, barras invertidas e controles', () => {
    expect(safeEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeEntryName('/abs/olute.txt')).toBe('abs/olute.txt');
    expect(safeEntryName('pasta\\sub\\a.txt')).toBe('pasta/sub/a.txt');
    expect(safeEntryName('a/./b//c')).toBe('a/b/c');
    expect(safeEntryName('..')).toBe('');
    expect(safeEntryName('x\u0000y.txt')).toBe('xy.txt');
    expect(safeEntryName('relatório ç.txt')).toBe('relatório ç.txt');
  });
  it('nomes únicos sem diferenciar maiúsculas', () => {
    expect(uniqueName('a.txt', new Set())).toBe('a.txt');
    expect(uniqueName('a.txt', new Set(['A.TXT']))).toBe('a (2).txt');
    expect(uniqueName('d/a.txt', new Set(['d/a.txt', 'd/a (2).txt']))).toBe('d/a (3).txt');
    expect(uniqueName('semext', new Set(['semext']))).toBe('semext (2)');
  });
});

describe('zip · criar e ler', () => {
  const files = [
    { name: 'leia-me.txt', data: text('Olá, mundo! '.repeat(200)), modified: Date.UTC(2024, 4, 5, 12) },
    { name: 'dados/números.csv', data: text('a;b\n1;2\n'), modified: Date.UTC(2024, 4, 5, 12) },
    { name: 'vazio.bin', data: new Uint8Array(0) },
    { name: 'binario.bin', data: Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) & 255) }
  ];
  it('ida e volta com compressão: conteúdo idêntico e menor', async () => {
    const built = await buildZip(files, { compress: true });
    expect(built.files).toBe(4);
    expect(built.bytes.length).toBeLessThan(built.storedBytes);
    expect(built.compressedEntries).toBeGreaterThanOrEqual(1);
    const list = listZip(built.bytes);
    expect(list.entries.map((e) => e.name)).toEqual(['leia-me.txt', 'dados/números.csv', 'vazio.bin', 'binario.bin']);
    expect(list.totalSize).toBe(built.storedBytes);
    for (let i = 0; i < files.length; i++) {
      const out = await extractEntry(built.bytes, list.entries[i]!);
      expect(Array.from(out)).toEqual(Array.from(files[i]!.data));
    }
    expect(list.entries[0]!.method).toBe(8);
    expect(list.entries[1]!.unsafe).toBe(false);
  });
  it('sem compressão: tudo armazenado', async () => {
    const built = await buildZip(files, { compress: false });
    const list = listZip(built.bytes);
    expect(list.entries.every((e) => e.method === 0)).toBe(true);
    expect(built.compressedEntries).toBe(0);
    expect(dec.decode(await extractEntry(built.bytes, list.entries[1]!))).toBe('a;b\n1;2\n');
  });
  it('recusa lista vazia, nomes repetidos e nomes inválidos', async () => {
    await expect(buildZip([], { compress: true })).rejects.toThrow(ZipError);
    await expect(buildZip([{ name: 'a', data: text('1') }, { name: 'A', data: text('2') }], { compress: true })).rejects.toThrow('mesmo nome');
    await expect(buildZip([{ name: '../', data: text('1') }], { compress: true })).rejects.toThrow('inválido');
    await expect(buildZip(Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({ name: 'f' + i, data: text('x') })), { compress: false })).rejects.toThrow('limite');
  });
  it('detecta dado adulterado pelo CRC-32', async () => {
    const built = await buildZip([{ name: 'a.txt', data: text('conteúdo importante') }], { compress: false });
    const list = listZip(built.bytes);
    const copy = built.bytes.slice();
    copy[30 + 5 + 2] ^= 0xff; // um byte do conteúdo
    await expect(extractEntry(copy, list.entries[0]!)).rejects.toThrow('CRC-32');
  });
  it('recusa arquivos que não são ZIP, cortados ou inconsistentes', async () => {
    expect(() => listZip(text('isto não é um zip, é só texto comprido o bastante'))).toThrow('não é um ZIP');
    expect(() => listZip(new Uint8Array(5))).toThrow(ZipError);
    const built = await buildZip([{ name: 'a.txt', data: text('abc') }], { compress: true });
    expect(() => listZip(built.bytes.slice(0, built.bytes.length - 10))).toThrow(ZipError);
    const bad = built.bytes.slice();
    new DataView(bad.buffer).setUint32(bad.length - 22 + 16, 0x7fffffff, true); // índice apontando para fora
    expect(() => listZip(bad)).toThrow(ZipError);
  });
  it('recusa senha e ZIP64', async () => {
    const built = await buildZip([{ name: 'a.txt', data: text('abc') }], { compress: false });
    const cdAt = new DataView(built.bytes.buffer).getUint32(built.bytes.length - 22 + 16, true);
    const enc1 = built.bytes.slice();
    new DataView(enc1.buffer).setUint16(cdAt + 8, 0x0801, true);
    expect(() => listZip(enc1)).toThrow('senha');
    const z64 = built.bytes.slice();
    new DataView(z64.buffer).setUint32(cdAt + 24, 0xffffffff, true);
    expect(() => listZip(z64)).toThrow('ZIP64');
  });
  it('marca nomes perigosos (zip-slip) mas devolve o nome limpo', async () => {
    const built = await buildZip([{ name: 'ok.txt', data: text('x') }], { compress: false });
    const evil = built.bytes.slice();
    const cdAt = new DataView(evil.buffer).getUint32(evil.length - 22 + 16, true);
    evil.set(text('../x.t'), cdAt + 46); // mesmo tamanho de 'ok.txt'
    const list = listZip(evil);
    expect(list.entries[0]!.unsafe).toBe(true);
    expect(list.entries[0]!.rawName).toBe('../x.t');
    expect(list.entries[0]!.name).toBe('x.t');
  });
  it('bomba de descompactação: o tamanho declarado limita a saída', async () => {
    const big = new Uint8Array(200_000);
    const built = await buildZip([{ name: 'z.bin', data: big }], { compress: true });
    const list = listZip(built.bytes);
    const lying = { ...list.entries[0]!, size: 10 };
    await expect(extractEntry(built.bytes, lying)).rejects.toThrow('maior do que o informado');
  });
});

describe('zip · documento', () => {
  it('normaliza dados corrompidos', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { files: 'a' }, { files: [null, 3, { id: 'a' }] }]) {
      const s = normalizeZip(raw);
      expect(Array.isArray(s.files)).toBe(true);
      expect(s.compress).toBe(true);
    }
  });
  it('mantém só arquivos válidos, com caminhos seguros e únicos', () => {
    const s = normalizeZip({ name: '', compress: false, files: [
      { id: 'a', path: '../x/a.txt', size: 10, modified: 5 }, { id: 'a', path: 'dup-id', size: 1 }, { id: 'b', path: 'X/A.TXT', size: 2 },
      { id: 'c', path: '..', size: 2 }, { id: 'd', path: 'ok.txt', size: -4 }, { path: 'sem-id' }
    ] });
    expect(s.files.map((f) => f.path)).toEqual(['x/a.txt', 'ok.txt']);
    expect(s.files[1]!.size).toBe(0);
    expect(s.compress).toBe(false);
    expect(s.name).toBe('Arquivos compactados');
    expect(totalSize(s)).toBe(10);
  });
  it('vai e volta pelo JSON; modelos válidos', () => {
    const s = normalizeZip({ files: [{ id: 'a', path: 'a.txt', size: 3, modified: 9 }] });
    expect(normalizeZip(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(zipKind.type).toBe('zip');
    expect(zipKind.prefix).toBe('v2-zip-');
    for (const t of zipTemplates) { const m = t.create(); expect(normalizeZip(m)).toEqual(m); }
    expect(zipTemplates.find((t) => t.id === 'armazenar')!.create().compress).toBe(false);
    expect(emptyZip().files).toEqual([]);
  });
  it('textos auxiliares', () => {
    expect(savingsText(1000, 380)).toBe('62% menor');
    expect(savingsText(1000, 1000)).toBe('sem ganho');
    expect(savingsText(100, 150)).toBe('maior que o original');
    expect(savingsText(0, 22)).toBe('sem dados');
    expect(zipFileName('Relatório 2024/final')).toBe('Relatório 2024-final.zip');
    expect(zipFileName('')).toBe('arquivos.zip');
    expect(zipFileName('dados.ZIP')).toBe('dados.zip');
  });
});
