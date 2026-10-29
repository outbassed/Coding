/**
 * Área de transferência INTERNA do Versos (cenas, textos e formatação). Não usa a área de transferência do sistema:
 * assim copiar/colar nunca atrapalha o texto que a pessoa copiou em outro lugar.
 *
 * Fica em memória (com os arquivos de imagem, sem limite) e é espelhada no localStorage para funcionar entre projetos
 * e abas do Versos. No espelho, imagens de fundo só entram se couberem em ~1,8 MB no total; senão a cena colada
 * perde apenas o fundo em imagem e o app avisa (os textos e o resto da cena vêm inteiros).
 */
import { cloneScene, cloneText, type Scene, type TextBlock, type TextStyle, normalizeScene, normalizeText, normalizeStyle } from './model';
import type { KV } from '../../workspace/prefs';

export const CLIP_KEY = 'coding-v2-versos-clip';
export const MIRROR_IMAGE_BUDGET = 1_800_000; // bytes de imagem no espelho

export type ClipKind = 'scenes' | 'texts' | 'format';
export interface SceneClip { kind: 'scenes'; at: number; scenes: Scene[] }
export interface TextClip { kind: 'texts'; at: number; texts: TextBlock[] }
export interface FormatClip { kind: 'format'; at: number; style: TextStyle }
export type Clip = SceneClip | TextClip | FormatClip;
export interface ClipPayload { clip: Clip; blobs: Map<string, Blob> }

let memory: ClipPayload | null = null;
let clock = 0;
const store = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const nextAt = (): number => { clock = Math.max(clock + 1, Date.now()); return clock; };

// ---------- imagens ↔ data URL ----------
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer !== 'function') {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error ?? new Error('leitura'));
      r.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(bin);
}
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  try {
    const bin = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  } catch { return null; }
}

// ---------- copiar ----------
export interface CopyReport { embedded: number; omitted: number }
function mirror(payload: unknown, kv: KV | null): boolean {
  try { if (!kv) return false; kv.setItem(CLIP_KEY, JSON.stringify(payload)); return true; } catch { return false; }
}
export async function copyScenes(scenes: readonly Scene[], blobOf: (imageId: string) => Blob | undefined, kv: KV | null = store()): Promise<CopyReport> {
  const copies = scenes.map((s) => JSON.parse(JSON.stringify(s)) as Scene);
  const blobs = new Map<string, Blob>();
  for (const s of copies) { const id = s.background.image?.imageId; const b = id ? blobOf(id) : undefined; if (id && b) blobs.set(id, b); }
  const at = nextAt();
  memory = { clip: { kind: 'scenes', at, scenes: copies }, blobs };

  // espelho: imagens pequenas entram como data URL, até o orçamento
  const images: Record<string, string> = {};
  let used = 0, embedded = 0, omitted = 0;
  for (const [id, blob] of blobs) {
    if (used + blob.size > MIRROR_IMAGE_BUDGET) { omitted++; continue; }
    try { images[id] = await blobToDataUrl(blob); used += blob.size; embedded++; } catch { omitted++; }
  }
  const usedIds = new Set(copies.map((s) => s.background.image?.imageId).filter(Boolean));
  for (const id of usedIds) if (id && !blobs.has(id)) omitted++;
  mirror({ v: 1, kind: 'scenes', at, scenes: copies, images }, kv);
  return { embedded, omitted };
}
export function copyTexts(texts: readonly TextBlock[], kv: KV | null = store()): void {
  const copies = texts.map((t) => JSON.parse(JSON.stringify(t)) as TextBlock);
  const at = nextAt();
  memory = { clip: { kind: 'texts', at, texts: copies }, blobs: new Map() };
  mirror({ v: 1, kind: 'texts', at, texts: copies }, kv);
}
export function copyFormat(style: TextStyle, kv: KV | null = store()): void {
  const copy = JSON.parse(JSON.stringify(style)) as TextStyle;
  const at = nextAt();
  memory = { clip: { kind: 'format', at, style: copy }, blobs: new Map() };
  mirror({ v: 1, kind: 'format', at, style: copy }, kv);
}

// ---------- ler ----------
const SIZE_FALLBACK = { width: 1080, height: 1080 };
function parseMirror(kv: KV | null): ClipPayload | null {
  try {
    const raw = kv?.getItem(CLIP_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const at = typeof o.at === 'number' ? o.at : 0;
    if (o.kind === 'scenes' && Array.isArray(o.scenes)) {
      const scenes = o.scenes.slice(0, 300).map((s) => normalizeScene(s));
      const blobs = new Map<string, Blob>();
      const imgs = o.images && typeof o.images === 'object' ? (o.images as Record<string, unknown>) : {};
      for (const [id, url] of Object.entries(imgs)) { const b = typeof url === 'string' ? dataUrlToBlob(url) : null; if (b) blobs.set(id, b); }
      return { clip: { kind: 'scenes', at, scenes }, blobs };
    }
    if (o.kind === 'texts' && Array.isArray(o.texts)) return { clip: { kind: 'texts', at, texts: o.texts.slice(0, 100).map((t) => normalizeText(t, SIZE_FALLBACK)) }, blobs: new Map() };
    if (o.kind === 'format') return { clip: { kind: 'format', at, style: normalizeStyle(o.style) }, blobs: new Map() };
  } catch { /* espelho corrompido: ignora */ }
  return null;
}
/** O mais recente entre a memória e o espelho (outra aba pode ter copiado depois). */
export function readClip(kv: KV | null = store()): ClipPayload | null {
  const mirrored = parseMirror(kv);
  if (mirrored && (!memory || mirrored.clip.at > memory.clip.at)) return mirrored;
  return memory;
}
export function peekClip(kv: KV | null = store()): ClipKind | null { return readClip(kv)?.clip.kind ?? null; }
export function clearClip(kv: KV | null = store()): void { memory = null; try { kv?.removeItem(CLIP_KEY); } catch { /* ignora */ } }

// ---------- colar ----------
export interface ScenePastePlan {
  /** Cenas novas (ids novos). As imagens de fundo ainda apontam para os ids ORIGINAIS: use `imagesToAdd` e `remapImages`. */
  scenes: Scene[];
  imagesToAdd: { oldId: string; blob: Blob }[];
  /** Quantas cenas perderam o fundo em imagem por não haver o arquivo. */
  droppedBackgrounds: number;
}
export function planScenePaste(clip: SceneClip, blobs: ReadonlyMap<string, Blob>, hasImage: (imageId: string) => boolean): ScenePastePlan {
  const imagesToAdd = new Map<string, Blob>();
  let dropped = 0;
  const scenes = clip.scenes.map((s) => {
    const copy = cloneScene(s);
    const img = copy.background.image;
    if (img && !hasImage(img.imageId)) {
      const blob = blobs.get(img.imageId);
      if (blob) imagesToAdd.set(img.imageId, blob);
      else { copy.background = { ...copy.background, mode: 'color', image: null }; dropped++; }
    }
    return copy;
  });
  return { scenes, imagesToAdd: [...imagesToAdd].map(([oldId, blob]) => ({ oldId, blob })), droppedBackgrounds: dropped };
}
export function remapImages(scenes: Scene[], map: ReadonlyMap<string, string>): void {
  for (const s of scenes) { const img = s.background.image; if (img && map.has(img.imageId)) img.imageId = map.get(img.imageId)!; }
}
/** Textos colados: ids novos e leve deslocamento para não ficarem exatamente por cima dos originais. */
export function planTextPaste(clip: TextClip, offset = 24): TextBlock[] { return clip.texts.map((t) => cloneText(t, offset)); }
