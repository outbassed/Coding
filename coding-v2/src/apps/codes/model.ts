import type { Symbology } from './barcodes';
import type { CodeStyle, Ecl } from './render';

export interface CodeItem { id: string; kind: Symbology; value: string; caption: string; copies: number }
export interface StylePreset { id: string; name: string; style: CodeStyle }
export interface CodesState { name: string; items: CodeItem[]; style: CodeStyle; layout: { cols: number; gapMm: number }; /** aparências guardadas com nome */ stylePresets: StylePreset[] }
export const MAX_ITEMS = 200;
export const MAX_STYLE_PRESETS = 12;
const KINDS: Symbology[] = ['qr', 'code128', 'ean13', 'ean8', 'upca', 'code39'];
export const cid = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

export function defaultStyle(): CodeStyle { return { module: 4, height: 90, fg: '#000000', bg: '#ffffff', showText: true, ecl: 'M', margin: 4 }; }
export function normalizeStyle(raw: unknown): CodeStyle {
  const st = (raw && typeof raw === 'object' ? raw : {}) as Partial<CodeStyle>;
  const ecl: Ecl = st.ecl === 'L' || st.ecl === 'Q' || st.ecl === 'H' ? st.ecl : 'M';
  return { module: num(st.module, 1, 20, 4), height: num(st.height, 20, 400, 90), fg: color(st.fg, '#000000'), bg: color(st.bg, '#ffffff'), showText: st.showText !== false, ecl, margin: num(st.margin, 0, 10, 4) };
}
export function normalizeStylePresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return [];
  const out: StylePreset[] = [];
  const ids = new Set<string>();
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const p = it as Partial<StylePreset>;
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 60) : '';
    if (!name) continue;
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : cid();
    while (ids.has(id)) id += '-';
    ids.add(id);
    out.push({ id, name, style: normalizeStyle(p.style) });
    if (out.length >= MAX_STYLE_PRESETS) break;
  }
  return out;
}
export function normalizeCodes(raw: unknown): CodesState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<CodesState>;
  const items: CodeItem[] = [];
  const ids = new Set<string>();
  for (const it of Array.isArray(s.items) ? s.items.slice(0, MAX_ITEMS) : []) {
    if (!it || typeof it !== 'object') continue;
    const id = typeof it.id === 'string' && it.id && !ids.has(it.id) ? it.id.slice(0, 40) : cid();
    ids.add(id);
    items.push({ id, kind: KINDS.includes(it.kind) ? it.kind : 'qr', value: typeof it.value === 'string' ? it.value.slice(0, 2000) : '', caption: typeof it.caption === 'string' ? it.caption.slice(0, 80) : '', copies: num(it.copies, 1, 200, 1) });
  }
  return {
    name: typeof s.name === 'string' ? s.name.slice(0, 250) : 'Códigos',
    items,
    style: normalizeStyle(s.style),
    layout: { cols: num(s.layout?.cols, 1, 6, 3), gapMm: num(s.layout?.gapMm, 0, 30, 6) },
    stylePresets: normalizeStylePresets(s.stylePresets)
  };
}
export function demoCodes(): CodesState {
  return normalizeCodes({ name: 'Códigos de exemplo', style: defaultStyle(), layout: { cols: 3, gapMm: 6 }, items: [
    { id: cid(), kind: 'qr', value: 'https://coding-v2-preview.vercel.app/', caption: 'Coding', copies: 1 },
    { id: cid(), kind: 'ean13', value: '789123456789', caption: '', copies: 1 },
    { id: cid(), kind: 'code128', value: 'CX-2026-0042', caption: '', copies: 1 }
  ] });
}
