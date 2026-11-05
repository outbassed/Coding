<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import VIcon from './VIcon.vue';
import { sanitizeSvg } from './svg';
import { canvasToPng, useObjectUrl } from './resources';
import { renderViewCanvas } from './print';
import { clamp } from './media';
import { canvasPage } from '../../shared/print/pages';
import type { PrintPage } from '../../shared/print/print';
import type { ViewerFile } from './model';
import type { Backdrop, ViewerPrefs } from './prefs';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Imagens e SVG: zoom com roda/pinça, arrastar para mover, giro, espelho, fundo e cópia. A figura é sempre o arquivo; a interface nunca entra nela. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();

const PAD = 20, ZOOM_MIN = 0.05, ZOOM_MAX = 16;
const { set: setObjectUrl } = useObjectUrl();
const src = ref('');
const loaded = ref(false);
const failed = ref(false);
const natural = ref({ w: 0, h: 0 });
const zoom = ref(0);              // 0 = ajustado à tela
const turn = ref(0);
const flipX = ref(false);
const flipY = ref(false);
const box = ref({ w: 0, h: 0 });
const scroller = ref<HTMLElement | null>(null);
const isSvg = computed(() => props.file.kind === 'svg');

async function load(): Promise<void> {
  try {
    if (props.file.sourceUrl) src.value = props.file.sourceUrl;
    else if (props.blob) {
      if (isSvg.value) src.value = setObjectUrl(new Blob([sanitizeSvg(await props.blob.text())], { type: 'image/svg+xml' }));
      else src.value = setObjectUrl(props.blob);
    }
  } catch (e) {
    failed.value = true;
    emit('error', e instanceof Error && e.message ? e.message : 'Não foi possível abrir esta imagem.');
  }
}

// ---------------------------------------------------------------- geometria
const quarter = computed(() => ((Math.round(turn.value / 90) % 4) + 4) % 4);
const swapped = computed(() => quarter.value % 2 === 1);
const rotW = computed(() => (swapped.value ? natural.value.h : natural.value.w));
const rotH = computed(() => (swapped.value ? natural.value.w : natural.value.h));
const fitScale = computed(() => {
  if (!natural.value.w || !natural.value.h || box.value.w < 1 || box.value.h < 1) return 1;
  const k = Math.min((box.value.w - PAD * 2) / rotW.value, (box.value.h - PAD * 2) / rotH.value);
  return Math.max(0.01, isSvg.value ? k : Math.min(1, k));
});
const scale = computed(() => (zoom.value > 0 ? zoom.value : fitScale.value));
const frame = computed(() => ({ w: Math.max(1, Math.round(rotW.value * scale.value)), h: Math.max(1, Math.round(rotH.value * scale.value)) }));
const imgStyle = computed(() => {
  const dw = natural.value.w * scale.value, dh = natural.value.h * scale.value;
  return {
    width: Math.round(dw) + 'px', height: Math.round(dh) + 'px',
    left: Math.round((frame.value.w - dw) / 2) + 'px', top: Math.round((frame.value.h - dh) / 2) + 'px',
    transform: 'scale(' + (flipX.value ? -1 : 1) + ', ' + (flipY.value ? -1 : 1) + ') rotate(' + turn.value + 'deg)'
  };
});
const zoomText = computed(() => (zoom.value ? Math.round(zoom.value * 100) + '%' : 'Ajustado · ' + Math.round(scale.value * 100) + '%'));
const canPan = computed(() => frame.value.w + PAD * 2 > box.value.w + 1 || frame.value.h + PAD * 2 > box.value.h + 1);

function setZoom(next: number, ax?: number, ay?: number): void {
  const sc = scroller.value;
  const old = scale.value;
  const z = clamp(next, ZOOM_MIN, ZOOM_MAX);
  if (!sc || !old) { zoom.value = z; return; }
  const x = ax ?? sc.clientWidth / 2, y = ay ?? sc.clientHeight / 2;
  const fx = sc.scrollLeft + x, fy = sc.scrollTop + y;
  zoom.value = z;
  const ratio = z / old;
  void nextTick(() => { sc.scrollLeft = fx * ratio - x; sc.scrollTop = fy * ratio - y; });
}
const zoomBy = (factor: number): void => setZoom(scale.value * factor);
function fit(): void { zoom.value = 0; void nextTick(() => { if (scroller.value) { scroller.value.scrollLeft = 0; scroller.value.scrollTop = 0; } }); }
const rotate = (delta: number): void => { turn.value = (turn.value + delta) % 360; };
const toggleFit = (): void => { if (zoom.value === 1) fit(); else setZoom(1); };
const cycleBackdrop = (): void => { const order: Backdrop[] = ['xadrez', 'claro', 'escuro']; props.prefs.backdrop = order[(order.indexOf(props.prefs.backdrop) + 1) % order.length]!; };

// ---------------------------------------------------------------- eventos da figura
function onLoad(event: Event): void {
  const img = event.target as HTMLImageElement;
  natural.value = { w: img.naturalWidth || 300, h: img.naturalHeight || 150 };
  loaded.value = true;
  const size = img.naturalWidth && img.naturalHeight ? img.naturalWidth + ' × ' + img.naturalHeight + ' px' : 'tamanho livre (vetor)';
  emit('meta', size, [{ label: 'Dimensões', value: size }]);
}
function onError(): void {
  failed.value = true;
  emit('error', props.file.sourceUrl
    ? 'Não foi possível carregar esta imagem pelo link. Confira o endereço e as permissões do servidor.'
    : 'O navegador não conseguiu abrir esta imagem.');
}

// ---------------------------------------------------------------- mouse, toque e roda
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { d: number; z: number } | null = null;
let pan: { x: number; y: number; left: number; top: number } | null = null;
const panning = ref(false);
function onPointerDown(e: PointerEvent): void {
  const sc = scroller.value;
  if (!sc || (e.pointerType === 'mouse' && e.button !== 0)) return;
  sc.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: scale.value };
    pan = null; panning.value = false;
  } else if (pointers.size === 1) pan = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
}
function onPointerMove(e: PointerEvent): void {
  const sc = scroller.value;
  if (!sc || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (pinch.d > 0) setZoom(pinch.z * (d / pinch.d));
    return;
  }
  if (!pan) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!panning.value && Math.hypot(dx, dy) > 4) panning.value = true;
  if (panning.value) { sc.scrollLeft = pan.left - dx; sc.scrollTop = pan.top - dy; }
}
function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  const sc = scroller.value;
  if (!pointers.size) { pan = null; panning.value = false; }
  else if (pointers.size === 1 && sc) { const p = [...pointers.values()][0]!; pan = { x: p.x, y: p.y, left: sc.scrollLeft, top: sc.scrollTop }; }
}
function onWheel(e: WheelEvent): void {
  if (!(e.ctrlKey || e.metaKey) || !scroller.value) return;
  e.preventDefault();
  const rect = scroller.value.getBoundingClientRect();
  setZoom(scale.value * Math.exp(-e.deltaY * 0.0025), e.clientX - rect.left, e.clientY - rect.top);
}

let observer: ResizeObserver | undefined;
function measure(): void { const sc = scroller.value; if (sc) box.value = { w: sc.clientWidth, h: sc.clientHeight }; }
onMounted(() => {
  void load();
  measure();
  if (typeof ResizeObserver !== 'undefined' && scroller.value) { observer = new ResizeObserver(measure); observer.observe(scroller.value); }
});
onBeforeUnmount(() => observer?.disconnect());

// ---------------------------------------------------------------- copiar e imprimir
const corsMessage = 'O servidor desta imagem não permite copiá-la ou imprimi-la (bloqueio de origem). Baixe o arquivo e abra-o pelo aparelho.';
async function copyImage(): Promise<void> {
  if (!loaded.value) return;
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') { emit('notice', 'Este navegador não permite copiar imagens.'); return; }
  try {
    const canvas = await renderViewCanvas(src.value, { turn: turn.value, flipX: flipX.value, flipY: flipY.value, vector: isSvg.value, maxSide: 4096, cors: !!props.file.sourceUrl });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await canvasToPng(canvas) })]);
    emit('notice', 'Imagem copiada.');
  } catch (e) {
    emit('notice', props.file.sourceUrl ? corsMessage : (e instanceof Error && e.message ? e.message : 'Não foi possível copiar a imagem.'));
  }
}
function printReason(): string {
  if (failed.value) return 'Esta imagem não abriu, então não há o que imprimir.';
  return loaded.value ? '' : 'Espere a imagem terminar de abrir.';
}
async function printPages(): Promise<PrintPage[]> {
  try {
    const canvas = await renderViewCanvas(src.value, { turn: turn.value, flipX: flipX.value, flipY: flipY.value, vector: isSvg.value, background: '#ffffff', cors: !!props.file.sourceUrl });
    return [canvasPage(canvas)];
  } catch {
    throw new Error(props.file.sourceUrl ? corsMessage : 'Não foi possível preparar a imagem para imprimir.');
  }
}

// ---------------------------------------------------------------- menu e atalhos
function menu(): MenuGroup[] {
  const backdrops: [Backdrop, string][] = [['xadrez', 'Fundo xadrez (transparência)'], ['claro', 'Fundo claro'], ['escuro', 'Fundo escuro']];
  return [
    { title: 'Zoom', items: [
      { id: 'zoom-in', label: 'Aproximar', icon: 'zoomIn', shortcut: '+', run: () => zoomBy(1.25) },
      { id: 'zoom-out', label: 'Afastar', icon: 'zoomOut', shortcut: '−', run: () => zoomBy(0.8) },
      { id: 'fit', label: 'Ajustar à tela', icon: 'fit', shortcut: '0', checked: zoom.value === 0, run: fit },
      { id: 'actual', label: 'Tamanho real (100%)', icon: 'actual', shortcut: '1', checked: zoom.value === 1, run: () => setZoom(1) }
    ] },
    { title: 'Girar e espelhar', items: [
      { id: 'rotate-left', label: 'Girar à esquerda', icon: 'rotateLeft', shortcut: 'Shift+R', run: () => rotate(-90) },
      { id: 'rotate-right', label: 'Girar à direita', icon: 'rotateRight', shortcut: 'R', run: () => rotate(90) },
      { id: 'flip-h', label: 'Espelhar na horizontal', icon: 'flipH', shortcut: 'H', checked: flipX.value, run: () => { flipX.value = !flipX.value; } },
      { id: 'flip-v', label: 'Espelhar na vertical', icon: 'flipV', shortcut: 'V', checked: flipY.value, run: () => { flipY.value = !flipY.value; } }
    ] },
    { title: 'Fundo', items: backdrops.map(([id, label]) => ({ id: 'bd-' + id, label, icon: 'checker' as const, checked: props.prefs.backdrop === id, run: () => { props.prefs.backdrop = id; } })) },
    { items: [{ id: 'copy-image', label: 'Copiar imagem', icon: 'copy', run: () => { void copyImage(); } }] }
  ];
}
function key(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  switch (e.key) {
    case '+': case '=': zoomBy(1.25); return true;
    case '-': case '_': zoomBy(0.8); return true;
    case '0': fit(); return true;
    case '1': setZoom(1); return true;
    case 'r': rotate(90); return true;
    case 'R': rotate(-90); return true;
    case 'h': case 'H': flipX.value = !flipX.value; return true;
    case 'v': case 'V': flipY.value = !flipY.value; return true;
    case 'b': case 'B': cycleBackdrop(); return true;
    default: return false;
  }
}
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
</script>

<template>
  <div class="vw-body iv" data-testid="image-viewer">
    <div ref="scroller" class="iv-scroll" :class="{ pannable: canPan, panning }" data-testid="image-stage"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @wheel="onWheel" @dblclick="toggleFit">
      <div class="iv-pad">
        <div v-show="loaded" class="iv-frame" :class="'bd-' + prefs.backdrop" :style="{ width: frame.w + 'px', height: frame.h + 'px' }">
          <img v-if="src" :src="src" :alt="'Visualização de ' + file.name" class="iv-img" :style="imgStyle" draggable="false" data-testid="viewer-image" @load="onLoad" @error="onError" />
        </div>
      </div>
      <p v-if="!loaded && !failed" class="vw-spin" role="status">Abrindo…</p>
    </div>
    <div class="vw-bar" role="toolbar" aria-label="Controles da imagem">
      <div class="vw-group">
        <button type="button" class="vw-btn" aria-label="Afastar" title="Afastar (−)" data-testid="zoom-out" @click="zoomBy(0.8)"><VIcon name="zoomOut" /></button>
        <span class="vw-readout" data-testid="zoom-text" aria-live="polite">{{ zoomText }}</span>
        <button type="button" class="vw-btn" aria-label="Aproximar" title="Aproximar (+)" data-testid="zoom-in" @click="zoomBy(1.25)"><VIcon name="zoomIn" /></button>
        <button type="button" class="vw-btn" aria-label="Ajustar à tela" title="Ajustar à tela (0)" data-testid="zoom-fit" :aria-pressed="zoom === 0" @click="fit"><VIcon name="fit" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Tamanho real, 100%" title="Tamanho real (1)" data-testid="zoom-100" :aria-pressed="zoom === 1" @click="setZoom(1)"><VIcon name="actual" /></button>
      </div>
      <span class="vw-sep vw-hide-sm" aria-hidden="true"></span>
      <div class="vw-group">
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Girar à esquerda" title="Girar à esquerda (Shift+R)" data-testid="turn-left" @click="rotate(-90)"><VIcon name="rotateLeft" /></button>
        <button type="button" class="vw-btn" aria-label="Girar à direita" title="Girar à direita (R)" data-testid="turn-right" @click="rotate(90)"><VIcon name="rotateRight" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Espelhar na horizontal" title="Espelhar na horizontal (H)" data-testid="flip-h" :aria-pressed="flipX" @click="flipX = !flipX"><VIcon name="flipH" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Espelhar na vertical" title="Espelhar na vertical (V)" data-testid="flip-v" :aria-pressed="flipY" @click="flipY = !flipY"><VIcon name="flipV" /></button>
      </div>
      <span class="vw-sep vw-hide-sm" aria-hidden="true"></span>
      <div class="vw-group vw-hide-sm">
        <label class="sr-only" for="iv-backdrop">Fundo da imagem</label>
        <select id="iv-backdrop" v-model="prefs.backdrop" class="vw-sel" data-testid="backdrop">
          <option value="xadrez">Fundo xadrez</option><option value="claro">Fundo claro</option><option value="escuro">Fundo escuro</option>
        </select>
        <button type="button" class="vw-btn" aria-label="Copiar imagem" title="Copiar imagem" data-testid="copy-image" @click="copyImage"><VIcon name="copy" /></button>
      </div>
      <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
    </div>
  </div>
</template>

<style scoped>
.iv-scroll { position: relative; flex: 1 1 0; min-height: 0; display: flex; overflow: auto; touch-action: none; background:
  radial-gradient(120% 90% at 50% 0%, #1a2230 0%, var(--st-bg) 70%); }
.iv-scroll.pannable { cursor: grab; }
.iv-scroll.panning { cursor: grabbing; }
.iv-pad { margin: auto; padding: 20px; flex: none; }
.iv-frame { position: relative; box-shadow: 0 10px 40px rgb(0 0 0 / 45%); }
.iv-img { position: absolute; max-width: none; user-select: none; -webkit-user-drag: none; image-rendering: auto; }
.bd-xadrez { background: repeating-conic-gradient(#d9dde5 0% 25%, #ffffff 0% 50%) 0 0 / 20px 20px; }
.bd-claro { background: #ffffff; }
.bd-escuro { background: #10141b; outline: 1px solid var(--st-line); }
</style>
