/** Rich-text document format. Only a small, safe HTML subset is persisted. */
export interface TextState { name: string; html: string }
export const MAX_HTML_CHARS = 3_000_000;
export const MAX_IMAGE_BYTES = 1_500_000;
export const initialTextState = (): TextState => ({
  name: 'Carta de apresentação',
  html: '<h1>Carta de apresentação</h1><p>Olá!</p><p>Este é seu primeiro documento no <strong>Coding Texto</strong>. Selecione uma palavra para formatar, escreva aqui e acompanhe o salvamento automático.</p><p>Atenciosamente,<br>Seu nome</p>'
});
const safeTags = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN']);
const skipTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','META','LINK','BASE','TEMPLATE']);
/** Fontes oferecidas no editor; só estas são aceitas no HTML guardado. */
export const TEXT_FONTS = ['Georgia', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Times New Roman', 'Courier New', 'Arial Black', 'Impact'] as const;
export const TEXT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72] as const;
export const MIN_FONT_PX = 8;
export const MAX_FONT_PX = 96;
export const MIN_IMAGE_PERCENT = 5;
const fontByKey = new Map<string, string>(TEXT_FONTS.map((f) => [f.toLowerCase(), f]));

/** Aceita #rgb, #rrggbb e rgb()/rgba() opaco; devolve #rrggbb ou null. Nada além disso passa. */
export function cleanColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1] as string;
    return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)$/.exec(v);
  if (!rgb) return null;
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4]);
  if (!(alpha > 0)) return null; // transparente = sem cor
  const parts = [rgb[1], rgb[2], rgb[3]].map((n) => Number(n));
  if (parts.some((n) => n > 255)) return null;
  return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function cleanFont(value: string): string | null {
  const first = value.split(',')[0]?.trim().replace(/^["']|["']$/g, '').toLowerCase() ?? '';
  return fontByKey.get(first) ?? null;
}
export function cleanSize(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(px|pt)$/.exec(value.trim().toLowerCase());
  if (!m) return null;
  const px = Math.round(Number(m[1]) * (m[2] === 'pt' ? 96 / 72 : 1));
  return px >= MIN_FONT_PX && px <= MAX_FONT_PX ? px : null;
}
export function cleanPercent(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n >= MIN_IMAGE_PERCENT && n <= 100 ? n : null;
}
const styleTags = new Set(['P', 'H1', 'H2', 'H3', 'SPAN', 'LI', 'BLOCKQUOTE']);

const safeImage = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i;

export function sanitizeTextHtml(source: string): string {
  if (source.length > MAX_HTML_CHARS) throw new Error('Documento excede o limite de 3 milhões de caracteres.');
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const clean = (node: Node, parent: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(out.createTextNode(node.textContent ?? '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element, tag = el.tagName;
    if (skipTags.has(tag)) return;
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      if (!safeImage.test(src) || src.length > MAX_IMAGE_BYTES * 1.4 + 128) return;
      const image = out.createElement('img');
      image.setAttribute('src', src);
      image.setAttribute('alt', (el.getAttribute('alt') ?? 'Imagem').slice(0, 160));
      const width = cleanPercent((el as HTMLElement).style?.width ?? '');
      if (width) image.style.width = width + '%';
      parent.appendChild(image);
      return;
    }
    const target = safeTags.has(tag) ? out.createElement(tag.toLowerCase()) : out.createDocumentFragment();
    if (target instanceof Element && styleTags.has(tag)) {
      const css = (el as HTMLElement).style;
      const t = target as HTMLElement;
      const align = css?.textAlign;
      if (align === 'left' || align === 'right' || align === 'center' || align === 'justify') t.style.textAlign = align;
      const font = css?.fontFamily ? cleanFont(css.fontFamily) : null;
      if (font) t.style.fontFamily = font.includes(' ') ? '"' + font + '"' : font;
      const size = css?.fontSize ? cleanSize(css.fontSize) : null;
      if (size) t.style.fontSize = size + 'px';
      const color = css?.color ? cleanColor(css.color) : null;
      if (color) t.style.color = color;
      const back = css?.backgroundColor ? cleanColor(css.backgroundColor) : null;
      if (back) t.style.backgroundColor = back;
      if (t.getAttribute('style') === '') t.removeAttribute('style');
    }
    for (const child of [...el.childNodes]) clean(child, target);
    parent.appendChild(target);
  };
  for (const child of [...parsed.body.childNodes]) clean(child, out.body);
  return out.body.innerHTML;
}

export function normalizedTextState(raw: unknown): TextState {
  if (!raw || typeof raw !== 'object' || typeof (raw as TextState).html !== 'string') throw new Error('Documento de Texto inválido.');
  const state = raw as TextState;
  return {
    name: (typeof state.name === 'string' && state.name.trim() ? state.name.trim() : 'Documento sem título').slice(0, 250),
    html: sanitizeTextHtml(state.html)
  };
}
export const textLabel = (name: string): string => (name.trim() || 'Documento sem título').slice(0, 250);
