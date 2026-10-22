import { buildPdf, type PdfPageImage } from './pdf';

const CSS_PX_PER_MM = 96 / 25.4;
export const PDF_DPI = 150;

/** Copia os estilos calculados para dentro do clone, para que a folha carregue a aparência sem depender de CSS externo. */
function inlineStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  let css = '';
  for (let i = 0; i < computed.length; i += 1) {
    const name = computed.item(i);
    css += name + ':' + computed.getPropertyValue(name) + ';';
  }
  target.setAttribute('style', css);
  target.removeAttribute('class');
  for (const attr of Array.from(target.attributes)) if (attr.name.startsWith('data-')) target.removeAttribute(attr.name);
  const a = source.children;
  const b = target.children;
  for (let i = 0; i < a.length; i += 1) if (a[i] && b[i]) inlineStyles(a[i] as Element, b[i] as Element);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('O navegador não conseguiu desenhar a folha.'));
    img.src = url;
  });
}

/** Desenha uma folha (elemento já renderizado na página) como imagem JPEG, em alta resolução. */
export async function rasterizeSheet(sheet: HTMLElement, widthMm: number, heightMm: number, dpi = PDF_DPI): Promise<PdfPageImage> {
  const clone = sheet.cloneNode(true) as HTMLElement;
  inlineStyles(sheet, clone);
  clone.style.setProperty('position', 'static');
  clone.style.setProperty('margin', '0');
  clone.style.setProperty('left', '0');
  clone.style.setProperty('top', '0');
  clone.style.setProperty('transform', 'none');
  clone.style.setProperty('break-after', 'auto');
  clone.style.setProperty('page-break-after', 'auto');
  const cssW = widthMm * CSS_PX_PER_MM;
  const cssH = heightMm * CSS_PX_PER_MM;
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cssW + '" height="' + cssH + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xml + '</foreignObject></svg>';
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const width = Math.round((widthMm / 25.4) * dpi);
  const height = Math.round((heightMm / 25.4) * dpi);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não permitiu criar a imagem da folha.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('O navegador não conseguiu gerar a imagem da folha.');
  canvas.width = canvas.height = 0;
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

export interface PdfExport { bytes: Uint8Array; pages: number }

/** Gera o PDF de todas as folhas. `onProgress` informa a folha em andamento. */
export async function exportSheetsToPdf(
  sheets: readonly HTMLElement[], widthMm: number, heightMm: number, title: string, onProgress?: (done: number, total: number) => void
): Promise<PdfExport> {
  if (!sheets.length) throw new Error('Não há folhas para exportar.');
  await document.fonts?.ready;
  const images: PdfPageImage[] = [];
  for (let i = 0; i < sheets.length; i += 1) {
    onProgress?.(i, sheets.length);
    images.push(await rasterizeSheet(sheets[i] as HTMLElement, widthMm, heightMm));
    await new Promise((resolve) => setTimeout(resolve, 0)); // deixa a tela respirar entre folhas
  }
  onProgress?.(sheets.length, sheets.length);
  return { bytes: buildPdf(images, widthMm, heightMm, title), pages: images.length };
}

export function pdfFileName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return (base || 'etiquetas') + '.pdf';
}

export function downloadBytes(bytes: Uint8Array, fileName: string, type = 'application/pdf'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
