/**
 * Saneamento de SVG: o arquivo é lido como XML, só elementos e atributos conhecidos sobrevivem e nada que execute código
 * ou busque algo fora do arquivo é mantido (script, foreignObject, eventos on*, javascript:, referências externas).
 * O resultado também é exibido por <img>, que por si só já não executa scripts — as duas camadas se somam.
 */
const ELEMENTS = new Set(['svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textpath', 'title', 'desc',
  'lineargradient', 'radialgradient', 'stop', 'pattern', 'clippath', 'mask', 'marker', 'image', 'filter', 'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix', 'feflood', 'fecomposite', 'femerge', 'femergenode', 'fedropshadow', 'style', 'metadata']);
const BLOCKED_ATTR = /^(on|xmlns:)/i;
const SAFE_URL = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;
const URL_REF = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;

export class SvgError extends Error {}

function cleanCss(css: string): string | null {
  // sem @import, expression(), javascript: nem url(...) para fora do arquivo
  if (/@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(css)) return null;
  let ok = true;
  css.replace(URL_REF, (_all, _q, url: string) => { if (!SAFE_URL.test(url.trim())) ok = false; return ''; });
  return ok ? css : null;
}

export function sanitizeSvg(source: string): string {
  if (source.length > 8 * 1024 * 1024) throw new SvgError('SVG grande demais para visualizar com segurança.');
  let parsed: Document;
  try { parsed = new DOMParser().parseFromString(source, 'image/svg+xml'); } catch { throw new SvgError('O arquivo não é um SVG válido.'); }
  const root = parsed.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg' || parsed.getElementsByTagName('parsererror').length > 0) throw new SvgError('O arquivo não é um SVG válido.');
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const name = child.localName.toLowerCase();
      if (!ELEMENTS.has(name)) { child.remove(); continue; }
      if (name === 'style') {
        const cleaned = cleanCss(child.textContent ?? '');
        if (cleaned === null) { child.remove(); continue; }
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const value = attr.value;
      if (BLOCKED_ATTR.test(n) && n !== 'xmlns:xlink') { el.removeAttribute(attr.name); continue; }
      if (n === 'href' || n === 'xlink:href') { if (!SAFE_URL.test(value.trim())) el.removeAttribute(attr.name); continue; }
      if (n === 'style') { const c = cleanCss(value); if (c === null) el.removeAttribute(attr.name); continue; }
      if (/javascript:|data:text\/html|<script/i.test(value)) { el.removeAttribute(attr.name); continue; }
      if (/url\(/i.test(value)) { const c = cleanCss(value); if (c === null) el.removeAttribute(attr.name); }
    }
  };
  walk(root);
  // atributos do próprio <svg>
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  ensureSize(root);
  return new XMLSerializer().serializeToString(root);
}

/** Um <svg> só com viewBox (ou com tamanho em %) não tem tamanho próprio e some dentro de um <img>: dá a ele um tamanho em pixels. */
function ensureSize(root: Element): void {
  const px = (v: string | null): number | null => {
    if (!v || /%\s*$/.test(v)) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let w = px(root.getAttribute('width')), h = px(root.getAttribute('height'));
  if (w && h) return;
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const ratio = vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 ? vb[2]! / vb[3]! : null;
  if (w && ratio) h = w / ratio;
  else if (h && ratio) w = h * ratio;
  else if (ratio) { w = vb[2]!; h = vb[3]!; }
  else { w = w ?? 300; h = h ?? 150; }
  const cap = 4096, k = Math.min(1, cap / Math.max(w!, h!));
  root.setAttribute('width', String(Math.round(w! * k * 100) / 100));
  root.setAttribute('height', String(Math.round(h! * k * 100) / 100));
}
