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
