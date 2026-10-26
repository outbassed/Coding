<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, safeFileName } from '../../shared/files/download';
import type { LegacyImage } from '../../storage/documents';
import { FONTS, MAX_LAYERS, MAX_SIDE, PRESETS, lid, noFilters, usedImageIds, type Filters, type Layer, type LayerKind } from './model';
import { exportComposition, hitTest, renderComposition, type Bitmaps } from './render';
import { imagesKind, imagesTemplates } from './kind';

const doc = useDocument({
  kind: imagesKind, templates: imagesTemplates, path: '/apps/imagens/', withImages: true,
  imagesFor: (state, images) => { const used = usedImageIds(state); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const tab = ref('camadas');
const tabs = [{ id: 'camadas', label: 'Camadas' }, { id: 'ajustar', label: 'Ajustar' }, { id: 'filtros', label: 'Filtros' }, { id: 'estilo', label: 'Texto e forma' }, { id: 'tela', label: 'Tela' }, { id: 'arquivo', label: 'Arquivo' }];
const selectedId = ref<string | null>(null);
const selected = computed<Layer | null>(() => state.value.layers.find((l) => l.id === selectedId.value) ?? null);
const message = ref('');
function note(text: string): void { message.value = text; doc.say(text); }

// ---- imagens (Blobs) decodificadas ----
const bitmaps = shallowRef<Bitmaps>(new Map());
const bitmapTick = ref(0);
watch(images, async (list) => {
  const map = bitmaps.value;
  for (const img of list) {
    if (map.has(img.id) || !img.blob) continue;
    try { map.set(img.id, await createImageBitmap(img.blob)); bitmapTick.value++; } catch { /* imagem corrompida: aparece como retângulo cinza */ }
  }
}, { immediate: true });

// ---- canvas e zoom ----
const stageEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const zoom = ref(0); // 0 = ajustar à tela
const box = ref({ w: 800, h: 600 });
const fitZoom = computed(() => Math.max(0.05, Math.min(4, Math.min((box.value.w - 32) / state.value.width, (box.value.h - 32) / state.value.height))));
const scale = computed(() => (zoom.value > 0 ? zoom.value : fitZoom.value));
const zoomText = computed(() => Math.round(scale.value * 100) + '%');
let ro: ResizeObserver | undefined;
function measure(): void { const el = stageEl.value; if (el) box.value = { w: el.clientWidth, h: el.clientHeight }; }
onMounted(() => { measure(); if (typeof ResizeObserver !== 'undefined' && stageEl.value) { ro = new ResizeObserver(measure); ro.observe(stageEl.value); } });
onBeforeUnmount(() => ro?.disconnect());
let frame = 0;
function draw(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const c = canvasEl.value; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(state.value.width * scale.value * dpr)), h = Math.max(1, Math.round(state.value.height * scale.value * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return;
    renderComposition(ctx, state.value, bitmaps.value, scale.value * dpr);
  });
}
watch([state, scale, bitmapTick], draw, { deep: true });
onMounted(draw);
function setZoom(v: number): void { zoom.value = Math.max(0.05, Math.min(4, v)); }

// ---- seleção e arraste ----
type Drag = { mode: 'move' | 'resize' | 'rotate'; id: string; sx: number; sy: number; ox: number; oy: number; corner?: [number, number]; start?: Layer };
let drag: Drag | null = null;
const keepRatio = ref(true);
function toDoc(event: PointerEvent): { x: number; y: number } {
  const r = canvasEl.value!.getBoundingClientRect();
  return { x: (event.clientX - r.left) / scale.value, y: (event.clientY - r.top) / scale.value };
}
function onCanvasDown(event: PointerEvent): void {
  if (!canvasEl.value) return;
  const p = toDoc(event);
  const hit = hitTest(state.value, p.x, p.y);
  selectedId.value = hit?.id ?? null;
  if (hit) {
    drag = { mode: 'move', id: hit.id, sx: p.x, sy: p.y, ox: hit.x, oy: hit.y };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
}
function onHandleDown(event: PointerEvent, mode: 'resize' | 'rotate', corner?: [number, number]): void {
  const l = selected.value; if (!l) return;
  event.stopPropagation(); event.preventDefault();
  const p = toDoc(event);
  drag = { mode, id: l.id, sx: p.x, sy: p.y, ox: l.x, oy: l.y, corner, start: JSON.parse(JSON.stringify(l)) as Layer };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function onMove(event: PointerEvent): void {
  if (!drag) return;
  const l = state.value.layers.find((x) => x.id === drag!.id); if (!l) return;
  const p = toDoc(event);
  doc.setChangeKey('drag-' + l.id);
  if (drag.mode === 'move') { l.x = Math.round(drag.ox + p.x - drag.sx); l.y = Math.round(drag.oy + p.y - drag.sy); return; }
  const s = drag.start!;
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  if (drag.mode === 'rotate') {
    let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
    if (event.shiftKey) deg = Math.round(deg / 15) * 15;
    l.rotation = Math.round(((deg + 540) % 360) - 180);
    return;
  }
  const [sx, sy] = drag.corner!;
  const a = (s.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ox = -sx * s.w / 2, oy = -sy * s.h / 2; // canto oposto (fixo), no referencial da camada
  const fx = cx + ox * cos - oy * sin, fy = cy + ox * sin + oy * cos;
  const dx = p.x - fx, dy = p.y - fy;
  let w = Math.max(8, sx * (dx * cos + dy * sin)), h = Math.max(8, sy * (-dx * sin + dy * cos));
  if ((keepRatio.value && s.kind !== 'text') !== event.shiftKey) { const ratio = s.w / s.h; if (w / h > ratio) h = w / ratio; else w = h * ratio; }
  const hx = sx * w / 2, hy = sy * h / 2;
  const ncx = fx + hx * cos - hy * sin, ncy = fy + hx * sin + hy * cos;
  l.w = Math.round(w); l.h = Math.round(h); l.x = Math.round(ncx - w / 2); l.y = Math.round(ncy - h / 2);
}
function onUp(): void { drag = null; }
onMounted(() => { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp); });
onBeforeUnmount(() => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); });
const frameStyle = computed(() => {
  const l = selected.value; if (!l) return null;
  return { left: l.x * scale.value + 'px', top: l.y * scale.value + 'px', width: l.w * scale.value + 'px', height: l.h * scale.value + 'px', transform: 'rotate(' + l.rotation + 'deg)' };
});
function onStageKey(event: KeyboardEvent): void {
  const l = selected.value; if (!l) return;
  const t = event.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
  const step = event.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[event.key];
  if (m) { event.preventDefault(); doc.setChangeKey('key-' + l.id); l.x += m[0]; l.y += m[1]; }
  else if (event.key === 'Delete') { event.preventDefault(); removeLayer(l.id); }
}

// ---- camadas ----
function addLayer(kind: Exclude<LayerKind, 'image'>): void {
  if (state.value.layers.length >= MAX_LAYERS) { note('Limite de ' + MAX_LAYERS + ' camadas.'); return; }
  const W = state.value.width, H = state.value.height;
  const w = Math.round(W * (kind === 'text' ? 0.7 : 0.4)), h = Math.round(kind === 'text' ? H * 0.15 : w * (kind === 'ellipse' ? 1 : 0.6));
  const base: Layer = { id: lid(), name: kind === 'text' ? 'Texto' : kind === 'rect' ? 'Retângulo' : 'Elipse', kind, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0, flipX: false, flipY: false, opacity: 1, visible: true, filters: noFilters() };
  if (kind === 'text') Object.assign(base, { text: 'Seu texto aqui', font: 'Arial', size: Math.max(16, Math.round(H / 16)), color: '#141922', bold: true, italic: false, align: 'center' });
  else Object.assign(base, { fill: kind === 'rect' ? '#4c8df6' : '#f5b820', stroke: '#141922', strokeWidth: 0, radius: 0 });
  state.value.layers.push(base);
  selectedId.value = base.id;
  note(base.name + ' adicionado.');
}
const fileInput = ref<HTMLInputElement | null>(null);
const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_PIXELS = 120_000_000;
const NATIVE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Re-codifica um formato que o app não guarda direto (GIF, BMP, AVIF…) como PNG, preservando a transparência. */
async function toPng(bmp: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.drawImage(bmp, 0, 0);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao converter a imagem.'))), 'image/png'));
}

/**
 * Entrada única de imagens (botão, Ctrl+V, botão Colar e arrastar): valida, decodifica, guarda o arquivo na Biblioteca
 * e cria uma camada. Devolve se a camada foi criada.
 */
async function addImageBlob(file: Blob, rawName: string, convertOthers = false): Promise<boolean> {
  const name = rawName || 'Imagem';
  if (file.type === 'image/svg+xml') { note('SVG não é aceito como camada. Exporte como PNG, JPG ou WebP.'); return false; }
  const native = NATIVE_TYPES.includes(file.type);
  if (!native && !(convertOthers && file.type.startsWith('image/'))) { note('“' + name + '” não é PNG, JPG ou WebP.'); return false; }
  if (file.size > MAX_IMAGE) { note('“' + name + '” passa de 25 MB.'); return false; }
  if (state.value.layers.length >= MAX_LAYERS) { note('Limite de ' + MAX_LAYERS + ' camadas.'); return false; }
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { note('Não foi possível abrir “' + name + '”. O arquivo pode estar corrompido ou ter um formato sem suporte neste navegador.'); return false; }
  if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close(); note('“' + name + '” é grande demais (mais de 120 megapixels).'); return false; }
  let stored: Blob = file;
  if (!native) {
    try { stored = await toPng(bmp); } catch { bmp.close(); note('Não foi possível converter “' + name + '” para PNG.'); return false; }
  }
  const id = 'img-' + crypto.randomUUID();
  bitmaps.value.set(id, bmp);
  const image: LegacyImage = { id, docId: '', blob: stored, mime: stored.type, name: name.slice(0, 120) };
  images.value = [...images.value, image];
  if (!state.value.layers.length) {
    // primeira foto: a tela assume o tamanho dela (limitado a 6000 px)
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    state.value.width = Math.max(16, Math.round(bmp.width * k)); state.value.height = Math.max(16, Math.round(bmp.height * k));
  }
  const fit = Math.min(1, (state.value.width * 0.9) / bmp.width, (state.value.height * 0.9) / bmp.height);
  const full = !state.value.layers.length;
  const w = Math.round(full ? state.value.width : bmp.width * fit), h = Math.round(full ? state.value.height : bmp.height * fit);
  state.value.layers.push({ id: lid(), name: name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imagem', kind: 'image', imageId: id, crop: { x: 0, y: 0, w: 1, h: 1 }, x: Math.round((state.value.width - w) / 2), y: Math.round((state.value.height - h) / 2), w, h, rotation: 0, flipX: false, flipY: false, opacity: 1, visible: true, filters: noFilters() });
  selectedId.value = state.value.layers[state.value.layers.length - 1]!.id;
  bitmapTick.value++;
  note('Imagem “' + name + '” adicionada como camada.');
  return true;
}
async function onImageFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = '';
  for (const file of files) { if (state.value.layers.length >= MAX_LAYERS) { note('Limite de ' + MAX_LAYERS + ' camadas.'); break; } await addImageBlob(file, file.name); }
}

// ---- colar (Ctrl+V), botão Colar e arrastar ----
/** Campos em que Ctrl+V deve continuar colando texto normalmente. */
function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes((el as HTMLInputElement).type);
  return el.isContentEditable;
}
function imagesIn(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const f = item.getAsFile(); if (f) out.push(f);
  }
  if (!out.length) for (const f of Array.from(data.files ?? [])) if (f.type.startsWith('image/')) out.push(f);
  return out;
}
let pasting = false;
async function addAll(files: File[], fallbackName: string): Promise<void> {
  if (pasting) return;
  pasting = true;
  try {
    let n = 0;
    for (const f of files) { if (await addImageBlob(f, f.name && f.name !== 'image.png' ? f.name : fallbackName, true)) n++; }
    if (n > 1) note(n + ' imagens adicionadas como camadas.');
  } finally { pasting = false; }
}
function onPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || isTextTarget(event.target)) return; // não rouba o Ctrl+V de campos de texto
  const files = imagesIn(event.clipboardData);
  if (!files.length) return; // texto puro: nada a fazer aqui
  event.preventDefault();
  void addAll(files, 'Imagem colada');
}
async function pasteFromClipboard(): Promise<void> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') { note('Este navegador não deixa o app ler a área de transferência. Copie a imagem e use Ctrl+V (⌘V no Mac) com a área da imagem selecionada.'); return; }
  try {
    const items = await navigator.clipboard.read();
    let n = 0;
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/')); if (!type) continue;
      const blob = await item.getType(type);
      if (await addImageBlob(blob, 'Imagem colada', true)) n++;
    }
    if (!n) note('Não há imagem na área de transferência. Copie uma imagem e tente de novo.');
  } catch { note('O navegador não permitiu ler a área de transferência. Libere a permissão ou use Ctrl+V (⌘V no Mac).'); }
}
function onDrop(event: DragEvent): void {
  const files = imagesIn(event.dataTransfer);
  if (!files.length) { note('Solte arquivos de imagem (PNG, JPG ou WebP).'); return; }
  void addAll(files, 'Imagem');
}
onMounted(() => window.addEventListener('paste', onPaste));
onBeforeUnmount(() => window.removeEventListener('paste', onPaste));
function removeLayer(id: string): void {
  const i = state.value.layers.findIndex((l) => l.id === id); if (i < 0) return;
  state.value.layers.splice(i, 1);
  selectedId.value = state.value.layers[Math.min(i, state.value.layers.length - 1)]?.id ?? null;
  note('Camada removida. Use Desfazer para recuperar.');
}
function duplicateLayer(id: string): void {
  const l = state.value.layers.find((x) => x.id === id); if (!l || state.value.layers.length >= MAX_LAYERS) return;
  const copy = JSON.parse(JSON.stringify(l)) as Layer;
  copy.id = lid(); copy.name = (l.name + ' (cópia)').slice(0, 60); copy.x += 24; copy.y += 24;
  state.value.layers.splice(state.value.layers.indexOf(l) + 1, 0, copy); selectedId.value = copy.id;
}
function moveLayer(id: string, dir: 1 | -1 | 'top' | 'bottom'): void {
  const list = state.value.layers; const i = list.findIndex((l) => l.id === id); if (i < 0) return;
  const [l] = list.splice(i, 1);
  const to = dir === 'top' ? list.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(list.length, i + dir));
  list.splice(to, 0, l!);
}
const topFirst = computed(() => [...state.value.layers].reverse());

// ---- ajustes ----
function setFilter(k: keyof Filters, v: number): void { const l = selected.value; if (!l) return; doc.setChangeKey('f-' + k + l.id); l.filters[k] = v; }
function applyPreset(id: string): void { const l = selected.value; const p = PRESETS.find((x) => x.id === id); if (!l || !p) return; l.filters = { ...noFilters(), ...p.f }; }
const cropPct = (k: 'left' | 'top' | 'right' | 'bottom'): number => {
  const c = selected.value?.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return Math.round((k === 'left' ? c.x : k === 'top' ? c.y : k === 'right' ? 1 - c.x - c.w : 1 - c.y - c.h) * 100);
};
function setCrop(k: 'left' | 'top' | 'right' | 'bottom', pct: number): void {
  const l = selected.value; if (!l?.crop) return;
  doc.setChangeKey('crop-' + k + l.id);
  const c = { ...l.crop }; const v = Math.max(0, Math.min(95, pct)) / 100;
  const right = 1 - c.x - c.w, bottom = 1 - c.y - c.h;
  const oldW = c.w, oldH = c.h;
  if (k === 'left') c.x = Math.min(v, 1 - right - 0.05);
  if (k === 'top') c.y = Math.min(v, 1 - bottom - 0.05);
  if (k === 'right') c.w = Math.max(0.05, 1 - c.x - v); else c.w = Math.max(0.05, 1 - c.x - right);
  if (k === 'bottom') c.h = Math.max(0.05, 1 - c.y - v); else c.h = Math.max(0.05, 1 - c.y - bottom);
  // a camada mantém a escala da imagem: o tamanho na tela acompanha o recorte
  l.w = Math.max(8, Math.round(l.w * (c.w / oldW))); l.h = Math.max(8, Math.round(l.h * (c.h / oldH)));
  l.crop = c;
}
function resetCrop(): void { const l = selected.value; if (!l?.crop) return; const c = l.crop; l.w = Math.round(l.w / c.w); l.h = Math.round(l.h / c.h); l.crop = { x: 0, y: 0, w: 1, h: 1 }; }
function rotate90(dir: 1 | -1): void { const l = selected.value; if (l) l.rotation = ((l.rotation + dir * 90 + 540) % 360) - 180; }
function centerLayer(): void { const l = selected.value; if (l) { l.x = Math.round((state.value.width - l.w) / 2); l.y = Math.round((state.value.height - l.h) / 2); } }
function fillCanvas(): void { const l = selected.value; if (!l) return; l.rotation = 0; l.x = 0; l.y = 0; l.w = state.value.width; l.h = state.value.height; }
function canvasToLayer(): void { const l = selected.value; if (!l || l.rotation) { note('Funciona com uma camada sem rotação.'); return; } const dx = l.x, dy = l.y; state.value.width = Math.max(16, Math.min(MAX_SIDE, l.w)); state.value.height = Math.max(16, Math.min(MAX_SIDE, l.h)); for (const x of state.value.layers) { x.x -= dx; x.y -= dy; } note('Tela recortada na camada selecionada.'); }
const SIZES: [string, number, number][] = [['Quadrado 1080', 1080, 1080], ['Retrato 4:5', 1080, 1350], ['Story 9:16', 1080, 1920], ['HD 16:9', 1920, 1080], ['A4 (150 dpi)', 1240, 1754]];
const newW = ref(state.value.width), newH = ref(state.value.height);
watch(() => [state.value.width, state.value.height], ([w, h]) => { newW.value = w!; newH.value = h!; });
const scaleContent = ref(false);
function resizeCanvas(w: number, h: number): void {
  const W = Math.round(Math.max(16, Math.min(MAX_SIDE, w))), H = Math.round(Math.max(16, Math.min(MAX_SIDE, h)));
  if (scaleContent.value) { const kx = W / state.value.width, ky = H / state.value.height; for (const l of state.value.layers) { l.x = Math.round(l.x * kx); l.y = Math.round(l.y * ky); l.w = Math.round(l.w * kx); l.h = Math.round(l.h * ky); if (l.size) l.size = Math.max(6, Math.round(l.size * Math.min(kx, ky))); } }
  state.value.width = W; state.value.height = H;
  note('Tela: ' + W + ' × ' + H + ' px.');
}
const bgTransparent = computed({ get: () => state.value.background === 'transparent', set: (v: boolean) => { state.value.background = v ? 'transparent' : '#ffffff'; } });
const bgColor = computed({ get: () => (state.value.background === 'transparent' ? '#ffffff' : state.value.background), set: (v: string) => { state.value.background = v; } });

// ---- exportar ----
const quality = ref(90);
const busy = ref(false);
async function exportAs(type: 'png' | 'jpeg' | 'webp'): Promise<void> {
  busy.value = true;
  try {
    const blob = await exportComposition(state.value, bitmaps.value, type, quality.value / 100);
    downloadBlob(blob, safeFileName(state.value.name, 'imagem') + '.' + (type === 'jpeg' ? 'jpg' : type));
    note(type.toUpperCase() + ' exportado: ' + state.value.width + ' × ' + state.value.height + ' px.');
  } catch (e) { note((e as Error).message); }
  finally { busy.value = false; }
}
void nextTick;
</script>

<template>
  <EditorShell v-model:tab="tab" app="images" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'camadas'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="add-image" @click="fileInput?.click()">Adicionar imagem</button>
          <input ref="fileInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" multiple aria-label="Escolher imagens PNG, JPG ou WebP" data-testid="image-input" @change="onImageFile" />
          <button type="button" class="btn" data-testid="paste-image" title="Ctrl+V" @click="pasteFromClipboard">Colar imagem</button>
          <button type="button" class="btn" data-testid="add-text" @click="addLayer('text')">Texto</button>
          <button type="button" class="btn" data-testid="add-rect" @click="addLayer('rect')">Retângulo</button>
          <button type="button" class="btn" @click="addLayer('ellipse')">Elipse</button>
        </div>
        <ol class="layers" data-testid="layers" aria-label="Camadas, de cima para baixo">
          <li v-for="l in topFirst" :key="l.id" :class="{ on: l.id === selectedId }">
            <button type="button" class="pick" :aria-pressed="l.id === selectedId" @click="selectedId = l.id">{{ l.name || 'Camada' }} <small class="muted">· {{ { image: 'imagem', text: 'texto', rect: 'retângulo', ellipse: 'elipse' }[l.kind] }}</small></button>
            <button type="button" class="ib" :aria-label="(l.visible ? 'Ocultar ' : 'Mostrar ') + l.name" :aria-pressed="!l.visible" @click="l.visible = !l.visible"><NavIcon :name="l.visible ? 'eye' : 'eye-off'" /></button>
            <button type="button" class="ib" :aria-label="'Subir ' + l.name" @click="moveLayer(l.id, 1)"><NavIcon name="arrow-up" /></button>
            <button type="button" class="ib" :aria-label="'Descer ' + l.name" @click="moveLayer(l.id, -1)"><NavIcon name="arrow-down" /></button>
            <button type="button" class="ib" :aria-label="'Duplicar ' + l.name" @click="duplicateLayer(l.id)"><NavIcon name="duplicate" /></button>
            <button type="button" class="ib" :aria-label="'Excluir ' + l.name" @click="removeLayer(l.id)"><NavIcon name="trash" /></button>
          </li>
        </ol>
        <p v-if="!state.layers.length" class="ed-hint">Sem camadas: adicione uma imagem, um texto ou uma forma. Também dá para colar uma imagem copiada (Ctrl+V) ou arrastar arquivos para a área da imagem.</p>
        <label v-if="selected" class="ed-field"><span class="ed-label">Nome da camada</span><input v-model="selected.name" class="inp" maxlength="60" /></label>
      </div>
      <template v-else-if="!selected && current !== 'tela' && current !== 'arquivo'"><p class="ed-hint">Selecione uma camada na imagem ou na aba Camadas.</p></template>
      <div v-else-if="current === 'ajustar' && selected" class="ed-row">
        <label class="ed-field"><span class="ed-label">X</span><input v-model.number="selected.x" class="inp inp-num" type="number" /></label>
        <label class="ed-field"><span class="ed-label">Y</span><input v-model.number="selected.y" class="inp inp-num" type="number" /></label>
        <label class="ed-field"><span class="ed-label">Largura</span><input v-model.number="selected.w" class="inp inp-num" type="number" min="1" data-testid="layer-w" /></label>
        <label class="ed-field"><span class="ed-label">Altura</span><input v-model.number="selected.h" class="inp inp-num" type="number" min="1" data-testid="layer-h" /></label>
        <label class="ed-field"><span class="ed-label">Rotação ({{ selected.rotation }}°)</span><input v-model.number="selected.rotation" type="range" min="-180" max="180" class="range" data-testid="rotation" /></label>
        <label class="ed-field"><span class="ed-label">Opacidade ({{ Math.round(selected.opacity * 100) }}%)</span><input v-model.number="selected.opacity" type="range" min="0" max="1" step="0.01" class="range" /></label>
        <button type="button" class="btn" @click="rotate90(-1)">Girar −90°</button>
        <button type="button" class="btn" data-testid="rotate90" @click="rotate90(1)">Girar +90°</button>
        <button type="button" class="btn" :aria-pressed="selected.flipX" data-testid="flip-x" @click="selected.flipX = !selected.flipX">Espelhar ↔</button>
        <button type="button" class="btn" :aria-pressed="selected.flipY" @click="selected.flipY = !selected.flipY">Espelhar ↕</button>
        <button type="button" class="btn" @click="centerLayer">Centralizar</button>
        <button type="button" class="btn" @click="fillCanvas">Preencher a tela</button>
        <label class="check"><input v-model="keepRatio" type="checkbox" /> Manter proporção ao redimensionar</label>
        <template v-if="selected.kind === 'image'">
          <span class="ed-label wide">Recorte (% de cada borda)</span>
          <label v-for="k in (['left', 'top', 'right', 'bottom'] as const)" :key="k" class="ed-field"><span class="ed-label">{{ { left: 'Esquerda', top: 'Topo', right: 'Direita', bottom: 'Base' }[k] }}</span>
            <input type="number" class="inp inp-num" min="0" max="95" :value="cropPct(k)" :data-testid="'crop-' + k" @change="setCrop(k, Number(($event.target as HTMLInputElement).value))" /></label>
          <button type="button" class="btn" @click="resetCrop">Desfazer recorte</button>
        </template>
      </div>
      <div v-else-if="current === 'filtros' && selected" class="ed-row">
        <div class="presets" role="group" aria-label="Filtros prontos"><button v-for="p in PRESETS" :key="p.id" type="button" class="btn" :data-preset="p.id" @click="applyPreset(p.id)">{{ p.name }}</button></div>
        <label v-for="f in ([['brightness', 'Brilho', 0, 200, '%'], ['contrast', 'Contraste', 0, 200, '%'], ['saturation', 'Saturação', 0, 200, '%'], ['grayscale', 'Preto e branco', 0, 100, '%'], ['sepia', 'Sépia', 0, 100, '%'], ['hue', 'Matiz', -180, 180, '°'], ['blur', 'Desfoque', 0, 20, 'px']] as const)" :key="f[0]" class="ed-field">
          <span class="ed-label">{{ f[1] }} ({{ selected.filters[f[0]] }}{{ f[4] }})</span>
          <input type="range" class="range" :min="f[2]" :max="f[3]" :value="selected.filters[f[0]]" :data-testid="'filter-' + f[0]" @input="setFilter(f[0], Number(($event.target as HTMLInputElement).value))" /></label>
      </div>
      <div v-else-if="current === 'estilo' && selected" class="ed-row">
        <template v-if="selected.kind === 'text'">
          <label class="ed-field wide"><span class="ed-label">Texto</span><textarea v-model="selected.text" class="inp" rows="3" maxlength="2000" data-testid="layer-text" @input="doc.setChangeKey('t' + selected.id)"></textarea></label>
          <label class="ed-field"><span class="ed-label">Fonte</span><select v-model="selected.font" class="inp"><option v-for="f in FONTS" :key="f" :value="f">{{ f }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Tamanho (px)</span><input v-model.number="selected.size" class="inp inp-num" type="number" min="6" max="800" /></label>
          <label class="ed-field"><span class="ed-label">Cor</span><input v-model="selected.color" class="inp color" type="color" /></label>
          <button type="button" class="ib b" :aria-pressed="selected.bold" aria-label="Negrito" @click="selected.bold = !selected.bold"><b>N</b></button>
          <button type="button" class="ib b" :aria-pressed="selected.italic" aria-label="Itálico" @click="selected.italic = !selected.italic"><i>I</i></button>
          <label class="ed-field"><span class="ed-label">Alinhamento</span><select v-model="selected.align" class="inp"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
        </template>
        <template v-else-if="selected.kind !== 'image'">
          <label class="check"><input type="checkbox" :checked="selected.fill === 'transparent'" @change="selected.fill = ($event.target as HTMLInputElement).checked ? 'transparent' : '#4c8df6'" /> Sem preenchimento</label>
          <label v-if="selected.fill !== 'transparent'" class="ed-field"><span class="ed-label">Preenchimento</span><input v-model="selected.fill" class="inp color" type="color" data-testid="shape-fill" /></label>
          <label class="ed-field"><span class="ed-label">Contorno</span><input v-model="selected.stroke" class="inp color" type="color" /></label>
          <label class="ed-field"><span class="ed-label">Espessura</span><input v-model.number="selected.strokeWidth" class="inp inp-num" type="number" min="0" max="200" /></label>
          <label v-if="selected.kind === 'rect'" class="ed-field"><span class="ed-label">Cantos arredondados</span><input v-model.number="selected.radius" class="inp inp-num" type="number" min="0" max="2000" /></label>
        </template>
        <p v-else class="ed-hint">Imagens usam as abas Ajustar e Filtros.</p>
      </div>
      <div v-else-if="current === 'tela'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Largura (px)</span><input v-model.number="newW" class="inp inp-num" type="number" min="16" :max="MAX_SIDE" data-testid="canvas-w" /></label>
        <label class="ed-field"><span class="ed-label">Altura (px)</span><input v-model.number="newH" class="inp inp-num" type="number" min="16" :max="MAX_SIDE" data-testid="canvas-h" /></label>
        <button type="button" class="btn" data-testid="apply-size" @click="resizeCanvas(newW, newH)">Aplicar tamanho</button>
        <label class="check"><input v-model="scaleContent" type="checkbox" /> Redimensionar o conteúdo junto</label>
        <div class="presets wide" role="group" aria-label="Tamanhos prontos"><button v-for="s in SIZES" :key="s[0]" type="button" class="btn" @click="resizeCanvas(s[1], s[2])">{{ s[0] }}</button></div>
        <label class="check"><input v-model="bgTransparent" type="checkbox" /> Fundo transparente</label>
        <label v-if="!bgTransparent" class="ed-field"><span class="ed-label">Cor de fundo</span><input v-model="bgColor" class="inp color" type="color" /></label>
        <button type="button" class="btn" :disabled="!selected" @click="canvasToLayer">Recortar a tela na camada</button>
      </div>
      <FileTab v-else :templates="imagesTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="busy" data-testid="export-png" @click="exportAs('png')">Baixar PNG</button>
        <button type="button" class="btn" :disabled="busy" data-testid="export-jpg" @click="exportAs('jpeg')">Baixar JPG</button>
        <button type="button" class="btn" :disabled="busy" data-testid="export-webp" @click="exportAs('webp')">Baixar WebP</button>
        <label class="ed-field"><span class="ed-label">Qualidade JPG/WebP ({{ quality }}%)</span><input v-model.number="quality" type="range" min="40" max="100" class="range" /></label>
      </FileTab>
    </template>

    <div class="img-stage">
      <div ref="stageEl" class="viewport" tabindex="0" role="region" aria-label="Área da imagem. Setas movem a camada selecionada; Delete exclui." data-testid="image-viewport" @keydown="onStageKey" @dragover.prevent @drop.prevent="onDrop">
        <div class="board" :style="{ width: state.width * scale + 'px', height: state.height * scale + 'px' }" :class="{ checker: state.background === 'transparent' }">
          <canvas ref="canvasEl" class="cv" :style="{ width: state.width * scale + 'px', height: state.height * scale + 'px' }" role="img" :aria-label="'Composição ' + state.width + ' × ' + state.height + ' com ' + state.layers.length + ' camadas'" data-testid="image-canvas" @pointerdown="onCanvasDown"></canvas>
          <div v-if="frameStyle" class="frame" :style="frameStyle" data-testid="selection-frame">
            <span v-for="h in ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][])" :key="h.join()" class="handle" :style="{ left: h[0] < 0 ? '-11px' : 'calc(100% - 11px)', top: h[1] < 0 ? '-11px' : 'calc(100% - 11px)' }" :data-handle="h.join(',')" @pointerdown="onHandleDown($event, 'resize', h)"></span>
            <span class="rot" data-handle="rotate" title="Girar" @pointerdown="onHandleDown($event, 'rotate')"></span>
          </div>
        </div>
      </div>
      <div class="zoombar">
        <button type="button" class="ib" aria-label="Diminuir zoom" @click="setZoom(scale * 0.8)">−</button>
        <span class="z" data-testid="zoom">{{ zoomText }}</span>
        <button type="button" class="ib" aria-label="Aumentar zoom" @click="setZoom(scale * 1.25)">+</button>
        <button type="button" class="btn small" @click="zoom = 0">Ajustar</button>
        <button type="button" class="btn small" @click="zoom = 1">100%</button>
        <span class="muted dims">{{ state.width }} × {{ state.height }} px<template v-if="message"> · {{ message }}</template></span>
      </div>
    </div>
  </EditorShell>
</template>

<style scoped>
.wide { flex-basis: 100%; }
.range { min-width: 160px; min-height: 44px; }
.color { width: 64px; padding: 4px; }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.layers { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.layers li { display: flex; align-items: center; gap: 2px; border: 1px solid var(--border); border-radius: 10px; padding: 2px; background: var(--surface); }
.layers li.on { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); }
.pick { flex: 1; min-width: 0; min-height: 44px; text-align: left; border: 0; background: transparent; padding: 0 8px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b { border: 1px solid var(--border); }
.img-stage { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--raised); }
.viewport { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 16px; outline: none; }
.viewport:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.board { position: relative; box-shadow: 0 10px 30px rgb(0 0 0 / 22%); flex: none; }
.checker { background: repeating-conic-gradient(#d9dde5 0% 25%, #fff 0% 50%) 0 0 / 20px 20px; }
.cv { display: block; touch-action: none; cursor: default; }
.frame { position: absolute; border: 2px solid var(--accent); box-sizing: border-box; pointer-events: none; transform-origin: center; }
.handle { position: absolute; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid var(--accent); box-sizing: border-box; pointer-events: auto; touch-action: none; cursor: nwse-resize; }
.rot { position: absolute; left: calc(50% - 11px); top: -44px; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); pointer-events: auto; touch-action: none; cursor: grab; }
.rot::after { content: ""; position: absolute; left: 10px; top: 22px; width: 2px; height: 20px; background: var(--accent); }
.zoombar { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 12px; background: var(--surface); border-top: 1px solid var(--border); flex-wrap: wrap; }
.z { min-width: 52px; text-align: center; font-weight: 700; font-size: 13px; }
.small { min-height: 36px; padding: 4px 10px; font-size: 13px; }
.dims { font-size: 12.5px; }
</style>
