import { findAll, fold } from './search';

/**
 * Pesquisa no texto de um PDF. O pdf.js entrega o texto em pedaços (itens) com posição; juntamos os itens de uma página
 * numa linha só para achar frases que atravessam itens e depois voltamos a cada item para saber onde desenhar o destaque.
 */
export interface TextItem { str: string; x: number; y: number; w: number; h: number }
export interface PageText { text: string; folded: string; items: TextItem[]; starts: number[] }
export interface Match { start: number; end: number }
/** Trecho de um item que deve ser destacado: frações (0–1) da largura do item. */
export interface ItemRange { item: number; f0: number; f1: number }

export function buildPageText(items: readonly TextItem[]): PageText {
  let text = '';
  const starts: number[] = [];
  for (const item of items) { starts.push(text.length); text += item.str; }
  return { text, folded: fold(text), items: items.slice(), starts };
}

export function findMatches(page: PageText, query: string, limit = 2000): Match[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  return findAll(page.folded, needle, limit).map((start) => ({ start, end: start + needle.length }));
}

export function rangesFor(page: PageText, match: Match): ItemRange[] {
  const out: ItemRange[] = [];
  page.items.forEach((item, i) => {
    const s = page.starts[i]!, e = s + item.str.length;
    if (!item.str.length) return;
    const a = Math.max(match.start, s), b = Math.min(match.end, e);
    if (b > a) out.push({ item: i, f0: (a - s) / item.str.length, f1: (b - s) / item.str.length });
  });
  return out;
}

/** Converte o item do pdf.js (`transform`, `width`, `height`) para o formato simples usado aqui. */
export function toTextItem(raw: { str?: unknown; transform?: unknown; width?: unknown; height?: unknown }): TextItem | null {
  if (typeof raw.str !== 'string' || !Array.isArray(raw.transform) || raw.transform.length < 6) return null;
  const t = raw.transform as number[];
  const w = Number(raw.width), h = Number(raw.height);
  if (![t[4], t[5], w, h].every((v) => Number.isFinite(v))) return null;
  return { str: raw.str, x: t[4]!, y: t[5]!, w, h: h || Math.abs(t[3]!) };
}

/** Retângulo (em pixels do canvas) de um trecho de item, usando a matriz `transform` do viewport do pdf.js. */
export function boxOf(item: TextItem, range: ItemRange, m: readonly number[]): { x: number; y: number; w: number; h: number } {
  const x0 = item.x + item.w * range.f0, x1 = item.x + item.w * range.f1;
  const pts = [[x0, item.y], [x1, item.y], [x0, item.y + item.h], [x1, item.y + item.h]].map(([x, y]) => [
    m[0]! * x! + m[2]! * y! + m[4]!, m[1]! * x! + m[3]! * y! + m[5]!
  ] as const);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}
