import { shallowReactive } from 'vue';
import { viewDoc } from '../pdf/engine';
import { boundsOf, defaultCamera, drawMesh, parseModel } from './mesh';
import { decodeText, type ViewerFile } from './model';
import { sanitizeSvg } from './svg';

/**
 * Miniaturas da biblioteca, feitas sob demanda (só quando o cartão aparece na tela) e guardadas na memória enquanto o app
 * estiver aberto. Imagem, SVG, vídeo, PDF e 3D viram uma figura; texto vira as primeiras linhas; áudio e desconhecidos
 * ficam com o ícone do tipo. Arquivos muito grandes não geram miniatura para a lista continuar fluida.
 */
export interface Thumb { url?: string; text?: string; failed?: boolean }

const SIZE = 240;
const MAX_THUMB_BYTES = 40 * 1024 * 1024;
const MAX_MODEL_BYTES = 12 * 1024 * 1024;
const cache = shallowReactive(new Map<string, Thumb>());
const queue: (() => Promise<void>)[] = [];
let running = 0;

const keyOf = (f: ViewerFile): string => f.blobId || f.id;
/** Miniatura pronta (ou `undefined` enquanto não foi pedida/concluída). Reativa: o cartão atualiza quando ficar pronta. */
export function thumbOf(file: ViewerFile): Thumb | undefined { return cache.get(keyOf(file)); }

function pump(): void {
  while (running < 2 && queue.length) {
    const task = queue.shift()!;
    running++;
    void task().finally(() => { running--; pump(); });
  }
}

/** Pede a miniatura de um arquivo local; não faz nada se já foi pedida. Links de imagem usam o próprio endereço no cartão. */
export function requestThumb(file: ViewerFile, blob: Blob | null): void {
  const key = keyOf(file);
  if (cache.has(key) || !blob || file.sourceUrl) return;
  if (blob.size > MAX_THUMB_BYTES && file.kind !== 'text') { cache.set(key, { failed: true }); return; }
  cache.set(key, {}); // marcada como em andamento
  queue.push(async () => {
    try {
      const thumb = await make(file, blob);
      cache.set(key, thumb);
    } catch { cache.set(key, { failed: true }); }
  });
  pump();
}

/** Libera as figuras (ao fechar o app). */
export function disposeThumbs(): void {
  for (const t of cache.values()) if (t.url) URL.revokeObjectURL(t.url);
  cache.clear();
  queue.length = 0;
}

function once(target: EventTarget, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('tempo esgotado')); }, ms);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('erro')); };
    function cleanup(): void { clearTimeout(timer); target.removeEventListener(event, ok); target.removeEventListener('error', bad); }
    target.addEventListener(event, ok, { once: true });
    target.addEventListener('error', bad, { once: true });
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.82));
}
function canvasFor(w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, SIZE / Math.max(w, h, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  return c;
}
async function fromCanvas(c: HTMLCanvasElement): Promise<Thumb> {
  const blob = await toBlob(c);
  if (!blob) throw new Error('sem figura');
  return { url: URL.createObjectURL(blob) };
}

async function fromImageUrl(src: string): Promise<Thumb> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const w = img.naturalWidth || SIZE, h = img.naturalHeight || SIZE;
  const c = canvasFor(w, h);
  const g = c.getContext('2d');
  if (!g) throw new Error('sem canvas');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return fromCanvas(c);
}

async function make(file: ViewerFile, blob: Blob): Promise<Thumb> {
  switch (file.kind) {
    case 'image': {
      try {
        const bmp = await createImageBitmap(blob, { resizeWidth: SIZE, resizeQuality: 'medium' });
        try {
          const c = canvasFor(bmp.width, bmp.height);
          const g = c.getContext('2d');
          if (!g) throw new Error('sem canvas');
          g.drawImage(bmp, 0, 0, c.width, c.height);
          return await fromCanvas(c);
        } finally { bmp.close(); }
      } catch {
        const url = URL.createObjectURL(blob);
        try { return await fromImageUrl(url); } finally { URL.revokeObjectURL(url); }
      }
    }
    case 'svg': {
      const url = URL.createObjectURL(new Blob([sanitizeSvg(await blob.text())], { type: 'image/svg+xml' }));
      try { return await fromImageUrl(url); } finally { URL.revokeObjectURL(url); }
    }
    case 'video': {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.muted = true; video.preload = 'auto'; video.playsInline = true;
      try {
        video.src = url;
        await once(video, 'loadeddata', 5000);
        const target = Math.min(1, (Number.isFinite(video.duration) ? video.duration : 1) * 0.1);
        if (target > 0.05) { video.currentTime = target; await once(video, 'seeked', 4000); }
        if (!video.videoWidth) throw new Error('sem imagem');
        const c = canvasFor(video.videoWidth, video.videoHeight);
        const g = c.getContext('2d');
        if (!g) throw new Error('sem canvas');
        g.drawImage(video, 0, 0, c.width, c.height);
        return await fromCanvas(c);
      } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    }
    case 'pdf': {
      const pdf = await viewDoc(file.blobId, async () => new Uint8Array(await blob.arrayBuffer()));
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const k = SIZE / Math.max(base.width, base.height);
      const vp = page.getViewport({ scale: k });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
      const g = c.getContext('2d');
      if (!g) throw new Error('sem canvas');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      return await fromCanvas(c);
    }
    case 'model': {
      if (blob.size > MAX_MODEL_BYTES) throw new Error('modelo grande');
      const mesh = parseModel(file.name, new Uint8Array(await blob.arrayBuffer()));
      const c = document.createElement('canvas');
      c.width = SIZE; c.height = Math.round(SIZE * 0.75);
      const g = c.getContext('2d');
      if (!g) throw new Error('sem canvas');
      drawMesh(g, mesh, boundsOf(mesh), defaultCamera(), c.width, c.height, { wireframe: false, color: [90, 150, 245], background: '#161c27' }, 6000);
      return await fromCanvas(c);
    }
    case 'text': {
      const r = decodeText(new Uint8Array(await blob.slice(0, 1200).arrayBuffer()));
      const lines = r.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 5).map((l) => l.slice(0, 46));
      return { text: lines.join('\n') };
    }
    default: return { failed: true };
  }
}
