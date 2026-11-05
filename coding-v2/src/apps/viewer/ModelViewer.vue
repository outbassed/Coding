<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VIcon from './VIcon.vue';
import { boundsOf, defaultCamera, drawMesh, parseModel, type Bounds, type Camera, type Mesh } from './mesh';
import { meshPage } from './print';
import { canvasToPng } from './resources';
import { clamp } from './media';
import type { PrintPage } from '../../shared/print/print';
import type { ViewerFile } from './model';
import type { ModelColor, ViewerPrefs } from './prefs';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Modelos 3D (STL, OBJ, GLB): girar com mouse ou dedo, aproximar com roda ou pinça, vistas prontas, arestas, cor e captura. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();

const COLORS: Record<ModelColor, [number, number, number]> = { azul: [90, 150, 245], cinza: [190, 195, 205], laranja: [245, 160, 70], verde: [90, 200, 140] };
const COLOR_LABELS: Record<ModelColor, string> = { azul: 'Azul', cinza: 'Cinza', laranja: 'Laranja', verde: 'Verde' };
const BACKGROUND = '#0f1319';
const VIEWS: { id: string; label: string; yaw: number; pitch: number }[] = [
  { id: 'iso', label: 'Isométrica', yaw: -0.6, pitch: 0.45 },
  { id: 'front', label: 'Frente', yaw: 0, pitch: 0 },
  { id: 'side', label: 'Lado', yaw: Math.PI / 2, pitch: 0 },
  { id: 'back', label: 'Trás', yaw: Math.PI, pitch: 0 },
  { id: 'top', label: 'Topo', yaw: 0, pitch: 1.5 }
];

const mesh = ref<Mesh | null>(null);
const bounds = ref<Bounds | null>(null);
const camera = ref<Camera>(defaultCamera());
const canvas = ref<HTMLCanvasElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const loading = ref(true);
const failed = ref(false);
const auto = ref(false);
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewId = ref('iso');

onMounted(async () => {
  try {
    if (!props.blob) throw new Error('Não foi possível abrir este modelo.');
    const m = parseModel(props.file.name, new Uint8Array(await props.blob.arrayBuffer()));
    mesh.value = m; bounds.value = boundsOf(m);
    const b = bounds.value;
    const num = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const tri = m.triangles.toLocaleString('pt-BR') + (m.triangles === 1 ? ' triângulo' : ' triângulos');
    emit('meta', tri, [
      { label: 'Triângulos', value: m.triangles.toLocaleString('pt-BR') },
      { label: 'Dimensões (unidades do modelo)', value: num(b.sx) + ' × ' + num(b.sy) + ' × ' + num(b.sz) }
    ]);
    loading.value = false;
    draw();
  } catch (e) {
    loading.value = false; failed.value = true;
    emit('error', e instanceof Error && e.message ? e.message : 'Não foi possível abrir este modelo 3D.');
  }
  if (typeof ResizeObserver !== 'undefined' && stage.value) { ro = new ResizeObserver(() => draw()); ro.observe(stage.value); }
});
let ro: ResizeObserver | undefined;
let frame = 0;
let spinner = 0;
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(spinner); });

function draw(fast = false): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const c = canvas.value, m = mesh.value, b = bounds.value, box = stage.value;
    if (!c || !m || !b || !box) return;
    const w = Math.max(160, Math.floor(box.clientWidth)), h = Math.max(160, Math.floor(box.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = drawMesh(ctx, m, b, camera.value, w, h, { wireframe: props.prefs.wire, color: COLORS[props.prefs.modelColor] ?? COLORS.azul, background: BACKGROUND }, fast ? 12000 : 250000);
    c.dataset.drawn = String(n);
  });
}
watch(() => [props.prefs.wire, props.prefs.modelColor], () => draw());

// ---------------------------------------------------------------- câmera
function setCamera(next: Partial<Camera>, fast = false): void {
  const c = { ...camera.value, ...next };
  c.pitch = clamp(c.pitch, -1.5, 1.5); c.zoom = clamp(c.zoom, 0.2, 8);
  camera.value = c;
  draw(fast);
}
function zoomBy(f: number): void { setCamera({ zoom: camera.value.zoom * f }); }
function reset(): void { viewId.value = 'iso'; setCamera(defaultCamera()); }
function setView(id: string): void {
  const v = VIEWS.find((x) => x.id === id);
  if (!v) return;
  viewId.value = id;
  setCamera({ yaw: v.yaw, pitch: v.pitch });
}
function toggleAuto(): void {
  if (reduceMotion && !auto.value) { emit('notice', 'O giro automático está desligado porque o aparelho pede menos animações.'); return; }
  auto.value = !auto.value;
}
watch(auto, (on) => {
  cancelAnimationFrame(spinner);
  if (!on) { draw(); return; }
  let last = performance.now();
  const tick = (now: number): void => {
    if (!auto.value) return;
    if (!pointers.size) setCamera({ yaw: camera.value.yaw + ((now - last) / 1000) * 0.6 }, true);
    last = now;
    spinner = requestAnimationFrame(tick);
  };
  spinner = requestAnimationFrame(tick);
});

// ---------------------------------------------------------------- mouse e toque
const pointers = new Map<number, { x: number; y: number }>();
let pinchStart: { d: number; z: number } | null = null;
function onDown(e: PointerEvent): void {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: camera.value.zoom }; }
  viewId.value = '';
}
function onMove(e: PointerEvent): void {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (pinchStart.d > 0) setCamera({ zoom: pinchStart.z * (d / pinchStart.d) }, true);
    return;
  }
  setCamera({ yaw: camera.value.yaw + (e.clientX - prev.x) * 0.01, pitch: camera.value.pitch + (e.clientY - prev.y) * 0.01 }, true);
}
function onUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (!pointers.size) draw();
}
function onWheel(e: WheelEvent): void { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }

// ---------------------------------------------------------------- captura e impressão
async function capture(): Promise<void> {
  const m = mesh.value, b = bounds.value, c = canvas.value;
  if (!m || !b || !c) return;
  try {
    const out = document.createElement('canvas');
    const a = c.width / Math.max(1, c.height);
    out.width = a >= 1 ? 1600 : Math.round(1600 * a); out.height = a >= 1 ? Math.round(1600 / a) : 1600;
    const g = out.getContext('2d');
    if (!g) throw new Error('O navegador não conseguiu gerar a imagem.');
    drawMesh(g, m, b, camera.value, out.width, out.height, { wireframe: props.prefs.wire, color: COLORS[props.prefs.modelColor] ?? COLORS.azul, background: BACKGROUND }, 250000);
    const png = await canvasToPng(out);
    const url = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = url; link.download = (props.file.name.replace(/\.[^.]+$/, '') || 'modelo') + '-vista.png';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    emit('notice', 'Vista salva como imagem.');
  } catch (e) { emit('notice', e instanceof Error ? e.message : 'Não foi possível salvar a vista.'); }
}
const printReason = (): string => (failed.value ? 'Este modelo não abriu, então não há o que imprimir.' : mesh.value ? '' : 'Espere o modelo terminar de abrir.');
async function printPages(): Promise<PrintPage[]> {
  const c = canvas.value;
  if (!mesh.value || !bounds.value) throw new Error('Espere o modelo terminar de abrir.');
  return [meshPage(mesh.value, bounds.value, camera.value, COLORS[props.prefs.modelColor] ?? COLORS.azul, props.prefs.wire, c ? c.width / c.height : 4 / 3)];
}

// ---------------------------------------------------------------- menu e teclado
function menu(): MenuGroup[] {
  return [
    { title: 'Vista', items: [
      ...VIEWS.map((v) => ({ id: 'view-' + v.id, label: v.label, icon: 'cube' as const, checked: viewId.value === v.id, run: () => setView(v.id) })),
      { id: 'reset', label: 'Centralizar e restaurar', icon: 'home' as const, shortcut: '0', run: reset }
    ] },
    { title: 'Exibição', items: [
      { id: 'solid', label: 'Sólido', icon: 'cube', checked: !props.prefs.wire, run: () => { props.prefs.wire = false; } },
      { id: 'wire', label: 'Só as arestas', icon: 'grid', shortcut: 'W', checked: props.prefs.wire, run: () => { props.prefs.wire = !props.prefs.wire; } },
      { id: 'auto', label: 'Girar sozinho', icon: 'spin', shortcut: 'A', checked: auto.value, run: toggleAuto }
    ] },
    { title: 'Cor', items: (Object.keys(COLORS) as ModelColor[]).map((k) => ({ id: 'color-' + k, label: COLOR_LABELS[k], icon: 'sun' as const, checked: props.prefs.modelColor === k, run: () => { props.prefs.modelColor = k; } })) },
    { items: [
      { id: 'zoom-in', label: 'Aproximar', icon: 'zoomIn', shortcut: '+', run: () => zoomBy(1.2) },
      { id: 'zoom-out', label: 'Afastar', icon: 'zoomOut', shortcut: '−', run: () => zoomBy(1 / 1.2) },
      { id: 'capture', label: 'Salvar vista como imagem', icon: 'camera', run: () => { void capture(); } }
    ] }
  ];
}
function key(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  switch (e.key) {
    case 'ArrowLeft': setCamera({ yaw: camera.value.yaw - 0.1 }); return true;
    case 'ArrowRight': setCamera({ yaw: camera.value.yaw + 0.1 }); return true;
    case 'ArrowUp': setCamera({ pitch: camera.value.pitch - 0.1 }); return true;
    case 'ArrowDown': setCamera({ pitch: camera.value.pitch + 0.1 }); return true;
    case '+': case '=': zoomBy(1.15); return true;
    case '-': case '_': zoomBy(1 / 1.15); return true;
    case '0': reset(); return true;
    case '1': setView('front'); return true;
    case '2': setView('side'); return true;
    case '3': setView('back'); return true;
    case '4': setView('top'); return true;
    case 'w': case 'W': props.prefs.wire = !props.prefs.wire; return true;
    case 'a': case 'A': toggleAuto(); return true;
    default: return false;
  }
}
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
const viewValue = computed(() => viewId.value);
</script>

<template>
  <div class="vw-body mv" data-testid="model-viewer">
    <div ref="stage" class="mv-stage">
      <canvas v-if="mesh" ref="canvas" class="mv-canvas" tabindex="0" role="img" data-testid="model-canvas"
        :aria-label="'Modelo 3D ' + file.name + '. Arraste para girar; setas giram; + e − aproximam; 0 restaura.'"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel"></canvas>
      <p v-if="loading" class="vw-spin mv-msg" role="status">Preparando o modelo…</p>
    </div>
    <div class="vw-bar" role="toolbar" aria-label="Controles do modelo 3D">
      <div class="vw-group">
        <button type="button" class="vw-btn" aria-label="Centralizar e restaurar a vista" title="Centralizar e restaurar (0)" data-testid="reset-3d" @click="reset"><VIcon name="home" /></button>
        <button type="button" class="vw-btn" aria-label="Afastar" title="Afastar (−)" data-testid="zoom-out-3d" @click="zoomBy(1 / 1.2)"><VIcon name="zoomOut" /></button>
        <button type="button" class="vw-btn" aria-label="Aproximar" title="Aproximar (+)" data-testid="zoom-in-3d" @click="zoomBy(1.2)"><VIcon name="zoomIn" /></button>
        <label class="sr-only" for="mv-view">Vista</label>
        <select id="mv-view" class="vw-sel vw-hide-sm" :value="viewValue" data-testid="model-view" @change="setView(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Vista livre</option>
          <option v-for="v in VIEWS" :key="v.id" :value="v.id">{{ v.label }}</option>
        </select>
      </div>
      <span class="vw-sep vw-hide-sm" aria-hidden="true"></span>
      <div class="vw-group">
        <button type="button" class="vw-btn" :aria-pressed="prefs.wire" aria-label="Só as arestas" title="Só as arestas (W)" data-testid="wireframe" @click="prefs.wire = !prefs.wire"><VIcon name="grid" /></button>
        <button type="button" class="vw-btn vw-hide-sm" :aria-pressed="auto" aria-label="Girar sozinho" title="Girar sozinho (A)" data-testid="auto-rotate" @click="toggleAuto"><VIcon name="spin" /></button>
        <label class="sr-only" for="mv-color">Cor do modelo</label>
        <select id="mv-color" v-model="prefs.modelColor" class="vw-sel vw-hide-sm" data-testid="model-color">
          <option v-for="(label, k) in COLOR_LABELS" :key="k" :value="k">{{ label }}</option>
        </select>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Salvar vista como imagem" title="Salvar vista como imagem" data-testid="model-capture" :disabled="!mesh" @click="capture"><VIcon name="camera" /></button>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mv-stage { position: relative; flex: 1 1 0; min-height: 0; overflow: hidden; background: #0f1319; }
.mv-canvas { display: block; position: absolute; inset: 0; cursor: grab; touch-action: none; outline: none; }
.mv-canvas:active { cursor: grabbing; }
.mv-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--app); }
.mv-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; }
</style>
