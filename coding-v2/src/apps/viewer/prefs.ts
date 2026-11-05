import { reactive, watch } from 'vue';

/**
 * Preferências do Visualizador. Ficam só neste aparelho (localStorage), separadas dos documentos: mudar o modo da lista
 * ou o tamanho da letra nunca altera um projeto salvo.
 */
export const PREFS_KEY = 'coding-v2-viewer-prefs';

export type LibraryView = 'grade' | 'lista';
export type SortKey = 'ordem' | 'nome' | 'formato' | 'tamanho';
export type Backdrop = 'xadrez' | 'claro' | 'escuro';
export type ModelColor = 'azul' | 'cinza' | 'laranja' | 'verde';

export interface ViewerPrefs {
  libraryView: LibraryView;
  sortKey: SortKey;
  sortDesc: boolean;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  backdrop: Backdrop;
  wrap: boolean;
  gutter: boolean;
  fontSize: number;
  slideSeconds: number;
  volume: number;
  muted: boolean;
  rate: number;
  loop: boolean;
  autoNext: boolean;
  modelColor: ModelColor;
  wire: boolean;
  pdfThumbs: boolean;
}

export const RATES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const SLIDE_SECONDS: readonly number[] = [1, 2, 3, 5, 10, 15];
export const FONT_MIN = 10, FONT_MAX = 32;

export const DEFAULT_PREFS: Readonly<ViewerPrefs> = Object.freeze({
  libraryView: 'grade', sortKey: 'ordem', sortDesc: false, libraryOpen: true, inspectorOpen: true,
  backdrop: 'xadrez', wrap: true, gutter: true, fontSize: 14, slideSeconds: 3,
  volume: 1, muted: false, rate: 1, loop: false, autoNext: true,
  modelColor: 'azul', wire: false, pdfThumbs: false
});

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const num = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const nearest = (value: unknown, allowed: readonly number[], fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return allowed.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best), allowed[0] ?? fallback);
};

/** Aceita qualquer coisa vinda do armazenamento e devolve preferências válidas (valores desconhecidos voltam ao padrão). */
export function parsePrefs(raw: unknown): ViewerPrefs {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    libraryView: oneOf(o.libraryView, ['grade', 'lista'], d.libraryView),
    sortKey: oneOf(o.sortKey, ['ordem', 'nome', 'formato', 'tamanho'], d.sortKey),
    sortDesc: bool(o.sortDesc, d.sortDesc),
    libraryOpen: bool(o.libraryOpen, d.libraryOpen),
    inspectorOpen: bool(o.inspectorOpen, d.inspectorOpen),
    backdrop: oneOf(o.backdrop, ['xadrez', 'claro', 'escuro'], d.backdrop),
    wrap: bool(o.wrap, d.wrap),
    gutter: bool(o.gutter, d.gutter),
    fontSize: Math.round(num(o.fontSize, FONT_MIN, FONT_MAX, d.fontSize)),
    slideSeconds: nearest(o.slideSeconds, SLIDE_SECONDS, d.slideSeconds),
    volume: num(o.volume, 0, 1, d.volume),
    muted: bool(o.muted, d.muted),
    rate: nearest(o.rate, RATES, d.rate),
    loop: bool(o.loop, d.loop),
    autoNext: bool(o.autoNext, d.autoNext),
    modelColor: oneOf(o.modelColor, ['azul', 'cinza', 'laranja', 'verde'], d.modelColor),
    wire: bool(o.wire, d.wire),
    pdfThumbs: bool(o.pdfThumbs, d.pdfThumbs)
  };
}

export function loadPrefs(): ViewerPrefs {
  try {
    const text = localStorage.getItem(PREFS_KEY);
    return parsePrefs(text ? JSON.parse(text) : null);
  } catch { return parsePrefs(null); }
}

export function savePrefs(prefs: ViewerPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* armazenamento opcional */ }
}

/** Preferências reativas que se salvam sozinhas. */
export function useViewerPrefs(): ViewerPrefs {
  const prefs = reactive<ViewerPrefs>(loadPrefs());
  watch(prefs, () => savePrefs({ ...prefs }), { deep: true });
  return prefs;
}
