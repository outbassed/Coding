<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { VersosView } from './controller';
import { canvasSize, hitTest, renderScene, type BlockBox } from './render';

/**
 * Prévia da cena atual: o MESMO renderizador da exportação, só em escala menor. A grade de transparência é CSS atrás do
 * canvas (nunca entra na imagem exportada). Seleção e arraste são opcionais: tudo também se edita nos campos numéricos.
 */
const props = defineProps<{ v: VersosView }>();
const emit = defineEmits<{ edit: [] }>();

const stageEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const box = ref({ w: 800, h: 500 });
const zoom = ref(0); // 0 = ajustar à área
const boxes = shallowRef<BlockBox[]>([]);
const missing = ref<string[]>([]);

const fit = computed(() => Math.max(0.02, Math.min(4, Math.min((box.value.w - 24) / props.v.scene.width, (box.value.h - 24) / props.v.scene.height))));
const scale = computed(() => (zoom.value > 0 ? zoom.value : fit.value));
const zoomText = computed(() => Math.round(scale.value * 100) + '%');
function setZoom(value: number): void { zoom.value = Math.max(0.02, Math.min(4, value)); }

let ro: ResizeObserver | undefined;
function measure(): void { const el = stageEl.value; if (el) box.value = { w: el.clientWidth, h: el.clientHeight }; }
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && stageEl.value) { ro = new ResizeObserver(measure); ro.observe(stageEl.value); }
  draw();
});

let frame = 0;
function draw(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const c = canvasEl.value;
    if (!c) return;
    const s = props.v.scene;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let k = scale.value * dpr;
    k *= Math.min(1, 4096 / Math.max(s.width * k, s.height * k)); // teto de 4096 px: prévia leve mesmo em cenas enormes
    const size = canvasSize(s, k);
    if (c.width !== size.width) c.width = size.width;
    if (c.height !== size.height) c.height = size.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const result = renderScene(ctx, s, props.v.deps, { scale: k });
    boxes.value = result.boxes;
    missing.value = result.missingImages;
  });
}
watch([() => props.v.scene, scale, () => props.v.imageTick, () => props.v.fontTick], draw, { deep: true });
onBeforeUnmount(() => { cancelAnimationFrame(frame); ro?.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); });

// ---------- seleção e arraste ----------
type Mode = 'move' | 'width-left' | 'width-right' | 'rotate';
interface Drag { mode: Mode; id: string; sx: number; sy: number; x: number; y: number; width: number; rotation: number }
let drag: Drag | null = null;

function toScene(event: PointerEvent): { x: number; y: number } {
  const r = canvasEl.value!.getBoundingClientRect();
  return { x: ((event.clientX - r.left) / r.width) * props.v.scene.width, y: ((event.clientY - r.top) / r.height) * props.v.scene.height };
}
function onCanvasDown(event: PointerEvent): void {
  if (!canvasEl.value) return;
  props.v.area = 'stage';
  stageEl.value?.focus({ preventScroll: true });
  const p = toScene(event);
  const id = hitTest(boxes.value, p.x, p.y, 6 / scale.value);
  props.v.selectText(id);
  const t = props.v.selectedText;
  if (!id || !t || event.button === 2) return;
  drag = { mode: 'move', id, sx: p.x, sy: p.y, x: t.x, y: t.y, width: t.width, rotation: t.rotation };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
function onHandleDown(event: PointerEvent, mode: Mode): void {
  const t = props.v.selectedText;
  if (!t || !canvasEl.value) return;
  event.stopPropagation(); event.preventDefault();
  const p = toScene(event);
  drag = { mode, id: t.id, sx: p.x, sy: p.y, x: t.x, y: t.y, width: t.width, rotation: t.rotation };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
function onMove(event: PointerEvent): void {
  if (!drag || !canvasEl.value) return;
  const t = props.v.scene.texts.find((x) => x.id === drag!.id);
  if (!t) return;
  const p = toScene(event);
  const d = drag;
  props.v.doc.setChangeKey('drag-' + d.id);
  if (d.mode === 'move') { t.x = Math.round(d.x + p.x - d.sx); t.y = Math.round(d.y + p.y - d.sy); return; }
  if (d.mode === 'rotate') {
    let deg = (Math.atan2(p.y - d.y, p.x - d.x) * 180) / Math.PI + 90;
    if (event.shiftKey) deg = Math.round(deg / 15) * 15;
    t.rotation = Math.round(((deg + 540) % 360) - 180);
    return;
  }
  // largura: a borda oposta fica parada (no referencial girado do texto)
  const a = (d.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - d.sx, dy = p.y - d.sy;
  const local = dx * cos + dy * sin;
  const sign = d.mode === 'width-right' ? 1 : -1;
  const width = Math.max(20, Math.round(d.width + sign * local));
  const shift = (width - d.width) / 2 * sign;
  t.width = width;
  t.x = Math.round(d.x + shift * cos); t.y = Math.round(d.y + shift * sin);
}
function onUp(): void {
  drag = null;
  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
}
function onDouble(event: MouseEvent): void {
  if (!canvasEl.value) return;
  const r = canvasEl.value.getBoundingClientRect();
  const x = ((event.clientX - r.left) / r.width) * props.v.scene.width, y = ((event.clientY - r.top) / r.height) * props.v.scene.height;
  const id = hitTest(boxes.value, x, y, 6 / scale.value);
  if (id) { props.v.selectText(id); emit('edit'); }
}
function onStageKey(event: KeyboardEvent): void {
  if ((event.target as HTMLElement).tagName === 'INPUT') return;
  const step = event.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[event.key];
  if (m && props.v.selectedText && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); props.v.nudge(m[0], m[1]); }
  else if (event.key === 'Escape') props.v.selectText(null);
  else if (event.key === 'Enter' && props.v.selectedText) { event.preventDefault(); emit('edit'); }
}
function onDrop(event: DragEvent): void {
  const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
  if (!file) { props.v.note('Solte um arquivo de imagem (PNG, JPG ou WebP) para usá-lo como fundo desta cena.'); return; }
  void props.v.importBackground(file);
}

const frameStyle = computed(() => {
  const b = boxes.value.find((x) => x.id === props.v.textId);
  if (!b) return null;
  const k = scale.value;
  return { left: (b.x - b.w / 2) * k + 'px', top: (b.y - b.h / 2) * k + 'px', width: Math.max(4, b.w * k) + 'px', height: Math.max(4, b.h * k) + 'px', transform: 'rotate(' + b.rotation + 'deg)' };
});
const frameHidden = computed(() => boxes.value.find((x) => x.id === props.v.textId)?.visible === false);
const label = computed(() => {
  const s = props.v.scene;
  return 'Cena ' + (props.v.sceneIndex + 1) + ' de ' + props.v.sceneCount + ', ' + s.width + ' por ' + s.height + ' pixels, com ' + s.texts.length + (s.texts.length === 1 ? ' texto' : ' textos');
});
</script>

<template>
  <div class="vs-stage" data-versos-root :data-clip="v.clipKind ?? ''">
    <div ref="stageEl" class="viewport" tabindex="0" role="group" aria-label="Prévia da cena. Setas movem o texto selecionado; Shift acelera; Esc limpa a seleção." data-testid="versos-viewport"
      @keydown="onStageKey" @dragover.prevent @drop.prevent="onDrop">
      <div class="board" :style="{ width: v.scene.width * scale + 'px', height: v.scene.height * scale + 'px' }" data-testid="versos-board">
        <canvas ref="canvasEl" class="cv" :style="{ width: v.scene.width * scale + 'px', height: v.scene.height * scale + 'px' }" role="img" :aria-label="label"
          data-testid="versos-canvas" :data-has-selection="v.selectedText ? 'true' : 'false'" :data-scene-w="v.scene.width" :data-scene-h="v.scene.height" @pointerdown="onCanvasDown" @dblclick="onDouble"></canvas>
        <div v-if="frameStyle" class="frame" :class="{ off: frameHidden }" :style="frameStyle" data-testid="selection-frame">
          <span class="handle h-left" data-context-native title="Largura (lado esquerdo)" data-handle="width-left" @pointerdown="onHandleDown($event, 'width-left')"></span>
          <span class="handle h-right" data-context-native title="Largura (lado direito)" data-handle="width-right" @pointerdown="onHandleDown($event, 'width-right')"></span>
          <span class="rot" data-context-native title="Girar (Shift = de 15 em 15°)" data-handle="rotate" @pointerdown="onHandleDown($event, 'rotate')"></span>
        </div>
      </div>
    </div>
    <p v-if="missing.length" class="miss" role="status" data-testid="missing-image">A imagem de fundo desta cena ainda está carregando ou não pôde ser lida.</p>
    <div class="zoombar">
      <button type="button" class="ib" aria-label="Diminuir zoom" @click="setZoom(scale * 0.8)">−</button>
      <span class="z" data-testid="zoom" aria-live="off">{{ zoomText }}</span>
      <button type="button" class="ib" aria-label="Aumentar zoom" @click="setZoom(scale * 1.25)">+</button>
      <button type="button" class="btn small" @click="zoom = 0">Ajustar</button>
      <button type="button" class="btn small z100" @click="zoom = 1">100%</button>
      <span class="muted dims" data-testid="scene-dims">{{ v.scene.width }} × {{ v.scene.height }} px</span>
    </div>
  </div>
</template>

<style scoped>
.vs-stage { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--raised); }
.viewport { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 12px; outline: none; }
.viewport:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.board {
  position: relative; flex: none; box-shadow: 0 10px 30px rgb(0 0 0 / 28%);
  /* grade de transparência: SÓ na tela, atrás do canvas; nunca é desenhada na exportação */
  background: repeating-conic-gradient(#c9ced8 0% 25%, #f4f6fa 0% 50%) 0 0 / 18px 18px;
}
.cv { display: block; touch-action: none; cursor: default; }
.frame { position: absolute; border: 2px solid var(--accent); box-sizing: border-box; pointer-events: none; transform-origin: center; }
.frame.off { border-style: dashed; }
.handle { position: absolute; top: calc(50% - 14px); width: 16px; height: 28px; border-radius: 8px; background: #fff; border: 2px solid var(--accent); box-sizing: border-box; pointer-events: auto; touch-action: none; cursor: ew-resize; }
.h-left { left: -9px; }
.h-right { right: -9px; }
.rot { position: absolute; left: calc(50% - 14px); top: -42px; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; box-sizing: border-box; pointer-events: auto; touch-action: none; cursor: grab; }
.rot::after { content: ""; position: absolute; left: 11px; top: 24px; width: 2px; height: 16px; background: var(--accent); }
.miss { margin: 0; padding: 4px 12px; font-size: 12.5px; background: var(--surface); color: var(--warn); border-top: 1px solid var(--border); }
.zoombar { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 12px; background: var(--surface); border-top: 1px solid var(--border); flex-wrap: wrap; }
.z { min-width: 48px; text-align: center; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.small { min-height: 36px; padding: 4px 10px; font-size: 13px; }
.dims { font-size: 12.5px; margin-left: auto; font-variant-numeric: tabular-nums; }
/* celular: a barra de zoom fica numa linha só (as medidas da cena aparecem na aba Cena) */
@media (max-width: 899px) { .dims, .z100 { display: none; } .zoombar { flex-wrap: nowrap; justify-content: center; } }
</style>
