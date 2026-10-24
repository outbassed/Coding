import { hexToRgb, toPdfSpace, winAnsi, type Annotation, type PdfPage } from './model';

/* Bibliotecas do Coding 1.0 (pdf-lib e pdf.js), carregadas sob demanda a partir de /vendor/. */
interface PdfLibGlobal {
  PDFDocument: { load(bytes: Uint8Array, opts?: Record<string, unknown>): Promise<PdfLibDoc>; create(): Promise<PdfLibDoc> };
  StandardFonts: Record<string, string>;
  degrees(n: number): unknown;
  rgb(r: number, g: number, b: number): unknown;
}
interface PdfLibPage { getSize(): { width: number; height: number }; getRotation(): { angle: number }; setRotation(r: unknown): void; drawText(t: string, o: Record<string, unknown>): void; drawRectangle(o: Record<string, unknown>): void }
interface PdfLibDoc { getPageCount(): number; copyPages(src: PdfLibDoc, idx: number[]): Promise<PdfLibPage[]>; addPage(p: PdfLibPage): PdfLibPage; embedFont(name: string): Promise<{ widthOfTextAtSize(t: string, s: number): number }>; save(o?: Record<string, unknown>): Promise<Uint8Array>; setTitle(t: string): void; setProducer(t: string): void; setCreator(t: string): void; isEncrypted?: boolean }
interface PdfJsDoc { numPages: number; getPage(n: number): Promise<PdfJsPage>; destroy(): Promise<void> }
interface PdfJsPage { rotate: number; getViewport(o: { scale: number; rotation?: number }): { width: number; height: number }; render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void } }
interface PdfJsGlobal { getDocument(o: Record<string, unknown>): { promise: Promise<PdfJsDoc> }; GlobalWorkerOptions: { workerSrc: string } }
declare global { interface Window { PDFLib?: PdfLibGlobal; pdfjsLib?: PdfJsGlobal } }

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = () => resolve();
      el.onerror = () => { loaded.delete(src); reject(new Error('Não foi possível carregar o leitor de PDF. Verifique a conexão e tente de novo.')); };
      document.head.appendChild(el);
    });
    loaded.set(src, p);
  }
  return p;
}
export async function pdfLib(): Promise<PdfLibGlobal> { await loadScript('/vendor/pdf-lib.min.js'); if (!window.PDFLib) throw new Error('Leitor de PDF indisponível.'); return window.PDFLib; }
export async function pdfJs(): Promise<PdfJsGlobal> {
  await loadScript('/vendor/pdf.min.js');
  const lib = window.pdfjsLib; if (!lib) throw new Error('Visualizador de PDF indisponível.');
  lib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  return lib;
}
export class PdfOpenError extends Error { constructor(message: string) { super(message); this.name = 'PdfOpenError'; } }
function explain(e: unknown): PdfOpenError {
  const name = e instanceof Error ? e.name : '', msg = e instanceof Error ? e.message : String(e);
  if (/Password|Encrypted/i.test(name + msg)) return new PdfOpenError('Este PDF é protegido por senha ou criptografado e não pode ser editado aqui. Remova a proteção no programa de origem e tente de novo.');
  if (/Invalid PDF|No PDF header|Failed to parse|InvalidPDF/i.test(name + msg)) return new PdfOpenError('O arquivo não é um PDF válido ou está corrompido.');
  return new PdfOpenError('Não foi possível abrir o PDF: ' + msg);
}
/** Confere o arquivo e conta as páginas (sem alterar nada). */
export async function inspectPdf(bytes: Uint8Array): Promise<number> {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) throw new PdfOpenError('O arquivo não é um PDF (cabeçalho %PDF ausente).');
  const L = await pdfLib();
  try {
    const doc = await L.PDFDocument.load(bytes.slice(), { ignoreEncryption: false, updateMetadata: false });
    return doc.getPageCount();
  } catch (e) { throw explain(e); }
}

const views = new Map<string, Promise<PdfJsDoc>>();
export function viewDoc(id: string, bytes: () => Promise<Uint8Array>): Promise<PdfJsDoc> {
  let p = views.get(id);
  if (!p) {
    p = (async () => {
      const lib = await pdfJs();
      try { return await lib.getDocument({ data: await bytes(), isEvalSupported: false, disableFontFace: false }).promise; }
      catch (e) { throw explain(e); }
    })();
    p.catch(() => views.delete(id));
    views.set(id, p);
  }
  return p;
}
export function forgetDoc(id: string): void { const p = views.get(id); views.delete(id); void p?.then((d) => d.destroy()).catch(() => undefined); }
/** Desenha a página num canvas, já com a rotação pedida. Devolve o tamanho em pontos da página exibida. */
export async function renderPage(doc: PdfJsDoc, index: number, extra: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<{ w: number; h: number }> {
  const page = await doc.getPage(index + 1);
  const rotation = (page.rotate + extra) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = (cssWidth / base.width) * dpr;
  const vp = page.getViewport({ scale, rotation });
  canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
  canvas.style.width = cssWidth + 'px'; canvas.style.height = (cssWidth * base.height) / base.width + 'px';
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas indisponível.');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { w: base.width, h: base.height };
}

/** Monta um PDF novo com as páginas na ordem pedida; os originais nunca são alterados. */
export async function buildPdf(pages: readonly PdfPage[], annotations: readonly Annotation[], bytesOf: (src: string) => Promise<Uint8Array>, title: string): Promise<Uint8Array> {
  const L = await pdfLib();
  const out = await L.PDFDocument.create();
  out.setTitle(title); out.setProducer('Coding 2.0'); out.setCreator('Coding 2.0 · Editor PDF');
  const docs = new Map<string, PdfLibDoc>();
  const font = await out.embedFont(L.StandardFonts.Helvetica!);
  for (const p of pages) {
    let src = docs.get(p.src);
    if (!src) {
      try { src = await L.PDFDocument.load((await bytesOf(p.src)).slice(), { ignoreEncryption: false, updateMetadata: false }); } catch (e) { throw explain(e); }
      docs.set(p.src, src);
    }
    const [copied] = await out.copyPages(src, [p.index]);
    const page = out.addPage(copied!);
    const total = (page.getRotation().angle + p.rotate) % 360;
    page.setRotation(L.degrees(total));
    const { width: W, height: H } = page.getSize();
    const Dw = total % 180 ? H : W, Dh = total % 180 ? W : H;
    for (const a of annotations.filter((x) => x.page === p.id)) {
      const [r, g, b] = hexToRgb(a.color);
      const dw = a.w * Dw, dh = a.h * Dh, dx = a.x * Dw, dy = a.y * Dh;
      if (a.kind === 'text') {
        const lines = winAnsi(a.text).split('\n');
        lines.forEach((line, i) => {
          const pt = toPdfSpace(dx, dy + a.size * (0.85 + i * 1.2), W, H, total);
          page.drawText(line, { x: pt.x, y: pt.y, size: a.size, font, color: L.rgb(r, g, b), rotate: L.degrees(total) });
        });
      } else {
        const pt = toPdfSpace(dx, dy + dh, W, H, total);
        page.drawRectangle({ x: pt.x, y: pt.y, width: dw, height: dh, rotate: L.degrees(total), ...(a.kind === 'highlight' ? { color: L.rgb(r, g, b), opacity: 0.35 } : { borderColor: L.rgb(r, g, b), borderWidth: 2 }) });
      }
    }
  }
  return out.save({ useObjectStreams: true });
}
