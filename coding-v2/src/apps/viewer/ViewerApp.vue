<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob } from '../../shared/files/download';
import { formatBytes } from '../../shared/bytes';
import { forgetDoc, viewDoc } from '../pdf/engine';
import type { LegacyImage } from '../../storage/documents';
import { detectKind, KIND_LABELS, mimeFor, type ViewKind } from './kinds';
import { countLines, decodeText, hexDump, MAX_FILE_BYTES, MAX_FILES, prettyJson, type ViewerFile } from './model';
import { boundsOf, defaultCamera, drawMesh, parseModel, type Bounds, type Camera, type Mesh } from './mesh';
import { sanitizeSvg } from './svg';
import { viewerKind, viewerTemplates } from './kind';
import { createDoc } from '../../editors/docs';
import { useAppsStore } from '../../stores/apps';
import { codeKind } from '../code/kind';
import { cleanPath, isTextPath, normalizeCode } from '../code/model';

const doc = useDocument({
  kind: viewerKind, templates: viewerTemplates, path: '/apps/visualizador/', withImages: true,
  imagesFor: (state, images) => { const used = new Set(state.files.map((f) => f.blobId)); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const tabs = [{ id: 'arquivos', label: 'Arquivos' }, { id: 'exibicao', label: 'Exibição' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('arquivos');
const message = ref('');
const problem = ref('');
function ok(text: string): void { message.value = text; problem.value = ''; doc.say(text); }
function fail(text: string): void { problem.value = text; message.value = ''; doc.say(text); }

// ---------------------------------------------------------------- arquivos do projeto
const current = computed<ViewerFile | null>(() => state.value.files.find((f) => f.id === state.value.activeId) ?? null);
const currentBlob = computed<Blob | null>(() => images.value.find((i) => i.id === current.value?.blobId)?.blob ?? null);
const fileInput = ref<HTMLInputElement | null>(null);

async function addFiles(list: File[]): Promise<void> {
  let added = 0;
  for (const file of list) {
    if (state.value.files.length >= MAX_FILES) { fail('Um projeto aceita até ' + MAX_FILES + ' arquivos. Remova algum para abrir outro.'); break; }
    if (file.size > MAX_FILE_BYTES) { fail('“' + file.name + '” passa de ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB.'); continue; }
    try {
      const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
      const kind = detectKind(file.name, head);
      const mime = mimeFor(kind, file.name, file.type);
      const blobId = 'viewer-' + crypto.randomUUID();
      const image: LegacyImage = { id: blobId, docId: '', blob: new Blob([file], { type: mime }), mime, name: file.name.slice(0, 160) };
      images.value = [...images.value, image];
      const entry: ViewerFile = { id: 'f' + crypto.randomUUID().slice(0, 12), name: file.name.slice(0, 160) || 'arquivo', kind, mime, size: file.size, blobId };
      state.value.files.push(entry);
      state.value.activeId = entry.id;
      added++;
    } catch { fail('Não foi possível ler “' + file.name + '”.'); }
  }
  if (added) ok(added === 1 ? 'Arquivo aberto.' : added + ' arquivos abertos.');
}
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = '';
  await addFiles(files);
}
function removeFile(id: string): void {
  const i = state.value.files.findIndex((f) => f.id === id); if (i < 0) return;
  const [gone] = state.value.files.splice(i, 1);
  if (gone) { images.value = images.value.filter((x) => x.id !== gone.blobId); forgetDoc(gone.blobId); }
  if (state.value.activeId === id) state.value.activeId = state.value.files[Math.min(i, state.value.files.length - 1)]?.id ?? '';
  ok('Arquivo removido do projeto. O original no seu aparelho não foi alterado.');
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
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  void addFiles(files.map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], 'imagem-colada.png', { type: f.type }))));
}
function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) { fail('Solte arquivos aqui para abri-los.'); return; }
  void addFiles(files);
}
onMounted(() => window.addEventListener('paste', onPaste));
onBeforeUnmount(() => window.removeEventListener('paste', onPaste));
function downloadCurrent(): void {
  const f = current.value, b = currentBlob.value;
  if (!f || !b) return;
  downloadBlob(b, f.name);
  ok('“' + f.name + '” baixado como estava.');
}

// ---------------------------------------------------------------- navegação, filtro, tela cheia e apresentação
const filter = ref('');
const shownFiles = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return q ? state.value.files.filter((f) => f.name.toLowerCase().includes(q) || KIND_LABELS[f.kind].toLowerCase().includes(q)) : state.value.files;
});
const position = computed(() => state.value.files.findIndex((f) => f.id === state.value.activeId));
function step(delta: number): void {
  const n = state.value.files.length;
  if (n < 2) return;
  state.value.activeId = state.value.files[(((position.value < 0 ? 0 : position.value) + delta) % n + n) % n]!.id;
}
const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
const fullscreenOn = ref(false);
function onFullscreenChange(): void { fullscreenOn.value = !!document.fullscreenElement && document.fullscreenElement === stage.value; }
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange));
async function toggleFullscreen(): Promise<void> {
  const el = stage.value; if (!el) return;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await el.requestFullscreen(); }
  catch { fail('O navegador não permitiu a tela cheia.'); }
}
const slides = computed(() => state.value.files.filter((f) => f.kind === 'image' || f.kind === 'svg'));
const playing = ref(false);
const slideSeconds = ref(3);
let slideTimer: ReturnType<typeof setInterval> | undefined;
function advanceSlide(): void {
  const list = slides.value;
  if (list.length < 2) { playing.value = false; return; }
  const i = list.findIndex((f) => f.id === state.value.activeId);
  state.value.activeId = list[(i + 1) % list.length]!.id;
}
function toggleSlideshow(): void {
  if (playing.value) { playing.value = false; ok('Apresentação parada.'); return; }
  if (slides.value.length < 2) { fail('Abra pelo menos duas imagens para fazer uma apresentação.'); return; }
  if (!slides.value.some((f) => f.id === state.value.activeId)) state.value.activeId = slides.value[0]!.id;
  playing.value = true; ok('Apresentação iniciada: troca de imagem a cada ' + slideSeconds.value + ' s. Esc para parar.');
}
watch([playing, slideSeconds], () => {
  clearInterval(slideTimer);
  if (playing.value) slideTimer = setInterval(advanceSlide, slideSeconds.value * 1000);
});
watch(() => slides.value.length, (n) => { if (n < 2) playing.value = false; });
function onEscape(event: KeyboardEvent): void { if (event.key === 'Escape' && playing.value) { playing.value = false; ok('Apresentação parada.'); } }
onMounted(() => window.addEventListener('keydown', onEscape));
onBeforeUnmount(() => { window.removeEventListener('keydown', onEscape); clearInterval(slideTimer); });

// ---------------------------------------------------------------- abrir em outro app (cópia; o original continua aqui)
const apps = useAppsStore();
const codeName = computed(() => (current.value && (current.value.kind === 'text' || current.value.kind === 'svg') ? cleanPath(current.value.name) : null));
const canOpenInCode = computed(() => !!codeName.value && isTextPath(codeName.value));
async function openInCode(): Promise<void> {
  const f = current.value, b = currentBlob.value, path = codeName.value;
  if (!f || !b || !path) return;
  try {
    const decoded = decodeText(new Uint8Array(await b.arrayBuffer()));
    if (decoded.truncated) { fail('“' + f.name + '” é grande demais para o Código (passa de 4 MB).'); return; }
    const project = normalizeCode({ name: f.name.slice(0, 80), files: [{ path, text: decoded.text.replace(/\r\n?/g, '\n') }], active: path, open: [path] });
    const created = await createDoc(codeKind, project);
    await doc.saveNow();
    location.assign('/apps/codigo/?doc=' + encodeURIComponent(created.id));
  } catch { fail('Não foi possível criar o projeto no Código.'); }
}

// ---------------------------------------------------------------- preparo do arquivo atual
const url = ref('');           // imagem, vídeo e áudio (objeto) ou SVG saneado
const textBody = ref('');
const textInfo = ref({ encoding: '', truncated: false, lines: 0 });
const hex = ref('');
const extra = ref('');         // dimensões, duração, páginas, triângulos…
const loading = ref(false);
let seq = 0;
function revoke(): void { if (url.value) { URL.revokeObjectURL(url.value); url.value = ''; } }

// 3D
const mesh = shallowRef<Mesh | null>(null);
const bounds = shallowRef<Bounds | null>(null);
const camera = ref<Camera>(defaultCamera());
const wire = ref(false);
const modelColor = ref<'azul' | 'cinza' | 'laranja' | 'verde'>('azul');
const COLORS: Record<string, [number, number, number]> = { azul: [90, 150, 245], cinza: [190, 195, 205], laranja: [245, 160, 70], verde: [90, 200, 140] };
const canvas3d = ref<HTMLCanvasElement | null>(null);
const stage = ref<HTMLElement | null>(null);
// PDF
const pdfCanvas = ref<HTMLCanvasElement | null>(null);
const pdfPage = ref(1);
const pdfPages = ref(0);
const pdfZoom = ref(1);
let pdfTask: { cancel(): void } | null = null;
// imagem
const zoom = ref(0);
const turn = ref(0);
const backdrop = ref<'xadrez' | 'claro' | 'escuro'>('xadrez');
const natural = ref({ w: 0, h: 0 });
// texto
const wrap = ref(true);
const gutter = ref(true);
const fontSize = ref(14);
// mídia
const rate = ref(1);
const loop = ref(false);

function resetView(): void {
  mesh.value = null; bounds.value = null; camera.value = defaultCamera(); extra.value = ''; textBody.value = ''; hex.value = '';
  pdfPage.value = 1; pdfPages.value = 0; zoom.value = 0; turn.value = 0; natural.value = { w: 0, h: 0 }; problem.value = '';
}
async function prepare(): Promise<void> {
  const mine = ++seq;
  revoke(); resetView();
  const f = current.value, blob = currentBlob.value;
  if (pdfTask) { pdfTask.cancel(); pdfTask = null; }
  if (!f || !blob) return;
  loading.value = true;
  try {
    switch (f.kind) {
      case 'image': case 'video': case 'audio': url.value = URL.createObjectURL(blob); break;
      case 'svg': {
        const clean = sanitizeSvg(await blob.text());
        if (mine !== seq) return;
        url.value = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
        break;
      }
      case 'text': {
        const r = decodeText(new Uint8Array(await blob.arrayBuffer()));
        if (mine !== seq) return;
        textBody.value = r.text; textInfo.value = { encoding: r.encoding, truncated: r.truncated, lines: countLines(r.text) };
        extra.value = textInfo.value.lines.toLocaleString('pt-BR') + (textInfo.value.lines === 1 ? ' linha · ' : ' linhas · ') + r.encoding;
        break;
      }
      case 'model': {
        const m = parseModel(f.name, new Uint8Array(await blob.arrayBuffer()));
        if (mine !== seq) return;
        mesh.value = m; bounds.value = boundsOf(m);
        extra.value = m.triangles.toLocaleString('pt-BR') + (m.triangles === 1 ? ' triângulo' : ' triângulos');
        break;
      }
      case 'pdf': {
        const pdf = await viewDoc(f.blobId, async () => new Uint8Array(await blob.arrayBuffer()));
        if (mine !== seq) return;
        pdfPages.value = pdf.numPages;
        extra.value = pdf.numPages + (pdf.numPages === 1 ? ' página' : ' páginas');
        break;
      }
      default: hex.value = hexDump(new Uint8Array(await blob.slice(0, 256).arrayBuffer()), 256);
    }
  } catch (e) {
    if (mine === seq) problem.value = e instanceof Error && e.message ? e.message : 'Não foi possível abrir este arquivo.';
  } finally { if (mine === seq) loading.value = false; }
  if (mine === seq) { await nextTick(); draw3d(); void renderPdf(); }
}
watch([() => current.value?.id, currentBlob], () => { void prepare(); }, { immediate: true });
onBeforeUnmount(() => { seq++; revoke(); pdfTask?.cancel(); });

// ---------------------------------------------------------------- 3D
let dragging: { x: number; y: number } | null = null;
let frame = 0;
function draw3d(fast = false): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const c = canvas3d.value, m = mesh.value, b = bounds.value;
    if (!c || !m || !b) return;
    const box = stage.value;
    const w = Math.max(200, Math.floor(box?.clientWidth ?? 600)), h = Math.max(200, Math.floor((box?.clientHeight ?? 420) - 8));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const n = drawMesh(ctx, m, b, camera.value, w, h, { wireframe: wire.value, color: COLORS[modelColor.value] ?? COLORS.azul!, background: dark ? '#0f1319' : '#f3f5f9' }, fast ? 12000 : 250000);
    c.dataset.drawn = String(n);
  });
}
function onDown(e: PointerEvent): void { dragging = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
function onMove3d(e: PointerEvent): void {
  if (!dragging) return;
  camera.value = { ...camera.value, yaw: camera.value.yaw + (e.clientX - dragging.x) * 0.01, pitch: Math.max(-1.5, Math.min(1.5, camera.value.pitch + (e.clientY - dragging.y) * 0.01)) };
  dragging = { x: e.clientX, y: e.clientY };
  draw3d(true);
}
function onUp3d(): void { if (dragging) { dragging = null; draw3d(); } }
function zoom3d(factor: number): void { camera.value = { ...camera.value, zoom: Math.max(0.2, Math.min(8, camera.value.zoom * factor)) }; draw3d(); }
function onWheel(e: WheelEvent): void { zoom3d(e.deltaY < 0 ? 1.12 : 1 / 1.12); }
function onKey3d(e: KeyboardEvent): void {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    camera.value = { ...camera.value, yaw: camera.value.yaw + (k === 'ArrowLeft' ? -0.1 : k === 'ArrowRight' ? 0.1 : 0), pitch: Math.max(-1.5, Math.min(1.5, camera.value.pitch + (k === 'ArrowUp' ? -0.1 : k === 'ArrowDown' ? 0.1 : 0))) };
    draw3d();
  } else if (k === '+' || k === '=') { e.preventDefault(); zoom3d(1.15); }
  else if (k === '-') { e.preventDefault(); zoom3d(1 / 1.15); }
}
function reset3d(): void { camera.value = defaultCamera(); draw3d(); }
watch([wire, modelColor], () => draw3d());
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !stage.value) return;
  ro = new ResizeObserver(() => { draw3d(); void renderPdf(); });
  ro.observe(stage.value);
});
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(frame); });

// ---------------------------------------------------------------- PDF
async function renderPdf(): Promise<void> {
  const f = current.value, c = pdfCanvas.value, blob = currentBlob.value;
  if (!f || f.kind !== 'pdf' || !c || !blob || !pdfPages.value) return;
  const mine = seq;
  try {
    const pdf = await viewDoc(f.blobId, async () => new Uint8Array(await blob.arrayBuffer()));
    const page = await pdf.getPage(Math.min(Math.max(1, pdfPage.value), pdf.numPages));
    if (mine !== seq) return;
    const base = page.getViewport({ scale: 1 });
    const avail = Math.max(240, (stage.value?.clientWidth ?? 640) - 32);
    const scale = (avail / base.width) * pdfZoom.value;
    const vp = page.getViewport({ scale: scale * Math.min(2, window.devicePixelRatio || 1) });
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    c.style.width = Math.floor(vp.width / Math.min(2, window.devicePixelRatio || 1)) + 'px';
    const ctx = c.getContext('2d'); if (!ctx) return;
    pdfTask?.cancel();
    const task = page.render({ canvasContext: ctx, viewport: vp });
    pdfTask = task;
    await task.promise;
    c.dataset.rendered = String(pdfPage.value);
  } catch (e) {
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'RenderingCancelledException') return;
    if (mine === seq) problem.value = e instanceof Error && e.message ? e.message : 'Não foi possível desenhar a página.';
  }
}
function goPage(n: number): void { pdfPage.value = Math.min(Math.max(1, Math.floor(n) || 1), Math.max(1, pdfPages.value)); void renderPdf(); }
watch(pdfZoom, () => { void renderPdf(); });

// ---------------------------------------------------------------- imagem, texto e mídia
const imgScale = computed(() => zoom.value);
const imgStyle = computed(() => {
  const z = imgScale.value;
  const turned = Math.abs(turn.value) % 180 !== 0;
  const style: Record<string, string> = { transform: 'rotate(' + turn.value + 'deg)' };
  if (z > 0 && natural.value.w) { style.width = natural.value.w * z + 'px'; style.height = 'auto'; style.maxWidth = 'none'; }
  else style.maxWidth = turned ? '70vh' : '100%';
  return style;
});
function onImgLoad(event: Event): void {
  const img = event.target as HTMLImageElement;
  natural.value = { w: img.naturalWidth, h: img.naturalHeight };
  extra.value = img.naturalWidth + ' × ' + img.naturalHeight + ' px';
}
function onMedia(event: Event): void {
  const m = event.target as HTMLVideoElement | HTMLAudioElement;
  const sec = Number.isFinite(m.duration) ? Math.round(m.duration) : 0;
  const t = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  m.playbackRate = rate.value;
  extra.value = (m instanceof HTMLVideoElement && m.videoWidth ? m.videoWidth + ' × ' + m.videoHeight + ' px · ' : '') + t;
}
function onMediaError(): void { problem.value = 'O navegador não consegue reproduzir este arquivo (formato ou codec sem suporte). Você ainda pode baixá-lo.'; }
watch(rate, (r) => { for (const el of document.querySelectorAll<HTMLMediaElement>('[data-testid="media-player"]')) el.playbackRate = r; });
function formatJson(): void {
  const pretty = prettyJson(textBody.value);
  if (pretty === null) { fail('O conteúdo não é um JSON válido.'); return; }
  textBody.value = pretty; textInfo.value = { ...textInfo.value, lines: countLines(pretty) };
  extra.value = textInfo.value.lines.toLocaleString('pt-BR') + ' linhas · ' + textInfo.value.encoding;
  ok('JSON formatado só na tela; o arquivo original não foi alterado.');
}
const isJson = computed(() => current.value?.kind === 'text' && textBody.value.trim().length > 0 && prettyJson(textBody.value) !== null);
const numbered = computed(() => (gutter.value ? Array.from({ length: Math.min(textInfo.value.lines, 100000) }, (_, i) => i + 1).join('\n') : ''));
const title = computed(() => current.value ? current.value.name : '');
</script>

<template>
  <EditorShell v-model:tab="tab" app="viewer" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: now }">
      <div v-if="now === 'arquivos'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="open-files" @click="fileInput?.click()">Abrir arquivos</button>
          <input ref="fileInput" type="file" class="sr-only" multiple aria-label="Escolher arquivos para visualizar" data-testid="viewer-input" @change="onPick" />
        </div>
        <p class="ed-hint">Também dá para arrastar arquivos para a área de visualização ou colar uma imagem com Ctrl+V. Os arquivos ficam só neste aparelho e podem ser guardados no projeto (até {{ MAX_FILES }} arquivos de {{ Math.round(MAX_FILE_BYTES / 1048576) }} MB).</p>
        <label v-if="state.files.length > 1" class="ed-field"><span class="ed-label">Buscar na lista (nome ou tipo)</span>
          <input v-model="filter" type="search" class="inp" autocomplete="off" data-testid="viewer-filter" /></label>
        <p v-if="filter.trim()" class="ed-hint" role="status" data-testid="viewer-filter-count">{{ shownFiles.length }} de {{ state.files.length }} arquivos.</p>
        <ul v-if="state.files.length" class="files" data-testid="viewer-files" aria-label="Arquivos do projeto">
          <li v-for="f in shownFiles" :key="f.id" :class="{ on: f.id === state.activeId }">
            <button type="button" class="pick" :aria-pressed="f.id === state.activeId" :data-file="f.name" @click="state.activeId = f.id">
              <span class="nm">{{ f.name }}</span><small class="muted">{{ KIND_LABELS[f.kind] }} · {{ formatBytes(f.size) }}</small>
            </button>
            <button type="button" class="ib" :aria-label="'Remover ' + f.name + ' do projeto'" @click="removeFile(f.id)">×</button>
          </li>
        </ul>
        <p v-else class="ed-hint" data-testid="viewer-empty-hint">Nenhum arquivo aberto ainda.</p>
        <div v-if="slides.length > 1" class="ed-row">
          <label class="ed-field"><span class="ed-label">Apresentação: trocar a cada</span>
            <select v-model.number="slideSeconds" class="inp" data-testid="slide-interval"><option :value="1">1 s</option><option :value="3">3 s</option><option :value="5">5 s</option><option :value="10">10 s</option></select></label>
          <button type="button" class="btn" :aria-pressed="playing" data-testid="slideshow" @click="toggleSlideshow">{{ playing ? 'Parar apresentação' : 'Iniciar apresentação' }}</button>
        </div>
        <dl v-if="current" class="props" data-testid="viewer-props">
          <dt>Nome</dt><dd>{{ current.name }}</dd>
          <dt>Tipo detectado</dt><dd>{{ KIND_LABELS[current.kind] }}</dd>
          <dt>Tipo MIME</dt><dd>{{ current.mime || 'não informado' }}</dd>
          <dt>Tamanho</dt><dd>{{ current.size.toLocaleString('pt-BR') }} bytes ({{ formatBytes(current.size) }})</dd>
          <template v-if="extra"><dt>Detalhes</dt><dd>{{ extra }}</dd></template>
        </dl>
      </div>
      <div v-else-if="now === 'exibicao'" class="ed-row">
        <p v-if="!current" class="ed-hint">Abra um arquivo para ver as opções de exibição.</p>
        <template v-else-if="current.kind === 'image' || current.kind === 'svg'">
          <button type="button" class="btn" aria-label="Diminuir zoom" @click="zoom = Math.max(0.05, (zoom || 1) * 0.8)">−</button>
          <span class="z" data-testid="zoom-text">{{ zoom ? Math.round(zoom * 100) + '%' : 'Ajustado' }}</span>
          <button type="button" class="btn" aria-label="Aumentar zoom" @click="zoom = Math.min(8, (zoom || 1) * 1.25)">+</button>
          <button type="button" class="btn" data-testid="zoom-fit" @click="zoom = 0">Ajustar</button>
          <button type="button" class="btn" data-testid="zoom-100" @click="zoom = 1">100%</button>
          <button type="button" class="btn" data-testid="turn-left" @click="turn = (turn - 90) % 360">Girar −90°</button>
          <button type="button" class="btn" data-testid="turn-right" @click="turn = (turn + 90) % 360">Girar +90°</button>
          <label class="ed-field"><span class="ed-label">Fundo</span>
            <select v-model="backdrop" class="inp" data-testid="backdrop"><option value="xadrez">Xadrez</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select></label>
        </template>
        <template v-else-if="current.kind === 'text'">
          <label class="check"><input v-model="wrap" type="checkbox" data-testid="wrap" /> Quebrar linhas longas</label>
          <label class="check"><input v-model="gutter" type="checkbox" data-testid="gutter" /> Números de linha</label>
          <label class="ed-field"><span class="ed-label">Tamanho da letra</span>
            <select v-model.number="fontSize" class="inp"><option :value="12">12</option><option :value="14">14</option><option :value="16">16</option><option :value="20">20</option></select></label>
          <button v-if="isJson" type="button" class="btn" data-testid="format-json" @click="formatJson">Formatar JSON</button>
        </template>
        <template v-else-if="current.kind === 'model'">
          <label class="check"><input v-model="wire" type="checkbox" data-testid="wireframe" /> Só as arestas</label>
          <label class="ed-field"><span class="ed-label">Cor</span>
            <select v-model="modelColor" class="inp"><option value="azul">Azul</option><option value="cinza">Cinza</option><option value="laranja">Laranja</option><option value="verde">Verde</option></select></label>
          <button type="button" class="btn" aria-label="Aproximar" data-testid="zoom-in-3d" @click="zoom3d(1.25)">+</button>
          <button type="button" class="btn" aria-label="Afastar" @click="zoom3d(0.8)">−</button>
          <button type="button" class="btn" data-testid="reset-3d" @click="reset3d">Redefinir vista</button>
          <p class="ed-hint">Arraste para girar, use a roda do mouse (ou + e −) para aproximar e as setas do teclado com o modelo focado.</p>
        </template>
        <template v-else-if="current.kind === 'pdf'">
          <button type="button" class="btn" data-testid="pdf-prev" :disabled="pdfPage <= 1" @click="goPage(pdfPage - 1)">Página anterior</button>
          <label class="ed-field"><span class="ed-label">Página (de {{ pdfPages }})</span>
            <input class="inp inp-num" type="number" min="1" :max="pdfPages" :value="pdfPage" data-testid="pdf-page" @change="goPage(Number(($event.target as HTMLInputElement).value))" /></label>
          <button type="button" class="btn" data-testid="pdf-next" :disabled="pdfPage >= pdfPages" @click="goPage(pdfPage + 1)">Próxima página</button>
          <label class="ed-field"><span class="ed-label">Zoom</span>
            <select v-model.number="pdfZoom" class="inp" data-testid="pdf-zoom"><option :value="0.75">75%</option><option :value="1">100%</option><option :value="1.5">150%</option><option :value="2">200%</option></select></label>
        </template>
        <template v-else-if="current.kind === 'video' || current.kind === 'audio'">
          <label class="ed-field"><span class="ed-label">Velocidade</span>
            <select v-model.number="rate" class="inp" data-testid="rate"><option :value="0.5">0,5×</option><option :value="1">1×</option><option :value="1.5">1,5×</option><option :value="2">2×</option></select></label>
          <label class="check"><input v-model="loop" type="checkbox" data-testid="loop" /> Repetir</label>
        </template>
        <p v-else class="ed-hint">Este tipo de arquivo não tem opções de exibição.</p>
      </div>
      <FileTab v-else :templates="viewerTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!current" data-testid="download-original" @click="downloadCurrent">Baixar o arquivo atual</button>
        <button v-if="canOpenInCode" type="button" class="btn" :disabled="!apps.isEnabled('code')" data-testid="open-in-code" @click="openInCode">Abrir uma cópia no Código</button>
        <p v-if="canOpenInCode && !apps.isEnabled('code')" class="ed-hint">O app Código está desativado. Ative-o no Launcher para abrir uma cópia nele.</p>
        <template #after><p v-if="message" class="ed-hint" role="status" data-testid="viewer-message">{{ message }}</p></template>
      </FileTab>
    </template>

    <div class="viewer" @dragover.prevent @drop.prevent="onDrop">
      <div class="bar" data-testid="viewer-bar">
        <strong class="name" data-testid="viewer-name">{{ title || 'Nenhum arquivo aberto' }}</strong>
        <span v-if="current" class="muted meta" data-testid="viewer-meta">{{ KIND_LABELS[current.kind] }} · {{ formatBytes(current.size) }}<template v-if="extra"> · {{ extra }}</template></span>
        <span v-if="state.files.length > 1" class="nav">
          <button type="button" class="ib" aria-label="Arquivo anterior" data-testid="viewer-prev" @click="step(-1)">‹</button>
          <span class="muted" data-testid="viewer-position">{{ position + 1 }} de {{ state.files.length }}</span>
          <button type="button" class="ib" aria-label="Próximo arquivo" data-testid="viewer-next" @click="step(1)">›</button>
        </span>
        <button v-if="current && canFullscreen" type="button" class="btn small" data-testid="viewer-fullscreen" @click="toggleFullscreen">Tela cheia</button>
      </div>
      <p v-if="problem" class="ed-error err" role="alert" data-testid="viewer-error">{{ problem }}</p>
      <div ref="stage" class="stage" :class="'bd-' + backdrop" data-testid="viewer-stage">
        <div v-if="fullscreenOn" class="fsbar" role="group" aria-label="Controles da tela cheia">
          <button v-if="state.files.length > 1" type="button" class="btn" data-testid="fs-prev" @click="step(-1)">‹ Anterior</button>
          <button v-if="state.files.length > 1" type="button" class="btn" data-testid="fs-next" @click="step(1)">Próximo ›</button>
          <button type="button" class="btn btn-app" data-testid="viewer-exit-fullscreen" @click="toggleFullscreen">Sair da tela cheia</button>
        </div>
        <div v-if="!current" class="empty" data-testid="viewer-empty">
          <p><strong>Visualizador</strong></p>
          <p>Abra imagens, SVG, vídeos, áudios, modelos 3D (STL, OBJ, GLB), PDFs e arquivos de texto. Tudo é aberto neste aparelho, nada é enviado para a internet.</p>
          <button type="button" class="btn btn-app" @click="fileInput?.click(); tab = 'arquivos'">Abrir arquivos</button>
        </div>
        <p v-else-if="loading" class="muted" role="status">Abrindo…</p>
        <template v-else-if="!problem || current.kind === 'video' || current.kind === 'audio'">
          <div v-if="(current.kind === 'image' || current.kind === 'svg') && url" class="imgbox"><img :src="url" :alt="'Visualização de ' + current.name" class="pic" :style="imgStyle" data-testid="viewer-image" @load="onImgLoad" @error="problem = 'O navegador não conseguiu abrir esta imagem.'" /></div>
          <video v-else-if="current.kind === 'video' && url" :key="url" class="media" controls :loop="loop" preload="metadata" :src="url" :aria-label="'Vídeo ' + current.name" data-testid="media-player" @loadedmetadata="onMedia" @error="onMediaError"></video>
          <div v-else-if="current.kind === 'audio' && url" class="audiobox"><audio :key="url" controls :loop="loop" preload="metadata" :src="url" :aria-label="'Áudio ' + current.name" data-testid="media-player" @loadedmetadata="onMedia" @error="onMediaError"></audio></div>
          <canvas v-else-if="current.kind === 'model' && mesh" ref="canvas3d" class="c3d" tabindex="0" role="img" :aria-label="'Modelo 3D ' + current.name + '. Arraste para girar; setas giram; + e − aproximam.'" data-testid="model-canvas"
            @pointerdown="onDown" @pointermove="onMove3d" @pointerup="onUp3d" @pointercancel="onUp3d" @wheel.prevent="onWheel" @keydown="onKey3d"></canvas>
          <div v-else-if="current.kind === 'pdf'" class="pdfbox"><canvas ref="pdfCanvas" class="pdfc" role="img" :aria-label="'Página ' + pdfPage + ' de ' + pdfPages + ' de ' + current.name" data-testid="pdf-canvas"></canvas></div>
          <div v-else-if="current.kind === 'text'" class="textbox" :style="{ fontSize: fontSize + 'px' }">
            <pre v-if="gutter" class="gut" aria-hidden="true">{{ numbered }}</pre>
            <pre class="body" :class="{ nowrap: !wrap }" tabindex="0" :aria-label="'Conteúdo de ' + current.name" data-testid="text-body">{{ textBody }}</pre>
            <p v-if="textInfo.truncated" class="ed-hint cut">Arquivo grande: mostrando só os primeiros 4 MB.</p>
          </div>
          <div v-else-if="current.kind === 'unknown'" class="unknown" data-testid="viewer-unknown">
            <p><strong>Não há visualização para este tipo de arquivo.</strong></p>
            <p class="muted">Veja os primeiros bytes abaixo ou baixe o arquivo como ele está.</p>
            <pre class="hexdump" tabindex="0" aria-label="Primeiros bytes do arquivo em hexadecimal">{{ hex }}</pre>
          </div>
        </template>
      </div>
    </div>
  </EditorShell>
</template>

<style scoped>
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.z { min-width: 64px; text-align: center; font-weight: 700; }
.files { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.files li { display: flex; align-items: center; gap: 2px; border: 1px solid var(--border); border-radius: 10px; padding: 2px; background: var(--surface); }
.files li.on { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); }
.pick { flex: 1; min-width: 0; min-height: 44px; display: grid; text-align: left; border: 0; background: transparent; padding: 2px 8px; }
.nm { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.nav .ib { min-width: 44px; min-height: 44px; font-size: 22px; }
.small { min-height: 44px; }
.props { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 8px 0 0; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); font-size: 13px; }
.props dt { color: var(--muted); }
.props dd { margin: 0; overflow-wrap: anywhere; }
.stage:fullscreen { background: var(--raised); }
.fsbar { position: fixed; top: 10px; right: 10px; z-index: 5; display: flex; gap: 6px; padding: 6px; border-radius: 12px; background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--border); }
.viewer { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--raised); }
.bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 8px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
.name { overflow-wrap: anywhere; }
.meta { font-size: 12.5px; }
.err { margin: 0; padding: 8px 14px; }
.stage { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 16px; position: relative; }
.stage:has(.textbox), .stage:has(.pdfbox) { place-items: start center; }
.empty, .unknown { max-width: 560px; text-align: center; display: grid; gap: 8px; justify-items: center; }
.imgbox { max-width: 100%; max-height: 100%; display: grid; place-items: center; }
.pic { max-height: 100%; object-fit: contain; image-rendering: auto; background: transparent; transform-origin: center; }
.bd-xadrez .imgbox { background: repeating-conic-gradient(#d9dde5 0% 25%, #fff 0% 50%) 0 0 / 20px 20px; }
.bd-claro .imgbox { background: #fff; }
.bd-escuro .imgbox { background: #10141b; }
.media { max-width: 100%; max-height: 100%; background: #000; border-radius: 8px; }
.audiobox { width: min(560px, 100%); padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }
.audiobox audio { width: 100%; }
.c3d { display: block; touch-action: none; cursor: grab; border-radius: 10px; outline: none; max-width: 100%; }
.c3d:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
.pdfbox { width: 100%; display: grid; place-items: start center; }
.pdfc { max-width: none; box-shadow: 0 6px 22px rgb(0 0 0 / 25%); background: #fff; }
.textbox { display: flex; align-items: flex-start; gap: 0; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: auto; align-self: stretch; }
.textbox pre { margin: 0; padding: 12px; font: inherit; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1.55; }
.gut { flex: none; text-align: right; color: var(--muted); border-right: 1px solid var(--border); user-select: none; }
.body { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; outline: none; }
.body.nowrap { white-space: pre; overflow-wrap: normal; overflow-x: auto; }
.body:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.cut { padding: 0 12px; }
.hexdump { text-align: left; max-width: 100%; overflow: auto; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; font: 12.5px/1.5 ui-monospace, Consolas, monospace; }
</style>
