import { describe, expect, it } from 'vitest';
import { buildZip } from '../zip/zip';
import { exportFiles } from './build';
import { addFile, blankCode, importAsset, importText, normalizeCode, uniquePath } from './model';
import { readProjectZip, stripCommonRoot } from './projectio';

const enc = new TextEncoder();

describe('Código · ZIP do projeto', () => {
  it('exporta e importa de volta com pastas e recursos', async () => {
    let s = addFile(blankCode(), 'js/app.js', 'console.log(1)');
    s = addFile(s, 'dados/x.json', '{"a":1}');
    const inputs = [...exportFiles(s).map((f) => ({ name: f.name, data: enc.encode(f.text) })), { name: 'img/foto.png', data: new Uint8Array([137, 80, 78, 71]) }];
    const zip = await buildZip(inputs, { compress: true });
    const r = await readProjectZip(zip.bytes);
    expect(r.skipped).toEqual([]);
    expect(r.files.map((f) => f.path).sort()).toEqual(['dados/x.json', 'img/foto.png', 'index.html', 'js/app.js', 'script.js', 'style.css']);
    expect(r.files.find((f) => f.path === 'js/app.js')!.text).toBe('console.log(1)');
    expect([...r.files.find((f) => f.path === 'img/foto.png')!.bytes!]).toEqual([137, 80, 78, 71]);
  });
  it('tira a pasta única que envolve o projeto', async () => {
    const zip = await buildZip([{ name: 'meu-site/index.html', data: enc.encode('<p/>') }, { name: 'meu-site/css/a.css', data: enc.encode('a{}') }], { compress: false });
    expect((await readProjectZip(zip.bytes)).files.map((f) => f.path)).toEqual(['index.html', 'css/a.css']);
    expect(stripCommonRoot(['a/x', 'b/y'])).toEqual(['a/x', 'b/y']);
    expect(stripCommonRoot(['x', 'a/y'])).toEqual(['x', 'a/y']);
  });
  it('ignora o que não serve e diz por quê', async () => {
    const zip = await buildZip([
      { name: 'index.html', data: enc.encode('<p/>') }, { name: 'programa.exe', data: new Uint8Array([1, 2]) }, { name: 'a/../../fora.js', data: enc.encode('x') }, { name: 'ok.txt', data: enc.encode('t') }
    ], { compress: false });
    const r = await readProjectZip(zip.bytes);
    expect(r.files.map((f) => f.path).sort()).toContain('index.html');
    expect(r.skipped.join('|')).toContain('programa.exe: tipo de arquivo não suportado');
    expect(r.files.some((f) => f.path.includes('..'))).toBe(false);
  });
  it('arquivo que não é ZIP dá erro claro', async () => {
    await expect(readProjectZip(enc.encode('isto não é um zip, é só texto comprido o bastante para passar do tamanho mínimo.'))).rejects.toThrow(/ZIP/);
  });
});

describe('Código · importação de arquivos', () => {
  it('conflito: manter os dois ou substituir', () => {
    const s = blankCode();
    const keep = importText(s, 'style.css', 'novo', 'keep');
    expect(keep.path).toBe('style (2).css');
    expect(keep.state.files.find((f) => f.path === 'style.css')!.text).toBe(s.files[1]!.text);
    const rep = importText(s, 'STYLE.css', 'novo', 'replace');
    expect([rep.path, rep.replaced, rep.state.files.find((f) => f.path === 'style.css')!.text]).toEqual(['style.css', true, 'novo']);
    expect(uniquePath(keep.state, 'style.css')).toBe('style (3).css');
    expect(() => importText(s, 'x.png', 'a', 'keep')).toThrow(/texto/);
  });
  it('recursos: valida tipo e tamanho, guarda a ligação e informa o blob substituído', () => {
    const s = normalizeCode({ files: [{ path: 'index.html', text: '' }] });
    const a = importAsset(s, 'img/a.png', { blobId: 'b1', size: 10 }, 'keep');
    expect(a.state.assets).toEqual([{ path: 'img/a.png', blobId: 'b1', mime: 'image/png', size: 10 }]);
    const again = importAsset(a.state, 'img/a.png', { blobId: 'b2', size: 20 }, 'replace');
    expect([again.droppedBlobId, again.state.assets[0]!.blobId, again.replaced]).toEqual(['b1', 'b2', true]);
    expect(importAsset(a.state, 'img/a.png', { blobId: 'b3', size: 1 }, 'keep').path).toBe('img/a (2).png');
    expect(() => importAsset(s, 'x.js', { blobId: 'b', size: 1 }, 'keep')).toThrow(/recurso/);
    expect(() => importAsset(s, 'x.png', { blobId: 'b', size: 99e6 }, 'keep')).toThrow(/MB/);
  });
});
