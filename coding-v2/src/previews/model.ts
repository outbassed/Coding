import { activeItems, normalize, type LabelsState } from '../labels/model';
import { sanitizeTextHtml } from '../text/model';
import { display, Evaluator, key, normalizeCalc } from '../apps/calc/model';
import { normalizeCodes } from '../apps/codes/model';
import { renderCode } from '../apps/codes/render';
import { normalizeSplit, summarize, settle } from '../apps/split/model';
import { formatMoney } from '../apps/split/money';
import { cleanNames, normalizeDraw } from '../apps/draw/model';
import { normalizeImages } from '../apps/images/model';
import { normalizePdf } from '../apps/pdf/model';
import { normalizeSheetLabels } from '../apps/sheet-labels/model';
import { normalizeCalc as normalizeCalculator, preview as calculatorLive } from '../apps/calculator/model';
import { formatNumber } from '../apps/calculator/format';

/** Limites do que entra no cache: só o que cabe na primeira folha/tela precisa ser guardado. */
export const MAX_PREVIEW_BLOCKS = 60;
export const MAX_PREVIEW_ITEMS = 40;
export const MAX_TEXT_CHARS = 1800;
export const MAX_TEXT_BLOCKS = 40;
export const MAX_IMAGE_CHARS = 160_000;
export const MAX_IMAGE_BUDGET = 320_000;

export type Preview =
  | { kind: 'labels'; state: LabelsState; blocks: number }
  | { kind: 'text'; html: string }
  | { kind: 'table'; rows: string[][]; bold: boolean[][] }
  | { kind: 'codes'; svgs: string[] }
  | { kind: 'summary'; title: string; lines: [string, string][] };

/** Primeira folha das etiquetas: itens com conteúdo, cópias repetidas e limite para o cache. */
export function labelsPreview(raw: unknown): Preview {
  const state = normalize(raw);
  const items: LabelsState['items'] = [];
  let blocks = 0;
  for (const item of activeItems(state)) {
    if (items.length >= MAX_PREVIEW_ITEMS || blocks >= MAX_PREVIEW_BLOCKS) break;
    const copies = Math.min(item.copies, MAX_PREVIEW_BLOCKS - blocks);
    items.push({ ...item, copies });
    blocks += copies;
  }
  return { kind: 'labels', state: { ...state, items }, blocks };
}

/** Início do documento de Texto: HTML já saneado, sem corpo inteiro nem imagens enormes. */
export function textPreview(raw: unknown): Preview {
  if (!raw || typeof raw !== 'object' || typeof (raw as { html?: unknown }).html !== 'string') throw new Error('Texto inválido');
  const clean = sanitizeTextHtml((raw as { html: string }).html);
  const parsed = new DOMParser().parseFromString(clean, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  let chars = 0, budget = MAX_IMAGE_BUDGET, count = 0;
  for (const child of Array.from(parsed.body.childNodes)) {
    if (count >= MAX_TEXT_BLOCKS || chars >= MAX_TEXT_CHARS) break;
    // O editor também salva texto puro, sem <p>. Não deixar essas cópias com miniatura vazia.
    const copy = child.nodeType === Node.TEXT_NODE
      ? out.createElement('p')
      : out.importNode(child, true);
    if (child.nodeType === Node.TEXT_NODE) copy.textContent = child.textContent;
    if (copy instanceof Element) {
      const images = copy.tagName === 'IMG' ? [copy] : Array.from(copy.querySelectorAll('img'));
      for (const node of images) {
        const img = node as HTMLImageElement;
        const size = (img.getAttribute('src') ?? '').length;
        if (size > MAX_IMAGE_CHARS || size > budget) img.remove(); else budget -= size;
      }
    }
    // Um único parágrafo também pode ser gigantesco: respeitar o orçamento de caracteres.
    let left = MAX_TEXT_CHARS - chars;
    const walker = out.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);
    for (const node of textNodes) {
      if (left <= 0) node.remove();
      else if (node.data.length > left) { node.data = node.data.slice(0, left); left = 0; }
      else left -= node.data.length;
    }
    const length = MAX_TEXT_CHARS - chars - left;
    if (copy.textContent?.trim() || (copy instanceof Element && (copy.tagName === 'IMG' || copy.querySelector('img')))) {
      out.body.appendChild(copy);
      chars += length;
      count++;
    }
  }
  // Passa de novo pelo saneador: v-html só recebe HTML confiável.
  return { kind: 'text', html: sanitizeTextHtml(out.body.innerHTML) };
}

const PREVIEW_TYPES = ['labels', 'texts', 'calc', 'sheet', 'codes', 'split', 'draw', 'images', 'pdf', 'calculator'] as const;
export type PreviewType = typeof PREVIEW_TYPES[number];
export function previewable(type: unknown): type is PreviewType { return typeof type === 'string' && (PREVIEW_TYPES as readonly string[]).includes(type); }
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {});
/** Formatos antigos do Coding 1.0 com o mesmo tipo não são reinterpretados: sem a estrutura da v2, fica o ícone. */
function need(raw: unknown, field: string): void { if (!Array.isArray(obj(raw)[field])) throw new Error('Formato sem prévia'); }

export function calcPreview(raw: unknown): Preview {
  need(raw, 'sheets');
  const state = normalizeCalc(raw);
  const ev = new Evaluator(state);
  const si = Math.min(state.active, state.sheets.length - 1);
  const sheet = state.sheets[si]!;
  const rows: string[][] = [], bold: boolean[][] = [];
  for (let r = 0; r < Math.min(16, sheet.rows); r++) {
    const row: string[] = [], b: boolean[] = [];
    for (let c = 0; c < Math.min(6, sheet.cols); c++) { const cell = sheet.cells[key(r, c)]; row.push(display(ev.value(si, r, c), cell?.f).slice(0, 24)); b.push(!!cell?.b); }
    rows.push(row); bold.push(b);
  }
  while (rows.length > 1 && rows[rows.length - 1]!.every((v) => !v)) { rows.pop(); bold.pop(); }
  return { kind: 'table', rows, bold };
}
export function sheetPreview(raw: unknown): Preview {
  need(raw, 'rows');
  const s = normalizeSheetLabels(raw);
  const rows = s.rows.slice(0, 16).map((r) => r.slice(0, 5).map((v) => v.slice(0, 24)));
  return { kind: 'table', rows, bold: rows.map((r, i) => r.map(() => s.hasHeader && i === 0)) };
}
export function codesPreview(raw: unknown): Preview {
  need(raw, 'items');
  const s = normalizeCodes(raw);
  const svgs: string[] = [];
  for (const item of s.items) {
    if (svgs.length >= 4) break;
    try { svgs.push(renderCode(item.kind, item.value, { ...s.style, module: 2 }, item.caption).svg); } catch { /* código inválido não entra na miniatura */ }
  }
  if (!svgs.length) throw new Error('Sem código válido');
  return { kind: 'codes', svgs };
}
export function splitPreview(raw: unknown): Preview {
  need(raw, 'people');
  const s = normalizeSplit(raw);
  const sum = summarize(s);
  const name = (id: string) => s.people.find((p) => p.id === id)?.name || 'Sem nome';
  const lines: [string, string][] = [['Total', formatMoney(sum.total)], ['Pessoas', String(s.people.length)], ['Despesas', String(s.expenses.length)]];
  for (const t of settle(sum.balance, s.people.map((p) => p.id)).slice(0, 5)) lines.push([name(t.from) + ' → ' + name(t.to), formatMoney(t.amount)]);
  return { kind: 'summary', title: s.name || 'Racha-conta', lines };
}
export function drawPreview(raw: unknown): Preview {
  need(raw, 'participants');
  const s = normalizeDraw(raw);
  const names = cleanNames(s.participants);
  const lines: [string, string][] = names.slice(0, 10).map((n, i) => [String(i + 1), n]);
  const last = s.history[s.history.length - 1];
  if (last) lines.unshift(['Último resultado', last.text.slice(0, 40)]);
  return { kind: 'summary', title: s.name || 'Sorteio', lines: lines.length ? lines : [['Participantes', '0']] };
}
export function imagesPreview(raw: unknown): Preview {
  need(raw, 'layers');
  const s = normalizeImages(raw);
  const lines: [string, string][] = [['Tamanho', s.width + ' × ' + s.height + ' px'], ['Camadas', String(s.layers.length)]];
  for (const l of [...s.layers].reverse().slice(0, 8)) lines.push([{ image: 'Imagem', text: 'Texto', rect: 'Retângulo', ellipse: 'Elipse' }[l.kind], (l.kind === 'text' ? (l.text ?? '').split('\n')[0] : l.name).slice(0, 30)]);
  return { kind: 'summary', title: s.name || 'Imagem', lines };
}
export function calculatorPreview(raw: unknown): Preview {
  need(raw, 'history');
  const s = normalizeCalculator(raw);
  const lines: [string, string][] = [['Modo', s.mode === 'pro' ? 'Pro' : 'Básico']];
  const live = calculatorLive(s);
  if (s.expr.trim()) lines.push([s.expr.slice(0, 30), live && live.ok ? formatNumber(live.value, s.decimals) : '…']);
  for (const h of s.history.slice(-6).reverse()) lines.push([h.expr.slice(0, 30), h.text.slice(0, 24)]);
  if (s.vars.length) lines.push(['Variáveis', String(s.vars.length)]);
  return { kind: 'summary', title: s.name || 'Calculadora', lines };
}
export function pdfPreview(raw: unknown): Preview {
  need(raw, 'pages');
  const s = normalizePdf(raw);
  const lines: [string, string][] = [['Páginas', String(s.pages.length)], ['Anotações', String(s.annotations.length)]];
  for (const src of s.sources.slice(0, 6)) lines.push(['Arquivo', src.name.slice(0, 34)]);
  return { kind: 'summary', title: s.name || 'Documento PDF', lines };
}

export function buildPreview(type: string | undefined, state: unknown): Preview {
  switch (type) {
    case 'labels': return labelsPreview(state);
    case 'texts': return textPreview(state);
    case 'calc': return calcPreview(state);
    case 'sheet': return sheetPreview(state);
    case 'codes': return codesPreview(state);
    case 'split': return splitPreview(state);
    case 'draw': return drawPreview(state);
    case 'images': return imagesPreview(state);
    case 'pdf': return pdfPreview(state);
    case 'calculator': return calculatorPreview(state);
    default: throw new Error('Tipo sem prévia');
  }
}
