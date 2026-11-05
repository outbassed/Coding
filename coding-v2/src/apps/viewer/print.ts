import type { PrintPage } from '../../shared/print/print';
import { canvasPage, fitSize } from '../../shared/print/pages';
import { drawMesh, type Bounds, type Camera, type Mesh } from './mesh';

/**
 * Páginas de impressão do Visualizador, formato por formato (IMPRESSAO.md). Só o conteúdo do arquivo:
 * nada de barra de vídeo/áudio, controles 3D, miniaturas ou fundo xadrez.
 */
const paper = (): HTMLCanvasElement => document.createElement('canvas');

/** Quadro atual de um vídeo. */
export function videoFramePage(video: HTMLVideoElement): PrintPage | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const size = fitSize(video.videoWidth, video.videoHeight);
  const c = paper();
  c.width = size.w; c.height = size.h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(video, 0, 0, c.width, c.height);
  return canvasPage(c);
}

/** Vista atual do modelo 3D, em fundo branco (sem a interface do visualizador). */
export function meshPage(mesh: Mesh, bounds: Bounds, camera: Camera, color: [number, number, number], wireframe: boolean, aspect: number): PrintPage {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 4 / 3;
  const w = a >= 1 ? 2000 : Math.round(2000 * a), h = a >= 1 ? Math.round(2000 / a) : 2000;
  const c = paper();
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('O navegador não conseguiu preparar a imagem.');
  drawMesh(g, mesh, bounds, camera, w, h, { wireframe, color, background: '#ffffff' }, 250000);
  return canvasPage(c);
}

export interface ViewCanvasOptions {
  /** Giro (múltiplo de 90°) e espelhos que a pessoa aplicou na tela. */
  turn: number;
  flipX: boolean;
  flipY: boolean;
  /** SVG sem tamanho próprio sai nítido. */
  vector?: boolean;
  maxSide?: number;
  /** Cor de fundo (impressão = branco). Sem cor, o PNG mantém a transparência. */
  background?: string;
  /** Pede a imagem com CORS: necessário para ler os pixels de um link externo (o servidor precisa permitir). */
  cors?: boolean;
}

/** Imagem ou SVG como a pessoa a vê (giro e espelho incluídos), num canvas sem nenhum elemento da interface. */
export async function renderViewCanvas(src: string, o: ViewCanvasOptions): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  if (o.cors) img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
  if (o.vector) { const k = 2400 / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const quarter = ((Math.round(o.turn / 90) % 4) + 4) % 4;
  const swap = quarter % 2 === 1;
  const size = fitSize(swap ? h : w, swap ? w : h, o.maxSide);
  const c = paper();
  c.width = size.w; c.height = size.h;
  const g = c.getContext('2d');
  if (!g) throw new Error('O navegador não conseguiu preparar a imagem.');
  if (o.background) { g.fillStyle = o.background; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = 'high';
  g.translate(c.width / 2, c.height / 2);
  g.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  g.rotate((quarter * Math.PI) / 2);
  const dw = swap ? c.height : c.width, dh = swap ? c.width : c.height;
  g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  return c;
}
