/**
 * Geometria da impressão (pura, sem DOM): tamanho de papel, orientação, margens e encaixe do conteúdo na página.
 * Tudo em milímetros. Veja IMPRESSAO.md.
 */
export type PaperName = 'A5' | 'A4' | 'A3' | 'Letter';
export interface PaperSize { w: number; h: number }
/** Tamanhos em retrato. */
export const PAPERS: Record<PaperName, PaperSize> = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 }
};
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type PageFit = 'contain' | 'flow';

export interface PrintPageSpec {
  /** `contain`: o conteúdo é reduzido para caber inteiro numa página, mantendo a proporção (imagens, cenas). `flow`: o conteúdo corre e o navegador pagina (texto). */
  fit?: PageFit;
  /** Proporção largura/altura do conteúdo. Obrigatória em `contain`; em `auto` decide a orientação. */
  aspect?: number;
  paper?: PaperName | PaperSize;
  orientation?: Orientation;
  marginMm?: number;
}

export interface PageBox {
  fit: PageFit;
  /** Papel já orientado. */
  paperW: number;
  paperH: number;
  margin: number;
  /** Área útil dentro das margens. */
  availW: number;
  availH: number;
  /** Tamanho do conteúdo encaixado (só em `contain`). */
  contentW: number;
  contentH: number;
  /** Nome da página do CSS (`@page nome`): páginas com mesmo papel e margem dividem o nome. */
  key: string;
}

export const DEFAULT_MARGIN_MM = 10;
/** Folga contra o arredondamento do navegador: uma página que passa 0,01 mm da área útil gera uma folha em branco. */
export const SAFETY_MM = 0.6;

const round = (n: number): number => Math.round(n * 100) / 100;

export function paperOf(p: PrintPageSpec['paper']): PaperSize {
  if (!p) return PAPERS.A4;
  if (typeof p === 'string') return PAPERS[p] ?? PAPERS.A4;
  return { w: Math.max(50, p.w), h: Math.max(50, p.h) };
}

export function layoutPage(spec: PrintPageSpec): PageBox {
  const fit: PageFit = spec.fit ?? 'contain';
  const base = paperOf(spec.paper);
  const orientation = spec.orientation ?? 'auto';
  const aspect = spec.aspect && spec.aspect > 0 && Number.isFinite(spec.aspect) ? spec.aspect : 1;
  const landscape = orientation === 'landscape' || (orientation === 'auto' && fit === 'contain' && aspect > 1);
  const paperW = landscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h);
  const paperH = landscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h);
  const margin = Math.min(Math.max(0, spec.marginMm ?? DEFAULT_MARGIN_MM), Math.min(paperW, paperH) / 4);
  const availW = round(paperW - 2 * margin);
  const availH = round(paperH - 2 * margin - SAFETY_MM);
  let contentW = availW, contentH = availH;
  if (fit === 'contain') {
    if (aspect >= availW / availH) { contentW = availW; contentH = round(availW / aspect); }
    else { contentH = availH; contentW = round(availH * aspect); }
  }
  return { fit, paperW: round(paperW), paperH: round(paperH), margin: round(margin), availW, availH, contentW, contentH, key: 'cp-' + round(paperW) + 'x' + round(paperH) + 'm' + round(margin) };
}

/** CSS de impressão para um trabalho: uma regra `@page` por combinação de papel e margem. A primeira vira o padrão (navegadores sem páginas nomeadas). */
export function printCss(boxes: readonly PageBox[]): string {
  const first = boxes[0];
  if (!first) return '';
  const seen = new Set<string>();
  const rules: string[] = ['@page { size: ' + first.paperW + 'mm ' + first.paperH + 'mm; margin: ' + first.margin + 'mm; }'];
  for (const b of boxes) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    rules.push('@page ' + b.key + ' { size: ' + b.paperW + 'mm ' + b.paperH + 'mm; margin: ' + b.margin + 'mm; }');
    rules.push('.cp-page[data-page-key="' + b.key + '"] { page: ' + b.key + '; }');
  }
  return rules.join('\n');
}
