import type { PrintPage } from './print';

/** Peças reutilizáveis para montar páginas de impressão (IMPRESSAO.md). */
export const PRINT_MAX_SIDE = 3508;      // ~300 dpi em A4: mais que isso só pesa
export const PRINT_MAX_PDF_PAGES = 150;  // cada página vira uma imagem na memória
export const PRINT_MAX_TEXT_CHARS = 400_000;

export function canvasPage(c: HTMLCanvasElement): PrintPage { return { el: c, aspect: c.width / c.height }; }

export function fitSize(w: number, h: number, max = PRINT_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Imagem ou SVG saneado. `turn`: giro de 0, 90, 180 ou 270 graus que a pessoa deu na tela. `vector`: SVG sem tamanho próprio sai nítido. */
export async function imagePage(src: string, turn: number, vector = false): Promise<PrintPage> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
  if (vector) { const k = 2400 / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const quarter = (((Math.round(turn / 90) % 4) + 4) % 4);
  const swap = quarter % 2 === 1;
  const size = fitSize(swap ? h : w, swap ? w : h);
  const c = document.createElement('canvas');
  c.width = size.w; c.height = size.h;
  const g = c.getContext('2d');
  if (!g) throw new Error('O navegador não conseguiu preparar a imagem.');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.translate(c.width / 2, c.height / 2);
  g.rotate((quarter * Math.PI) / 2);
  const dw = swap ? c.height : c.width, dh = swap ? c.width : c.height;
  g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  return canvasPage(c);
}

/** Texto: corre em páginas A4 (o navegador pagina), com o nome do arquivo no topo. */
export function textPage(name: string, text: string): { page: PrintPage; truncated: boolean } {
  const truncated = text.length > PRINT_MAX_TEXT_CHARS;
  const body = truncated ? text.slice(0, PRINT_MAX_TEXT_CHARS) : text;
  const box = document.createElement('div');
  box.style.cssText = 'color:#000;background:#fff;font:9.5pt/1.4 ui-monospace,Menlo,Consolas,monospace;';
  const h = document.createElement('div');
  h.textContent = name;
  h.style.cssText = 'font:700 11pt/1.3 system-ui,sans-serif;margin:0 0 4mm;padding-bottom:2mm;border-bottom:.3mm solid #000;';
  const pre = document.createElement('div');
  pre.textContent = body;
  pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;';
  box.append(h, pre);
  if (truncated) {
    const n = document.createElement('div');
    n.textContent = '[Impressão limitada aos primeiros ' + PRINT_MAX_TEXT_CHARS.toLocaleString('pt-BR') + ' caracteres do arquivo.]';
    n.style.cssText = 'margin-top:4mm;font:italic 9pt system-ui,sans-serif;';
    box.append(n);
  }
  return { page: { el: box, fit: 'flow', marginMm: 15 }, truncated };
}

interface PdfPageLike { getViewport(o: { scale: number }): { width: number; height: number }; render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> } }
export interface PdfDocLike { numPages: number; getPage(n: number): Promise<PdfPageLike> }

/** Cada página do PDF vira uma página impressa, com a orientação e a proporção dela. Devolve também quantas ficaram de fora do limite. */
export async function pdfPages(pdf: PdfDocLike, onProgress?: (done: number, total: number) => void): Promise<{ pages: PrintPage[]; skipped: number }> {
  const total = Math.min(pdf.numPages, PRINT_MAX_PDF_PAGES);
  const pages: PrintPage[] = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const k = Math.min(2.2, 2200 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale: k });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    const g = c.getContext('2d');
    if (!g) throw new Error('O navegador não conseguiu preparar a página ' + i + '.');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    pages.push({ ...canvasPage(c), marginMm: 5 });
    onProgress?.(i, total);
  }
  return { pages, skipped: Math.max(0, pdf.numPages - total) };
}
