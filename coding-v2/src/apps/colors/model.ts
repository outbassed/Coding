import { colorsInText, parseColor, rgbToHsl, scheme as makeScheme, toHex, SCHEMES, type SchemeKind } from './color';

export interface Swatch { id: string; hex: string; name: string }
export interface ColorsState {
  name: string;
  /** Cor em edição (#RRGGBB). */
  base: string;
  palette: Swatch[];
  /** Par do verificador de contraste. */
  fg: string;
  bg: string;
  scheme: SchemeKind;
}
export const MAX_SWATCHES = 64;
export const MAX_NAME = 40;
const DEFAULT_BASE = '#3366CC';

let counter = 0;
export const swatchId = (): string => 's' + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

/** Texto → #RRGGBB (a transparência, se houver, é descartada); nulo se não for uma cor. */
export function hexOf(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const c = parseColor(input);
  return c ? toHex({ ...c, a: 1 }) : null;
}
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_NAME) : '');

export function emptyColors(name = 'Paleta de cores'): ColorsState {
  return { name, base: DEFAULT_BASE, palette: [], fg: '#141922', bg: '#FFFFFF', scheme: 'complementary' };
}

export function normalizeColors(raw: unknown): ColorsState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const palette: Swatch[] = [];
  const ids = new Set<string>();
  if (Array.isArray(s.palette)) {
    for (const item of s.palette) {
      const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const hex = hexOf(o.hex);
      if (!hex || palette.length >= MAX_SWATCHES) continue;
      let id = typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 40 ? o.id : swatchId();
      while (ids.has(id)) id = swatchId();
      ids.add(id);
      palette.push({ id, hex, name: cleanName(o.name) });
    }
  }
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Paleta de cores',
    base: hexOf(s.base) ?? DEFAULT_BASE,
    palette,
    fg: hexOf(s.fg) ?? '#141922',
    bg: hexOf(s.bg) ?? '#FFFFFF',
    scheme: SCHEMES.some((x) => x.id === s.scheme) ? (s.scheme as SchemeKind) : 'complementary'
  };
}

// ------------------------------------------------------------ paleta
export type AddResult = { state: ColorsState; added: number; skipped: number; full: boolean };
/** Acrescenta cores à paleta sem repetir a mesma cor e sem passar do limite. */
export function addColors(state: ColorsState, hexes: readonly string[], names: readonly string[] = []): AddResult {
  const palette = [...state.palette];
  const have = new Set(palette.map((p) => p.hex));
  let added = 0, skipped = 0, full = false;
  hexes.forEach((raw, i) => {
    const hex = hexOf(raw);
    if (!hex || have.has(hex)) { skipped++; return; }
    if (palette.length >= MAX_SWATCHES) { full = true; skipped++; return; }
    have.add(hex);
    palette.push({ id: swatchId(), hex, name: cleanName(names[i]) });
    added++;
  });
  return { state: { ...state, palette }, added, skipped, full };
}
export const removeSwatch = (state: ColorsState, id: string): ColorsState => ({ ...state, palette: state.palette.filter((p) => p.id !== id) });
export function moveSwatch(state: ColorsState, id: string, delta: -1 | 1): ColorsState {
  const i = state.palette.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.palette.length) return state;
  const palette = [...state.palette];
  [palette[i], palette[j]] = [palette[j] as Swatch, palette[i] as Swatch];
  return { ...state, palette };
}
export function renameSwatch(state: ColorsState, id: string, name: string): ColorsState {
  return { ...state, palette: state.palette.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)) };
}
/** Cores de uma harmonia, já em hex. */
export const schemeHexes = (base: string, kind: SchemeKind): string[] => {
  const c = parseColor(base);
  return c ? makeScheme(c, kind).map((x) => toHex(x)) : [];
};

// ------------------------------------------------------------ importar / exportar
/** Importa as cores escritas num texto (#hex, rgb(), hsl()). */
export function importFromText(state: ColorsState, text: string): AddResult {
  return addColors(state, colorsInText(text, MAX_SWATCHES).map((c) => toHex(c)));
}

export function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
function uniqueNames(palette: readonly Swatch[]): string[] {
  const used = new Set<string>();
  return palette.map((p, i) => {
    const base = slug(p.name) || 'cor-' + (i + 1);
    let name = base, n = 2;
    while (used.has(name)) name = base + '-' + n++;
    used.add(name);
    return name;
  });
}
export function paletteCss(state: ColorsState): string {
  const names = uniqueNames(state.palette);
  const lines = state.palette.map((p, i) => '  --' + names[i] + ': ' + p.hex + ';');
  return '/* ' + state.name.replace(/\*\//g, '') + ' */\n:root {\n' + lines.join('\n') + '\n}\n';
}
export function paletteJson(state: ColorsState): string {
  const colors = state.palette.map((p) => {
    const c = parseColor(p.hex)!;
    const h = rgbToHsl(c);
    return { name: p.name || null, hex: p.hex, rgb: [c.r, c.g, c.b], hsl: [Math.round(h.h), Math.round(h.s), Math.round(h.l)] };
  });
  return JSON.stringify({ name: state.name, colors }, null, 2) + '\n';
}
export function paletteText(state: ColorsState): string {
  return [state.name, '', ...state.palette.map((p) => (p.name ? p.name + ' ' : '') + p.hex)].join('\n') + '\n';
}
const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
/** Imagem SVG da paleta (retângulos com nome e código), pronta para anexar em documentos. */
export function paletteSvg(state: ColorsState): string {
  const per = 6, cell = 120, pad = 12, label = 36;
  const cols = Math.max(1, Math.min(per, state.palette.length));
  const rows = Math.max(1, Math.ceil(state.palette.length / per));
  const w = pad + cols * (cell + pad), h = pad + rows * (cell + label + pad);
  const items = state.palette.map((p, i) => {
    const x = pad + (i % per) * (cell + pad), y = pad + Math.floor(i / per) * (cell + label + pad);
    return '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="12" fill="' + p.hex + '" stroke="#00000022"/>' +
      '<text x="' + x + '" y="' + (y + cell + 15) + '" font-family="sans-serif" font-size="12" font-weight="700" fill="#141922">' + esc(p.name || p.hex) + '</text>' +
      (p.name ? '<text x="' + x + '" y="' + (y + cell + 30) + '" font-family="sans-serif" font-size="11" fill="#596579">' + p.hex + '</text>' : '');
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><title>' + esc(state.name) + '</title><rect width="100%" height="100%" fill="#ffffff"/>' + items.join('') + '</svg>\n';
}
