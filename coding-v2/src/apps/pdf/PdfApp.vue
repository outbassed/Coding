<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, safeFileName } from '../../shared/files/download';
import { writeZip } from '../../shared/files/zip';
import type { LegacyImage } from '../../storage/documents';
import { buildPdf, forgetDoc, inspectPdf, renderBlank, renderPage, viewDoc } from './engine';
import ModalDialog from '../../components/library/ModalDialog.vue';
import { samplePdf } from './sample';
import PdfThumb from './PdfThumb.vue';
import { MAX_ANNOTATIONS, MAX_NEW_PAGES, MAX_PAGES, MAX_PDF_BYTES, MAX_SOURCES, PAGE_FORMATS, blankSize, parseRanges, pid, type Annotation, type AnnotationKind, type BlankSize, type PageFormat, type PdfPage, type Rotation } from './model';
import { pdfKind, pdfTemplates } from './kind';

const doc = useDocument({
  kind: pdfKind, templates: pdfTemplates, path: '/apps/pdf/', withImages: true,
  imagesFor: (state, images) => { const used = new Set(state.sources.map((s) => s.id)); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const tab = ref('paginas');
const tabs = [{ id: 'paginas', label: 'Páginas' }, { id: 'anotar', label: 'Anotar' }, { id: 'dividir', label: 'Dividir e extrair' }, { id: 'arquivo', label: 'Arquivo' }];
const current = ref(0);
const page = computed<PdfPage | null>(() => state.value.pages[current.value] ?? null);
watch(() => state.value.pages.length, (n) => { if (current.value >= n) current.value = Math.max(0, n - 1); });
const checked = ref<Set<string>>(new Set());
const busy = ref(false);
const info = ref('');
const problem = ref('');
function note(t: string): void { info.value = t; problem.value = ''; doc.say(t); }
function fail(t: string): void { problem.value = t; info.value = ''; doc.say(t); }

async function bytesOf(src: string): Promise<Uint8Array> {
  const file = images.value.find((i) => i.id === src);
  if (!file?.blob) throw new Error('O arquivo PDF deste documento não está disponível.');
  return new Uint8Array(await file.blob.arrayBuffer());
}
// ---- abrir / juntar ----
const fileInput = ref<HTMLInputElement | null>(null);
async function addPdfBytes(bytes: Uint8Array, name: string, blob?: Blob): Promise<void> {
  if (state.value.sources.length >= MAX_SOURCES) { fail('Limite de ' + MAX_SOURCES + ' arquivos por projeto.'); return; }
  const count = await inspectPdf(bytes);
  if (state.value.pages.length + count > MAX_PAGES) { fail('“' + name + '” tem ' + count + ' páginas; o projeto passaria de ' + MAX_PAGES + '.'); return; }
  const id = 'pdf-' + crypto.randomUUID();
  const file: LegacyImage = { id, docId: '', blob: blob ?? new Blob([bytes as BlobPart], { type: 'application/pdf' }), mime: 'application/pdf', name: name.slice(0, 160) };
  images.value = [...images.value, file];
  state.value.sources.push({ id, name: name.slice(0, 160), pages: count });
  const first = state.value.pages.length;
  for (let i = 0; i < count; i++) state.value.pages.push({ id: pid(), src: id, index: i, rotate: 0 });
  if (!first && (state.value.name === 'Documento PDF' || !state.value.name.trim())) state.value.name = name.replace(/\.pdf$/i, '').slice(0, 200) || 'Documento PDF';
  current.value = first;
  note('“' + name + '” adicionado: ' + count + (count === 1 ? ' página.' : ' páginas.') + (first ? ' Os PDFs foram juntados.' : ''));
}
async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = '';
  busy.value = true;
  try {
    for (const f of files) {
      if (f.size > MAX_PDF_BYTES) { fail('“' + f.name + '” passa de 60 MB.'); continue; }
      try { await addPdfBytes(new Uint8Array(await f.arrayBuffer()), f.name, f); } catch (e) { fail('“' + f.name + '”: ' + (e as Error).message); }
    }
  } finally { busy.value = false; }
}
async function useSample(): Promise<void> {
  busy.value = true;
  try { await addPdfBytes(await samplePdf(), 'exemplo.pdf'); } catch (e) { fail((e as Error).message); } finally { busy.value = false; }
}
// ---- páginas em branco ----
const blankOpen = ref(false);
const blankFormat = ref<PageFormat>('a4');
const blankOrientation = ref<'portrait' | 'landscape'>('portrait');
const blankCount = ref(1);
const blankName = ref('Documento em branco');
const blankW = ref(210);
const blankH = ref(297);
const blankFresh = computed(() => state.value.pages.length === 0);
function openBlank(): void {
  blankFormat.value = 'a4'; blankOrientation.value = 'portrait'; blankCount.value = 1; blankW.value = 210; blankH.value = 297;
  blankName.value = blankFresh.value ? 'Documento em branco' : state.value.name;
  blankOpen.value = true;
}
function createBlank(): void {
  const wanted = Math.max(1, Math.round(Number(blankCount.value)) || 1);
  const count = Math.min(MAX_NEW_PAGES, wanted);
  if (state.value.pages.length + count > MAX_PAGES) { fail('O projeto passaria de ' + MAX_PAGES + ' páginas.'); return; }
  const size = blankSize(blankFormat.value, blankOrientation.value, { w: blankW.value, h: blankH.value });
  const first = state.value.pages.length;
  for (let i = 0; i < count; i++) state.value.pages.push({ id: pid(), src: '', index: 0, rotate: 0, blank: { ...size } });
  if (first === 0) state.value.name = blankName.value.trim().slice(0, 200) || 'Documento em branco';
  current.value = first;
  blankOpen.value = false;
  note(count + (count === 1 ? ' página em branco criada.' : ' páginas em branco criadas.') + (wanted > count ? ' O limite por vez é de ' + MAX_NEW_PAGES + ' páginas.' : ''));
}
/** Nova página em branco logo depois da atual, com o mesmo tamanho dela. */
async function insertBlankAfter(): Promise<void> {
  if (!page.value) return;
  if (state.value.pages.length >= MAX_PAGES) { fail('Limite de ' + MAX_PAGES + ' páginas.'); return; }
  const p = page.value;
  // O tamanho vem da página realmente desenhada; se ela ainda não terminou de carregar, espera.
  if (!p.blank && boxKey.value !== p.id + ':' + p.rotate) {
    await nextTick();
    await drawCurrent();
    if (boxKey.value !== p.id + ':' + p.rotate) { fail('A página ainda está carregando. Tente de novo em instantes.'); return; }
  }
  const size: BlankSize = p.blank ? { ...p.blank } : (p.rotate % 180 ? { w: pageBox.value.h, h: pageBox.value.w } : { w: pageBox.value.w, h: pageBox.value.h });
  state.value.pages.splice(current.value + 1, 0, { id: pid(), src: '', index: 0, rotate: 0, blank: size });
  current.value += 1;
  note('Página em branco inserida depois da página ' + current.value + '.');
}
// ---- página atual ----
const canvas = ref<HTMLCanvasElement | null>(null);
const viewEl = ref<HTMLElement | null>(null);
const viewW = ref(600);
const pageBox = ref({ w: 595, h: 842 });
/** Qual página (e giro) o `pageBox` descreve; evita usar o tamanho de outra página enquanto a atual carrega. */
const boxKey = ref('');
const zoom = ref(1);
let token = 0;
async function drawCurrent(): Promise<void> {
  const p = page.value, c = canvas.value; if (!p || !c) return;
  const my = ++token;
  try {
    const width = Math.max(200, Math.min(1400, (viewW.value - 32) * zoom.value));
    if (p.blank) { pageBox.value = renderBlank(p.blank, p.rotate, c, width); boxKey.value = p.id + ':' + p.rotate; return; }
    const d = await viewDoc(p.src, () => bytesOf(p.src));
    if (my !== token) return;
    const box = await renderPage(d, p.index, p.rotate, c, width);
    if (my !== token) return;
    pageBox.value = box; boxKey.value = p.id + ':' + p.rotate;
  } catch (e) { if (my === token) fail((e as Error).message); }
}
watch([page, zoom, viewW, () => images.value.length], () => { void nextTick(drawCurrent); }, { deep: true });
let ro: ResizeObserver | undefined;
onMounted(() => { if (viewEl.value) { viewW.value = viewEl.value.clientWidth; if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { viewW.value = viewEl.value?.clientWidth ?? 600; }); ro.observe(viewEl.value); } } void drawCurrent(); });
onBeforeUnmount(() => { ro?.disconnect(); for (const s of state.value.sources) forgetDoc(s.id); });
const pageCss = computed(() => { const width = Math.max(200, Math.min(1400, (viewW.value - 32) * zoom.value)); return { width: width + 'px', height: (width * pageBox.value.h) / pageBox.value.w + 'px' }; });

// ---- operações com páginas ----
function targets(): string[] { const sel = state.value.pages.filter((p) => checked.value.has(p.id)).map((p) => p.id); return sel.length ? sel : page.value ? [page.value.id] : []; }
function rotate(delta: 90 | -90): void { for (const id of targets()) { const p = state.value.pages.find((x) => x.id === id); if (p) p.rotate = (((p.rotate + delta) % 360 + 360) % 360) as Rotation; } note('Página(s) girada(s).'); }
function duplicate(): void {
  if (state.value.pages.length + targets().length > MAX_PAGES) { fail('Limite de ' + MAX_PAGES + ' páginas.'); return; }
  for (const id of targets().reverse()) { const i = state.value.pages.findIndex((x) => x.id === id); const p = state.value.pages[i]!; state.value.pages.splice(i + 1, 0, { ...p, id: pid() }); }
  note('Página(s) duplicada(s).');
}
function removePages(): void {
  const ids = new Set(targets()); if (!ids.size) return;
  if (ids.size >= state.value.pages.length && !confirm('Remover todas as páginas do projeto?')) return;
  state.value.pages = state.value.pages.filter((p) => !ids.has(p.id));
  state.value.annotations = state.value.annotations.filter((a) => !ids.has(a.page));
  checked.value = new Set();
  note(ids.size + ' página(s) removida(s) do projeto. Use Desfazer para recuperar.');
}
function movePage(delta: number): void {
  const i = current.value, j = i + delta;
  if (!page.value || j < 0 || j >= state.value.pages.length) return;
  const list = state.value.pages; const [p] = list.splice(i, 1); list.splice(j, 0, p!); current.value = j;
}
function toggle(id: string, on: boolean): void { const s = new Set(checked.value); if (on) s.add(id); else s.delete(id); checked.value = s; }
function selectAll(on: boolean): void { checked.value = on ? new Set(state.value.pages.map((p) => p.id)) : new Set(); }

// ---- anotações ----
const pageAnnotations = computed(() => state.value.annotations.filter((a) => a.page === page.value?.id));
const annId = ref<string | null>(null);
const ann = computed(() => state.value.annotations.find((a) => a.id === annId.value) ?? null);
function addAnnotation(kind: AnnotationKind): void {
  if (!page.value) return;
  if (state.value.annotations.length >= MAX_ANNOTATIONS) { fail('Limite de anotações atingido.'); return; }
  const a: Annotation = { id: pid(), page: page.value.id, kind, x: 0.1, y: 0.1 + (pageAnnotations.value.length % 8) * 0.06, w: kind === 'text' ? 0.6 : 0.4, h: kind === 'text' ? 0.05 : 0.08, text: kind === 'text' ? 'Escreva aqui' : '', size: 14, color: kind === 'highlight' ? '#ffe066' : '#c0392b' };
  state.value.annotations.push(a); annId.value = a.id; tab.value = 'anotar';
  note({ text: 'Texto', rect: 'Retângulo', highlight: 'Destaque' }[kind] + ' adicionado. Arraste na página para posicionar.');
}
function removeAnnotation(): void { if (!ann.value) return; state.value.annotations = state.value.annotations.filter((a) => a.id !== annId.value); annId.value = null; }
let drag: { id: string; sx: number; sy: number; ox: number; oy: number; mode: 'move' | 'size'; ow: number; oh: number } | null = null;
function onAnnDown(event: PointerEvent, a: Annotation, mode: 'move' | 'size'): void {
  annId.value = a.id; event.preventDefault(); event.stopPropagation();
  drag = { id: a.id, sx: event.clientX, sy: event.clientY, ox: a.x, oy: a.y, mode, ow: a.w, oh: a.h };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function onMove(event: PointerEvent): void {
  if (!drag) return;
  const a = state.value.annotations.find((x) => x.id === drag!.id); if (!a) return;
  const w = parseFloat(pageCss.value.width), h = parseFloat(pageCss.value.height);
  const dx = (event.clientX - drag.sx) / w, dy = (event.clientY - drag.sy) / h;
  doc.setChangeKey('ann-' + a.id);
  if (drag.mode === 'move') { a.x = Math.min(1 - a.w, Math.max(0, drag.ox + dx)); a.y = Math.min(1 - a.h, Math.max(0, drag.oy + dy)); }
  else { a.w = Math.min(1 - a.x, Math.max(0.02, drag.ow + dx)); a.h = Math.min(1 - a.y, Math.max(0.02, drag.oh + dy)); }
}
const stop = () => { drag = null; };
onMounted(() => { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', stop); });
onBeforeUnmount(() => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', stop); });
const scalePt = computed(() => parseFloat(pageCss.value.width) / pageBox.value.w);

// ---- exportar ----
async function download(pages: PdfPage[], name: string): Promise<Uint8Array | null> {
  if (!pages.length) { fail('Nenhuma página para exportar.'); return null; }
  busy.value = true;
  try { const bytes = await buildPdf(pages, state.value.annotations, bytesOf, name); return bytes; }
  catch (e) { fail((e as Error).message); return null; }
  finally { busy.value = false; }
}
async function exportAll(): Promise<void> {
  const bytes = await download(state.value.pages, state.value.name);
  if (bytes) { downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), safeFileName(state.value.name, 'documento') + '.pdf'); note('PDF gerado com ' + state.value.pages.length + ' página(s). Os arquivos originais não foram alterados.'); }
}
async function exportSelected(): Promise<void> {
  const pages = state.value.pages.filter((p) => checked.value.has(p.id));
  if (!pages.length) { fail('Marque as páginas na lista para extrair.'); return; }
  const bytes = await download(pages, state.value.name + ' (extraídas)');
  if (bytes) { downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), safeFileName(state.value.name + ' - selecionadas', 'paginas') + '.pdf'); note(pages.length + ' página(s) extraída(s) em um PDF novo.'); }
}
const rangeText = ref('1-2');
async function exportRange(): Promise<void> {
  const idx = parseRanges(rangeText.value, state.value.pages.length);
  if (typeof idx === 'string') { fail(idx); return; }
  const bytes = await download(idx.map((i) => state.value.pages[i]!), state.value.name);
  if (bytes) { downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), safeFileName(state.value.name + ' - ' + rangeText.value, 'paginas') + '.pdf'); note('PDF com as páginas ' + rangeText.value + ' gerado.'); }
}
const every = ref(1);
async function splitEvery(): Promise<void> {
  const n = Math.max(1, Math.round(every.value)); const pages = state.value.pages;
  if (!pages.length) return;
  busy.value = true;
  try {
    const parts: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < pages.length; i += n) {
      const chunk = pages.slice(i, i + n);
      const bytes = await buildPdf(chunk, state.value.annotations, bytesOf, state.value.name);
      parts.push({ name: safeFileName(state.value.name, 'documento') + ' - parte ' + String(parts.length + 1).padStart(2, '0') + ' (p' + (i + 1) + '-' + (i + chunk.length) + ').pdf', data: bytes });
    }
    const zip = await writeZip(parts, false);
    downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), safeFileName(state.value.name, 'documento') + ' - dividido.zip');
    note('Documento dividido em ' + parts.length + ' PDFs (arquivo .zip).');
  } catch (e) { fail((e as Error).message); }
  finally { busy.value = false; }
}
function sourceName(src: string): string { return state.value.sources.find((s) => s.id === src)?.name ?? 'PDF'; }
</script>

<template>
  <EditorShell v-model:tab="tab" app="pdf" :doc="doc" :tabs="tabs" side-label="Miniaturas">
    <template #panel="{ tab: currentTab }">
      <div v-if="currentTab === 'paginas'" class="ed-row">
        <button type="button" class="btn btn-app" :disabled="busy" data-testid="open-pdf" @click="fileInput?.click()">{{ state.pages.length ? 'Juntar outro PDF' : 'Abrir PDF' }}</button>
        <input ref="fileInput" type="file" class="sr-only" accept="application/pdf,.pdf" multiple aria-label="Escolher arquivos PDF" data-testid="pdf-input" @change="onFiles" />
        <button type="button" class="btn" :disabled="busy" data-testid="create-blank" @click="openBlank">{{ state.pages.length ? 'Adicionar páginas em branco' : 'Criar em branco' }}</button>
        <button v-if="!state.pages.length" type="button" class="btn" :disabled="busy" data-testid="sample-pdf" @click="useSample">Usar PDF de exemplo</button>
        <template v-if="state.pages.length">
          <button type="button" class="btn" data-testid="insert-blank" @click="insertBlankAfter">Inserir página em branco depois desta</button>
          <button type="button" class="btn" :disabled="current === 0" data-testid="move-up" @click="movePage(-1)">Mover para antes</button>
          <button type="button" class="btn" :disabled="current >= state.pages.length - 1" data-testid="move-down" @click="movePage(1)">Mover para depois</button>
          <button type="button" class="btn" @click="rotate(-90)">Girar ⟲</button>
          <button type="button" class="btn" data-testid="rotate-page" @click="rotate(90)">Girar ⟳</button>
          <button type="button" class="btn" data-testid="duplicate-page" @click="duplicate">Duplicar</button>
          <button type="button" class="btn" data-testid="remove-page" @click="removePages">Remover</button>
          <p class="ed-hint wide">{{ checked.size ? checked.size + ' página(s) marcada(s): as ações valem para elas.' : 'As ações valem para a página aberta; marque páginas nas miniaturas para agir em várias.' }}</p>
        </template>
      </div>
      <div v-else-if="currentTab === 'anotar'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!page" data-testid="add-note-text" @click="addAnnotation('text')">Texto</button>
          <button type="button" class="btn" :disabled="!page" @click="addAnnotation('highlight')">Destaque</button>
          <button type="button" class="btn" :disabled="!page" @click="addAnnotation('rect')">Retângulo</button>
        </div>
        <div v-if="ann" class="ed-row">
          <label v-if="ann.kind === 'text'" class="ed-field grow"><span class="ed-label">Texto</span><textarea v-model="ann.text" class="inp" rows="2" maxlength="2000" data-testid="note-text" @input="doc.setChangeKey('nt' + ann.id)"></textarea></label>
          <label v-if="ann.kind === 'text'" class="ed-field"><span class="ed-label">Tamanho (pt)</span><input v-model.number="ann.size" class="inp inp-num" type="number" min="6" max="96" /></label>
          <label class="ed-field"><span class="ed-label">Cor</span><input v-model="ann.color" class="inp color" type="color" /></label>
          <button type="button" class="btn" @click="removeAnnotation">Excluir anotação</button>
        </div>
        <p class="ed-hint">Arraste a anotação na página; o canto inferior direito muda o tamanho. Textos usam a fonte Helvetica do PDF.</p>
      </div>
      <div v-else-if="currentTab === 'dividir'" class="ed-row">
        <button type="button" class="btn" :disabled="busy || !checked.size" data-testid="extract-selected" @click="exportSelected">Extrair páginas marcadas ({{ checked.size }})</button>
        <label class="ed-field"><span class="ed-label">Páginas (ex.: 1-3, 5)</span><input v-model="rangeText" class="inp" data-testid="range" /></label>
        <button type="button" class="btn" :disabled="busy || !state.pages.length" data-testid="extract-range" @click="exportRange">Baixar intervalo</button>
        <label class="ed-field"><span class="ed-label">Dividir a cada N páginas</span><input v-model.number="every" class="inp inp-num" type="number" min="1" max="500" /></label>
        <button type="button" class="btn" :disabled="busy || !state.pages.length" data-testid="split" @click="splitEvery">Dividir (baixa .zip)</button>
      </div>
      <FileTab v-else :templates="pdfTemplates" @new="doc.newFrom">
        <button type="button" class="btn btn-app" :disabled="busy || !state.pages.length" data-testid="export-pdf" @click="exportAll">{{ busy ? 'Gerando…' : 'Baixar PDF' }}</button>
        <button type="button" class="btn" :disabled="busy" @click="fileInput?.click()">Juntar outro PDF</button>
      </FileTab>
    </template>

    <template #side>
      <div class="side-head"><strong>{{ state.pages.length }} páginas</strong>
        <button v-if="state.pages.length" type="button" class="btn small" @click="selectAll(checked.size < state.pages.length)">{{ checked.size < state.pages.length ? 'Marcar todas' : 'Desmarcar' }}</button></div>
      <ol class="thumbs" data-testid="thumbs">
        <li v-for="(p, i) in state.pages" :key="p.id" :class="{ cur: i === current }">
          <button type="button" class="thumb-btn" :aria-current="i === current ? 'page' : undefined" :aria-label="'Página ' + (i + 1) + ' (' + sourceName(p.src) + ', original ' + (p.index + 1) + ')'" @click="current = i">
            <PdfThumb :src="p.src" :index="p.index" :rotate="p.rotate" :blank="p.blank" :bytes="bytesOf" :width="88" />
            <span class="num">{{ i + 1 }}</span>
          </button>
          <label class="mark"><input type="checkbox" :checked="checked.has(p.id)" :aria-label="'Marcar página ' + (i + 1)" @change="toggle(p.id, ($event.target as HTMLInputElement).checked)" /></label>
        </li>
      </ol>
    </template>

    <div class="pdf-stage">
      <div ref="viewEl" class="view" data-testid="pdf-view">
        <div v-if="!state.pages.length" class="empty">
          <p><strong>Nenhum PDF aberto.</strong></p>
          <p class="muted">Crie páginas em branco para escrever e anotar, ou abra arquivos para organizar, juntar, dividir e anotar. O original nunca é alterado.</p>
          <div class="ed-row center"><button type="button" class="btn btn-app" :disabled="busy" data-testid="create-blank-stage" @click="openBlank">Criar em branco</button><button type="button" class="btn" :disabled="busy" @click="fileInput?.click()">Abrir PDF</button><button type="button" class="btn" :disabled="busy" data-testid="sample-pdf-stage" @click="useSample">Usar PDF de exemplo</button></div>
        </div>
        <div v-else class="page" :style="pageCss" data-testid="pdf-page">
          <canvas ref="canvas" aria-hidden="true"></canvas>
          <div v-for="a in pageAnnotations" :key="a.id" class="ann" :class="[a.kind, { on: a.id === annId }]" :data-testid="'ann-' + a.kind"
            :style="{ left: a.x * 100 + '%', top: a.y * 100 + '%', width: a.w * 100 + '%', height: a.h * 100 + '%', color: a.color, borderColor: a.color, background: a.kind === 'highlight' ? a.color + '59' : undefined, fontSize: a.size * scalePt + 'px' }"
            @pointerdown="onAnnDown($event, a, 'move')">
            <span v-if="a.kind === 'text'" class="t">{{ a.text }}</span>
            <span class="grip" @pointerdown="onAnnDown($event, a, 'size')"></span>
          </div>
        </div>
      </div>
      <div class="pbar">
        <button type="button" class="ib" aria-label="Página anterior" :disabled="current === 0" @click="current--">‹</button>
        <span class="pnum" data-testid="page-number">{{ state.pages.length ? current + 1 : 0 }} / {{ state.pages.length }}</span>
        <button type="button" class="ib" aria-label="Próxima página" :disabled="current >= state.pages.length - 1" @click="current++">›</button>
        <button type="button" class="ib" aria-label="Diminuir zoom" @click="zoom = Math.max(0.4, zoom - 0.2)">−</button>
        <span class="pnum">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="ib" aria-label="Aumentar zoom" @click="zoom = Math.min(3, zoom + 0.2)">+</button>
        <span class="msg" :class="{ bad: problem }" role="status" data-testid="pdf-message">{{ problem || info }}</span>
      </div>
    </div>
    <ModalDialog :open="blankOpen" label="Criar páginas em branco" @close="blankOpen = false">
      <form class="blank-form" data-testid="blank-dialog" novalidate @submit.prevent="createBlank">
        <h2>{{ blankFresh ? 'Novo documento em branco' : 'Adicionar páginas em branco' }}</h2>
        <label v-if="blankFresh" class="bf"><span>Nome do arquivo</span><input v-model="blankName" class="inp" maxlength="200" data-testid="blank-name" data-autofocus /></label>
        <label class="bf"><span>Formato</span>
          <select v-model="blankFormat" class="inp" data-testid="blank-format"><option v-for="f in PAGE_FORMATS" :key="f.id" :value="f.id">{{ f.label }}</option></select>
        </label>
        <div v-if="blankFormat === 'custom'" class="bf-row">
          <label class="bf"><span>Largura (mm)</span><input v-model.number="blankW" class="inp" type="number" min="25" max="1000" data-testid="blank-w" /></label>
          <label class="bf"><span>Altura (mm)</span><input v-model.number="blankH" class="inp" type="number" min="25" max="1000" data-testid="blank-h" /></label>
        </div>
        <fieldset class="bf"><legend>Orientação</legend>
          <label class="radio"><input v-model="blankOrientation" type="radio" value="portrait" data-testid="blank-portrait" /> Retrato</label>
          <label class="radio"><input v-model="blankOrientation" type="radio" value="landscape" data-testid="blank-landscape" /> Paisagem</label>
        </fieldset>
        <label class="bf"><span>Quantidade de páginas (1 a {{ MAX_NEW_PAGES }})</span><input v-model.number="blankCount" class="inp inp-num" type="number" min="1" :max="MAX_NEW_PAGES" data-testid="blank-count" /></label>
        <div class="ed-row"><button type="submit" class="btn btn-app" data-testid="blank-create">Criar</button><button type="button" class="btn" @click="blankOpen = false">Cancelar</button></div>
      </form>
    </ModalDialog>
  </EditorShell>
</template>

<style scoped>
.wide { flex-basis: 100%; }
.blank-form { display: grid; gap: 12px; }
.blank-form h2 { font-size: 18px; margin: 0; }
.bf { display: grid; gap: 4px; border: 0; padding: 0; margin: 0; min-width: 0; }
.bf > span, .bf legend { font-size: 13px; font-weight: 700; padding: 0; }
.bf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.radio { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-right: 16px; }
.grow { flex: 1 1 260px; }
.color { width: 64px; padding: 4px; }
.small { min-height: 36px; padding: 4px 10px; font-size: 13px; }
.side-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.thumbs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; }
.thumbs li { position: relative; display: grid; justify-items: center; padding: 6px; border-radius: 10px; border: 2px solid transparent; }
.thumbs li.cur { border-color: var(--app); background: var(--panel); }
.thumb-btn { border: 0; background: transparent; padding: 0; display: grid; justify-items: center; gap: 4px; cursor: pointer; }
.num { font-size: 12px; font-weight: 700; }
.mark { position: absolute; top: 2px; right: 2px; width: 32px; height: 32px; display: grid; place-items: center; }
.mark input { width: 20px; height: 20px; }
.pdf-stage { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--raised); }
.view { flex: 1; min-height: 0; overflow: auto; padding: 16px; display: grid; justify-items: center; align-content: start; }
.empty { max-width: 420px; text-align: center; padding: 40px 16px; }
.center { justify-content: center; }
.page { position: relative; background: #fff; box-shadow: 0 8px 28px rgb(0 0 0 / 25%); }
.page canvas { display: block; }
.ann { position: absolute; box-sizing: border-box; cursor: move; touch-action: none; border: 1px dashed transparent; }
.ann.text { line-height: 1.2; white-space: pre-wrap; overflow: hidden; font-family: Helvetica, Arial, sans-serif; }
.ann.rect { border: 2px solid; }
.ann.on { outline: 2px solid var(--accent); outline-offset: 1px; }
.ann.text.on, .ann.text:hover { border-color: var(--accent); }
.grip { position: absolute; right: -8px; bottom: -8px; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; cursor: nwse-resize; touch-action: none; }
.pbar { flex: none; display: flex; align-items: center; gap: 4px; padding: 4px 12px; background: var(--surface); border-top: 1px solid var(--border); flex-wrap: wrap; }
.pnum { min-width: 56px; text-align: center; font-weight: 700; font-size: 13px; }
.msg { font-size: 12.5px; color: var(--muted); flex: 1 1 200px; }
.msg.bad { color: var(--danger); font-weight: 600; }
</style>
