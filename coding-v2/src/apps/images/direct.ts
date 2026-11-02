import type { Crop, Layer } from './model';

/**
 * Geometria da edição direta no canvas (puro e testável). Coordenadas da composição, em px; a rotação gira a camada em torno
 * do centro, no sentido horário. `sx`/`sy` identificam a alça: -1 = esquerda/topo, 1 = direita/base, 0 = meio da borda.
 */
export type Side = -1 | 0 | 1;
export type Box = Pick<Layer, 'x' | 'y' | 'w' | 'h' | 'rotation'>;
export const MIN_BOX = 8;
export const MIN_CROP = 0.05;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Redimensiona arrastando uma alça: o canto (ou a borda) oposto fica parado. Alças de borda (um dos lados 0) mudam só uma
 * dimensão e nunca travam a proporção.
 */
export function resizeByHandle(start: Box, sx: Side, sy: Side, p: { x: number; y: number }, keepRatio: boolean): Pick<Layer, 'x' | 'y' | 'w' | 'h'> {
  const cx = start.x + start.w / 2, cy = start.y + start.h / 2;
  const a = rad(start.rotation), cos = Math.cos(a), sin = Math.sin(a);
  const ox = -sx * start.w / 2, oy = -sy * start.h / 2; // ponto oposto (fixo), no referencial da camada
  const fx = cx + ox * cos - oy * sin, fy = cy + ox * sin + oy * cos;
  const dx = p.x - fx, dy = p.y - fy;
  let w = sx === 0 ? start.w : Math.max(MIN_BOX, sx * (dx * cos + dy * sin));
  let h = sy === 0 ? start.h : Math.max(MIN_BOX, sy * (-dx * sin + dy * cos));
  if (keepRatio && sx !== 0 && sy !== 0) {
    const ratio = start.w / start.h;
    if (w / h > ratio) h = w / ratio; else w = h * ratio;
  }
  const hx = sx * w / 2, hy = sy * h / 2;
  const ncx = fx + hx * cos - hy * sin, ncy = fy + hx * sin + hy * cos;
  return { w: Math.round(w), h: Math.round(h), x: Math.round(ncx - w / 2), y: Math.round(ncy - h / 2) };
}

export type CropPatch = Pick<Layer, 'x' | 'y' | 'w' | 'h'> & { crop: Crop };

/**
 * Recorte arrastando as bordas: o que continua visível não se mexe na tela (as bordas opostas ficam paradas) e a escala da
 * imagem não muda. `inwardX`/`inwardY` são quanto a borda andou para dentro (px, no eixo da camada; negativo = devolve parte
 * do que estava cortado). Respeita espelhamento, rotação e os limites do recorte.
 */
export function cropByEdges(start: Layer, sx: Side, sy: Side, inwardX: number, inwardY: number): CropPatch | null {
  const c0 = start.crop;
  if (start.kind !== 'image' || !c0) return null;
  let w = start.w, h = start.h;
  let { x: cropX, y: cropY, w: cropW, h: cropH } = c0;
  let shiftX = 0, shiftY = 0;
  if (sx !== 0) {
    const full = start.w / c0.w; // largura da imagem inteira, na escala da camada
    // lado da IMAGEM que a borda visual corta: com espelhamento, a esquerda da tela é a direita da imagem
    const imageLeft = (sx < 0) !== start.flipX;
    let f = inwardX / full;
    const lo = imageLeft ? -c0.x : c0.x + c0.w - 1, hi = c0.w - MIN_CROP;
    f = Math.min(Math.min(hi, (start.w - MIN_BOX) / full), Math.max(lo, f));
    if (imageLeft) cropX += f;
    cropW -= f;
    w = start.w - f * full;
    shiftX = (sx < 0 ? 1 : -1) * (f * full) / 2;
  }
  if (sy !== 0) {
    const full = start.h / c0.h;
    const imageTop = (sy < 0) !== start.flipY;
    let f = inwardY / full;
    const lo = imageTop ? -c0.y : c0.y + c0.h - 1, hi = c0.h - MIN_CROP;
    f = Math.min(Math.min(hi, (start.h - MIN_BOX) / full), Math.max(lo, f));
    if (imageTop) cropY += f;
    cropH -= f;
    h = start.h - f * full;
    shiftY = (sy < 0 ? 1 : -1) * (f * full) / 2;
  }
  const a = rad(start.rotation), cos = Math.cos(a), sin = Math.sin(a);
  const cx = start.x + start.w / 2 + shiftX * cos - shiftY * sin;
  const cy = start.y + start.h / 2 + shiftX * sin + shiftY * cos;
  const r4 = (v: number): number => Math.round(v * 10000) / 10000;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h), crop: { x: r4(cropX), y: r4(cropY), w: r4(cropW), h: r4(cropH) } };
}

/** Movimento do ponteiro (doc) → movimento no eixo da camada. */
export function toLocal(rotation: number, dx: number, dy: number): { x: number; y: number } {
  const a = rad(rotation), cos = Math.cos(a), sin = Math.sin(a);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
