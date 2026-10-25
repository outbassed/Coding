<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, safeFileName } from '../../shared/files/download';
import type { LegacyImage } from '../../storage/documents';
import { floodMask, growMask, maskSize } from './fill';
import { hexToRgba, layerId, MAX_LAYERS, MAX_SIDE, MIN_SIDE, type PaintLayer } from './model';
import { boxFrom, constrainLine, type Pt } from './shapes';
import { UndoStack } from './undo';
import { paintKind, paintTemplates } from './kind';

const doc = useDocument({
  kind: paintKind, templates: paintTemplates, path: '/apps/pintar/', withImages: true,
  imagesFor: (state, images) => { const used = new Set(state.layers.map((l) => l.blobId)); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const tabs = [{ id: 'ferramentas', label: 'Ferramentas' }, { id: 'camadas', label: 'Camadas' }, { id: 'tela', label: 'Tela' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('ferramentas');
const message = ref('');
function note(text: string): void { message.value = text; doc.say(text); }

type Tool = 'brush' | 'eraser' | 'bucket' | 'line' | 'rect' | 'ellipse' | 'picker' | 'hand';
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'brush', label: 'Pincel', key: 'B' }, { id: 'eraser', label: 'Borracha', key: 'E' }, { id: 'bucket', label: 'Balde', key: 'G' },
  { id: 'line', label: 'Linha', key: 'L' }, { id: 'rect', label: 'Retângulo', key: 'R' }, { id: 'ellipse', label: 'Elipse', key: 'O' },
  { id: 'picker', label: 'Conta-gotas', key: 'I' }, { id: 'hand', label: 'Mão', key: 'H' }
];
const tool = ref<Tool>('brush');
const color = ref('#e8538f');
const size = ref(12);
const opacity = ref(100);
const tolerance = ref(24);
const sampleAll = ref(false);
const filled = ref(false);
const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#e63946', '#f4a261', '#ffd166', '#06d6a0', '#118ab2', '#4c8df6', '#7b2cbf', '#e8538f', '#8d5524'];

// ---------------------------------------------------------------- camadas em memória
const canvases = new Map<string, HTMLCanvasElement>();
const drawnFrom = new Map<string, Blob | null>();
const stroke = document.createElement('canvas');
const scratch = document.createElement('canvas');
const undoStack = new UndoStack();
const tick = ref(0);
const canUndo = ref(false), canRedo = ref(false);
function refreshHistory(): void { canUndo.value = undoStack.canUndo; canRedo.value = undoStack.canRedo; }
const active = computed<PaintLayer | undefined>(() => state.value.layers.find((l) => l.id === state.value.activeId));
const topFirst = computed(() => [...state.value.layers].reverse());

function makeCanvas(w = state.value.width, h = state.value.height): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasOf(id: string): HTMLCanvasElement {
  let c = canvases.get(id);
  if (!c) { c = makeCanvas(); canvases.set(id, c); }
  return c;
}
function copyOf(src: HTMLCanvasElement): HTMLCanvasElement { const c = makeCanvas(src.width, src.height); c.getContext('2d')!.drawImage(src, 0, 0); return c; }
function paintBack(id: string, src: HTMLCanvasElement): void {
  const c = canvasOf(id);
  if (c.width !== src.width || c.height !== src.height) { c.width = src.width; c.height = src.height; }
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0);
  markDirty(id);
}
function sizeStroke(): void {
  for (const c of [stroke, scratch]) { if (c.width !== state.value.width) c.width = state.value.width; if (c.height !== state.value.height) c.height = state.value.height; }
}

// ---------------------------------------------------------------- gravação dos pixels (um PNG por camada)
const dirty = new Set<string>();
const encoding = new Set<string>();
function markDirty(id: string): void { dirty.add(id); void flushLayer(id); requestRender(); }
async function flushLayer(id: string): Promise<void> {
  if (encoding.has(id) || !dirty.has(id)) return;
  const layer = state.value.layers.find((l) => l.id === id);
  const c = canvases.get(id);
  if (!layer || !c) { dirty.delete(id); return; }
  encoding.add(id); dirty.delete(id);
  try {
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível gravar a camada.');
    if (!layer.blobId) layer.blobId = 'paint-' + crypto.randomUUID();
    const image: LegacyImage = { id: layer.blobId, docId: '', blob, mime: 'image/png', name: layer.name.slice(0, 120) };
    drawnFrom.set(id, blob);
    images.value = [...images.value.filter((i) => i.id !== layer.blobId), image];
  } catch (e) { note((e as Error).message); }
  finally { encoding.delete(id); if (dirty.has(id)) void flushLayer(id); }
}
function flushAll(): void { for (const l of state.value.layers) if (dirty.has(l.id)) void flushLayer(l.id); }

// ---------------------------------------------------------------- abrir: reconstrói os canvases a partir dos PNG
let reconciling = 0;
async function reconcile(): Promise<void> {
  const mine = ++reconciling;
  sizeStroke();
  const ids = new Set(state.value.layers.map((l) => l.id));
  for (const id of [...canvases.keys()]) if (!ids.has(id)) { canvases.delete(id); drawnFrom.delete(id); }
  for (const layer of state.value.layers) {
    const c = canvasOf(layer.id);
    if (c.width !== state.value.width || c.height !== state.value.height) { c.width = state.value.width; c.height = state.value.height; }
    const image = layer.blobId ? images.value.find((i) => i.id === layer.blobId) : undefined;
    const blob = image?.blob ?? null;
    if (blob && drawnFrom.get(layer.id) !== blob) {
      try {
        const bmp = await createImageBitmap(blob);
        if (mine !== reconciling) { bmp.close(); return; }
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(bmp, 0, 0);
        bmp.close();
        drawnFrom.set(layer.id, blob);
      } catch { /* camada corrompida: fica em branco */ }
    }
  }
  requestRender();
}
watch([state, images], () => { void reconcile(); }, { immediate: true });
watch(() => [state.value.width, state.value.height], () => { sizeStroke(); requestRender(); });
// mudanças de visibilidade/opacidade/fundo/ordem redesenham
watch(() => JSON.stringify([state.value.layers.map((l) => [l.id, l.visible, l.opacity]), state.value.background]), () => requestRender());

// ---------------------------------------------------------------- tela e zoom
const viewportEl = ref<HTMLElement | null>(null);
const displayEl = ref<HTMLCanvasElement | null>(null);
const zoom = ref(0);
const box = ref({ w: 800, h: 600 });
const fitScale = computed(() => Math.max(0.02, Math.min(4, Math.min((box.value.w - 32) / state.value.width, (box.value.h - 32) / state.value.height))));
const scale = computed(() => (zoom.value > 0 ? zoom.value : fitScale.value));
const zoomText = computed(() => Math.round(scale.value * 100) + '%');
function setZoom(v: number): void { zoom.value = Math.max(0.05, Math.min(8, v)); }
let ro: ResizeObserver | undefined;
function measure(): void { const el = viewportEl.value; if (el) box.value = { w: el.clientWidth, h: el.clientHeight }; }
onMounted(() => { measure(); if (typeof ResizeObserver !== 'undefined' && viewportEl.value) { ro = new ResizeObserver(measure); ro.observe(viewportEl.value); } });
onBeforeUnmount(() => ro?.disconnect());

interface ActiveStroke { tool: Tool; layerId: string; before: HTMLCanvasElement; last: Pt; mid: Pt; start: Pt; erase: boolean; alpha: number; points: number }
let current: ActiveStroke | null = null;

function composeInto(ctx: CanvasRenderingContext2D, w: number, h: number, withBackground: boolean, forExport = false): void {
  if (withBackground && state.value.background !== 'transparent') { ctx.fillStyle = state.value.background; ctx.fillRect(0, 0, w, h); }
  for (const layer of state.value.layers) {
    if (!layer.visible) continue;
    const c = canvases.get(layer.id); if (!c) continue;
    ctx.globalAlpha = layer.opacity;
    if (!forExport && current && current.layerId === layer.id) {
      scratch.getContext('2d')!.clearRect(0, 0, scratch.width, scratch.height);
      const sg = scratch.getContext('2d')!;
      sg.drawImage(c, 0, 0);
      sg.globalAlpha = current.alpha;
      sg.globalCompositeOperation = current.erase ? 'destination-out' : 'source-over';
      sg.drawImage(stroke, 0, 0);
      sg.globalAlpha = 1; sg.globalCompositeOperation = 'source-over';
      ctx.drawImage(scratch, 0, 0, w, h);
    } else ctx.drawImage(c, 0, 0, w, h);
  }
  ctx.globalAlpha = 1;
}
let frame = 0;
function requestRender(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const c = displayEl.value; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.min(scale.value, 1) * dpr;
    const w = Math.max(1, Math.round(state.value.width * px)), h = Math.max(1, Math.round(state.value.height * px));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    composeInto(ctx, w, h, true);
    c.dataset.layers = String(state.value.layers.length);
    tick.value++;
  });
}
watch(scale, () => requestRender());
onMounted(requestRender);
onBeforeUnmount(() => cancelAnimationFrame(frame));

// ---------------------------------------------------------------- desenho
function pointOf(e: PointerEvent): Pt {
  const r = displayEl.value!.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * state.value.width, y: ((e.clientY - r.top) / r.height) * state.value.height };
}
const cursorText = ref('');
function strokeStyle(g: CanvasRenderingContext2D): void {
  g.strokeStyle = color.value; g.fillStyle = color.value; g.lineWidth = size.value; g.lineCap = 'round'; g.lineJoin = 'round';
}
function begin(e: PointerEvent): void {
  const layer = active.value;
  if (!layer) return;
  if (!layer.visible) { note('A camada “' + layer.name + '” está oculta. Mostre-a para desenhar nela.'); return; }
  sizeStroke();
  const p = pointOf(e);
  const g = stroke.getContext('2d')!;
  g.clearRect(0, 0, stroke.width, stroke.height);
  current = { tool: tool.value, layerId: layer.id, before: copyOf(canvasOf(layer.id)), last: p, mid: p, start: p, erase: tool.value === 'eraser', alpha: opacity.value / 100, points: 1 };
  if (tool.value === 'brush' || tool.value === 'eraser') {
    g.fillStyle = tool.value === 'eraser' ? '#000' : color.value;
    g.beginPath(); g.arc(p.x, p.y, size.value / 2, 0, Math.PI * 2); g.fill();
  }
  requestRender();
}
function extend(e: PointerEvent): void {
  if (!current) return;
  const g = stroke.getContext('2d')!;
  const events = typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    const p = pointOf(ev);
    if (current.tool === 'brush' || current.tool === 'eraser') {
      strokeStyle(g);
      if (current.tool === 'eraser') { g.strokeStyle = '#000'; g.fillStyle = '#000'; }
      const mid = { x: (current.last.x + p.x) / 2, y: (current.last.y + p.y) / 2 };
      g.beginPath(); g.moveTo(current.mid.x, current.mid.y); g.quadraticCurveTo(current.last.x, current.last.y, mid.x, mid.y); g.stroke();
      current.mid = mid; current.last = p; current.points++;
    } else if (current.tool === 'line' || current.tool === 'rect' || current.tool === 'ellipse') {
      g.clearRect(0, 0, stroke.width, stroke.height);
      strokeStyle(g);
      if (current.tool === 'line') {
        const end = ev.shiftKey ? constrainLine(current.start, p) : p;
        g.beginPath(); g.moveTo(current.start.x, current.start.y); g.lineTo(end.x, end.y); g.stroke();
      } else {
        const b = boxFrom(current.start, p, ev.shiftKey);
        g.beginPath();
        if (current.tool === 'rect') g.rect(b.x, b.y, b.w, b.h); else g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        if (filled.value) g.fill(); else g.stroke();
      }
      current.last = p;
    }
  }
  requestRender();
}
function finish(): void {
  if (!current) return;
  const s = current; current = null;
  const c = canvasOf(s.layerId);
  if (s.tool === 'brush' || s.tool === 'eraser') {
    const g = stroke.getContext('2d')!;
    strokeStyle(g); if (s.erase) g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(s.mid.x, s.mid.y); g.lineTo(s.last.x, s.last.y); g.stroke();
  }
  const g = c.getContext('2d')!;
  g.save();
  g.globalAlpha = s.alpha;
  g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  g.drawImage(stroke, 0, 0);
  g.restore();
  stroke.getContext('2d')!.clearRect(0, 0, stroke.width, stroke.height);
  pushPixels(s.layerId, s.before, s.erase ? 'Borracha' : tool.value === 'brush' ? 'Pincel' : 'Forma');
  markDirty(s.layerId);
}
function pushPixels(id: string, before: HTMLCanvasElement, label: string): void {
  let after: HTMLCanvasElement | null = null;
  undoStack.push({
    label, cost: before.width * before.height * 2,
    undo: () => { after ??= copyOf(canvasOf(id)); paintBack(id, before); },
    redo: () => { if (after) paintBack(id, after); }
  });
  refreshHistory();
}

// balde, conta-gotas
function compositeData(): ImageData {
  const c = makeCanvas();
  composeInto(c.getContext('2d')!, c.width, c.height, true, true);
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}
function bucket(p: Pt): void {
  const layer = active.value; if (!layer) return;
  if (!layer.visible) { note('A camada “' + layer.name + '” está oculta. Mostre-a para pintar nela.'); return; }
  const c = canvasOf(layer.id);
  const w = c.width, h = c.height;
  const src = sampleAll.value ? compositeData() : c.getContext('2d')!.getImageData(0, 0, w, h);
  let mask = floodMask(src.data, w, h, p.x, p.y, tolerance.value);
  if (!maskSize(mask)) { note('Clique dentro da tela para preencher.'); return; }
  if (tolerance.value > 0) mask = growMask(mask, w, h, 1); // cobre o serrilhado das bordas
  const [r, g, b] = hexToRgba(color.value);
  const out = new ImageData(w, h);
  for (let i = 0; i < mask.length; i++) if (mask[i]) { out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255; }
  const temp = makeCanvas(w, h);
  temp.getContext('2d')!.putImageData(out, 0, 0);
  const before = copyOf(c);
  const ctx = c.getContext('2d')!;
  ctx.save(); ctx.globalAlpha = opacity.value / 100; ctx.drawImage(temp, 0, 0); ctx.restore();
  pushPixels(layer.id, before, 'Balde');
  markDirty(layer.id);
  note('Região preenchida.');
}
function pick(p: Pt): void {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= state.value.width || y >= state.value.height) return;
  const data = compositeData().data;
  const i = (y * state.value.width + x) * 4;
  if (data[i + 3] === 0) { note('Esse ponto é transparente: não há cor para copiar.'); return; }
  color.value = '#' + [data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');
  note('Cor copiada: ' + color.value + '.');
}

// ponteiro
let pan: { x: number; y: number; left: number; top: number } | null = null;
function onDown(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  const t = tool.value;
  if (t === 'hand') { const v = viewportEl.value!; pan = { x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop }; return; }
  if (t === 'picker') { pick(pointOf(e)); return; }
  if (t === 'bucket') { bucket(pointOf(e)); return; }
  begin(e);
}
function onMove(e: PointerEvent): void {
  const p = pointOf(e);
  cursorText.value = Math.round(p.x) + ', ' + Math.round(p.y);
  if (pan && viewportEl.value) { viewportEl.value.scrollLeft = pan.left - (e.clientX - pan.x); viewportEl.value.scrollTop = pan.top - (e.clientY - pan.y); return; }
  extend(e);
}
function onUp(): void { pan = null; finish(); }

// ---------------------------------------------------------------- camadas
function entryFor(layer: PaintLayer, index: number, canvas: HTMLCanvasElement): void {
  undoStack.push({
    label: 'Camada', cost: canvas.width * canvas.height,
    undo: () => {
      const i = state.value.layers.findIndex((l) => l.id === layer.id);
      if (i >= 0) { state.value.layers.splice(i, 1); canvases.delete(layer.id); if (state.value.activeId === layer.id) state.value.activeId = state.value.layers[Math.max(0, i - 1)]!.id; }
      requestRender();
    },
    redo: () => { state.value.layers.splice(index, 0, layer); canvases.set(layer.id, canvas); state.value.activeId = layer.id; markDirty(layer.id); }
  });
  refreshHistory();
}
function addLayer(name?: string, pixels?: HTMLCanvasElement): PaintLayer | null {
  if (state.value.layers.length >= MAX_LAYERS) { note('Limite de ' + MAX_LAYERS + ' camadas.'); return null; }
  const layer: PaintLayer = { id: layerId(), name: (name ?? 'Camada ' + (state.value.layers.length + 1)).slice(0, 60), visible: true, opacity: 1, blobId: '' };
  const at = state.value.layers.findIndex((l) => l.id === state.value.activeId) + 1 || state.value.layers.length;
  const c = makeCanvas();
  if (pixels) c.getContext('2d')!.drawImage(pixels, 0, 0);
  canvases.set(layer.id, c);
  state.value.layers.splice(at, 0, layer);
  state.value.activeId = layer.id;
  entryFor(layer, at, c);
  markDirty(layer.id);
  return layer;
}
function removeLayer(id: string): void {
  if (state.value.layers.length <= 1) { note('Mantenha ao menos uma camada. Use “Limpar camada” para apagar o desenho dela.'); return; }
  const i = state.value.layers.findIndex((l) => l.id === id); if (i < 0) return;
  const layer = state.value.layers[i]!, canvas = canvasOf(id);
  state.value.layers.splice(i, 1); canvases.delete(id);
  if (state.value.activeId === id) state.value.activeId = state.value.layers[Math.max(0, i - 1)]!.id;
  undoStack.push({
    label: 'Excluir camada', cost: canvas.width * canvas.height,
    undo: () => { state.value.layers.splice(i, 0, layer); canvases.set(id, canvas); state.value.activeId = id; markDirty(id); },
    redo: () => { const j = state.value.layers.findIndex((l) => l.id === id); if (j >= 0) { state.value.layers.splice(j, 1); canvases.delete(id); state.value.activeId = state.value.layers[Math.max(0, j - 1)]!.id; requestRender(); } }
  });
  refreshHistory(); requestRender();
  note('Camada “' + layer.name + '” excluída. Desfazer (Ctrl+Z) traz de volta.');
}
function duplicateLayer(id: string): void {
  const src = state.value.layers.find((l) => l.id === id); if (!src) return;
  const layer = addLayer((src.name + ' (cópia)').slice(0, 60), canvasOf(id));
  if (layer) { layer.opacity = src.opacity; layer.visible = src.visible; }
}
function moveLayer(id: string, delta: -1 | 1): void {
  const list = state.value.layers; const i = list.findIndex((l) => l.id === id); const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  const [l] = list.splice(i, 1); list.splice(j, 0, l!);
  undoStack.push({
    label: 'Mover camada', cost: 1,
    undo: () => { const a = list.findIndex((x) => x.id === id); const [m] = list.splice(a, 1); list.splice(i, 0, m!); requestRender(); },
    redo: () => { const a = list.findIndex((x) => x.id === id); const [m] = list.splice(a, 1); list.splice(j, 0, m!); requestRender(); }
  });
  refreshHistory(); requestRender();
}
function clearLayer(): void {
  const layer = active.value; if (!layer) return;
  const c = canvasOf(layer.id);
  const before = copyOf(c);
  c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  pushPixels(layer.id, before, 'Limpar camada');
  markDirty(layer.id);
  note('Camada limpa.');
}
function mergeDown(): void {
  const list = state.value.layers; const i = list.findIndex((l) => l.id === state.value.activeId);
  if (i <= 0) { note('Não há camada abaixo para mesclar.'); return; }
  const top = list[i]!, below = list[i - 1]!;
  const topC = canvasOf(top.id), belowC = canvasOf(below.id);
  const beforeBelow = copyOf(belowC);
  const g = belowC.getContext('2d')!;
  g.save(); g.globalAlpha = top.visible ? top.opacity : 0; g.drawImage(topC, 0, 0); g.restore();
  let afterBelow: HTMLCanvasElement | null = null;
  list.splice(i, 1); canvases.delete(top.id); state.value.activeId = below.id;
  undoStack.push({
    label: 'Mesclar', cost: belowC.width * belowC.height * 3,
    undo: () => { afterBelow ??= copyOf(canvasOf(below.id)); paintBack(below.id, beforeBelow); list.splice(i, 0, top); canvases.set(top.id, topC); state.value.activeId = top.id; markDirty(top.id); },
    redo: () => { if (afterBelow) paintBack(below.id, afterBelow); const j = list.findIndex((l) => l.id === top.id); if (j >= 0) list.splice(j, 1); canvases.delete(top.id); state.value.activeId = below.id; requestRender(); }
  });
  refreshHistory(); markDirty(below.id);
  note('Camada mesclada com a de baixo.');
}
function selectLayer(id: string): void { state.value.activeId = id; }
function undo(): void { const l = undoStack.undo(); refreshHistory(); requestRender(); if (l) doc.say('Desfeito: ' + l + '.'); }
function redo(): void { const l = undoStack.redo(); refreshHistory(); requestRender(); if (l) doc.say('Refeito: ' + l + '.'); }

// ---------------------------------------------------------------- tela
const newW = ref(state.value.width), newH = ref(state.value.height);
watch(() => [state.value.width, state.value.height], ([w, h]) => { newW.value = w!; newH.value = h!; });
const scaleArt = ref(false);
function resizeCanvas(w: number, h: number): void {
  const W = Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, w))), H = Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, h)));
  if (!Number.isFinite(W) || !Number.isFinite(H) || (W === state.value.width && H === state.value.height)) return;
  const oldW = state.value.width, oldH = state.value.height;
  const snaps = new Map<string, HTMLCanvasElement>();
  for (const l of state.value.layers) snaps.set(l.id, copyOf(canvasOf(l.id)));
  const apply = (nw: number, nh: number, source: Map<string, HTMLCanvasElement>, scaled: boolean): void => {
    state.value.width = nw; state.value.height = nh;
    for (const l of state.value.layers) {
      const src = source.get(l.id); if (!src) continue;
      const c = canvasOf(l.id); c.width = nw; c.height = nh;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, nw, nh);
      if (scaled) g.drawImage(src, 0, 0, nw, nh); else g.drawImage(src, 0, 0);
      markDirty(l.id);
    }
    sizeStroke(); requestRender();
  };
  const scaled = scaleArt.value;
  apply(W, H, snaps, scaled);
  const afterSnaps = new Map<string, HTMLCanvasElement>();
  undoStack.push({
    label: 'Tamanho da tela', cost: [...snaps.values()].reduce((s, c) => s + c.width * c.height, 0) * 2,
    undo: () => { for (const l of state.value.layers) afterSnaps.set(l.id, copyOf(canvasOf(l.id))); apply(oldW, oldH, snaps, false); },
    redo: () => { apply(W, H, afterSnaps, false); }
  });
  refreshHistory();
  note('Tela: ' + W + ' × ' + H + ' px.');
}
const SIZES: [string, number, number][] = [['HD 1280 × 720', 1280, 720], ['Quadrado 1080', 1080, 1080], ['Story 1080 × 1920', 1080, 1920], ['A4 150 dpi', 1240, 1754], ['Pequeno 640 × 480', 640, 480]];
const bgTransparent = computed({ get: () => state.value.background === 'transparent', set: (v: boolean) => { state.value.background = v ? 'transparent' : '#ffffff'; } });
const bgColor = computed({ get: () => (state.value.background === 'transparent' ? '#ffffff' : state.value.background), set: (v: string) => { state.value.background = v; } });

// importar imagem como camada
const fileInput = ref<HTMLInputElement | null>(null);
async function importBlob(blob: Blob, name: string): Promise<boolean> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].includes(blob.type)) { note('“' + name + '” não é uma imagem aceita (PNG, JPG, WebP, GIF, BMP ou AVIF).'); return false; }
  if (blob.size > 25 * 1024 * 1024) { note('“' + name + '” passa de 25 MB.'); return false; }
  if (state.value.layers.length >= MAX_LAYERS) { note('Limite de ' + MAX_LAYERS + ' camadas.'); return false; }
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob); } catch { note('Não foi possível abrir “' + name + '”.'); return false; }
  const fit = Math.min(1, state.value.width / bmp.width, state.value.height / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * fit)), h = Math.max(1, Math.round(bmp.height * fit));
  const temp = makeCanvas();
  temp.getContext('2d')!.drawImage(bmp, Math.round((state.value.width - w) / 2), Math.round((state.value.height - h) / 2), w, h);
  bmp.close();
  addLayer(name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imagem', temp);
  note('Imagem “' + name + '” adicionada como nova camada.');
  return true;
}
async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = '';
  for (const f of files) await importBlob(f, f.name);
}
function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes((el as HTMLInputElement).type);
  return el.isContentEditable;
}
function onPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || isTextTarget(event.target)) return;
  const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  event.preventDefault();
  for (const f of files) void importBlob(f, f.name && f.name !== 'image.png' ? f.name : 'Imagem colada');
}
function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;
  for (const f of files) void importBlob(f, f.name);
}

// ---------------------------------------------------------------- teclado
function onKey(event: KeyboardEvent): void {
  if (isTextTarget(event.target)) return;
  const mod = event.ctrlKey || event.metaKey;
  const k = event.key.toLowerCase();
  if (mod && (k === 'z' || k === 'y')) {
    // o desfazer do Pintar é o dos pixels; impede o desfazer genérico do documento
    event.preventDefault(); event.stopImmediatePropagation();
    if (k === 'y' || event.shiftKey) redo(); else undo();
    return;
  }
  if (mod || event.altKey) return;
  if (k === '[') { size.value = Math.max(1, size.value - (size.value > 20 ? 5 : 1)); return; }
  if (k === ']') { size.value = Math.min(200, size.value + (size.value >= 20 ? 5 : 1)); return; }
  const t = TOOLS.find((x) => x.key.toLowerCase() === k);
  if (t) { tool.value = t.id; }
}
onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('paste', onPaste);
  document.addEventListener('visibilitychange', flushAll);
  window.addEventListener('pagehide', flushAll);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('paste', onPaste);
  document.removeEventListener('visibilitychange', flushAll);
  window.removeEventListener('pagehide', flushAll);
});

// ---------------------------------------------------------------- exportar
const quality = ref(92);
const busy = ref(false);
async function exportAs(type: 'png' | 'jpeg' | 'webp'): Promise<void> {
  busy.value = true;
  try {
    const out = makeCanvas();
    const g = out.getContext('2d')!;
    if (type === 'jpeg' && state.value.background === 'transparent') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height); }
    composeInto(g, out.width, out.height, true, true);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/' + type, type === 'png' ? undefined : quality.value / 100));
    if (!blob || blob.type !== 'image/' + type) throw new Error('Este navegador não consegue gerar ' + type.toUpperCase() + '.');
    downloadBlob(blob, safeFileName(state.value.name, 'desenho') + '.' + (type === 'jpeg' ? 'jpg' : type));
    note(type.toUpperCase() + ' exportado: ' + state.value.width + ' × ' + state.value.height + ' px.');
  } catch (e) { note((e as Error).message); }
  finally { busy.value = false; }
}
void nextTick;
</script>

<template>
  <EditorShell v-model:tab="tab" app="paint" :doc="doc" :tabs="tabs" :history="false">
    <template #panel="{ tab: now }">
      <div v-if="now === 'ferramentas'" class="ed-group">
        <div class="tools" role="group" aria-label="Ferramentas de desenho">
          <button v-for="t in TOOLS" :key="t.id" type="button" class="btn tool" :aria-pressed="tool === t.id" :title="t.label + ' (' + t.key + ')'" :data-testid="'tool-' + t.id" @click="tool = t.id">{{ t.label }}</button>
        </div>
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Cor</span><input v-model="color" type="color" class="inp color" data-testid="paint-color" /></label>
          <div class="swatches" role="group" aria-label="Cores prontas">
            <button v-for="c in SWATCHES" :key="c" type="button" class="sw" :style="{ background: c }" :aria-label="'Cor ' + c" :data-testid="'sw-' + c.slice(1)" @click="color = c"></button>
          </div>
        </div>
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Tamanho ({{ size }} px)</span><input v-model.number="size" type="range" min="1" max="200" class="range" data-testid="brush-size" /></label>
          <label class="ed-field"><span class="ed-label">Opacidade ({{ opacity }}%)</span><input v-model.number="opacity" type="range" min="1" max="100" class="range" data-testid="brush-opacity" /></label>
        </div>
        <div v-if="tool === 'bucket'" class="ed-row">
          <label class="ed-field"><span class="ed-label">Tolerância ({{ tolerance }})</span><input v-model.number="tolerance" type="range" min="0" max="128" class="range" data-testid="tolerance" /></label>
          <label class="check"><input v-model="sampleAll" type="checkbox" data-testid="sample-all" /> Considerar todas as camadas</label>
        </div>
        <div v-if="tool === 'rect' || tool === 'ellipse'" class="ed-row"><label class="check"><input v-model="filled" type="checkbox" data-testid="shape-filled" /> Preencher a forma</label></div>
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!canUndo" data-testid="undo-paint" title="Ctrl+Z" @click="undo">Desfazer</button>
          <button type="button" class="btn" :disabled="!canRedo" data-testid="redo-paint" title="Ctrl+Y" @click="redo">Refazer</button>
        </div>
        <p class="ed-hint">Atalhos: B pincel · E borracha · G balde · L linha · R retângulo · O elipse · I conta-gotas · H mão · [ e ] mudam o tamanho. Com Shift, linhas ficam retas em 45° e formas viram quadrado ou círculo.</p>
      </div>
      <div v-else-if="now === 'camadas'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="add-layer" @click="addLayer()">Nova camada</button>
          <button type="button" class="btn" data-testid="clear-layer" @click="clearLayer">Limpar camada</button>
          <button type="button" class="btn" data-testid="merge-down" @click="mergeDown">Mesclar com a de baixo</button>
        </div>
        <ol class="layers" data-testid="paint-layers" aria-label="Camadas, de cima para baixo">
          <li v-for="l in topFirst" :key="l.id" :class="{ on: l.id === state.activeId }" :data-layer="l.name">
            <button type="button" class="pick" :aria-pressed="l.id === state.activeId" @click="selectLayer(l.id)">{{ l.name }}</button>
            <button type="button" class="ib" :aria-label="(l.visible ? 'Ocultar ' : 'Mostrar ') + l.name" :aria-pressed="!l.visible" @click="l.visible = !l.visible"><NavIcon :name="l.visible ? 'eye' : 'eye-off'" /></button>
            <button type="button" class="ib" :aria-label="'Subir ' + l.name" @click="moveLayer(l.id, 1)"><NavIcon name="arrow-up" /></button>
            <button type="button" class="ib" :aria-label="'Descer ' + l.name" @click="moveLayer(l.id, -1)"><NavIcon name="arrow-down" /></button>
            <button type="button" class="ib" :aria-label="'Duplicar ' + l.name" @click="duplicateLayer(l.id)"><NavIcon name="duplicate" /></button>
            <button type="button" class="ib" :aria-label="'Excluir ' + l.name" @click="removeLayer(l.id)"><NavIcon name="trash" /></button>
          </li>
        </ol>
        <template v-if="active">
          <label class="ed-field"><span class="ed-label">Nome da camada</span><input v-model="active.name" class="inp" maxlength="60" data-testid="layer-name" /></label>
          <label class="ed-field"><span class="ed-label">Opacidade da camada ({{ Math.round(active.opacity * 100) }}%)</span><input v-model.number="active.opacity" type="range" min="0" max="1" step="0.01" class="range" data-testid="layer-opacity" /></label>
        </template>
      </div>
      <div v-else-if="now === 'tela'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Largura (px)</span><input v-model.number="newW" class="inp inp-num" type="number" :min="MIN_SIDE" :max="MAX_SIDE" data-testid="canvas-w" /></label>
        <label class="ed-field"><span class="ed-label">Altura (px)</span><input v-model.number="newH" class="inp inp-num" type="number" :min="MIN_SIDE" :max="MAX_SIDE" data-testid="canvas-h" /></label>
        <button type="button" class="btn" data-testid="apply-size" @click="resizeCanvas(newW, newH)">Aplicar tamanho</button>
        <label class="check"><input v-model="scaleArt" type="checkbox" /> Esticar o desenho junto</label>
        <div class="presets" role="group" aria-label="Tamanhos prontos"><button v-for="s in SIZES" :key="s[0]" type="button" class="btn" @click="resizeCanvas(s[1], s[2])">{{ s[0] }}</button></div>
        <label class="check"><input v-model="bgTransparent" type="checkbox" data-testid="bg-transparent" /> Fundo transparente</label>
        <label v-if="!bgTransparent" class="ed-field"><span class="ed-label">Cor de fundo</span><input v-model="bgColor" class="inp color" type="color" data-testid="bg-color" /></label>
        <button type="button" class="btn" data-testid="import-layer" @click="fileInput?.click()">Importar imagem como camada</button>
        <input ref="fileInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" multiple aria-label="Escolher imagens para importar como camada" data-testid="import-input" @change="onImport" />
        <p class="ed-hint">Também dá para colar uma imagem (Ctrl+V) ou soltar arquivos sobre o desenho. Mudar o tamanho da tela pode ser desfeito.</p>
      </div>
      <FileTab v-else :templates="paintTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="busy" data-testid="export-png" @click="exportAs('png')">Baixar PNG</button>
        <button type="button" class="btn" :disabled="busy" data-testid="export-jpg" @click="exportAs('jpeg')">Baixar JPG</button>
        <button type="button" class="btn" :disabled="busy" data-testid="export-webp" @click="exportAs('webp')">Baixar WebP</button>
        <label class="ed-field"><span class="ed-label">Qualidade JPG/WebP ({{ quality }}%)</span><input v-model.number="quality" type="range" min="40" max="100" class="range" /></label>
        <template #after><p v-if="message" class="ed-hint" role="status" data-testid="paint-message">{{ message }}</p></template>
      </FileTab>
    </template>

    <div class="paint-stage" @dragover.prevent @drop.prevent="onDrop">
      <div ref="viewportEl" class="viewport" role="region" aria-label="Área de desenho" data-testid="paint-viewport">
        <div class="board" :class="{ checker: state.background === 'transparent' }" :style="{ width: state.width * scale + 'px', height: state.height * scale + 'px' }">
          <canvas ref="displayEl" class="cv" :class="{ crisp: scale > 1, grab: tool === 'hand', pick: tool === 'picker' }" :style="{ width: state.width * scale + 'px', height: state.height * scale + 'px' }" role="img"
            :aria-label="'Desenho ' + state.width + ' × ' + state.height + ' com ' + state.layers.length + ' camadas'" data-testid="paint-canvas"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"></canvas>
        </div>
      </div>
      <div class="zoombar">
        <button type="button" class="ib" aria-label="Diminuir zoom" @click="setZoom(scale * 0.8)">−</button>
        <span class="z" data-testid="zoom">{{ zoomText }}</span>
        <button type="button" class="ib" aria-label="Aumentar zoom" @click="setZoom(scale * 1.25)">+</button>
        <button type="button" class="btn small" data-testid="zoom-fit" @click="zoom = 0">Ajustar</button>
        <button type="button" class="btn small" data-testid="zoom-100" @click="zoom = 1">100%</button>
        <span class="muted dims" data-testid="paint-dims">{{ state.width }} × {{ state.height }} px · {{ active?.name }}<template v-if="cursorText"> · {{ cursorText }}</template><template v-if="message"> · {{ message }}</template></span>
      </div>
    </div>
  </EditorShell>
</template>

<style scoped>
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.range { min-width: 160px; min-height: 44px; }
.color { width: 64px; padding: 4px; }
.tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
.tool[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 -3px var(--app); }
.swatches { display: flex; flex-wrap: wrap; gap: 4px; max-width: 330px; }
.sw { width: 32px; height: 32px; min-width: 32px; padding: 0; border-radius: 8px; border: 1px solid var(--border); box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 18%, transparent); }
@media (pointer: coarse) { .sw { width: 44px; height: 44px; min-width: 44px; } }
.presets { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; }
.layers { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.layers li { display: flex; align-items: center; gap: 2px; border: 1px solid var(--border); border-radius: 10px; padding: 2px; background: var(--surface); }
.layers li.on { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); }
.pick { flex: 1; min-width: 0; min-height: 44px; text-align: left; border: 0; background: transparent; padding: 0 8px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paint-stage { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--raised); }
.viewport { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 16px; }
.board { position: relative; flex: none; box-shadow: 0 10px 30px rgb(0 0 0 / 22%); background: #fff; }
.checker { background: repeating-conic-gradient(#d9dde5 0% 25%, #fff 0% 50%) 0 0 / 20px 20px; }
.cv { display: block; touch-action: none; cursor: crosshair; }
.cv.crisp { image-rendering: pixelated; }
.cv.grab { cursor: grab; }
.cv.pick { cursor: copy; }
.zoombar { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 12px; background: var(--surface); border-top: 1px solid var(--border); flex-wrap: wrap; }
.z { min-width: 52px; text-align: center; font-weight: 700; font-size: 13px; }
.small { min-height: 36px; padding: 4px 10px; font-size: 13px; }
.dims { font-size: 12.5px; }
</style>
