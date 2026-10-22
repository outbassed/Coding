import { activeItems, normalize, type LabelsState } from '../labels/model';
import { sanitizeTextHtml } from '../text/model';

/** Limites do que entra no cache: só o que cabe na primeira folha/tela precisa ser guardado. */
export const MAX_PREVIEW_BLOCKS = 60;
export const MAX_PREVIEW_ITEMS = 40;
export const MAX_TEXT_CHARS = 1800;
export const MAX_TEXT_BLOCKS = 40;
export const MAX_IMAGE_CHARS = 160_000;
export const MAX_IMAGE_BUDGET = 320_000;

export type Preview =
  | { kind: 'labels'; state: LabelsState; blocks: number }
  | { kind: 'text'; html: string };

/** Primeira folha das etiquetas: itens com conteúdo, cópias repetidas e limite para o cache. */
export function labelsPreview(raw: unknown): Preview {
  const state = normalize(raw);
  const items: LabelsState['items'] = [];
  let blocks = 0;
  for (const item of activeItems(state)) {
    if (items.length >= MAX_PREVIEW_ITEMS || blocks >= MAX_PREVIEW_BLOCKS) break;
    const copies = Math.min(item.copies, MAX_PREVIEW_BLOCKS - blocks);
    items.push({ ...item, copies });
    blocks += copies;
  }
  return { kind: 'labels', state: { ...state, items }, blocks };
}

/** Início do documento de Texto: HTML já saneado, sem corpo inteiro nem imagens enormes. */
export function textPreview(raw: unknown): Preview {
  if (!raw || typeof raw !== 'object' || typeof (raw as { html?: unknown }).html !== 'string') throw new Error('Texto inválido');
  const clean = sanitizeTextHtml((raw as { html: string }).html);
  const parsed = new DOMParser().parseFromString(clean, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  let chars = 0, budget = MAX_IMAGE_BUDGET, count = 0;
  for (const child of Array.from(parsed.body.childNodes)) {
    if (count >= MAX_TEXT_BLOCKS || chars >= MAX_TEXT_CHARS) break;
    // O editor também salva texto puro, sem <p>. Não deixar essas cópias com miniatura vazia.
    const copy = child.nodeType === Node.TEXT_NODE
      ? out.createElement('p')
      : out.importNode(child, true);
    if (child.nodeType === Node.TEXT_NODE) copy.textContent = child.textContent;
    if (copy instanceof Element) {
      const images = copy.tagName === 'IMG' ? [copy] : Array.from(copy.querySelectorAll('img'));
      for (const node of images) {
        const img = node as HTMLImageElement;
        const size = (img.getAttribute('src') ?? '').length;
        if (size > MAX_IMAGE_CHARS || size > budget) img.remove(); else budget -= size;
      }
    }
    // Um único parágrafo também pode ser gigantesco: respeitar o orçamento de caracteres.
    let left = MAX_TEXT_CHARS - chars;
    const walker = out.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);
    for (const node of textNodes) {
      if (left <= 0) node.remove();
      else if (node.data.length > left) { node.data = node.data.slice(0, left); left = 0; }
      else left -= node.data.length;
    }
    const length = MAX_TEXT_CHARS - chars - left;
    if (copy.textContent?.trim() || (copy instanceof Element && copy.querySelector('img'))) {
      out.body.appendChild(copy);
      chars += length;
      count++;
    }
  }
  // Passa de novo pelo saneador: v-html só recebe HTML confiável.
  return { kind: 'text', html: sanitizeTextHtml(out.body.innerHTML) };
}

export function previewable(type: unknown): type is 'labels' | 'texts' { return type === 'labels' || type === 'texts'; }

export function buildPreview(type: string | undefined, state: unknown): Preview {
  if (type === 'labels') return labelsPreview(state);
  if (type === 'texts') return textPreview(state);
  throw new Error('Tipo sem prévia');
}
