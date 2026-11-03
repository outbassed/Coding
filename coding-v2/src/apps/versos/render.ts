/**
 * Desenho de uma cena em canvas. É a ÚNICA função de desenho do Versos: a prévia, as miniaturas e a exportação
 * chamam `renderScene`, só mudando a escala. Assim o que se vê é o que se exporta (quebras de linha, alinhamento,
 * fonte, contorno, sombra, rotação, transparência).
 *
 * A grade de transparência (xadrez) NUNCA é desenhada aqui: ela é só CSS atrás do canvas na interface.
 */
import { layoutText, lineLeft, lineMiddle, type TextLayout } from './layout';
import { cssFont } from './fonts';
import { rgba, type Scene, type TextBlock } from './model';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export interface ImageSourceLike { source: CanvasImageSource; width: number; height: number }
export interface RenderDeps {
  /** Imagem de fundo já decodificada (ou null enquanto carrega / se estiver faltando). */
  getImage(id: string): ImageSourceLike | null;
  /** Cria um canvas auxiliar (usado para opacidade < 1 e sombras). */
  makeCanvas(width: number, height: number): CanvasLike;
}
export interface RenderOptions {
  /** Pixels do canvas por pixel da cena (1 = tamanho real, usado na exportação). */
  scale: number;
  /** Só os textos, sobre fundo transparente. */
  textOnly?: boolean;
}
/** Caixa de um texto na cena (centro, tamanho e rotação), para seleção e alças. */
export interface BlockBox { id: string; x: number; y: number; w: number; h: number; rotation: number; visible: boolean }
export interface RenderResult { boxes: BlockBox[]; missingImages: string[] }

export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_PIXELS = 268_435_456; // limite prático dos navegadores desktop (16384 × 16384)

export function defaultMakeCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  return c;
}
export function canvasSize(scene: Pick<Scene, 'width' | 'height'>, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round(scene.width * scale)), height: Math.max(1, Math.round(scene.height * scale)) };
}
/** Valida se o navegador deve conseguir criar um canvas desse tamanho. */
export function canvasProblem(width: number, height: number): string | null {
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) return 'O lado máximo suportado pelos navegadores é ' + MAX_CANVAS_SIDE + ' px.';
  if (width * height > MAX_CANVAS_PIXELS) return 'A imagem tem pixels demais para o navegador (máximo ' + Math.round(MAX_CANVAS_PIXELS / 1e6) + ' MP).';
  return null;
}

// ---------- texto ----------

const hasLetterSpacing = (ctx: Ctx2D): boolean => 'letterSpacing' in ctx;

/** Configura fonte e espaçamento no contexto. */
function setupText(ctx: Ctx2D, block: TextBlock): void {
  const c = ctx as CanvasRenderingContext2D;
  c.font = cssFont(block.font, block.size, block.weight, block.italic);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  if (hasLetterSpacing(ctx)) c.letterSpacing = block.letterSpacing + 'px';
  if ('fontKerning' in c) c.fontKerning = 'normal';
  if ('textRendering' in c) c.textRendering = 'geometricPrecision';
  c.lineJoin = 'round';
  c.miterLimit = 2;
}
/** Largura de uma string incluindo o espaçamento depois de cada caractere (mesma convenção do canvas). */
function measureFn(ctx: Ctx2D, block: TextBlock): (s: string) => number {
  if (hasLetterSpacing(ctx)) return (s) => ctx.measureText(s).width;
  return (s) => { let w = 0; for (const ch of Array.from(s)) w += ctx.measureText(ch).width + block.letterSpacing; return w; };
}
export function layoutBlock(ctx: Ctx2D, block: TextBlock): TextLayout {
  ctx.save();
  setupText(ctx, block);
  const layout = layoutText(block.text, block.width, block.size, block.lineHeight, block.letterSpacing, measureFn(ctx, block));
  ctx.restore();
  return layout;
}
function drawLine(ctx: Ctx2D, text: string, x: number, y: number, block: TextBlock, mode: 'fill' | 'stroke'): void {
  if (!text) return;
  if (hasLetterSpacing(ctx) || block.letterSpacing === 0) {
    if (mode === 'fill') ctx.fillText(text, x, y); else ctx.strokeText(text, x, y);
    return;
  }
  let cx = x; // sem suporte a letterSpacing: caractere a caractere
  for (const ch of Array.from(text)) {
    if (mode === 'fill') ctx.fillText(ch, cx, y); else ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + block.letterSpacing;
  }
}
/** Desenha as linhas do bloco com a origem no CENTRO da área de texto: contorno por baixo, depois o preenchimento. */
function drawContent(ctx: Ctx2D, block: TextBlock, layout: TextLayout): void {
  setupText(ctx, block);
  ctx.fillStyle = block.color;
  ctx.strokeStyle = block.stroke.color;
  ctx.lineWidth = block.stroke.width * 2;
  const stroked = block.stroke.width > 0;
  layout.lines.forEach((line, i) => {
    const x = lineLeft(line.width, layout.boxWidth, block.align);
    const y = lineMiddle(i, layout);
    if (stroked) drawLine(ctx, line.text, x, y, block, 'stroke');
    drawLine(ctx, line.text, x, y, block, 'fill');
  });
}
const hasShadow = (b: TextBlock): boolean => b.shadow.opacity > 0 && (b.shadow.blur > 0 || b.shadow.x !== 0 || b.shadow.y !== 0);

function renderBlock(ctx: Ctx2D, block: TextBlock, deps: RenderDeps, scale: number): BlockBox {
  const layout = layoutBlock(ctx, block);
  const box: BlockBox = { id: block.id, x: block.x, y: block.y, w: layout.boxWidth, h: layout.boxHeight, rotation: block.rotation, visible: block.visible };
  if (!block.visible || !block.text.trim() || block.opacity <= 0) return box;

  ctx.save();
  ctx.translate(block.x, block.y);
  if (block.rotation) ctx.rotate((block.rotation * Math.PI) / 180);

  const shadow = hasShadow(block);
  if (block.opacity >= 1 && !shadow) {
    drawContent(ctx, block, layout);
    ctx.restore();
    return box;
  }

  // Opacidade < 1 ou sombra: o bloco é composto em uma camada própria, para que contorno, preenchimento e sombra
  // formem UMA peça (sem a sombra dobrar nas sobreposições nem o contorno aparecer por baixo do texto translúcido).
  const bleed = Math.ceil(block.stroke.width + block.size * 0.4 + 4);
  const lw = Math.ceil((layout.boxWidth + bleed * 2) * scale), lh = Math.ceil((layout.boxHeight + bleed * 2) * scale);
  if (lw < 1 || lh < 1 || canvasProblem(lw, lh)) {
    // grande demais para uma camada: desenha direto (sem a composição única)
    ctx.globalAlpha = block.opacity;
    if (shadow) applyShadow(ctx, block, scale);
    drawContent(ctx, block, layout);
    ctx.restore();
    return box;
  }
  const layer = deps.makeCanvas(lw, lh);
  const lctx = layer.getContext('2d') as Ctx2D | null;
  if (!lctx) { drawContent(ctx, block, layout); ctx.restore(); return box; }
  lctx.setTransform(scale, 0, 0, scale, (bleed + layout.boxWidth / 2) * scale, (bleed + layout.boxHeight / 2) * scale);
  drawContent(lctx, block, layout);

  ctx.globalAlpha = block.opacity;
  if (shadow) applyShadow(ctx, block, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(layer as CanvasImageSource, -layout.boxWidth / 2 - bleed, -layout.boxHeight / 2 - bleed, lw / scale, lh / scale);
  ctx.restore();
  return box;
}
function applyShadow(ctx: Ctx2D, block: TextBlock, scale: number): void {
  // As propriedades de sombra do canvas ignoram a transformação: valores em pixels do canvas, direção fixa na cena.
  ctx.shadowColor = rgba(block.shadow.color, block.shadow.opacity);
  ctx.shadowBlur = block.shadow.blur * scale;
  ctx.shadowOffsetX = block.shadow.x * scale;
  ctx.shadowOffsetY = block.shadow.y * scale;
}

// ---------- fundo ----------

function drawBackground(ctx: Ctx2D, scene: Scene, deps: RenderDeps, missing: string[]): void {
  const bg = scene.background;
  if (bg.mode === 'transparent') return;
  const w = scene.width, h = scene.height;
  if (bg.alpha > 0) { ctx.fillStyle = rgba(bg.color, bg.alpha); ctx.fillRect(0, 0, w, h); }
  if (bg.mode !== 'image' || !bg.image) return;
  const img = deps.getImage(bg.image.imageId);
  if (!img) { missing.push(bg.image.imageId); return; }
  const g = imageRect(img.width, img.height, w, h, bg.image);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.source, g.x, g.y, g.w, g.h);
  ctx.restore();
}
/** Retângulo da imagem de fundo na cena (cobrir / conter / esticar, com zoom e deslocamento em % da cena). */
export function imageRect(iw: number, ih: number, sw: number, sh: number, o: { fit: 'cover' | 'contain' | 'stretch'; x: number; y: number; zoom: number }): { x: number; y: number; w: number; h: number } {
  let w: number, h: number;
  if (o.fit === 'stretch') { w = sw * o.zoom; h = sh * o.zoom; }
  else {
    const k = (o.fit === 'cover' ? Math.max(sw / iw, sh / ih) : Math.min(sw / iw, sh / ih)) * o.zoom;
    w = iw * k; h = ih * k;
  }
  return { x: (sw - w) / 2 + (o.x / 100) * sw, y: (sh - h) / 2 + (o.y / 100) * sh, w, h };
}

// ---------- cena ----------

export function renderScene(ctx: Ctx2D, scene: Scene, deps: RenderDeps, opts: RenderOptions): RenderResult {
  const cw = Math.max(1, Math.round(scene.width * opts.scale)), ch = Math.max(1, Math.round(scene.height * opts.scale));
  const sx = cw / scene.width, sy = ch / scene.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  const missingImages: string[] = [];
  if (!opts.textOnly) drawBackground(ctx, scene, deps, missingImages);
  const boxes: BlockBox[] = [];
  for (const block of scene.texts) boxes.push(renderBlock(ctx, block, deps, Math.max(sx, sy)));
  ctx.restore();
  return { boxes, missingImages };
}

// ---------- geometria (seleção) ----------

/** O ponto (px, py), em coordenadas da cena, está dentro da caixa girada? */
export function pointInBox(box: Pick<BlockBox, 'x' | 'y' | 'w' | 'h' | 'rotation'>, px: number, py: number, pad = 0): boolean {
  const a = (-box.rotation * Math.PI) / 180;
  const dx = px - box.x, dy = py - box.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= box.w / 2 + pad && Math.abs(ly) <= box.h / 2 + pad;
}
/** Texto mais acima (último desenhado) sob o ponto, ignorando os ocultos. */
export function hitTest(boxes: readonly BlockBox[], px: number, py: number, pad = 0): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i]!;
    if (b.visible && pointInBox(b, px, py, pad)) return b.id;
  }
  return null;
}

/** Assinatura barata do conteúdo de uma cena: muda quando algo visível muda (usada para atualizar miniaturas). */
export function sceneSignature(scene: Scene): string {
  const s = JSON.stringify([scene.width, scene.height, scene.background, scene.texts]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}
