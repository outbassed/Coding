import { describe, expect, it } from 'vitest';
import { ExportCancelled, ExportError, exportScenes, fontsOf, zipFiles, blobBytes, type ExportedFile } from './export';
import { blankScene, blankText } from './model';
import { readZip } from '../../shared/files/zip';

const png = (n: number): Blob => new Blob([new Uint8Array(n).fill(7)], { type: 'image/png' });
const fakeRender = async (scene: { width: number; height: number }): Promise<{ blob: Blob; width: number; height: number; missingImages: string[] }> => ({ blob: png(10), width: scene.width, height: scene.height, missingImages: [] });

describe('versos · exportação (orquestração)', () => {
  it('um arquivo por cena, na ordem, com nomes sequenciais e o tamanho de cada cena', async () => {
    const a = blankScene(1080, 1080), b = blankScene(1920, 1080), c = blankScene(1080, 1920);
    const seen: string[] = [];
    const r = await exportScenes('Meu projeto', [a, b, c], [0, 1, 2], 3, { kind: 'full', loadImage: async () => null, renderPng: fakeRender, onProgress: (p) => seen.push(p.done + '/' + p.total) });
    expect(r.files.map((f) => f.name)).toEqual(['Meu projeto-001.png', 'Meu projeto-002.png', 'Meu projeto-003.png']);
    expect(r.files.map((f) => f.width + 'x' + f.height)).toEqual(['1080x1080', '1920x1080', '1080x1920']);
    expect(seen[0]).toBe('0/3');
    expect(seen[seen.length - 1]).toBe('3/3');
  });
  it('a cena escolhida mantém o número da posição no projeto', async () => {
    const r = await exportScenes('P', [blankScene()], [6], 12, { kind: 'text', loadImage: async () => null, renderPng: fakeRender });
    expect(r.files[0]!.name).toBe('P-007-texto.png');
  });
  it('cancelar interrompe', async () => {
    const ctl = new AbortController();
    const scenes = [blankScene(), blankScene(), blankScene()];
    let n = 0;
    const p = exportScenes('P', scenes, [0, 1, 2], 3, { kind: 'full', loadImage: async () => null, signal: ctl.signal, renderPng: async (s) => { if (++n === 1) ctl.abort(); return fakeRender(s); } });
    await expect(p).rejects.toBeInstanceOf(ExportCancelled);
    expect(n).toBe(1);
  });
  it('erro em uma cena aponta qual cena falhou', async () => {
    const p = exportScenes('P', [blankScene(), blankScene()], [0, 1], 2, { kind: 'full', loadImage: async () => null, renderPng: async (s) => { if (s === undefined) throw new Error('x'); throw new ExportError('lado grande demais'); } });
    await expect(p).rejects.toThrow('Cena 1: lado grande demais');
  });
  it('lista fontes usadas só de textos visíveis e não vazios', () => {
    const s = blankScene();
    const t1 = blankText(s, 'a'), t2 = blankText(s, ' '), t3 = blankText(s, 'b'); t3.visible = false; t1.font = { id: 'x', label: 'X' };
    s.texts.push(t1, t2, t3);
    expect(fontsOf([s]).map((f) => f.id)).toEqual(['x']);
  });
});

describe('versos · ZIP', () => {
  it('gera um ZIP legível com os PNGs na ordem', async () => {
    const files: ExportedFile[] = [1, 2, 3].map((i) => ({ name: 'p-00' + i + '.png', blob: png(i * 5), width: 1, height: 1 }));
    const z = await zipFiles(files);
    const back = await readZip(await blobBytes(z));
    expect([...back.keys()]).toEqual(['p-001.png', 'p-002.png', 'p-003.png']);
    expect(back.get('p-002.png')!.length).toBe(10);
  });
  it('recusa ZIP acima do limite com mensagem clara', async () => {
    const big = { name: 'a.png', blob: { size: 300 * 1024 * 1024 } as unknown as Blob, width: 1, height: 1 };
    await expect(zipFiles([big])).rejects.toThrow(/Exporte um intervalo menor/);
  });
});
