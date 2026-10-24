import { rasterizeSheet } from '../labels/raster';
import { buildPdf, type PdfPageImage } from '../labels/pdf';

/** Estilos da folha usados na exportação (iguais aos da tela do editor). */
const CSS = `
.txp-root{position:absolute;left:-99999px;top:0;width:210mm}
.txp-page{box-sizing:border-box;width:210mm;height:297mm;padding:20mm;background:#fff;color:#171c25;font:16px/1.6 Georgia,serif;overflow:hidden;overflow-wrap:anywhere}
.txp-page h1{font-size:28px;line-height:1.2;margin:0 0 .5em}.txp-page h2{font-size:22px;line-height:1.3;margin:0 0 .5em}.txp-page h3{font-size:18px;line-height:1.35;margin:0 0 .5em}
.txp-page p,.txp-page ul,.txp-page ol{margin:0 0 .8em}.txp-page img{max-width:100%;height:auto;display:block}
.txp-page img[data-align=center]{margin-left:auto;margin-right:auto}.txp-page img[data-align=right]{margin-left:auto}
.txp-page img[data-align=left]{float:left;margin:0 1em .5em 0}.txp-page img[data-align=right]{float:right;margin:0 0 .5em 1em}
.txp-page blockquote{border-left:3px solid #8da5d9;padding-left:15px;margin:0 0 .8em;color:#36475c}
.txp-page table{border-collapse:collapse;width:100%;margin:0 0 .8em;table-layout:fixed}.txp-page td,.txp-page th{border:1px solid #9aa4b4;padding:4px 8px;vertical-align:top;overflow-wrap:anywhere}.txp-page th{background:#eef1f6;font-weight:700;text-align:left}
.txp-page hr{display:none}`;

/** Pagina o documento em folhas A4 (respeitando quebras de página) e gera um PDF de imagens das folhas. */
export async function textToPdf(html: string, title: string, progress?: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; pages: number; oversized: number }> {
  const style = document.createElement('style'); style.textContent = CSS;
  const root = document.createElement('div'); root.className = 'txp-root'; root.setAttribute('aria-hidden', 'true');
  document.head.appendChild(style); document.body.appendChild(root);
  try {
    const measure = document.createElement('div'); measure.className = 'txp-page'; measure.style.height = 'auto';
    measure.innerHTML = html;
    root.appendChild(measure);
    await Promise.all(Array.from(measure.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
    const pxPerMm = measure.getBoundingClientRect().width / 210 || 96 / 25.4;
    const limit = (297 - 40) * pxPerMm;
    const groups: Element[][] = [[]];
    let used = 0, oversized = 0;
    for (const child of Array.from(measure.children)) {
      if (child.tagName === 'HR') { if (groups[groups.length - 1]!.length) { groups.push([]); used = 0; } continue; }
      const cs = getComputedStyle(child);
      const h = child.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      if (used + h > limit && groups[groups.length - 1]!.length) { groups.push([]); used = 0; }
      if (h > limit) oversized++;
      groups[groups.length - 1]!.push(child);
      used += h;
    }
    root.removeChild(measure);
    const sheets: HTMLElement[] = groups.filter((g, i) => g.length || i === 0).map((g) => { const p = document.createElement('div'); p.className = 'txp-page'; for (const el of g) p.appendChild(el.cloneNode(true)); root.appendChild(p); return p; });
    const images: PdfPageImage[] = [];
    for (let i = 0; i < sheets.length; i++) { progress?.(i, sheets.length); images.push(await rasterizeSheet(sheets[i]!, 210, 297)); }
    progress?.(sheets.length, sheets.length);
    return { bytes: buildPdf(images, 210, 297, title), pages: images.length, oversized };
  } finally { root.remove(); style.remove(); }
}
