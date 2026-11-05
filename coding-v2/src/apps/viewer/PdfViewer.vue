<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import VIcon from './VIcon.vue';
import { viewDoc } from '../pdf/engine';
import { pdfPages as printPdfPages } from '../../shared/print/pages';
import { buildPageText, boxOf, findMatches, rangesFor, toTextItem, type Match, type PageText } from './pdf-search';
import { clamp } from './media';
import type { PrintPage } from '../../shared/print/print';
import type { ViewerFile } from './model';
import type { ViewerPrefs } from './prefs';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** PDF: uma página por vez, com miniaturas, zoom por largura/página/porcentagem, giro e pesquisa de texto com destaque. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();

interface Vp { width: number; height: number; transform: number[] }
interface Page {
  rotate: number;
  getViewport(o: { scale: number; rotation?: number }): Vp;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<{ items: unknown[] }>;
}
interface Doc { numPages: number; getPage(n: number): Promise<unknown> }

const PAD = 16;
const doc = shallowRef<Doc | null>(null);
const total = ref(0);
const pageNo = ref(1);
const turn = ref(0);
const zoomMode = ref<'width' | 'page' | 'custom'>('width');
const zoomCustom = ref(1);
const scaleNow = ref(1);
const loading = ref(true);
const failed = ref(false);
const rendered = ref(false);
const scroller = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const box = ref({ w: 0, h: 0 });
const marks = ref<{ x: number; y: number; w: number; h: number; now: boolean }[]>([]);
const cssSize = ref({ w: 0, h: 0 });

const getPage = async (n: number): Promise<Page> => (await doc.value!.getPage(n)) as Page;

async function open(): Promise<void> {
  try {
    const blob = props.blob;
    if (!blob) throw new Error('Não foi possível abrir este PDF.');
    const pdf = (await viewDoc(props.file.blobId, async () => new Uint8Array(await blob.arrayBuffer()))) as unknown as Doc;
    doc.value = pdf; total.value = pdf.numPages;
    const extra = pdf.numPages + (pdf.numPages === 1 ? ' página' : ' páginas');
    emit('meta', extra, [{ label: 'Páginas', value: String(pdf.numPages) }]);
    loading.value = false;
    await nextTick();
    measure();
    void render();
  } catch (e) {
    loading.value = false; failed.value = true;
    emit('error', e instanceof Error && e.message ? e.message : 'Não foi possível abrir este PDF.');
  }
}

// ---------------------------------------------------------------- desenho da página
let seq = 0;
let task: { cancel(): void } | null = null;
async function render(): Promise<void> {
  const c = canvas.value;
  if (!doc.value || !c || box.value.w < 1) return;
  const mine = ++seq;
  try {
    const page = await getPage(clamp(pageNo.value, 1, total.value));
    if (mine !== seq) return;
    const rotation = (page.rotate + turn.value) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const aw = Math.max(120, box.value.w - PAD * 2), ah = Math.max(120, box.value.h - PAD * 2);
    const scale = zoomMode.value === 'custom' ? zoomCustom.value : zoomMode.value === 'page' ? Math.min(aw / base.width, ah / base.height) : aw / base.width;
    scaleNow.value = scale;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = page.getViewport({ scale, rotation });
    const vp = page.getViewport({ scale: scale * dpr, rotation });
    const ctx = c.getContext('2d');
    if (!ctx) return;
    task?.cancel();
    c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    cssSize.value = { w: Math.floor(css.width), h: Math.floor(css.height) };
    const t = page.render({ canvasContext: ctx, viewport: vp });
    task = t;
    await t.promise;
    if (mine !== seq) return;
    c.dataset.rendered = String(pageNo.value);
    rendered.value = true;
    updateMarks(css);
    void nextTick(() => { void renderThumbsActive(); });
  } catch (e) {
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'RenderingCancelledException') return;
    if (mine === seq) emit('error', e instanceof Error && e.message ? e.message : 'Não foi possível desenhar a página.');
  }
}
let raf = 0;
function schedule(): void { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { void render(); }); }
function measure(): void { const s = scroller.value; if (s) box.value = { w: s.clientWidth, h: s.clientHeight }; }
let observer: ResizeObserver | undefined;
onMounted(() => {
  void open();
  measure();
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    observer = new ResizeObserver(() => { const w = box.value.w, h = box.value.h; measure(); if (w !== box.value.w || h !== box.value.h) schedule(); });
    observer.observe(scroller.value);
  }
});
onBeforeUnmount(() => { observer?.disconnect(); thumbObserver?.disconnect(); task?.cancel(); cancelAnimationFrame(raf); seq++; searchToken++; });
watch([pageNo, turn, zoomMode, zoomCustom], () => { rendered.value = false; schedule(); });

// ---------------------------------------------------------------- navegação e zoom
function goPage(n: number): void {
  const next = clamp(Math.floor(n) || 1, 1, Math.max(1, total.value));
  if (next !== pageNo.value && scroller.value) scroller.value.scrollTop = 0;
  pageNo.value = next;
}
const zoomText = computed(() => Math.round(scaleNow.value * 100) + '%');
const zoomSelect = computed(() => (zoomMode.value === 'custom' ? String(zoomCustom.value) : zoomMode.value));
function onZoomSelect(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  if (v === 'width' || v === 'page') zoomMode.value = v;
  else { zoomMode.value = 'custom'; zoomCustom.value = Number(v); }
}
function zoomBy(factor: number): void { zoomCustom.value = clamp(+(scaleNow.value * factor).toFixed(3), 0.25, 5); zoomMode.value = 'custom'; }
const rotate = (d: number): void => { turn.value = (((turn.value + d) % 360) + 360) % 360; };
function onWheel(e: WheelEvent): void { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0025)); } }
const zoomOptions = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

// ---------------------------------------------------------------- miniaturas
const thumbCanvases = new Map<number, HTMLCanvasElement>();
const thumbDone = new Set<number>();
let thumbObserver: IntersectionObserver | undefined;
function thumbRef(el: unknown, n: number): void {
  if (!(el instanceof HTMLCanvasElement)) { thumbCanvases.delete(n); return; }
  if (thumbCanvases.get(n) === el) return;
  thumbCanvases.set(n, el);
  el.dataset.n = String(n);
  if (typeof IntersectionObserver === 'undefined') { void drawThumb(n); return; }
  thumbObserver ??= new IntersectionObserver((entries) => {
    for (const it of entries) if (it.isIntersecting) { const k = Number((it.target as HTMLElement).dataset.n); thumbObserver?.unobserve(it.target); void drawThumb(k); }
  }, { root: null, rootMargin: '200px' });
  thumbObserver.observe(el);
}
async function drawThumb(n: number): Promise<void> {
  const c = thumbCanvases.get(n);
  if (!c || thumbDone.has(n) || !doc.value) return;
  thumbDone.add(n);
  try {
    const page = await getPage(n);
    const rotation = (page.rotate + turn.value) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const k = 96 / base.width;
    const vp = page.getViewport({ scale: k * Math.min(2, window.devicePixelRatio || 1), rotation });
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    c.style.aspectRatio = base.width + ' / ' + base.height;
    const g = c.getContext('2d');
    if (!g) return;
    await page.render({ canvasContext: g, viewport: vp }).promise;
  } catch { thumbDone.delete(n); }
}
async function renderThumbsActive(): Promise<void> {
  if (!props.prefs.pdfThumbs) return;
  document.querySelector('.pv-thumb.on')?.scrollIntoView?.({ block: 'nearest' });
}
watch(turn, () => { thumbDone.clear(); for (const n of thumbCanvases.keys()) void drawThumb(n); });
const pageList = computed(() => Array.from({ length: total.value }, (_, i) => i + 1));

// ---------------------------------------------------------------- pesquisa
const searchOpen = ref(false);
const query = ref('');
const searching = ref(false);
const searchNote = ref('');
const hits = ref<{ page: number; match: Match }[]>([]);
const hitAt = ref(-1);
const texts = new Map<number, PageText>();
let searchToken = 0;
const searchInput = ref<HTMLInputElement | null>(null);

async function textOf(n: number): Promise<PageText> {
  const known = texts.get(n);
  if (known) return known;
  const page = await getPage(n);
  const content = await page.getTextContent();
  const items = content.items.map((it) => toTextItem(it as Record<string, unknown>)).filter((x): x is NonNullable<typeof x> => !!x);
  const t = buildPageText(items);
  texts.set(n, t);
  return t;
}
async function runSearch(): Promise<void> {
  const token = ++searchToken;
  const q = query.value.trim();
  hits.value = []; hitAt.value = -1; searchNote.value = ''; marks.value = [];
  if (!q || !doc.value) { searching.value = false; return; }
  searching.value = true;
  const found: { page: number; match: Match }[] = [];
  let anyText = false;
  try {
    for (let n = 1; n <= total.value; n++) {
      const t = await textOf(n);
      if (token !== searchToken) return;
      if (t.text.trim()) anyText = true;
      for (const m of findMatches(t, q, 500)) found.push({ page: n, match: m });
      if (found.length >= 2000) break;
    }
  } catch { if (token === searchToken) { searching.value = false; searchNote.value = 'Não foi possível pesquisar neste PDF.'; } return; }
  if (token !== searchToken) return;
  searching.value = false;
  hits.value = found;
  if (!found.length) { searchNote.value = anyText ? 'Nada encontrado.' : 'Este PDF não tem texto pesquisável (pode ser digitalizado).'; return; }
  const from = found.findIndex((h) => h.page >= pageNo.value);
  gotoHit(from < 0 ? 0 : from);
}
function gotoHit(i: number): void {
  if (!hits.value.length) return;
  const at = ((i % hits.value.length) + hits.value.length) % hits.value.length;
  hitAt.value = at;
  const target = hits.value[at]!;
  if (target.page !== pageNo.value) goPage(target.page);
  else void refreshMarks();
}
async function refreshMarks(): Promise<void> {
  if (!doc.value) return;
  const page = await getPage(pageNo.value);
  updateMarks(page.getViewport({ scale: scaleNow.value, rotation: (page.rotate + turn.value) % 360 }));
}
function updateMarks(css: Vp): void {
  const out: { x: number; y: number; w: number; h: number; now: boolean }[] = [];
  const t = texts.get(pageNo.value);
  if (t && query.value.trim() && searchOpen.value) {
    const current = hits.value[hitAt.value];
    hits.value.forEach((h, i) => {
      if (h.page !== pageNo.value) return;
      for (const r of rangesFor(t, h.match)) {
        const item = t.items[r.item];
        if (item) out.push({ ...boxOf(item, r, css.transform), now: current === h || i === hitAt.value });
      }
    });
  }
  marks.value = out;
  if (out.some((m) => m.now)) void nextTick(() => document.querySelector('.pv-mark.now')?.scrollIntoView?.({ block: 'center', inline: 'nearest' }));
}
function openSearch(): void { searchOpen.value = true; void nextTick(() => { searchInput.value?.focus(); searchInput.value?.select(); }); }
function closeSearch(): void { searchOpen.value = false; searchToken++; searching.value = false; marks.value = []; }
watch(hitAt, () => { void refreshMarks(); });
let searchTimer = 0;
watch(query, () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void runSearch(); }, 250); });
const searchStatus = computed(() => (searching.value ? 'Procurando…' : hits.value.length ? (hitAt.value + 1) + ' de ' + hits.value.length : searchNote.value));

// ---------------------------------------------------------------- imprimir
const printReason = (): string => (failed.value ? 'Este PDF não abriu, então não há o que imprimir.' : doc.value ? '' : 'Espere o PDF terminar de abrir.');
async function printPages(): Promise<PrintPage[]> {
  if (!doc.value) throw new Error('Espere o PDF terminar de abrir.');
  if (total.value > 20) emit('notice', 'Preparando ' + Math.min(total.value, 150) + ' páginas para imprimir…');
  const r = await printPdfPages(doc.value as never);
  if (r.skipped) emit('notice', 'A impressão leva as primeiras ' + r.pages.length + ' páginas; o PDF tem ' + (r.pages.length + r.skipped) + '. Imprima o arquivo original para ter todas.');
  return r.pages;
}

// ---------------------------------------------------------------- menu e teclado
function menu(): MenuGroup[] {
  return [
    { title: 'Páginas', items: [
      { id: 'prev-page', label: 'Página anterior', icon: 'chevronUp', shortcut: 'PgUp', disabled: pageNo.value <= 1, run: () => goPage(pageNo.value - 1) },
      { id: 'next-page', label: 'Próxima página', icon: 'chevronDown', shortcut: 'PgDn', disabled: pageNo.value >= total.value, run: () => goPage(pageNo.value + 1) },
      { id: 'first-page', label: 'Primeira página', icon: 'prev', shortcut: 'Home', disabled: pageNo.value <= 1, run: () => goPage(1) },
      { id: 'last-page', label: 'Última página', icon: 'next', shortcut: 'End', disabled: pageNo.value >= total.value, run: () => goPage(total.value) },
      { id: 'thumbs', label: 'Miniaturas das páginas', icon: 'grid', checked: props.prefs.pdfThumbs, run: () => { props.prefs.pdfThumbs = !props.prefs.pdfThumbs; } }
    ] },
    { title: 'Zoom e giro', items: [
      { id: 'zoom-in', label: 'Aproximar', icon: 'zoomIn', shortcut: '+', run: () => zoomBy(1.25) },
      { id: 'zoom-out', label: 'Afastar', icon: 'zoomOut', shortcut: '−', run: () => zoomBy(0.8) },
      { id: 'fit-width', label: 'Ajustar à largura', icon: 'fit', shortcut: '0', checked: zoomMode.value === 'width', run: () => { zoomMode.value = 'width'; } },
      { id: 'fit-page', label: 'Página inteira', icon: 'actual', shortcut: '9', checked: zoomMode.value === 'page', run: () => { zoomMode.value = 'page'; } },
      { id: 'rotate', label: 'Girar à direita', icon: 'rotateRight', shortcut: 'R', run: () => rotate(90) }
    ] },
    { items: [{ id: 'search', label: 'Pesquisar no PDF…', icon: 'search', shortcut: 'Ctrl+F', run: openSearch }] }
  ];
}
function key(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) { openSearch(); return true; }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'Escape' && searchOpen.value) { closeSearch(); return true; }
  switch (e.key) {
    case 'PageDown': case 'ArrowRight': goPage(pageNo.value + 1); return true;
    case 'PageUp': case 'ArrowLeft': goPage(pageNo.value - 1); return true;
    case 'Home': goPage(1); return true;
    case 'End': goPage(total.value); return true;
    case '+': case '=': zoomBy(1.25); return true;
    case '-': case '_': zoomBy(0.8); return true;
    case '0': zoomMode.value = 'width'; return true;
    case '9': zoomMode.value = 'page'; return true;
    case 'r': rotate(90); return true;
    case 'R': rotate(-90); return true;
    case '/': openSearch(); return true;
    case 'F3': gotoHit(hitAt.value + (e.shiftKey ? -1 : 1)); return true;
    default: return false;
  }
}
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
</script>

<template>
  <div class="vw-body pv" data-testid="pdf-viewer">
    <div v-if="searchOpen" class="pv-search" role="search">
      <label class="sr-only" for="pv-q">Pesquisar no PDF</label>
      <input id="pv-q" ref="searchInput" v-model="query" type="search" class="pv-q" placeholder="Pesquisar no texto do PDF" data-testid="pdf-search"
        @keydown.enter.prevent="gotoHit(hitAt + ($event.shiftKey ? -1 : 1))" @keydown.esc.stop="closeSearch" />
      <span class="vw-time" role="status" data-testid="pdf-search-status">{{ searchStatus }}</span>
      <button type="button" class="vw-btn" aria-label="Resultado anterior" :disabled="!hits.length" data-testid="pdf-search-prev" @click="gotoHit(hitAt - 1)"><VIcon name="chevronUp" /></button>
      <button type="button" class="vw-btn" aria-label="Próximo resultado" :disabled="!hits.length" data-testid="pdf-search-next" @click="gotoHit(hitAt + 1)"><VIcon name="chevronDown" /></button>
      <button type="button" class="vw-btn" aria-label="Fechar a pesquisa" @click="closeSearch"><VIcon name="close" /></button>
    </div>
    <div class="pv-main">
      <nav v-if="prefs.pdfThumbs && total" class="pv-rail" aria-label="Miniaturas das páginas" data-testid="pdf-thumbs">
        <button v-for="n in pageList" :key="n" type="button" class="pv-thumb" :class="{ on: n === pageNo }" :aria-label="'Ir para a página ' + n" :aria-current="n === pageNo ? 'page' : undefined" @click="goPage(n)">
          <canvas :ref="(el) => thumbRef(el, n)" class="pv-tc" aria-hidden="true"></canvas>
          <span class="pv-n">{{ n }}</span>
        </button>
      </nav>
      <div ref="scroller" class="pv-scroll" tabindex="0" aria-label="Página do PDF" @wheel="onWheel">
        <p v-if="loading" class="vw-spin" role="status">Abrindo o PDF…</p>
        <div v-show="!loading && !failed" class="pv-sheet" :style="{ width: cssSize.w ? cssSize.w + 'px' : undefined, height: cssSize.h ? cssSize.h + 'px' : undefined }">
          <canvas ref="canvas" class="pv-canvas" role="img" :style="{ width: cssSize.w + 'px', height: cssSize.h + 'px' }" :aria-label="'Página ' + pageNo + ' de ' + total + ' de ' + file.name" data-testid="pdf-canvas"></canvas>
          <span v-for="(m, i) in marks" :key="i" class="pv-mark" :class="{ now: m.now }" :style="{ left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px' }" aria-hidden="true"></span>
        </div>
      </div>
    </div>
    <div class="vw-bar" role="toolbar" aria-label="Controles do PDF">
      <div class="vw-group">
        <button type="button" class="vw-btn vw-hide-sm" :aria-pressed="prefs.pdfThumbs" aria-label="Miniaturas" title="Miniaturas das páginas" data-testid="pdf-thumbs-toggle" @click="prefs.pdfThumbs = !prefs.pdfThumbs"><VIcon name="grid" /></button>
        <button type="button" class="vw-btn" aria-label="Página anterior" title="Página anterior (PgUp)" data-testid="pdf-prev" :disabled="pageNo <= 1" @click="goPage(pageNo - 1)"><VIcon name="chevronLeft" /></button>
        <label class="sr-only" for="pv-page">Número da página</label>
        <input id="pv-page" class="pv-page" type="number" inputmode="numeric" min="1" :max="total" :value="pageNo" data-testid="pdf-page" @change="goPage(Number(($event.target as HTMLInputElement).value))" />
        <span class="vw-time" data-testid="pdf-total">/ {{ total }}</span>
        <button type="button" class="vw-btn" aria-label="Próxima página" title="Próxima página (PgDn)" data-testid="pdf-next" :disabled="pageNo >= total" @click="goPage(pageNo + 1)"><VIcon name="chevronRight" /></button>
      </div>
      <span class="vw-sep vw-hide-sm" aria-hidden="true"></span>
      <div class="vw-group">
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Afastar" title="Afastar (−)" data-testid="pdf-zoom-out" @click="zoomBy(0.8)"><VIcon name="zoomOut" /></button>
        <label class="sr-only" for="pv-zoom">Zoom</label>
        <select id="pv-zoom" class="vw-sel" :value="zoomSelect" data-testid="pdf-zoom" @change="onZoomSelect">
          <option value="width">Largura</option><option value="page">Página inteira</option>
          <option v-for="z in zoomOptions" :key="z" :value="String(z)">{{ Math.round(z * 100) }}%</option>
          <option v-if="zoomMode === 'custom' && !zoomOptions.includes(zoomCustom)" :value="String(zoomCustom)">{{ Math.round(zoomCustom * 100) }}%</option>
        </select>
        <span class="sr-only" data-testid="pdf-zoom-text" aria-live="polite">{{ zoomText }}</span>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Aproximar" title="Aproximar (+)" data-testid="pdf-zoom-in" @click="zoomBy(1.25)"><VIcon name="zoomIn" /></button>
        <button type="button" class="vw-btn" aria-label="Girar à direita" title="Girar à direita (R)" data-testid="pdf-rotate" @click="rotate(90)"><VIcon name="rotateRight" /></button>
        <button type="button" class="vw-btn" :aria-pressed="searchOpen" aria-label="Pesquisar no PDF" title="Pesquisar (Ctrl+F)" data-testid="pdf-search-toggle" @click="searchOpen ? closeSearch() : openSearch()"><VIcon name="search" /></button>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv { background: #2b3140; }
.pv-main { flex: 1 1 0; min-height: 0; display: flex; }
.pv-scroll { flex: 1 1 0; min-width: 0; overflow: auto; display: flex; padding: 16px; background: #2b3140; outline: none; }
.pv-scroll:focus-visible { box-shadow: inset 0 0 0 2px var(--app); }
.pv-sheet { position: relative; margin: auto; flex: none; box-shadow: 0 8px 30px rgb(0 0 0 / 45%); background: #fff; }
.pv-canvas { display: block; background: #fff; max-width: none; }
.pv-mark { position: absolute; background: rgb(255 214 10 / 45%); mix-blend-mode: multiply; border-radius: 2px; pointer-events: none; }
.pv-mark.now { background: rgb(255 140 0 / 60%); outline: 2px solid #ff8c00; }
.pv-rail { flex: none; width: 128px; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; background: var(--st-bg2); border-right: 1px solid var(--st-line); }
.pv-thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px; border: 2px solid transparent; border-radius: 10px; background: transparent; color: var(--st-mut); font: inherit; font-size: 12px; cursor: pointer; min-height: 44px; }
.pv-thumb:hover { background: var(--st-hover); }
.pv-thumb:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.pv-thumb.on { border-color: var(--app); color: var(--st-fg); }
.pv-tc { width: 96px; max-width: 100%; aspect-ratio: 3 / 4; background: #fff; box-shadow: 0 2px 8px rgb(0 0 0 / 40%); }
.pv-n { font-variant-numeric: tabular-nums; }
.pv-search { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--st-bg2); border-bottom: 1px solid var(--st-line); flex-wrap: wrap; }
.pv-q { flex: 1 1 160px; min-width: 120px; min-height: 40px; padding: 0 10px; border: 1px solid var(--st-line); border-radius: 10px; background: var(--st-bg); color: var(--st-fg); font: inherit; }
.pv-q:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.pv-page { width: 58px; min-height: 40px; padding: 0 6px; text-align: center; border: 1px solid var(--st-line); border-radius: 10px; background: var(--st-bg2); color: var(--st-fg); font: inherit; font-weight: 700; }
.pv-page:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
@media (max-width: 599px) { .pv-rail { position: absolute; z-index: 3; left: 0; top: 0; bottom: 0; width: 112px; } .pv-scroll { padding: 8px; } }
</style>
