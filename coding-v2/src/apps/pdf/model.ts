export type Rotation = 0 | 90 | 180 | 270;
export interface PdfSource { id: string; name: string; pages: number }
export interface PdfPage { id: string; src: string; index: number; rotate: Rotation }
export type AnnotationKind = 'text' | 'rect' | 'highlight';
/** Posição em frações (0..1) da página como ela aparece (já girada), origem no canto superior esquerdo. */
export interface Annotation { id: string; page: string; kind: AnnotationKind; x: number; y: number; w: number; h: number; text: string; size: number; color: string }
export interface PdfState { name: string; sources: PdfSource[]; pages: PdfPage[]; annotations: Annotation[] }
export const MAX_SOURCES = 20, MAX_PAGES = 500, MAX_ANNOTATIONS = 1000, MAX_PDF_BYTES = 60 * 1024 * 1024;
export const pid = (): string => 'p' + Math.random().toString(36).slice(2, 9);
const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const ROT: Rotation[] = [0, 90, 180, 270];
export function normalizePdf(raw: unknown): PdfState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<PdfState>;
  const sources: PdfSource[] = [];
  for (const src of Array.isArray(s.sources) ? s.sources.slice(0, MAX_SOURCES) : []) {
    if (!src || typeof src.id !== 'string' || !src.id) continue;
    sources.push({ id: src.id.slice(0, 80), name: typeof src.name === 'string' ? src.name.slice(0, 160) : 'documento.pdf', pages: Math.round(num(src.pages, 1, 5000, 1)) });
  }
  const known = new Map(sources.map((x) => [x.id, x]));
  const pages: PdfPage[] = [];
  const pageIds = new Set<string>();
  for (const p of Array.isArray(s.pages) ? s.pages.slice(0, MAX_PAGES) : []) {
    const src = p && typeof p.src === 'string' ? known.get(p.src) : undefined;
    if (!src) continue;
    const index = Math.round(num(p.index, 0, src.pages - 1, 0));
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : pid();
    if (pageIds.has(id)) id = pid();
    pageIds.add(id);
    pages.push({ id, src: src.id, index, rotate: ROT.includes(p.rotate as Rotation) ? (p.rotate as Rotation) : 0 });
  }
  const annotations: Annotation[] = [];
  for (const a of Array.isArray(s.annotations) ? s.annotations.slice(0, MAX_ANNOTATIONS) : []) {
    if (!a || typeof a.page !== 'string' || !pageIds.has(a.page)) continue;
    const kind: AnnotationKind = a.kind === 'rect' || a.kind === 'highlight' ? a.kind : 'text';
    const x = num(a.x, 0, 1, 0.1), y = num(a.y, 0, 1, 0.1);
    annotations.push({ id: typeof a.id === 'string' && a.id ? a.id.slice(0, 40) : pid(), page: a.page, kind, x, y, w: num(a.w, 0.01, 1, 0.3), h: num(a.h, 0.01, 1, 0.05), text: typeof a.text === 'string' ? a.text.slice(0, 2000) : '', size: num(a.size, 6, 96, 14), color: typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#c0392b' });
  }
  return { name: typeof s.name === 'string' ? s.name.slice(0, 250) : 'Documento PDF', sources: sources.filter((x) => pages.some((p) => p.src === x.id)), pages, annotations };
}
/** Converte um ponto da página exibida (pontos, origem no topo à esquerda) para o espaço original do PDF (origem embaixo à esquerda). */
export function toPdfSpace(dx: number, dy: number, W: number, H: number, rotation: number): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { x: dy, y: dx };
    case 180: return { x: W - dx, y: dy };
    case 270: return { x: W - dy, y: H - dx };
    default: return { x: dx, y: H - dy };
  }
}
/** Texto que a fonte padrão (WinAnsi) consegue gravar: troca aspas tipográficas e remove o resto. */
export function winAnsi(text: string): string {
  const map: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '*', ' ': ' ' };
  return [...text].map((ch) => map[ch] ?? (ch === '\n' || (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255 && !(ch.charCodeAt(0) >= 127 && ch.charCodeAt(0) < 160)) || ch === '€' ? ch : '?')).join('');
}
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function parseRanges(spec: string, total: number): number[] | string {
  const out: number[] = [];
  for (const part of spec.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return 'Use números e intervalos, como “1-3, 5, 8-10”.';
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > total) return 'O intervalo “' + part + '” não existe (o documento tem ' + total + ' páginas).';
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out.length ? out : 'Digite ao menos uma página.';
}
