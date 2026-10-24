import { filterCss, type Filters, type ImagesState, type Layer } from './model';

export type Bitmaps = Map<string, CanvasImageSource & { width: number; height: number }>;
let filterSupport: boolean | null = null;
/** Safari (até a versão 17) ignora ctx.filter: nesse caso aplicamos brilho/contraste/saturação pixel a pixel. */
export function canvasFilterSupported(ctx: CanvasRenderingContext2D): boolean {
  if (filterSupport !== null) return filterSupport;
  try { ctx.filter = 'brightness(50%)'; filterSupport = ctx.filter === 'brightness(50%)'; ctx.filter = 'none'; } catch { filterSupport = false; }
  return filterSupport;
}
const neutral = (f: Filters) => f.brightness === 100 && f.contrast === 100 && f.saturation === 100 && !f.blur && !f.grayscale && !f.sepia && !f.hue;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test).width > width && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    }
    out.push(line);
  }
  return out;
}
function drawShape(ctx: CanvasRenderingContext2D, l: Layer): void {
  const w = l.w, h = l.h;
  ctx.beginPath();
  if (l.kind === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else {
    const r = Math.min(l.radius ?? 0, w / 2, h / 2);
    if (r > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h);
  }
  if (l.fill && l.fill !== 'transparent') { ctx.fillStyle = l.fill; ctx.fill(); }
  if ((l.strokeWidth ?? 0) > 0) { ctx.lineWidth = l.strokeWidth!; ctx.strokeStyle = l.stroke ?? '#000000'; ctx.stroke(); }
}
function drawText(ctx: CanvasRenderingContext2D, l: Layer): void {
  const size = l.size ?? 48;
  ctx.font = (l.italic ? 'italic ' : '') + (l.bold ? '700 ' : '400 ') + size + 'px "' + (l.font ?? 'Arial') + '", sans-serif';
  ctx.fillStyle = l.color ?? '#000000';
  ctx.textBaseline = 'top';
  ctx.textAlign = l.align ?? 'center';
  const lines = wrap(ctx, l.text ?? '', l.w);
  const lh = size * 1.18;
  const x = l.align === 'left' ? -l.w / 2 : l.align === 'right' ? l.w / 2 : 0;
  lines.forEach((line, i) => ctx.fillText(line, x, -l.h / 2 + i * lh));
}
/** Ajuste por pixel (sem ctx.filter): brilho, contraste, saturação, cinza e sépia. */
function pixelFilter(canvas: HTMLCanvasElement | OffscreenCanvas, f: Filters): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const b = f.brightness / 100, c = f.contrast / 100, s = f.saturation / 100, g = f.grayscale / 100, sp = f.sepia / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]! * b, gg = d[i + 1]! * b, bl = d[i + 2]! * b;
    r = (r - 128) * c + 128; gg = (gg - 128) * c + 128; bl = (bl - 128) * c + 128;
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * bl;
    r = lum + (r - lum) * s; gg = lum + (gg - lum) * s; bl = lum + (bl - lum) * s;
    if (g) { const y = 0.2126 * r + 0.7152 * gg + 0.0722 * bl; r += (y - r) * g; gg += (y - gg) * g; bl += (y - bl) * g; }
    if (sp) { const tr = 0.393 * r + 0.769 * gg + 0.189 * bl, tg = 0.349 * r + 0.686 * gg + 0.168 * bl, tb = 0.272 * r + 0.534 * gg + 0.131 * bl; r += (tr - r) * sp; gg += (tg - gg) * sp; bl += (tb - bl) * sp; }
    d[i] = r; d[i + 1] = gg; d[i + 2] = bl;
  }
  ctx.putImageData(img, 0, 0);
}
function drawContent(ctx: CanvasRenderingContext2D, l: Layer, bitmaps: Bitmaps): void {
  if (l.kind === 'image') {
    const bmp = l.imageId ? bitmaps.get(l.imageId) : undefined;
    if (!bmp) { ctx.fillStyle = '#d3dae6'; ctx.fillRect(-l.w / 2, -l.h / 2, l.w, l.h); return; }
    const c = l.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    ctx.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, c.w * bmp.width, c.h * bmp.height, -l.w / 2, -l.h / 2, l.w, l.h);
  } else if (l.kind === 'text') drawText(ctx, l);
  else drawShape(ctx, l);
}
export function renderComposition(ctx: CanvasRenderingContext2D, state: ImagesState, bitmaps: Bitmaps, scale = 1, forExport: 'png' | 'jpeg' | 'webp' | null = null): void {
  const W = state.width * scale, H = state.height * scale;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (state.background !== 'transparent') { ctx.fillStyle = state.background; ctx.fillRect(0, 0, W, H); }
  else if (forExport === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
  ctx.scale(scale, scale);
  const native = canvasFilterSupported(ctx);
  for (const l of state.layers) {
    if (!l.visible || l.opacity <= 0) continue;
    const css = filterCss(l.filters);
    const needsPixel = !native && !neutral(l.filters);
    if (needsPixel) {
      // desenha a camada sozinha num canvas auxiliar, ajusta os pixels e compõe
      const aux = document.createElement('canvas');
      aux.width = Math.max(1, Math.ceil(W)); aux.height = Math.max(1, Math.ceil(H));
      const a = aux.getContext('2d');
      if (!a) continue;
      a.scale(scale, scale);
      a.translate(l.x + l.w / 2, l.y + l.h / 2); a.rotate((l.rotation * Math.PI) / 180); a.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
      drawContent(a, l, bitmaps);
      pixelFilter(aux, l.filters);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = l.opacity; ctx.drawImage(aux, 0, 0); ctx.restore();
      continue;
    }
    ctx.save();
    ctx.globalAlpha = l.opacity;
    if (native) ctx.filter = css === 'none' ? 'none' : css.replace(/blur\((\d+(?:\.\d+)?)px\)/, (_m, v: string) => 'blur(' + Number(v) * scale + 'px)');
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
    drawContent(ctx, l, bitmaps);
    ctx.restore();
  }
  ctx.restore();
}
/** Camada sob o ponto (coordenadas da composição), de cima para baixo, considerando rotação. */
export function hitTest(state: ImagesState, px: number, py: number): Layer | null {
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const l = state.layers[i]!;
    if (!l.visible) continue;
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    const a = (-l.rotation * Math.PI) / 180;
    const dx = px - cx, dy = py - cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= l.w / 2 && Math.abs(ly) <= l.h / 2) return l;
  }
  return null;
}
export async function exportComposition(state: ImagesState, bitmaps: Bitmaps, type: 'png' | 'jpeg' | 'webp', quality = 0.92): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = state.width; canvas.height = state.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu criar a imagem.');
  renderComposition(ctx, state, bitmaps, 1, type);
  const mime = 'image/' + type;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error('O navegador não conseguiu gerar o arquivo.');
  if (blob.type !== mime) throw new Error('Este navegador não exporta ' + type.toUpperCase() + '. Use PNG.');
  return blob;
}
