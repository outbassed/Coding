import qrcode from '../../vendor/qrcode-generator.js';
import { CodeError, encodeLinear, type Symbology } from './barcodes';

export type Ecl = 'L' | 'M' | 'Q' | 'H';
export interface CodeStyle { module: number; height: number; fg: string; bg: string; showText: boolean; ecl: Ecl; margin: number }
export interface Rendered { svg: string; width: number; height: number }
export const SYMBOLOGIES: { id: Symbology; name: string; hint: string }[] = [
  { id: 'qr', name: 'QR code', hint: 'Links, textos, Pix, contatos (até ~1.000 caracteres)' },
  { id: 'code128', name: 'Code 128', hint: 'Letras e números (ASCII); muito usado em logística' },
  { id: 'ean13', name: 'EAN-13', hint: '12 ou 13 dígitos; produtos no varejo' },
  { id: 'ean8', name: 'EAN-8', hint: '7 ou 8 dígitos; embalagens pequenas' },
  { id: 'upca', name: 'UPC-A', hint: '11 ou 12 dígitos; padrão norte-americano' },
  { id: 'code39', name: 'Code 39', hint: 'A–Z, 0–9 e - . $ / + % espaço' }
];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
export const safeColor = (c: string, fallback: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

let utf8Ready = false;
export function qrMatrix(value: string, ecl: Ecl): boolean[][] {
  if (!value) throw new CodeError('Digite o conteúdo do QR code.');
  if (!utf8Ready) { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!; utf8Ready = true; }
  try {
    const q = qrcode(0, ecl);
    q.addData(value, 'Byte');
    q.make();
    const n = q.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  } catch {
    throw new CodeError('Conteúdo longo demais para um QR code com correção ' + ecl + '. Encurte o texto ou use correção L.');
  }
}

/** SVG vetorial (nítido em qualquer tamanho). Retângulos mesclados por linha para reduzir o tamanho. */
export function renderCode(kind: Symbology, value: string, style: CodeStyle, caption = ''): Rendered {
  const fg = safeColor(style.fg, '#000000'), bg = safeColor(style.bg, '#ffffff');
  const m = Math.max(1, Math.min(20, style.module));
  const label = caption.trim() || (kind === 'qr' ? '' : '');
  if (kind === 'qr') {
    const matrix = qrMatrix(value, style.ecl);
    const quiet = Math.max(0, Math.min(10, style.margin));
    const n = matrix.length, size = (n + quiet * 2) * m;
    const textH = style.showText && caption.trim() ? Math.max(14, m * 3) : 0;
    let rects = '';
    matrix.forEach((row, r) => {
      let c = 0;
      while (c < n) {
        if (!row[c]) { c++; continue; }
        let end = c; while (end < n && row[end]) end++;
        rects += `<rect x="${(c + quiet) * m}" y="${(r + quiet) * m}" width="${(end - c) * m}" height="${m}"/>`;
        c = end;
      }
    });
    const text = textH ? `<text x="${size / 2}" y="${size + textH * 0.75}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${textH * 0.8}" fill="${fg}">${esc(caption.trim())}</text>` : '';
    return { width: size, height: size + textH, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + textH}" viewBox="0 0 ${size} ${size + textH}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><g fill="${fg}">${rects}</g>${text}</svg>` };
  }
  const code = encodeLinear(kind, value);
  const quiet = Math.max(kind === 'ean13' || kind === 'upca' ? 11 : kind === 'ean8' ? 7 : 10, style.margin * 2);
  const h = Math.max(20, Math.min(400, style.height));
  const showText = style.showText;
  const fontSize = Math.max(10, m * 7);
  const textH = showText ? fontSize + 4 : 0;
  const width = (code.modules.length + quiet * 2) * m;
  const guardExtra = code.guards.length && showText ? fontSize * 0.55 : 0;
  const isGuard = (i: number) => code.guards.some(([s, len]) => i >= s && i < s + len);
  let rects = '';
  let i = 0;
  while (i < code.modules.length) {
    if (!code.modules[i]) { i++; continue; }
    let end = i; while (end < code.modules.length && code.modules[end]) end++;
    const tall = isGuard(i) ? guardExtra : 0;
    rects += `<rect x="${(i + quiet) * m}" y="${m * 2}" width="${(end - i) * m}" height="${h + tall}"/>`;
    i = end;
  }
  const shown = caption.trim() || code.text;
  const text = showText ? `<text x="${width / 2}" y="${m * 2 + h + fontSize}" text-anchor="middle" font-family="'Courier New', monospace" font-size="${fontSize}" letter-spacing="${m}" fill="${fg}">${esc(shown)}</text>` : '';
  const height = m * 4 + h + textH;
  void label;
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><g fill="${fg}">${rects}</g>${text}</svg>` };
}

export async function svgToPng(svg: string, scale = 1, type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png'): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('O navegador não conseguiu desenhar o código.')); el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.95));
    if (!blob) throw new Error('Não foi possível gerar a imagem.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
