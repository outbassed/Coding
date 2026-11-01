import { describe, expect, it } from 'vitest';
import { CLIP_KEY, MIRROR_IMAGE_BUDGET, clearClip, copyFormat, copyScenes, copyTexts, dataUrlToBlob, peekClip, planScenePaste, planTextPaste, readClip, remapImages, type SceneClip } from './clipboard';
import { blankScene, blankText, defaultStyle } from './model';
import type { KV } from '../../workspace/prefs';

function memoryKv(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); }, get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null };
}
const blobOf = (size: number): Blob => new Blob([new Uint8Array(size).fill(65)], { type: 'image/png' });

describe('versos · área de transferência interna', () => {
  it('copiar cenas e colar: cenas NOVAS com ids novos, conteúdo preservado', async () => {
    const kv = memoryKv(); clearClip(kv);
    const a = blankScene(1920, 1080); a.name = 'Verso'; a.texts.push(blankText(a, 'olá'));
    await copyScenes([a], () => undefined, kv);
    const payload = readClip(kv)!;
    expect(payload.clip.kind).toBe('scenes');
    const plan = planScenePaste(payload.clip as SceneClip, payload.blobs, () => true);
    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0]!.id).not.toBe(a.id);
    expect(plan.scenes[0]!.texts[0]!.id).not.toBe(a.texts[0]!.id);
    expect(plan.scenes[0]!.texts[0]!.text).toBe('olá');
    expect(plan.scenes[0]!.width).toBe(1920);
  });
  it('cópia independe da cena original (editar depois não muda o que foi copiado)', async () => {
    const kv = memoryKv(); clearClip(kv);
    const a = blankScene(); a.texts.push(blankText(a, 'antes'));
    await copyScenes([a], () => undefined, kv);
    a.texts[0]!.text = 'depois';
    const clip = readClip(kv)!.clip as SceneClip;
    expect(clip.scenes[0]!.texts[0]!.text).toBe('antes');
  });
  it('entre projetos: imagem pequena vai no espelho; grande só na memória; depois de "recarregar" some com aviso', async () => {
    const kv = memoryKv(); clearClip(kv);
    const a = blankScene(); a.background = { mode: 'image', color: '#000000', alpha: 1, image: { imageId: 'img1', fit: 'cover', x: 0, y: 0, zoom: 1 } };
    const b = blankScene(); b.background = { mode: 'image', color: '#000000', alpha: 1, image: { imageId: 'img2', fit: 'cover', x: 0, y: 0, zoom: 1 } };
    const big = blobOf(MIRROR_IMAGE_BUDGET + 10);
    const report = await copyScenes([a, b], (id) => (id === 'img1' ? blobOf(1000) : big), kv);
    expect(report).toEqual({ embedded: 1, omitted: 1 });
    // mesma aba: tudo na memória
    const same = readClip(kv)!;
    expect(same.blobs.size).toBe(2);
    // "recarregou": memória perdida → vale só o espelho (simulamos limpando a memória sem apagar o espelho)
    const saved = kv.data.get(CLIP_KEY)!;
    clearClip(kv); kv.data.set(CLIP_KEY, saved);
    const after = readClip(kv)!;
    expect(after.blobs.has('img1')).toBe(true);
    expect(after.blobs.has('img2')).toBe(false);
    const plan = planScenePaste(after.clip as SceneClip, after.blobs, () => false);
    expect(plan.imagesToAdd.map((x) => x.oldId)).toEqual(['img1']);
    expect(plan.droppedBackgrounds).toBe(1);
    expect(plan.scenes[1]!.background.image).toBeNull();
    expect(plan.scenes[1]!.background.mode).toBe('color');
    expect(plan.scenes[0]!.background.image?.imageId).toBe('img1');
    const map = new Map([['img1', 'novo9']]);
    remapImages(plan.scenes, map);
    expect(plan.scenes[0]!.background.image?.imageId).toBe('novo9');
  });
  it('no mesmo projeto a imagem existente é reaproveitada, sem duplicar o arquivo', async () => {
    const kv = memoryKv(); clearClip(kv);
    const a = blankScene(); a.background = { mode: 'image', color: '#000000', alpha: 1, image: { imageId: 'img1', fit: 'contain', x: 5, y: 5, zoom: 2 } };
    await copyScenes([a], () => blobOf(10), kv);
    const p = readClip(kv)!;
    const plan = planScenePaste(p.clip as SceneClip, p.blobs, (id) => id === 'img1');
    expect(plan.imagesToAdd).toEqual([]);
    expect(plan.scenes[0]!.background.image).toEqual({ imageId: 'img1', fit: 'contain', x: 5, y: 5, zoom: 2 });
  });
  it('textos e formatação', () => {
    const kv = memoryKv(); clearClip(kv);
    const s = blankScene(); const t = blankText(s, 'x'); t.x = 100;
    copyTexts([t], kv);
    expect(peekClip(kv)).toBe('texts');
    const clip = readClip(kv)!.clip;
    if (clip.kind !== 'texts') throw new Error('tipo');
    const pasted = planTextPaste(clip, 24);
    expect(pasted[0]!.id).not.toBe(t.id);
    expect(pasted[0]!.x).toBe(124);
    const st = defaultStyle(); st.size = 99;
    copyFormat(st, kv);
    expect(peekClip(kv)).toBe('format');
    const f = readClip(kv)!.clip;
    expect(f.kind === 'format' && f.style.size).toBe(99);
  });
  it('outra aba copiou depois: vale a mais recente', async () => {
    const kv = memoryKv(); clearClip(kv);
    copyFormat(defaultStyle(), kv);
    const mine = readClip(kv)!.clip.at;
    kv.data.set(CLIP_KEY, JSON.stringify({ v: 1, kind: 'texts', at: mine + 5000, texts: [blankText(blankScene(), 'da outra aba')] }));
    const c = readClip(kv)!.clip;
    expect(c.kind).toBe('texts');
  });
  it('espelho corrompido ou localStorage indisponível não quebra', () => {
    const kv = memoryKv(); clearClip(kv); kv.data.set(CLIP_KEY, '{lixo');
    expect(readClip(kv)).toBeNull();
    copyFormat(defaultStyle(), null);
    expect(peekClip(null)).toBe('format');
  });
  it('data URL ↔ Blob', () => {
    const b = dataUrlToBlob('data:image/png;base64,QUJD');
    expect(b?.size).toBe(3);
    expect(dataUrlToBlob('nao-e-data-url')).toBeNull();
  });
});
