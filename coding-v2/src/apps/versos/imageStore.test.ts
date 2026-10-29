import { describe, expect, it } from 'vitest';
import { ImageCache, readImageFile, type Decoded, type Decoder } from './imageStore';

function setup(opts: { max?: number; fail?: Set<string>; blobs?: string[] } = {}) {
  const closed: string[] = []; const decodeCalls: [string, number | null][] = [];
  const blobs = new Map<string, Blob>((opts.blobs ?? ['a', 'b', 'c', 'd']).map((id) => [id, { id } as unknown as Blob]));
  const decode: Decoder = async (blob, maxSide) => {
    const id = (blob as unknown as { id: string }).id;
    decodeCalls.push([id, maxSide]);
    if (opts.fail?.has(id)) throw new Error('x');
    return { source: {} as CanvasImageSource, width: 4000, height: 3000, close: () => { closed.push(id); } } as Decoded;
  };
  let changes = 0;
  const cache = new ImageCache((id) => blobs.get(id), () => { changes++; }, decode, opts.max ?? 2, 512);
  return { cache, closed, decodeCalls, changes: () => changes, blobs };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('versos · cache de imagens', () => {
  it('get devolve null, carrega em segundo plano e avisa quando pronto (uma leitura só)', async () => {
    const { cache, decodeCalls, changes } = setup();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('a')).toBeNull();
    expect(cache.isLoading('a')).toBe(true);
    await tick();
    expect(changes()).toBe(1);
    expect(cache.get('a')?.width).toBe(4000);
    expect(decodeCalls).toEqual([['a', 512]]);
  });
  it('mantém só as mais recentes e fecha as que saem', async () => {
    const { cache, closed } = setup({ max: 2 });
    for (const id of ['a', 'b']) { cache.get(id); await tick(); }
    cache.get('a'); // a fica recente
    cache.get('c'); await tick();
    expect(cache.size()).toBe(2);
    expect(closed).toEqual(['b']);
    expect(cache.get('a')).not.toBeNull();
  });
  it('imagem que não decodifica fica marcada e não é relida sem parar', async () => {
    const { cache, decodeCalls } = setup({ fail: new Set(['a']) });
    cache.get('a'); await tick();
    expect(cache.hasFailed('a')).toBe(true);
    cache.get('a'); cache.get('a'); await tick();
    expect(decodeCalls).toHaveLength(1);
    cache.forget('a');
    cache.get('a'); await tick();
    expect(decodeCalls).toHaveLength(2);
  });
  it('arquivo que ainda não chegou é tentado de novo depois', async () => {
    const { cache, blobs } = setup({ blobs: [] });
    expect(cache.get('z')).toBeNull();
    expect(cache.isLoading('z')).toBe(false);
    blobs.set('z', { id: 'z' } as unknown as Blob);
    cache.get('z'); await tick();
    expect(cache.get('z')).not.toBeNull();
  });
  it('loadFull usa o tamanho original; clear/dispose fecham tudo', async () => {
    const { cache, closed, decodeCalls } = setup();
    const full = await cache.loadFull('b');
    expect(decodeCalls).toEqual([['b', null]]);
    full?.close();
    cache.get('a'); await tick();
    cache.dispose();
    expect(closed).toEqual(['b', 'a']);
    expect(cache.size()).toBe(0);
  });
  it('dispose durante a leitura não deixa bitmap aberto', async () => {
    const { cache, closed } = setup();
    cache.get('a'); cache.dispose(); await tick();
    expect(closed).toEqual(['a']);
  });
  it('readImageFile devolve dimensões ou erro claro', async () => {
    const ok: Decoder = async () => ({ source: {} as CanvasImageSource, width: 10, height: 20, close: () => undefined });
    expect(await readImageFile({} as Blob, ok)).toEqual({ width: 10, height: 20 });
    const bad: Decoder = async () => { throw new Error('x'); };
    await expect(readImageFile({} as Blob, bad)).rejects.toThrow('Não foi possível ler esta imagem');
  });
});
