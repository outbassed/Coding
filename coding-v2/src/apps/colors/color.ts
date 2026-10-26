/**
 * Estúdio de Cores: matemática de cor pura (sem DOM), com entradas sempre validadas.
 * Tudo é calculado em sRGB. CMYK aqui é a conversão matemática simples, não um perfil de impressão.
 */
export interface RGB { r: number; g: number; b: number; a: number }
export interface HSL { h: number; s: number; l: number }
export interface HSV { h: number; s: number; v: number }
export interface CMYK { c: number; m: number; y: number; k: number }

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const byte = (v: number): number => Math.round(clamp(Number.isFinite(v) ? v : 0, 0, 255));
export const rgb = (r: number, g: number, b: number, a = 1): RGB => ({ r: byte(r), g: byte(g), b: byte(b), a: clamp(Number.isFinite(a) ? a : 1, 0, 1) });

// ------------------------------------------------------------ leitura (nunca lança)
const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
const FUNC = new RegExp('^(rgba?|hsla?)\\(\\s*(' + NUM + ')(%?)\\s*[,\\s]\\s*(' + NUM + ')(%?)\\s*[,\\s]\\s*(' + NUM + ')(%?)\\s*(?:[,/]\\s*(' + NUM + ')(%?)\\s*)?\\)$', 'i');
const TRIPLE = new RegExp('^(' + NUM + ')\\s*[,\\s]\\s*(' + NUM + ')\\s*[,\\s]\\s*(' + NUM + ')$');

/** Aceita #RGB, #RGBA, #RRGGBB, #RRGGBBAA (com ou sem #), rgb()/rgba(), hsl()/hsla() e "255, 128, 0". */
export function parseColor(input: string): RGB | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text.length === 0 || text.length > 60) return null;
  const hex = HEX.exec(text);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return rgb(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1);
  }
  const fn = FUNC.exec(text);
  if (fn) {
    const kind = (fn[1] as string).toLowerCase().slice(0, 3);
    const v = [2, 4, 6].map((i) => Number(fn[i]));
    const pct = [3, 5, 7].map((i) => fn[i] === '%');
    const alpha = fn[8] === undefined ? 1 : fn[9] === '%' ? Number(fn[8]) / 100 : Number(fn[8]);
    if (v.some((x) => !Number.isFinite(x)) || !Number.isFinite(alpha)) return null;
    if (kind === 'rgb') return rgb(...(v.map((x, i) => (pct[i] ? (x / 100) * 255 : x)) as [number, number, number]), alpha);
    const out = hslToRgb({ h: v[0] as number, s: clamp(v[1] as number, 0, 100), l: clamp(v[2] as number, 0, 100) });
    return { ...out, a: clamp(alpha, 0, 1) };
  }
  const triple = TRIPLE.exec(text);
  if (triple) return rgb(Number(triple[1]), Number(triple[2]), Number(triple[3]));
  return null;
}

// ------------------------------------------------------------ formatação
const h2 = (n: number): string => byte(n).toString(16).padStart(2, '0').toUpperCase();
export const toHex = (c: RGB, withAlpha = false): string => '#' + h2(c.r) + h2(c.g) + h2(c.b) + (withAlpha && c.a < 1 ? h2(c.a * 255) : '');
const round1 = (n: number): number => Math.round(n * 10) / 10;
export const cssRgb = (c: RGB): string => 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
export function cssHsl(c: RGB): string { const h = rgbToHsl(c); return 'hsl(' + Math.round(h.h) + ', ' + Math.round(h.s) + '%, ' + Math.round(h.l) + '%)'; }
export function cssHsv(c: RGB): string { const h = rgbToHsv(c); return 'hsv(' + Math.round(h.h) + ', ' + Math.round(h.s) + '%, ' + Math.round(h.v) + '%)'; }
export function cssCmyk(c: RGB): string { const k = rgbToCmyk(c); return 'cmyk(' + [k.c, k.m, k.y, k.k].map((x) => Math.round(x) + '%').join(', ') + ')'; }

// ------------------------------------------------------------ conversões
export function rgbToHsl(c: RGB): HSL {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: round1(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return { h: round1(((h * 60) + 360) % 360), s: round1(s * 100), l: round1(l * 100) };
}
export function hslToRgb(c: HSL): RGB {
  const h = (((c.h % 360) + 360) % 360) / 360, s = clamp(c.s, 0, 100) / 100, l = clamp(c.l, 0, 100) / 100;
  if (s === 0) return rgb(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number): number => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return rgb(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
export function rgbToHsv(c: RGB): HSV {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; }
  return { h: round1(((h * 60) + 360) % 360), s: round1((max === 0 ? 0 : d / max) * 100), v: round1(max * 100) };
}
export function hsvToRgb(c: HSV): RGB {
  const h = (((c.h % 360) + 360) % 360) / 60, s = clamp(c.s, 0, 100) / 100, v = clamp(c.v, 0, 100) / 100;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6] as [number, number, number];
  return rgb(r * 255, g * 255, b * 255);
}
export function rgbToCmyk(c: RGB): CMYK {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: round1(((1 - r - k) / (1 - k)) * 100), m: round1(((1 - g - k) / (1 - k)) * 100), y: round1(((1 - b - k) / (1 - k)) * 100), k: round1(k * 100) };
}

// ------------------------------------------------------------ contraste (WCAG 2.x)
const lin = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (c: RGB): number => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export function contrastRatio(a: RGB, b: RGB): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export interface Wcag { ratio: number; aaNormal: boolean; aaLarge: boolean; aaaNormal: boolean; aaaLarge: boolean; ui: boolean }
export function wcag(fg: RGB, bg: RGB): Wcag {
  const ratio = contrastRatio(fg, bg);
  const r = Math.floor(ratio * 100) / 100; // nunca arredonda para cima: 4,499 não vira "4,5"
  return { ratio: r, aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5, ui: ratio >= 3 };
}
/** Preto ou branco, o que tiver mais contraste sobre a cor. */
export const bestText = (bg: RGB): RGB => (contrastRatio(rgb(0, 0, 0), bg) >= contrastRatio(rgb(255, 255, 255), bg) ? rgb(0, 0, 0) : rgb(255, 255, 255));
/** Ajusta só a luminosidade do texto (mesmo matiz) até chegar ao contraste pedido. Nulo se não houver como. */
export function suggestForeground(fg: RGB, bg: RGB, target = 4.5): RGB | null {
  if (contrastRatio(fg, bg) >= target) return fg;
  const hsl = rgbToHsl(fg);
  for (const dir of [contrastRatio(rgb(0, 0, 0), bg) >= contrastRatio(rgb(255, 255, 255), bg) ? -1 : 1, 0] as const) {
    if (dir === 0) return null;
    for (let step = 1; step <= 100; step++) {
      const l = clamp(hsl.l + dir * step, 0, 100);
      const candidate = hslToRgb({ h: hsl.h, s: hsl.s, l });
      if (contrastRatio(candidate, bg) >= target) return candidate;
      if (l === 0 || l === 100) break;
    }
  }
  return null;
}

// ------------------------------------------------------------ harmonias
export type SchemeKind = 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'split' | 'monochrome' | 'scale';
export const SCHEMES: readonly { id: SchemeKind; label: string; help: string }[] = [
  { id: 'complementary', label: 'Complementar', help: 'A cor e a oposta no círculo cromático.' },
  { id: 'analogous', label: 'Análoga', help: 'Cores vizinhas, 30° para cada lado.' },
  { id: 'triadic', label: 'Tríade', help: 'Três cores a 120° uma da outra.' },
  { id: 'tetradic', label: 'Tétrade', help: 'Quatro cores a 90° uma da outra.' },
  { id: 'split', label: 'Complementar dividida', help: 'A cor e as duas vizinhas da oposta.' },
  { id: 'monochrome', label: 'Monocromática', help: 'O mesmo matiz em cinco luminosidades.' },
  { id: 'scale', label: 'Escala de tons', help: 'Nove tons do claro ao escuro, no estilo 100 a 900.' }
];
export function scheme(base: RGB, kind: SchemeKind): RGB[] {
  const hsl = rgbToHsl(base);
  const rotate = (deg: number): RGB => hslToRgb({ ...hsl, h: hsl.h + deg });
  const opaque = { ...base, a: 1 };
  switch (kind) {
    case 'complementary': return [opaque, rotate(180)];
    case 'analogous': return [rotate(-30), opaque, rotate(30)];
    case 'triadic': return [opaque, rotate(120), rotate(240)];
    case 'tetradic': return [opaque, rotate(90), rotate(180), rotate(270)];
    case 'split': return [opaque, rotate(150), rotate(210)];
    case 'monochrome': return [20, 35, 50, 65, 80].map((l) => hslToRgb({ ...hsl, l }));
    case 'scale': return [95, 85, 75, 65, 55, 45, 35, 25, 15].map((l) => hslToRgb({ ...hsl, l }));
  }
}

// ------------------------------------------------------------ extração de uma imagem (corte pela mediana)
type Px = [number, number, number];
/** Cores dominantes de pixels RGBA. Determinístico; ignora pixels quase transparentes. */
export function extractPalette(data: ArrayLike<number>, count: number): RGB[] {
  const want = Math.round(clamp(count, 1, 16));
  const total = Math.floor(data.length / 4);
  const stride = Math.max(1, Math.floor(total / 40_000));
  const pixels: Px[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if ((data[o + 3] ?? 255) < 128) continue;
    pixels.push([data[o] as number, data[o + 1] as number, data[o + 2] as number]);
  }
  if (!pixels.length) return [];
  let boxes: Px[][] = [pixels];
  while (boxes.length < want) {
    let bi = -1, widest = 0;
    boxes.forEach((box, i) => { const r = spread(box); if (box.length > 1 && r.range > widest) { widest = r.range; bi = i; } });
    if (bi < 0) break;
    const box = boxes[bi] as Px[];
    const { channel } = spread(box);
    const sorted = [...box].sort((a, b) => (a[channel] as number) - (b[channel] as number));
    // Corta na média do canal (separa melhor cores muito desiguais em quantidade); se não separar, corta no meio.
    const mean = sorted.reduce((sum, p) => sum + (p[channel] as number), 0) / sorted.length;
    let mid = sorted.findIndex((p) => (p[channel] as number) > mean);
    if (mid <= 0 || mid >= sorted.length) mid = Math.floor(sorted.length / 2);
    boxes.splice(bi, 1, sorted.slice(0, mid), sorted.slice(mid));
    boxes = boxes.filter((b) => b.length > 0);
  }
  return boxes
    .map((box) => ({ n: box.length, c: rgb(avg(box, 0), avg(box, 1), avg(box, 2)) }))
    .sort((a, b) => b.n - a.n || toHex(a.c).localeCompare(toHex(b.c)))
    .map((x) => x.c);
}
const avg = (box: Px[], ch: 0 | 1 | 2): number => box.reduce((s, p) => s + (p[ch] as number), 0) / box.length;
function spread(box: Px[]): { channel: 0 | 1 | 2; range: number } {
  let best: 0 | 1 | 2 = 0, range = -1;
  for (const ch of [0, 1, 2] as const) {
    let lo = 255, hi = 0;
    for (const p of box) { const v = p[ch] as number; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo > range) { range = hi - lo; best = ch; }
  }
  return { channel: best, range };
}

/** Todas as cores escritas num texto livre (#hex, rgb(), hsl()), na ordem em que aparecem, sem repetir. */
export function colorsInText(text: string, limit = 64): RGB[] {
  const out: RGB[] = [], seen = new Set<string>();
  const re = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|(?:rgba?|hsla?)\([^)]{0,60}\)/gi;
  for (const m of String(text).slice(0, 20_000).matchAll(re)) {
    const c = parseColor(m[0]);
    if (!c) continue;
    const key = toHex({ ...c, a: 1 });
    if (seen.has(key)) continue;
    seen.add(key); out.push({ ...c, a: 1 });
    if (out.length >= limit) break;
  }
  return out;
}
