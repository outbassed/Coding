import type { DBlock, DImage, DInline, DPara, DRun } from './docx';
import { cleanColor, cleanFont, cleanHref, cleanSize } from './model';

/** Converte o HTML já saneado do editor no modelo do DOCX (navegador). */
type Fmt = Omit<DRun, 'text' | 'br'>;
async function imageOf(img: HTMLImageElement): Promise<DImage | null> {
  const src = img.getAttribute('src') ?? '';
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/i.exec(src);
  if (!m) return null;
  const percent = Number.parseFloat(img.style.width) || 100;
  const el = new Image();
  el.src = src;
  try { await el.decode(); } catch { return null; }
  let type = m[1]!.toLowerCase();
  let b64 = m[2]!;
  if (type === 'webp') {
    // o Word não lê WebP: converte para PNG
    const c = document.createElement('canvas');
    c.width = el.naturalWidth; c.height = el.naturalHeight;
    c.getContext('2d')?.drawImage(el, 0, 0);
    b64 = c.toDataURL('image/png').split(',')[1] ?? '';
    type = 'png';
  }
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { data, ext: type === 'jpeg' ? 'jpeg' : 'png', widthPx: el.naturalWidth || 1, heightPx: el.naturalHeight || 1, percent };
}
async function inlines(node: Node, fmt: Fmt, out: DInline[]): Promise<void> {
  if (node.nodeType === Node.TEXT_NODE) { const t = (node.textContent ?? '').replace(/\s+/g, ' '); if (t) out.push({ text: t, ...fmt }); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === 'BR') { out.push({ text: '', br: true }); return; }
  if (tag === 'IMG') { const img = await imageOf(el as HTMLImageElement); if (img) out.push({ image: img }); return; }
  const next: Fmt = { ...fmt };
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U') next.u = true;
  if (tag === 'S') next.s = true;
  if (tag === 'A') { const href = cleanHref(el.getAttribute('href') ?? ''); if (href) next.href = href; }
  const font = el.style.fontFamily ? cleanFont(el.style.fontFamily) : null; if (font) next.font = font;
  const size = el.style.fontSize ? cleanSize(el.style.fontSize) : null; if (size) next.sizePx = size;
  const color = el.style.color ? cleanColor(el.style.color) : null; if (color) next.color = color;
  const bg = el.style.backgroundColor ? cleanColor(el.style.backgroundColor) : null; if (bg) next.bg = bg;
  for (const child of Array.from(el.childNodes)) await inlines(child, next, out);
}
const alignOf = (el: HTMLElement): DPara['align'] => { const a = el.style.textAlign; return a === 'center' || a === 'right' || a === 'justify' || a === 'left' ? a : undefined; };
const STYLE: Record<string, DPara['style']> = { H1: 'Heading1', H2: 'Heading2', H3: 'Heading3', BLOCKQUOTE: 'Quote' };
const trimRuns = (runs: DInline[]): DInline[] => {
  const first = runs[0]; if (first && !('image' in first) && !first.br) first.text = first.text.replace(/^\s+/, '');
  const last = runs[runs.length - 1]; if (last && !('image' in last) && !last.br) last.text = last.text.replace(/\s+$/, '');
  return runs.filter((r) => 'image' in r || r.br || r.text);
};
export async function htmlToBlocks(root: HTMLElement): Promise<DBlock[]> {
  const blocks: DBlock[] = [];
  let listId = 0;
  let breakNext = false;
  let loose: DInline[] = [];
  const flush = (): void => { if (loose.length) { const runs = trimRuns(loose); if (runs.length) push({ kind: 'p', style: 'Normal', runs }); loose = []; } };
  const push = (p: DPara): void => { if (breakNext) { p.pageBreakBefore = true; breakNext = false; } blocks.push(p); };
  async function cellParas(cell: HTMLElement): Promise<DPara[]> {
    const runs: DInline[] = [];
    for (const child of Array.from(cell.childNodes)) await inlines(child, {}, runs);
    return [{ kind: 'p', style: 'Normal', align: alignOf(cell), runs: trimRuns(runs) }];
  }
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) { await inlines(node, {}, loose); continue; }
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'BLOCKQUOTE' || tag === 'DIV') {
      flush();
      const runs: DInline[] = [];
      for (const c of Array.from(el.childNodes)) await inlines(c, {}, runs);
      push({ kind: 'p', style: STYLE[tag] ?? 'Normal', align: alignOf(el), runs: trimRuns(runs) });
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const id = ++listId;
      for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
        const runs: DInline[] = [];
        for (const c of Array.from(li.childNodes)) { if ((c as HTMLElement).tagName === 'UL' || (c as HTMLElement).tagName === 'OL') { for (const sub of Array.from((c as HTMLElement).children)) { runs.push({ text: '', br: true }); await inlines(sub, {}, runs); } } else await inlines(c, {}, runs); }
        push({ kind: 'p', style: 'Normal', align: alignOf(li as HTMLElement), list: { type: tag === 'UL' ? 'ul' : 'ol', id }, runs: trimRuns(runs) });
      }
    } else if (tag === 'TABLE') {
      flush();
      const rows: { header: boolean; cells: DPara[][] }[] = [];
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells = Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH') as HTMLElement[];
        rows.push({ header: cells.length > 0 && cells.every((c) => c.tagName === 'TH'), cells: await Promise.all(cells.map(cellParas)) });
      }
      if (rows.length) { if (breakNext) { blocks.push({ kind: 'p', style: 'Normal', runs: [], pageBreakBefore: true }); breakNext = false; } blocks.push({ kind: 'table', rows }); }
    } else if (tag === 'HR') {
      flush(); breakNext = true;
    } else if (tag === 'IMG') {
      flush();
      const img = await imageOf(el as HTMLImageElement);
      const align = el.getAttribute('data-align');
      if (img) push({ kind: 'p', style: 'Normal', align: align === 'center' ? 'center' : align === 'right' ? 'right' : undefined, runs: [{ image: img }] });
    } else await inlines(el, {}, loose);
  }
  flush();
  return blocks;
}
