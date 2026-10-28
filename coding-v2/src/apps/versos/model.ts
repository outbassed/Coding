/**
 * Modelo de documento do Versos (esquema v1).
 *
 * Um projeto é uma lista de cenas independentes. Cada cena tem tamanho, fundo e blocos de texto próprios.
 * Tudo aqui é puro (sem DOM): `normalizeVersos` nunca confia no que veio do banco, e as operações de cena
 * (duplicar, colar, mover, excluir) são funções testáveis que SEMPRE geram identificadores novos para cópias.
 *
 * Posição de um texto: `x` e `y` são o CENTRO da caixa do texto, em pixels da cena; `width` é a largura da área
 * de texto (a altura é calculada pelo layout). A rotação gira em torno desse centro.
 */

export const VERSOS_SCHEMA = 1;
export const MAX_SCENES = 300;
export const MAX_TEXTS = 100;
export const MIN_SIDE = 16;
export const MAX_SIDE = 8192;
/** Acima disso alguns celulares (Safari/iOS) podem falhar ao criar a imagem; só avisamos, não impedimos. */
export const PIXEL_WARNING = 16_777_216;

export type RatioId = '1:1' | '16:9' | '9:16' | '4:5' | '4:3' | 'custom';
export interface RatioDef { id: RatioId; label: string; w: number; h: number }
export const RATIOS: readonly RatioDef[] = [
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: 'custom', label: 'Personalizada', w: 0, h: 0 }
];
export const isRatioId = (value: unknown): value is RatioId => typeof value === 'string' && RATIOS.some((r) => r.id === value);
export const ratioDef = (id: RatioId): RatioDef => RATIOS.find((r) => r.id === id) ?? RATIOS[RATIOS.length - 1]!;

export interface FontRef {
  /** Identificador da fonte no catálogo (ex.: "arimo") ou o nome de uma fonte que este aparelho não tem. */
  id: string;
  /** Nome original escolhido pela pessoa; nunca é trocado quando a fonte está ausente. */
  label: string;
}
export type Align = 'left' | 'center' | 'right';
export interface Stroke { color: string; width: number }
/** `opacity` é a intensidade da sombra; `blur` o desfoque; `x`/`y` o deslocamento (em px da cena). Sem desfoque e sem deslocamento = sem sombra. */
export interface Shadow { color: string; opacity: number; blur: number; x: number; y: number }

/** Aparência de um texto (tudo o que pode ser copiado e colado como “formatação”). */
export interface TextStyle {
  font: FontRef;
  size: number;
  weight: number;
  italic: boolean;
  color: string;
  opacity: number;
  align: Align;
  letterSpacing: number;
  lineHeight: number;
  stroke: Stroke;
  shadow: Shadow;
}
export interface TextBlock extends TextStyle {
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  visible: boolean;
}

export type BgMode = 'color' | 'transparent' | 'image';
export type BgFit = 'cover' | 'contain' | 'stretch';
export interface BgImage { imageId: string; fit: BgFit; x: number; y: number; zoom: number }
export interface Background { mode: BgMode; color: string; alpha: number; image: BgImage | null }

export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  ratio: RatioId;
  background: Background;
  texts: TextBlock[];
}
export interface SavedStyle { id: string; name: string; style: TextStyle }
export interface VersosState {
  v: number;
  name: string;
  scenes: Scene[];
  styles: SavedStyle[];
}

// ---------- utilidades ----------

export function newId(prefix: string): string {
  const raw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return prefix + raw.slice(0, 12);
}
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
export function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}
const str = (value: unknown, max: number, fallback = ''): string => (typeof value === 'string' ? value.slice(0, max) : fallback);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Cor `#rgb` ou `#rrggbb` → `#rrggbb` minúsculo; qualquer outra coisa volta ao padrão. */
export function normColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? '#' + m[1]! + m[1]! + m[2]! + m[2]! + m[3]! + m[3]! : fallback;
}
export function hexToRgb(hex: string): [number, number, number] {
  const h = normColor(hex, '#000000');
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.round(clamp(alpha, 0, 1) * 1000) / 1000 + ')';
}

// ---------- padrões ----------

export const DEFAULT_FONT: FontRef = { id: 'arimo', label: 'Arimo' };
export const DEFAULT_BG_COLOR = '#14161c';
export const DEFAULT_TEXT_COLOR = '#ffffff';

export function defaultStyle(sceneHeight = 1080): TextStyle {
  return {
    font: { ...DEFAULT_FONT }, size: Math.max(12, Math.round(sceneHeight * 0.06)), weight: 400, italic: false,
    color: DEFAULT_TEXT_COLOR, opacity: 1, align: 'center', letterSpacing: 0, lineHeight: 1.25,
    stroke: { color: '#000000', width: 0 }, shadow: { color: '#000000', opacity: 0.6, blur: 0, x: 0, y: 0 }
  };
}
export function blankBackground(color = DEFAULT_BG_COLOR): Background { return { mode: 'color', color, alpha: 1, image: null }; }

export function blankScene(width = 1080, height = 1080, ratio?: RatioId): Scene {
  return { id: newId('sc_'), name: '', width, height, ratio: ratio ?? detectRatio(width, height), background: blankBackground(), texts: [] };
}
export function blankText(scene: Pick<Scene, 'width' | 'height'>, text = 'Novo texto'): TextBlock {
  return {
    ...defaultStyle(scene.height), id: newId('tx_'), name: '', text,
    x: Math.round(scene.width / 2), y: Math.round(scene.height / 2), width: Math.round(scene.width * 0.8), rotation: 0, visible: true
  };
}
export function blankVersos(name = 'Novo projeto', width = 1080, height = 1080): VersosState {
  return { v: VERSOS_SCHEMA, name, scenes: [blankScene(width, height)], styles: [] };
}

/** Proporção predefinida que corresponde ao tamanho (tolerância de 0,5%), ou "custom". */
export function detectRatio(width: number, height: number): RatioId {
  if (!(width > 0) || !(height > 0)) return 'custom';
  for (const r of RATIOS) {
    if (r.id === 'custom') continue;
    if (Math.abs(width / height - r.w / r.h) / (r.w / r.h) < 0.005) return r.id;
  }
  return 'custom';
}
/** Dimensões ao trocar a proporção mantendo o lado maior (a resolução é escolhida à parte). */
export function dimsForRatio(ratio: RatioId, width: number, height: number): { width: number; height: number } {
  if (ratio === 'custom') return { width, height };
  const r = ratioDef(ratio);
  const long = Math.max(width, height);
  const wide = r.w >= r.h;
  const w = wide ? long : Math.round((long * r.w) / r.h);
  const h = wide ? Math.round((long * r.h) / r.w) : long;
  return { width: clamp(w, MIN_SIDE, MAX_SIDE), height: clamp(h, MIN_SIDE, MAX_SIDE) };
}
/** Muda a largura (ou a altura) respeitando a proporção predefinida; em "custom" mexe só no lado pedido. */
export function resizeKeepingRatio(scene: Pick<Scene, 'width' | 'height' | 'ratio'>, side: 'width' | 'height', value: number): { width: number; height: number } {
  const v = Math.round(clamp(value, MIN_SIDE, MAX_SIDE));
  if (scene.ratio === 'custom') return side === 'width' ? { width: v, height: scene.height } : { width: scene.width, height: v };
  const r = ratioDef(scene.ratio);
  if (side === 'width') return { width: v, height: clamp(Math.round((v * r.h) / r.w), MIN_SIDE, MAX_SIDE) };
  return { width: clamp(Math.round((v * r.w) / r.h), MIN_SIDE, MAX_SIDE), height: v };
}
export const pixelCount = (scene: Pick<Scene, 'width' | 'height'>): number => scene.width * scene.height;

// ---------- normalização ----------

export function normalizeFont(raw: unknown): FontRef {
  const f = obj(raw);
  const id = str(f.id, 80).trim();
  if (!id) return { ...DEFAULT_FONT };
  return { id, label: str(f.label, 80).trim() || id };
}
export function normalizeStyle(raw: unknown, sceneHeight = 1080): TextStyle {
  const s = obj(raw), d = defaultStyle(sceneHeight), st = obj(s.stroke), sh = obj(s.shadow);
  return {
    font: normalizeFont(s.font),
    size: num(s.size, 1, 4000, d.size),
    weight: Math.round(num(s.weight, 100, 900, d.weight) / 100) * 100,
    italic: s.italic === true,
    color: normColor(s.color, d.color),
    opacity: num(s.opacity, 0, 1, 1),
    align: s.align === 'left' || s.align === 'right' ? s.align : 'center',
    letterSpacing: num(s.letterSpacing, -50, 200, 0),
    lineHeight: num(s.lineHeight, 0.5, 4, d.lineHeight),
    stroke: { color: normColor(st.color, '#000000'), width: num(st.width, 0, 200, 0) },
    shadow: { color: normColor(sh.color, '#000000'), opacity: num(sh.opacity, 0, 1, 0.6), blur: num(sh.blur, 0, 400, 0), x: num(sh.x, -1000, 1000, 0), y: num(sh.y, -1000, 1000, 0) }
  };
}
export function normalizeText(raw: unknown, scene: Pick<Scene, 'width' | 'height'>): TextBlock {
  const t = obj(raw);
  return {
    ...normalizeStyle(t, scene.height),
    id: str(t.id, 40) || newId('tx_'),
    name: str(t.name, 60),
    text: str(t.text, 5000),
    x: num(t.x, -MAX_SIDE * 2, MAX_SIDE * 3, Math.round(scene.width / 2)),
    y: num(t.y, -MAX_SIDE * 2, MAX_SIDE * 3, Math.round(scene.height / 2)),
    width: num(t.width, 1, MAX_SIDE * 3, Math.round(scene.width * 0.8)),
    rotation: num(t.rotation, -360, 360, 0),
    visible: t.visible !== false
  };
}
export function normalizeBackground(raw: unknown): Background {
  const b = obj(raw), im = obj(b.image);
  const mode: BgMode = b.mode === 'transparent' || b.mode === 'image' ? b.mode : 'color';
  const imageId = str(im.imageId, 80);
  const image: BgImage | null = imageId
    ? { imageId, fit: im.fit === 'contain' || im.fit === 'stretch' ? im.fit : 'cover', x: num(im.x, -100, 100, 0), y: num(im.y, -100, 100, 0), zoom: num(im.zoom, 0.1, 8, 1) }
    : null;
  return { mode: mode === 'image' && !image ? 'color' : mode, color: normColor(b.color, DEFAULT_BG_COLOR), alpha: num(b.alpha, 0, 1, 1), image };
}
export function normalizeScene(raw: unknown): Scene {
  const s = obj(raw);
  const width = Math.round(num(s.width, MIN_SIDE, MAX_SIDE, 1080)), height = Math.round(num(s.height, MIN_SIDE, MAX_SIDE, 1080));
  const scene = { width, height };
  const seen = new Set<string>();
  const texts: TextBlock[] = [];
  for (const rawText of Array.isArray(s.texts) ? s.texts.slice(0, MAX_TEXTS) : []) {
    const t = normalizeText(rawText, scene);
    if (seen.has(t.id)) t.id = newId('tx_');
    seen.add(t.id);
    texts.push(t);
  }
  return {
    id: str(s.id, 40) || newId('sc_'), name: str(s.name, 80), width, height,
    ratio: isRatioId(s.ratio) ? s.ratio : detectRatio(width, height), background: normalizeBackground(s.background), texts
  };
}
export function normalizeVersos(raw: unknown): VersosState {
  const s = obj(raw);
  const seen = new Set<string>();
  const scenes: Scene[] = [];
  for (const rawScene of Array.isArray(s.scenes) ? s.scenes.slice(0, MAX_SCENES) : []) {
    const scene = normalizeScene(rawScene);
    if (seen.has(scene.id)) scene.id = newId('sc_');
    seen.add(scene.id);
    scenes.push(scene);
  }
  if (!scenes.length) scenes.push(blankScene());
  const styles: SavedStyle[] = [];
  const styleIds = new Set<string>();
  for (const rawStyle of Array.isArray(s.styles) ? s.styles.slice(0, 100) : []) {
    const r = obj(rawStyle);
    let id = str(r.id, 40) || newId('st_');
    if (styleIds.has(id)) id = newId('st_');
    styleIds.add(id);
    styles.push({ id, name: str(r.name, 60).trim() || 'Estilo', style: normalizeStyle(r.style) });
  }
  return { v: VERSOS_SCHEMA, name: str(s.name, 250) || 'Novo projeto', scenes, styles };
}

/** Imagens de fundo realmente usadas (as demais não precisam ir para o armazenamento). */
export function usedImageIds(state: Pick<VersosState, 'scenes'>): Set<string> {
  const ids = new Set<string>();
  for (const scene of state.scenes) if (scene.background.image) ids.add(scene.background.image.imageId);
  return ids;
}

// ---------- cenas ----------

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Cópia profunda com identificadores NOVOS (cena e textos). Fundos continuam apontando para a mesma imagem. */
export function cloneScene(scene: Scene, nameSuffix = ''): Scene {
  const copy = clone(scene);
  copy.id = newId('sc_');
  if (nameSuffix && copy.name) copy.name = (copy.name + nameSuffix).slice(0, 80);
  for (const t of copy.texts) t.id = newId('tx_');
  return copy;
}
export function cloneText(block: TextBlock, offset = 0): TextBlock {
  const copy = clone(block);
  copy.id = newId('tx_');
  copy.x += offset; copy.y += offset;
  return copy;
}
export function sceneLabel(scene: Scene, index: number): string { return scene.name.trim() || 'Cena ' + (index + 1); }

export function insertAt<T>(list: T[], item: T, index: number): void { list.splice(clamp(index, 0, list.length), 0, item); }
export function moveItem<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): boolean {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const [item] = list.splice(i, 1);
  list.splice(j, 0, item!);
  return true;
}
/** Remove a cena; se era a última, deixa uma cena inicial vazia para o projeto continuar editável. Devolve a cena a selecionar. */
export function removeScene(state: Pick<VersosState, 'scenes'>, id: string): string {
  const i = state.scenes.findIndex((s) => s.id === id);
  if (i < 0) return state.scenes[0]!.id;
  const removed = state.scenes[i]!;
  state.scenes.splice(i, 1);
  if (!state.scenes.length) {
    const fresh = blankScene(removed.width, removed.height, removed.ratio);
    state.scenes.push(fresh);
    return fresh.id;
  }
  return state.scenes[Math.min(i, state.scenes.length - 1)]!.id;
}

/** Redimensiona a cena; com `scaleContent`, textos acompanham (posição, largura, tamanho, contorno e sombra). */
export function rescaleScene(scene: Scene, width: number, height: number, scaleContent: boolean): void {
  const w = Math.round(clamp(width, MIN_SIDE, MAX_SIDE)), h = Math.round(clamp(height, MIN_SIDE, MAX_SIDE));
  if (scaleContent) {
    const kx = w / scene.width, ky = h / scene.height, k = Math.min(kx, ky);
    for (const t of scene.texts) {
      t.x = Math.round(t.x * kx); t.y = Math.round(t.y * ky); t.width = Math.max(1, Math.round(t.width * kx));
      t.size = Math.max(1, Math.round(t.size * k * 100) / 100);
      t.letterSpacing = Math.round(t.letterSpacing * k * 100) / 100;
      t.stroke.width = Math.round(t.stroke.width * k * 100) / 100;
      t.shadow.blur = Math.round(t.shadow.blur * k * 100) / 100; t.shadow.x = Math.round(t.shadow.x * k * 100) / 100; t.shadow.y = Math.round(t.shadow.y * k * 100) / 100;
    }
  }
  scene.width = w; scene.height = h; scene.ratio = detectRatio(w, h);
}

// ---------- textos e estilos ----------

export function styleOf(block: TextStyle): TextStyle {
  const { font, size, weight, italic, color, opacity, align, letterSpacing, lineHeight, stroke, shadow } = block;
  return clone({ font, size, weight, italic, color, opacity, align, letterSpacing, lineHeight, stroke, shadow });
}
/** Aplica só a aparência: conteúdo, posição, largura e rotação ficam como estão. */
export function applyStyle(block: TextBlock, style: TextStyle): void { Object.assign(block, clone(style)); }

export type PresetStyle = Partial<Omit<TextStyle, 'shadow' | 'stroke'>> & { font: FontRef; stroke?: Partial<Stroke>; shadow?: Partial<Shadow> };
export interface StylePreset { id: string; name: string; hint: string; style: PresetStyle }
/** Estilos iniciais discretos. Nada obriga a usá-los: o projeto pode começar do zero. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'classico', name: 'Clássico', hint: 'Serifa elegante com sombra suave', style: { font: { id: 'playfair-display', label: 'Playfair Display' }, weight: 500, size: 0, shadow: { color: '#000000', blur: 12, x: 0, y: 3 } } },
  { id: 'moderno', name: 'Moderno', hint: 'Sem serifa, limpo e firme', style: { font: { id: 'montserrat', label: 'Montserrat' }, weight: 600, letterSpacing: 1 } },
  { id: 'poetico', name: 'Poético', hint: 'Itálico leve e arejado', style: { font: { id: 'cormorant-garamond', label: 'Cormorant Garamond' }, italic: true, weight: 500, lineHeight: 1.35, letterSpacing: 0.5 } },
  { id: 'manuscrito', name: 'Manuscrito', hint: 'Letra de mão', style: { font: { id: 'caveat', label: 'Caveat' }, weight: 600, lineHeight: 1.15 } },
  { id: 'impacto', name: 'Impacto', hint: 'Condensada, com contorno', style: { font: { id: 'bebas-neue', label: 'Bebas Neue' }, letterSpacing: 2, stroke: { color: '#000000', width: 4 } } },
  { id: 'cursiva', name: 'Cursiva', hint: 'Caligrafia de convite', style: { font: { id: 'great-vibes', label: 'Great Vibes' }, lineHeight: 1.1 } },
  { id: 'cinema', name: 'Cinema', hint: 'Caixa alta espaçada', style: { font: { id: 'oswald', label: 'Oswald' }, weight: 300, letterSpacing: 6 } }
];
/** Estilo completo de um preset para uma cena de certa altura (tamanho 0 = proporcional à altura). */
export function presetStyle(preset: StylePreset, sceneHeight: number): TextStyle {
  const base = defaultStyle(sceneHeight);
  const merged = { ...base, ...preset.style, stroke: { ...base.stroke, ...preset.style.stroke }, shadow: { ...base.shadow, ...preset.style.shadow } };
  if (!preset.style.size) merged.size = base.size;
  return normalizeStyle(merged, sceneHeight);
}

// ---------- nomes de arquivos ----------

export type ExportKind = 'full' | 'text';
/** `projeto-001.png`, `projeto-001-texto.png`: previsíveis e na ordem das cenas. */
export function exportFileName(project: string, index: number, total: number, kind: ExportKind, extension = 'png'): string {
  const base = project.normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/\s+/g, ' ').trim().replace(/^[-. ]+|[-. ]+$/g, '').slice(0, 60) || 'versos';
  const width = Math.max(3, String(total).length);
  return base + '-' + String(index + 1).padStart(width, '0') + (kind === 'text' ? '-texto' : '') + '.' + extension;
}
