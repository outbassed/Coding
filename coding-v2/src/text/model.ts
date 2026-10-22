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
      parent.appendChild(image);
      return;
    }
    const target = safeTags.has(tag) ? out.createElement(tag.toLowerCase()) : out.createDocumentFragment();
    if (target instanceof Element && ['P','H1','H2','H3','SPAN'].includes(tag)) {
      const align = (el as HTMLElement).style?.textAlign;
      if (align === 'left' || align === 'right' || align === 'center' || align === 'justify') {
        (target as HTMLElement).style.textAlign = align;
      }
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
