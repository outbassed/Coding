/**
 * Exportação de imagens estáticas (PNG) e ZIP. Nunca reduz resolução ou qualidade em silêncio: cada cena sai
 * no tamanho próprio dela, na ordem do projeto, e qualquer impossibilidade técnica vira um erro claro.
 *
 * A grade de transparência não existe aqui. "Só textos" produz PNG com canal alfa; "completa" inclui o fundo
 * (e preserva a transparência do fundo, quando o usuário escolheu um fundo transparente ou com alfa).
 */
import { ensureFonts } from './fonts';
import { exportFileName, type ExportKind, type FontRef, type Scene } from './model';
import { canvasProblem, canvasSize, defaultMakeCanvas, renderScene, type CanvasLike, type ImageSourceLike } from './render';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, writeZip } from '../../shared/files/zip';

export class ExportError extends Error { constructor(message: string) { super(message); this.name = 'ExportError'; } }
export class ExportCancelled extends Error { constructor() { super('Exportação cancelada.'); this.name = 'ExportCancelled'; } }

export type ImageLoader = (imageId: string) => Promise<ImageSourceLike | null>;
export interface ExportedFile { name: string; blob: Blob; width: number; height: number }
export interface ExportProgress { done: number; total: number; current: string }
export interface ExportResult { files: ExportedFile[]; missingFonts: string[]; missingImages: string[] }
export interface ExportOptions {
  kind: ExportKind;
  loadImage: ImageLoader;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
  /** Para testes: substitui a geração do PNG de uma cena. */
  renderPng?: typeof renderScenePng;
}

export async function canvasToPng(canvas: CanvasLike): Promise<Blob> {
  if ('convertToBlob' in canvas) return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new ExportError('O navegador não conseguiu gerar o PNG (memória insuficiente?).'))), 'image/png');
  });
}

/** Gera o PNG de UMA cena em tamanho real (escala 1). */
export async function renderScenePng(scene: Scene, kind: ExportKind, loadImage: ImageLoader, makeCanvas = defaultMakeCanvas): Promise<{ blob: Blob; width: number; height: number; missingImages: string[] }> {
  const { width, height } = canvasSize(scene, 1);
  const problem = canvasProblem(width, height);
  if (problem) throw new ExportError(problem);

  const images = new Map<string, ImageSourceLike | null>();
  if (kind === 'full' && scene.background.mode === 'image' && scene.background.image) {
    const id = scene.background.image.imageId;
    images.set(id, await loadImage(id));
  }
  try {
    let canvas: CanvasLike;
    try { canvas = makeCanvas(width, height); } catch { throw new ExportError('Não foi possível criar uma imagem de ' + width + '×' + height + ' px neste aparelho.'); }
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new ExportError('Não foi possível criar uma imagem de ' + width + '×' + height + ' px neste aparelho (memória insuficiente).');
    const result = renderScene(ctx, scene, { getImage: (id) => images.get(id) ?? null, makeCanvas }, { scale: 1, textOnly: kind === 'text' });
    const blob = await canvasToPng(canvas);
    return { blob, width, height, missingImages: result.missingImages };
  } finally {
    for (const img of images.values()) { const s = img?.source as { close?: () => void } | undefined; if (s && typeof s.close === 'function') s.close(); }
  }
}

export function fontsOf(scenes: readonly Scene[], kind: ExportKind = 'full'): FontRef[] {
  void kind;
  const out: FontRef[] = [];
  for (const s of scenes) for (const t of s.texts) if (t.visible && t.text.trim()) out.push(t.font);
  return out;
}

/**
 * Exporta as cenas escolhidas (`indexes` são as posições no projeto, para nomes previsíveis).
 * Sequencial para não estourar a memória; permite cancelar e informa o progresso.
 */
export async function exportScenes(project: string, scenes: readonly Scene[], indexes: readonly number[], totalInProject: number, opts: ExportOptions): Promise<ExportResult> {
  if (!scenes.length) throw new ExportError('Não há cenas para exportar.');
  const render = opts.renderPng ?? renderScenePng;
  const { missing: missingFonts } = await ensureFonts(fontsOf(scenes));
  const files: ExportedFile[] = [];
  const missingImages = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    if (opts.signal?.aborted) throw new ExportCancelled();
    const name = exportFileName(project, indexes[i] ?? i, totalInProject, opts.kind);
    opts.onProgress?.({ done: i, total: scenes.length, current: name });
    let r;
    try { r = await render(scenes[i]!, opts.kind, opts.loadImage); }
    catch (e) {
      if (e instanceof ExportError) throw new ExportError('Cena ' + ((indexes[i] ?? i) + 1) + ': ' + e.message);
      throw new ExportError('Cena ' + ((indexes[i] ?? i) + 1) + ': não foi possível gerar a imagem (' + (e instanceof Error ? e.message : 'erro desconhecido') + ').');
    }
    r.missingImages.forEach((m) => missingImages.add(m));
    files.push({ name, blob: r.blob, width: r.width, height: r.height });
    // devolve o controle ao navegador entre as cenas (a interface continua respondendo)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (opts.signal?.aborted) throw new ExportCancelled();
  opts.onProgress?.({ done: scenes.length, total: scenes.length, current: '' });
  return { files, missingFonts, missingImages: [...missingImages] };
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error ?? new Error('leitura'));
    r.readAsArrayBuffer(blob);
  });
}
/** Reúne os PNGs em um ZIP (PNG já é comprimido: guardamos sem recomprimir). Respeita o limite do leitor de ZIP do Coding. */
export async function zipFiles(files: readonly ExportedFile[]): Promise<Blob> {
  if (files.length > MAX_ZIP_ENTRIES) throw new ExportError('Arquivos demais para um único ZIP (máximo ' + MAX_ZIP_ENTRIES + ').');
  const total = files.reduce((n, f) => n + f.blob.size, 0);
  if (total > MAX_ZIP_BYTES) throw new ExportError('O ZIP passaria de ' + Math.round(MAX_ZIP_BYTES / 1048576) + ' MB (' + Math.round(total / 1048576) + ' MB). Exporte um intervalo menor de cenas ou baixe os PNGs separados.');
  const entries = [];
  for (const f of files) entries.push({ name: f.name, data: await blobBytes(f.blob) });
  const bytes = await writeZip(entries, false);
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
