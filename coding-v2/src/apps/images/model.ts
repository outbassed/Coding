export type LayerKind = 'image' | 'text' | 'rect' | 'ellipse';
export interface Filters { brightness: number; contrast: number; saturation: number; blur: number; grayscale: number; sepia: number; hue: number }
export interface Crop { x: number; y: number; w: number; h: number } // frações 0..1 da imagem original
export interface Layer {
  id: string; name: string; kind: LayerKind;
  x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean;
  opacity: number; visible: boolean; filters: Filters;
  imageId?: string; crop?: Crop;
  text?: string; font?: string; size?: number; color?: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right';
  fill?: string; stroke?: string; strokeWidth?: number; radius?: number;
}
export interface ImagesState { name: string; width: number; height: number; background: string; layers: Layer[] }
export const MAX_SIDE = 6000, MAX_LAYERS = 100;
export const FONTS = ['Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'Times New Roman', 'Courier New', 'Impact', 'Tahoma'] as const;
export const lid = (): string => 'l' + Math.random().toString(36).slice(2, 9);
export const noFilters = (): Filters => ({ brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0 });
const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const KINDS: LayerKind[] = ['image', 'text', 'rect', 'ellipse'];

export function normalizeFilters(raw: unknown): Filters {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Partial<Filters>;
  return { brightness: num(f.brightness, 0, 300, 100), contrast: num(f.contrast, 0, 300, 100), saturation: num(f.saturation, 0, 300, 100), blur: num(f.blur, 0, 40, 0), grayscale: num(f.grayscale, 0, 100, 0), sepia: num(f.sepia, 0, 100, 0), hue: num(f.hue, -180, 180, 0) };
}
export function normalizeLayer(raw: unknown): Layer | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Partial<Layer>;
  const kind: LayerKind = KINDS.includes(l.kind as LayerKind) ? (l.kind as LayerKind) : 'rect';
  const base: Layer = {
    id: typeof l.id === 'string' && /^[\w-]{1,40}$/.test(l.id) ? l.id : lid(), name: typeof l.name === 'string' ? l.name.slice(0, 60) : 'Camada', kind,
    x: num(l.x, -MAX_SIDE, MAX_SIDE * 2, 0), y: num(l.y, -MAX_SIDE, MAX_SIDE * 2, 0), w: num(l.w, 1, MAX_SIDE * 2, 100), h: num(l.h, 1, MAX_SIDE * 2, 100),
    rotation: num(l.rotation, -360, 360, 0), flipX: l.flipX === true, flipY: l.flipY === true, opacity: num(l.opacity, 0, 1, 1), visible: l.visible !== false,
    filters: normalizeFilters(l.filters)
  };
  if (kind === 'image') {
    if (typeof l.imageId !== 'string' || !l.imageId) return null;
    base.imageId = l.imageId.slice(0, 80);
    const c = (l.crop ?? {}) as Partial<Crop>;
    const x = num(c.x, 0, 0.99, 0), y = num(c.y, 0, 0.99, 0);
    base.crop = { x, y, w: num(c.w, 0.01, 1 - x, 1 - x), h: num(c.h, 0.01, 1 - y, 1 - y) };
  } else if (kind === 'text') {
    base.text = typeof l.text === 'string' ? l.text.slice(0, 2000) : 'Texto';
    base.font = typeof l.font === 'string' && (FONTS as readonly string[]).includes(l.font) ? l.font : 'Arial';
    base.size = num(l.size, 6, 800, 64); base.color = hex(l.color, '#141922'); base.bold = l.bold === true; base.italic = l.italic === true;
    base.align = l.align === 'left' || l.align === 'right' ? l.align : 'center';
  } else {
    base.fill = typeof l.fill === 'string' && (l.fill === 'transparent' || /^#[0-9a-f]{6}$/i.test(l.fill)) ? l.fill : '#4c8df6';
    base.stroke = hex(l.stroke, '#141922'); base.strokeWidth = num(l.strokeWidth, 0, 200, 0); base.radius = num(l.radius, 0, 2000, 0);
  }
  return base;
}
export function normalizeImages(raw: unknown): ImagesState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<ImagesState>;
  const ids = new Set<string>();
  const layers: Layer[] = [];
  for (const l of Array.isArray(s.layers) ? s.layers.slice(0, MAX_LAYERS) : []) {
    const n = normalizeLayer(l);
    if (!n) continue;
    if (ids.has(n.id)) n.id = lid();
    ids.add(n.id); layers.push(n);
  }
  const bg = typeof s.background === 'string' && (s.background === 'transparent' || /^#[0-9a-f]{6}$/i.test(s.background)) ? s.background : '#ffffff';
  return { name: typeof s.name === 'string' ? s.name.slice(0, 250) : 'Imagem', width: Math.round(num(s.width, 16, MAX_SIDE, 1080)), height: Math.round(num(s.height, 16, MAX_SIDE, 1080)), background: bg, layers };
}
export const usedImageIds = (state: ImagesState): Set<string> => new Set(state.layers.filter((l) => l.kind === 'image' && l.imageId).map((l) => l.imageId!));

export function filterCss(f: Filters): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push('brightness(' + f.brightness + '%)');
  if (f.contrast !== 100) parts.push('contrast(' + f.contrast + '%)');
  if (f.saturation !== 100) parts.push('saturate(' + f.saturation + '%)');
  if (f.grayscale) parts.push('grayscale(' + f.grayscale + '%)');
  if (f.sepia) parts.push('sepia(' + f.sepia + '%)');
  if (f.hue) parts.push('hue-rotate(' + f.hue + 'deg)');
  if (f.blur) parts.push('blur(' + f.blur + 'px)');
  return parts.join(' ') || 'none';
}
export const PRESETS: { id: string; name: string; f: Partial<Filters> }[] = [
  { id: 'none', name: 'Original', f: {} },
  { id: 'bw', name: 'Preto e branco', f: { grayscale: 100, contrast: 110 } },
  { id: 'sepia', name: 'Sépia', f: { sepia: 80, contrast: 95 } },
  { id: 'vivid', name: 'Vívido', f: { saturation: 150, contrast: 115 } },
  { id: 'soft', name: 'Suave', f: { brightness: 108, contrast: 88, saturation: 85 } },
  { id: 'cool', name: 'Frio', f: { hue: -15, saturation: 110 } }
];

/** Composição de exemplo pronta para editar (só formas e textos; nenhuma foto inventada). */
export function demoImages(): ImagesState {
  const f = noFilters();
  return normalizeImages({
    name: 'Cartaz de exemplo', width: 1080, height: 1350, background: '#fdf6e3',
    layers: [
      { id: lid(), name: 'Faixa', kind: 'rect', x: 0, y: 0, w: 1080, h: 520, rotation: 0, opacity: 1, visible: true, filters: f, fill: '#e8538f', strokeWidth: 0, radius: 0 },
      { id: lid(), name: 'Círculo', kind: 'ellipse', x: 640, y: 260, w: 520, h: 520, rotation: 0, opacity: 0.85, visible: true, filters: f, fill: '#f5b820', strokeWidth: 0 },
      { id: lid(), name: 'Cartão', kind: 'rect', x: 90, y: 640, w: 900, h: 460, rotation: -3, opacity: 1, visible: true, filters: f, fill: '#ffffff', stroke: '#141922', strokeWidth: 6, radius: 36 },
      { id: lid(), name: 'Título', kind: 'text', x: 90, y: 140, w: 900, h: 260, rotation: 0, opacity: 1, visible: true, filters: f, text: 'Feira de\nInverno', font: 'Georgia', size: 120, color: '#ffffff', bold: true, align: 'left' },
      { id: lid(), name: 'Detalhes', kind: 'text', x: 150, y: 700, w: 780, h: 340, rotation: -3, opacity: 1, visible: true, filters: f, text: 'Sábado, 14h às 20h\nPraça Central\nEntrada gratuita', font: 'Arial', size: 64, color: '#141922', bold: false, align: 'left' },
      { id: lid(), name: 'Selo', kind: 'text', x: 700, y: 1170, w: 340, h: 120, rotation: 0, opacity: 1, visible: true, filters: f, text: 'Edite tudo!', font: 'Impact', size: 64, color: '#e8538f', align: 'right' }
    ]
  });
}
export function blankImages(width = 1080, height = 1080): ImagesState { return { name: 'Nova imagem', width, height, background: '#ffffff', layers: [] }; }
