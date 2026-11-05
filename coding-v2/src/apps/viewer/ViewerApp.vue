<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import { useDocument } from '../../editors/useDocument';
import { createDoc } from '../../editors/docs';
import { downloadBlob } from '../../shared/files/download';
import { formatBytes } from '../../shared/bytes';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useResizableSidebar } from '../../composables/useResizableSidebar';
import { parseMediaLink, type MediaLinkChoice } from '../../shared/media-links';
import { usePrint } from '../../shared/print/usePrint';
import { requestPrint } from '../../shared/print/print';
import type { PrintJob } from '../../shared/print/print';
import type { LegacyImage } from '../../storage/documents';
import { forgetDoc, inspectPdf } from '../pdf/engine';
import { pdfKind } from '../pdf/kind';
import { MAX_PAGES, pid, type PdfState } from '../pdf/model';
import { codeKind } from '../code/kind';
import { cleanPath, isTextPath, normalizeCode } from '../code/model';
import { detectKind, KIND_LABELS, mimeFor } from './kinds';
import { decodeText, MAX_FILE_BYTES, MAX_FILES, type ViewerFile } from './model';
import { viewerKind, viewerTemplates } from './kind';
import { cleanFileName, filterFiles, kindCounts, neighborAfterRemoval, sortFiles } from './library';
import { SLIDE_SECONDS, useViewerPrefs } from './prefs';
import { disposeThumbs } from './thumbs';
import { createLongPress } from './longpress';
import { isEditableTarget } from './resources';
import type { ViewKind } from './kinds';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';
import VIcon from './VIcon.vue';
import LibraryPanel from './LibraryPanel.vue';
import InspectorPanel from './InspectorPanel.vue';
import ViewerContextMenu from './ViewerContextMenu.vue';
import ImageViewer from './ImageViewer.vue';
import VideoPlayer from './VideoPlayer.vue';
import AudioPlayer from './AudioPlayer.vue';
import PdfViewer from './PdfViewer.vue';
import ModelViewer from './ModelViewer.vue';
import TextViewer from './TextViewer.vue';
import UnknownViewer from './UnknownViewer.vue';
import './viewer.css';

/**
 * Visualizador 2.0. A mídia ocupa o centro; a biblioteca fica à esquerda e as propriedades à direita (gavetas no celular).
 * Este arquivo cuida do projeto (arquivos, desfazer, salvar), da navegação, dos painéis, da tela cheia e do menu de contexto;
 * cada formato tem o seu visualizador próprio, que oferece menu, atalhos e impressão pelo mesmo contrato (types.ts).
 */
const doc = useDocument({
  kind: viewerKind, templates: viewerTemplates, path: '/apps/visualizador/', withImages: true,
  // Trocar de arquivo na tela não é uma alteração: só a lista e os nomes entram no desfazer.
  historyView: (s) => ({ name: s.name, files: s.files }),
  // No disco ficam só os arquivos que o projeto usa; na memória, os removidos continuam disponíveis para o desfazer.
  imagesFor: (s, images) => { const used = new Set(s.files.map((f) => f.blobId)); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const prefs = useViewerPrefs();

// ---------------------------------------------------------------- avisos
const message = ref('');
const canUndoToast = ref(false);
const problem = ref('');
let messageTimer: ReturnType<typeof setTimeout> | undefined;
function ok(text: string, undo = false): void {
  message.value = text; canUndoToast.value = undo; problem.value = '';
  doc.say(text);
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { message.value = ''; canUndoToast.value = false; }, undo ? 9000 : 5000);
}
function notice(text: string): void { message.value = text; canUndoToast.value = false; doc.say(text); clearTimeout(messageTimer); messageTimer = setTimeout(() => { message.value = ''; }, 5000); }
function fail(text: string): void { notice(text); }

// ---------------------------------------------------------------- arquivos do projeto
const files = computed(() => state.value.files);
const blobMap = computed(() => new Map(images.value.map((i) => [i.id, i.blob] as const)));
const blobOf = (f: ViewerFile): Blob | null => blobMap.value.get(f.blobId) ?? null;
const current = computed<ViewerFile | null>(() => files.value.find((f) => f.id === state.value.activeId) ?? null);
const currentBlob = computed(() => (current.value ? blobOf(current.value) : null));
const missingBlob = computed(() => !!current.value && !current.value.sourceUrl && !currentBlob.value);

watch(() => files.value.map((f) => f.id).join('|'), () => {
  if (files.value.length && !files.value.some((f) => f.id === state.value.activeId)) state.value.activeId = files.value[0]!.id;
  if (!files.value.length && state.value.activeId) state.value.activeId = '';
  const ids = new Set(files.value.map((f) => f.id));
  if (selected.value.some((id) => !ids.has(id))) selected.value = selected.value.filter((id) => ids.has(id));
});

/** Libera da memória os arquivos removidos mais antigos quando passam do limite (o desfazer deles deixa de existir). */
const ORPHAN_LIMIT_BYTES = 192 * 1024 * 1024;
function trimOrphans(): void {
  const used = new Set(files.value.map((f) => f.blobId));
  const orphans = images.value.filter((i) => !used.has(i.id));
  let bytes = orphans.reduce((s, i) => s + (i.blob?.size ?? 0), 0);
  if (bytes <= ORPHAN_LIMIT_BYTES) return;
  const drop = new Set<string>();
  for (const o of orphans) { if (bytes <= ORPHAN_LIMIT_BYTES) break; drop.add(o.id); bytes -= o.blob?.size ?? 0; }
  if (drop.size) images.value = images.value.filter((i) => !drop.has(i.id));
}

async function addFiles(list: File[]): Promise<void> {
  let added = 0, lastId = '';
  for (const file of list) {
    if (files.value.length >= MAX_FILES) { fail('Um projeto aceita até ' + MAX_FILES + ' arquivos. Remova algum para abrir outro.'); break; }
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
      lastId = entry.id; added++;
    } catch { fail('Não foi possível ler “' + file.name + '”.'); }
  }
  if (lastId) openFile(lastId);
  if (added) ok(added === 1 ? 'Arquivo aberto.' : added + ' arquivos abertos.');
}
const fileInput = ref<HTMLInputElement | null>(null);
function browse(): void { fileInput.value?.click(); }
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []); input.value = '';
  await addFiles(list);
}

const linkError = ref('');
/** Links não viram cópias locais: o navegador pede a mídia direto à origem. Nada de contornar login, DRM ou bloqueio de origem. */
function addUrl(p: { url: string; choice: MediaLinkChoice; done: (ok: boolean) => void }): void {
  linkError.value = '';
  if (files.value.length >= MAX_FILES) { linkError.value = 'Um projeto aceita até ' + MAX_FILES + ' mídias.'; p.done(false); return; }
  try {
    const media = parseMediaLink(p.url, p.choice);
    const entry: ViewerFile = { id: 'f' + crypto.randomUUID().slice(0, 12), name: media.name, kind: media.kind, mime: media.mime, size: 0, blobId: '', sourceUrl: media.url };
    state.value.files.push(entry);
    openFile(entry.id);
    ok('Link adicionado ao projeto. A mídia será carregada da internet.');
    p.done(true);
  } catch (error) {
    linkError.value = error instanceof Error ? error.message : 'Não foi possível abrir esse link.';
    p.done(false);
  }
}

function removeFiles(ids: string[]): void {
  const order = ordered.value.map((f) => f.id);
  const gone = files.value.filter((f) => ids.includes(f.id));
  if (!gone.length) return;
  const wasActive = ids.includes(state.value.activeId);
  const at = Math.max(0, order.indexOf(state.value.activeId));
  const keep = order.filter((id) => !ids.includes(id));
  // Os arquivos (binários) ficam na memória: é isso que permite desfazer a remoção, mesmo depois de salvar.
  state.value.files = files.value.filter((f) => !ids.includes(f.id));
  for (const f of gone) if (f.blobId) forgetDoc(f.blobId);
  if (wasActive) {
    const next = neighborAfterRemoval(order, at);
    state.value.activeId = keep.includes(next) ? next : (keep[0] ?? '');
  }
  selected.value = selected.value.filter((id) => !ids.includes(id));
  trimOrphans();
  ok(gone.length === 1 ? '“' + gone[0]!.name + '” removido do projeto. O original no seu aparelho não foi alterado.' : gone.length + ' arquivos removidos do projeto.', true);
}
function renameFile(id: string, name: string): void {
  const f = files.value.find((x) => x.id === id);
  const clean = cleanFileName(name);
  if (!f || !clean || f.name === clean) return;
  doc.setChangeKey('rename-' + id);
  f.name = clean;
  ok('Nome alterado no projeto.');
}
function downloadFile(f: ViewerFile | null): void {
  if (!f) return;
  const b = blobOf(f);
  if (!b) { if (f.sourceUrl) notice('Esta mídia vem de um link; abra o endereço original para baixá-la.'); return; }
  downloadBlob(b, f.name);
  ok('“' + f.name + '” baixado como estava.');
}
async function downloadSelected(): Promise<void> {
  const list = files.value.filter((f) => selected.value.includes(f.id));
  const local = list.filter((f) => blobOf(f));
  for (const f of local) { downloadBlob(blobOf(f)!, f.name); await new Promise((r) => setTimeout(r, 250)); }
  const skipped = list.length - local.length;
  ok(local.length + (local.length === 1 ? ' arquivo baixado.' : ' arquivos baixados.') + (skipped ? ' ' + skipped + ' link(s) não têm arquivo para baixar.' : ''));
}

function isTextTarget(target: EventTarget | null): boolean { return isEditableTarget(target); }
function onPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || isTextTarget(event.target)) return;
  const list = Array.from(event.clipboardData?.files ?? []);
  if (!list.length) return;
  event.preventDefault();
  void addFiles(list.map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], 'imagem-colada.png', { type: f.type }))));
}
async function pasteFromClipboard(): Promise<void> {
  try {
    const items = await navigator.clipboard.read();
    const out: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) out.push(new File([await item.getType(type)], 'imagem-colada.' + (type.split('/')[1] ?? 'png'), { type }));
    }
    if (out.length) await addFiles(out); else notice('Não há imagem na área de transferência. Use Ctrl+V com um arquivo copiado.');
  } catch { notice('O navegador não permitiu ler a área de transferência. Use Ctrl+V.'); }
}
const dropping = ref(false);
let dragDepth = 0;
function onDragEnter(e: DragEvent): void { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; dropping.value = true; } }
function onDragLeave(): void { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropping.value = false; }
function onDrop(event: DragEvent): void {
  dragDepth = 0; dropping.value = false;
  const list = Array.from(event.dataTransfer?.files ?? []);
  if (!list.length) { fail('Solte arquivos aqui para abri-los.'); return; }
  void addFiles(list);
}

// ---------------------------------------------------------------- biblioteca: filtro, ordem, seleção, navegação
const query = ref('');
const kinds = ref<ViewKind[]>([]);
const selectMode = ref(false);
const selected = ref<string[]>([]);
let anchor = '';
const ordered = computed(() => sortFiles(files.value, prefs.sortKey, prefs.sortDesc));
const shown = computed(() => filterFiles(ordered.value, query.value, new Set(kinds.value)));
const counts = computed(() => kindCounts(files.value));
const position = computed(() => ordered.value.findIndex((f) => f.id === state.value.activeId));
function toggleKind(k: ViewKind): void { kinds.value = kinds.value.includes(k) ? kinds.value.filter((x) => x !== k) : [...kinds.value, k]; }
function clearFilters(): void { query.value = ''; kinds.value = []; }
watch(counts, (c) => { if (kinds.value.some((k) => !c.some((x) => x.kind === k))) kinds.value = kinds.value.filter((k) => c.some((x) => x.kind === k)); });
function toggleSelect(id: string): void { anchor = id; selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]; }
function selectRange(id: string): void {
  const ids = shown.value.map((f) => f.id);
  const a = ids.indexOf(anchor || state.value.activeId), b = ids.indexOf(id);
  if (!selectMode.value) selectMode.value = true;
  if (a < 0 || b < 0) { toggleSelect(id); return; }
  const [from, to] = a < b ? [a, b] : [b, a];
  selected.value = Array.from(new Set([...selected.value, ...ids.slice(from, to + 1)]));
}
watch(selectMode, (on) => { if (!on) { selected.value = []; anchor = ''; } });

function openFile(id: string): void {
  if (state.value.activeId !== id) state.value.activeId = id;
  if (!libDocked.value) drawerLib.value = false;
}
function step(delta: number): void {
  const list = shown.value.some((f) => f.id === state.value.activeId) ? shown.value : ordered.value;
  if (list.length < 2) return;
  const i = list.findIndex((f) => f.id === state.value.activeId);
  const at = i < 0 ? (delta > 0 ? -1 : 0) : i;
  state.value.activeId = list[(((at + delta) % list.length) + list.length) % list.length]!.id;
}

// ---------------------------------------------------------------- painéis e modos
const wide = useMediaQuery('(min-width: 1100px)', true);
const mid = useMediaQuery('(min-width: 700px)', true);
const libDocked = computed(() => mid.value);
const insDocked = computed(() => wide.value);
const drawerLib = ref(false);
const drawerIns = ref(false);
const libOpen = computed(() => (libDocked.value ? prefs.libraryOpen : drawerLib.value));
const insOpen = computed(() => (insDocked.value ? prefs.inspectorOpen : drawerIns.value));
function toggleLibrary(): void {
  if (libDocked.value) prefs.libraryOpen = !prefs.libraryOpen;
  else { drawerLib.value = !drawerLib.value; if (drawerLib.value) drawerIns.value = false; }
}
function toggleInspector(): void {
  if (insDocked.value) prefs.inspectorOpen = !prefs.inspectorOpen;
  else { drawerIns.value = !drawerIns.value; if (drawerIns.value) drawerLib.value = false; }
}
watch([libDocked, insDocked], () => { drawerLib.value = false; drawerIns.value = false; });
const libSize = useResizableSidebar('viewer-library', 300, 240, 460, 'right');
const insSize = useResizableSidebar('viewer-inspector', 312, 260, 480, 'left');

const clean = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const fullscreenOn = ref(false);
const chromeHidden = computed(() => clean.value || fullscreenOn.value);
const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
function onFullscreenChange(): void { fullscreenOn.value = !!document.fullscreenElement && document.fullscreenElement === rootEl.value; }
async function toggleFullscreen(): Promise<void> {
  const el = rootEl.value;
  if (!el) return;
  if (!canFullscreen) { clean.value = !clean.value; if (clean.value) notice('Este navegador não tem tela cheia; usei a visualização limpa. Esc volta.'); return; }
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await el.requestFullscreen(); }
  catch { fail('O navegador não permitiu a tela cheia.'); }
}
function toggleClean(): void { clean.value = !clean.value; drawerLib.value = false; drawerIns.value = false; }

// ---------------------------------------------------------------- apresentação de imagens
const slides = computed(() => ordered.value.filter((f) => f.kind === 'image' || f.kind === 'svg'));
const playing = ref(false);
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
  playing.value = true; ok('Apresentação iniciada: troca de imagem a cada ' + prefs.slideSeconds + ' s. Esc para parar.');
}
watch([playing, () => prefs.slideSeconds], () => {
  clearInterval(slideTimer);
  if (playing.value) slideTimer = setInterval(advanceSlide, prefs.slideSeconds * 1000);
});
watch(() => slides.value.length, (n) => { if (n < 2) playing.value = false; });

// ---------------------------------------------------------------- abrir uma cópia em outro app (o original continua aqui)
const codePathOf = (f: ViewerFile | null): string | null => (f && (f.kind === 'text' || f.kind === 'svg') ? cleanPath(f.name) : null);
const canCodeFile = (f: ViewerFile | null): boolean => { const p = codePathOf(f); return !!f && !!p && isTextPath(p) && !!blobOf(f); };
const canOpenInCode = computed(() => canCodeFile(current.value));
async function openInCode(f: ViewerFile | null = current.value): Promise<void> {
  const b = f ? blobOf(f) : null, path = codePathOf(f);
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
async function openInPdf(f: ViewerFile | null = current.value): Promise<void> {
  const b = f ? blobOf(f) : null;
  if (!f || !b || f.kind !== 'pdf') return;
  try {
    const count = await inspectPdf(new Uint8Array(await b.arrayBuffer()));
    if (count > MAX_PAGES) { fail('“' + f.name + '” tem ' + count + ' páginas; o Editor PDF aceita até ' + MAX_PAGES + '.'); return; }
    const id = 'pdf-' + crypto.randomUUID();
    const name = f.name.slice(0, 160);
    const project: PdfState = {
      name: name.replace(/\.pdf$/i, '').slice(0, 200) || 'Documento PDF',
      sources: [{ id, name, pages: count }],
      pages: Array.from({ length: count }, (_, i) => ({ id: pid(), src: id, index: i, rotate: 0 as const })),
      annotations: []
    };
    const copy: LegacyImage = { id, docId: '', blob: new Blob([b], { type: 'application/pdf' }), mime: 'application/pdf', name };
    const created = await createDoc(pdfKind, project, [copy]);
    await doc.saveNow();
    location.assign('/apps/pdf/?doc=' + encodeURIComponent(created.id));
  } catch (e) { fail(e instanceof Error && e.message ? e.message : 'Não foi possível criar o projeto no Editor PDF.'); }
}

// ---------------------------------------------------------------- o visualizador do formato aberto
const viewerRef = ref<ViewerHandle | null>(null);
const extra = ref('');
const details = ref<Detail[]>([]);
watch(() => current.value?.id, () => { extra.value = ''; details.value = []; problem.value = ''; });
function onMeta(e: string, d: Detail[]): void { extra.value = e; details.value = d; }
function onError(text: string): void { problem.value = text; }
const isMediaKind = computed(() => current.value?.kind === 'video' || current.value?.kind === 'audio');
const audioList = computed(() => ordered.value.filter((f) => f.kind === 'audio'));
function onAction(action: ViewerAction): void {
  switch (action) {
    case 'download': downloadFile(current.value); break;
    case 'print': void requestPrint(); break;
    case 'fullscreen': void toggleFullscreen(); break;
    case 'properties': toggleInspector(); break;
    case 'open-code': void openInCode(); break;
    case 'open-pdf': void openInPdf(); break;
    case 'remove': if (current.value) removeFiles([current.value.id]); break;
    case 'next': step(1); break;
    case 'prev': step(-1); break;
  }
}

const title = computed(() => current.value?.name ?? '');
const metaText = computed(() => {
  const f = current.value;
  if (!f) return '';
  return KIND_LABELS[f.kind] + ' · ' + (f.sourceUrl ? 'Link externo' : formatBytes(f.size)) + (extra.value ? ' · ' + extra.value : '');
});

// ---------------------------------------------------------------- imprimir (cada formato monta as próprias páginas)
function printReason(): string {
  const f = current.value;
  if (!f) return 'Abra um arquivo para imprimir.';
  if (doc.loading.value) return 'Espere o projeto terminar de abrir.';
  if (missingBlob.value) return 'O conteúdo deste arquivo não está disponível neste aparelho.';
  if (f.sourceUrl && (f.kind === 'video' || f.kind === 'audio')) return 'Para imprimir esta mídia, baixe o arquivo e abra-o pelo aparelho. Links externos podem bloquear a impressão.';
  if (problem.value) return 'Este arquivo não abriu, então não há o que imprimir.';
  return viewerRef.value?.printReason() ?? 'Espere o arquivo terminar de abrir.';
}
async function viewerPrintJob(): Promise<PrintJob | null> {
  const f = current.value, h = viewerRef.value;
  if (!f || !h || printReason()) return null;
  const pages = await h.printPages();
  return pages.length ? { title: f.name, pages } : null;
}
usePrint({ kind: 'built', build: viewerPrintJob, enabled: () => !printReason(), reason: printReason, notify: ok });

// ---------------------------------------------------------------- menus de contexto (por região e por formato)
interface OpenMenu { x: number; y: number; groups: MenuGroup[]; title: string; key: number }
const menu = ref<OpenMenu | null>(null);
let menuKey = 0;
const libraryRef = ref<InstanceType<typeof LibraryPanel> | null>(null);

function showLibrary(): void { if (libDocked.value) prefs.libraryOpen = true; else { drawerLib.value = true; drawerIns.value = false; } }
function openLinkForm(): void { showLibrary(); void nextTick(() => libraryRef.value?.openLink()); }
function focusRename(id: string): void {
  openFile(id);
  if (insDocked.value) prefs.inspectorOpen = true; else { drawerIns.value = true; drawerLib.value = false; }
  void nextTick(() => document.getElementById('vw-rename')?.focus());
}

function commonItems(f: ViewerFile): MenuGroup[] {
  const n = shown.value.length > 1 || ordered.value.length > 1;
  const groups: MenuGroup[] = [];
  if (n) groups.push({ title: 'Navegação', items: [
    { id: 'prev', label: 'Arquivo anterior', icon: 'prev', shortcut: 'Alt+←', run: () => step(-1) },
    { id: 'next', label: 'Próximo arquivo', icon: 'next', shortcut: 'Alt+→', run: () => step(1) }
  ] });
  const items: MenuGroup['items'] = [];
  if (f.kind === 'image' || f.kind === 'svg') items.push({ id: 'slideshow', label: playing.value ? 'Parar a apresentação' : 'Apresentação de imagens', icon: 'slideshow', disabled: slides.value.length < 2 && !playing.value, run: toggleSlideshow });
  items.push(
    { id: 'fullscreen', label: fullscreenOn.value ? 'Sair da tela cheia' : 'Tela cheia', icon: fullscreenOn.value ? 'exitFullscreen' : 'fullscreen', shortcut: 'F', run: () => { void toggleFullscreen(); } },
    { id: 'clean', label: clean.value ? 'Mostrar os painéis' : 'Visualização limpa', icon: 'eye', shortcut: 'C', checked: clean.value, run: toggleClean },
    { id: 'properties', label: 'Propriedades', icon: 'info', shortcut: 'I', checked: insOpen.value, run: toggleInspector },
    { id: 'library', label: 'Biblioteca', icon: 'panelLeft', shortcut: 'B', checked: libOpen.value, run: toggleLibrary }
  );
  groups.push({ title: 'Exibição', items });
  const file: MenuGroup['items'] = [
    { id: 'print', label: 'Imprimir', icon: 'print', shortcut: 'Ctrl+P', disabled: !!printReason(), run: () => { void requestPrint(); } }
  ];
  if (f.sourceUrl) file.push({ id: 'open-link', label: 'Abrir endereço original', icon: 'external', run: () => { window.open(f.sourceUrl, '_blank', 'noopener,noreferrer'); } });
  else file.push({ id: 'download', label: 'Baixar o original', icon: 'download', disabled: !currentBlob.value, run: () => downloadFile(f) });
  if (f.kind === 'pdf') file.push({ id: 'open-pdf', label: 'Abrir uma cópia no Editor PDF', icon: 'pdf', disabled: !currentBlob.value, run: () => { void openInPdf(f); } });
  if (canCodeFile(f)) file.push({ id: 'open-code', label: 'Abrir uma cópia no Código', icon: 'code', run: () => { void openInCode(f); } });
  file.push({ id: 'rename', label: 'Renomear…', icon: 'edit', run: () => focusRename(f.id) });
  file.push({ id: 'remove', label: 'Remover do projeto', icon: 'trash', danger: true, run: () => removeFiles([f.id]) });
  groups.push({ title: 'Arquivo', items: file });
  return groups;
}
function mediaMenu(): MenuGroup[] {
  const f = current.value;
  if (!f) return libraryMenu();
  return [...(viewerRef.value?.menu() ?? []), ...commonItems(f)];
}
function fileMenu(f: ViewerFile): MenuGroup[] {
  const picked = selected.value.includes(f.id);
  const batch = selectMode.value && picked && selected.value.length > 1;
  const items: MenuGroup['items'] = [];
  if (batch) {
    items.push(
      { id: 'batch-download', label: 'Baixar ' + selected.value.length + ' selecionados', icon: 'download', run: () => { void downloadSelected(); } },
      { id: 'batch-remove', label: 'Remover ' + selected.value.length + ' selecionados', icon: 'trash', danger: true, run: () => removeFiles(selected.value.slice()) }
    );
    return [{ title: selected.value.length + ' selecionados', items }, { items: [{ id: 'select-none', label: 'Limpar a seleção', icon: 'close', run: () => { selected.value = []; } }] }];
  }
  items.push({ id: 'open', label: f.id === state.value.activeId ? 'Aberto agora' : 'Abrir', icon: 'eye', disabled: f.id === state.value.activeId, run: () => openFile(f.id) });
  items.push({ id: 'select', label: picked ? 'Desmarcar' : 'Selecionar', icon: 'select', run: () => { selectMode.value = true; toggleSelect(f.id); } });
  items.push({ id: 'rename', label: 'Renomear…', icon: 'edit', run: () => focusRename(f.id) });
  const out: MenuGroup['items'] = [];
  if (f.sourceUrl) out.push({ id: 'open-link', label: 'Abrir endereço original', icon: 'external', run: () => { window.open(f.sourceUrl, '_blank', 'noopener,noreferrer'); } });
  else out.push({ id: 'download', label: 'Baixar o original', icon: 'download', disabled: !blobOf(f), run: () => downloadFile(f) });
  if (f.kind === 'pdf') out.push({ id: 'open-pdf', label: 'Abrir uma cópia no Editor PDF', icon: 'pdf', disabled: !blobOf(f), run: () => { void openInPdf(f); } });
  if (canCodeFile(f)) out.push({ id: 'open-code', label: 'Abrir uma cópia no Código', icon: 'code', run: () => { void openInCode(f); } });
  out.push({ id: 'remove', label: 'Remover do projeto', icon: 'trash', danger: true, run: () => removeFiles([f.id]) });
  return [{ items }, { title: KIND_LABELS[f.kind], items: out }];
}
function libraryMenu(): MenuGroup[] {
  const sorts: [typeof prefs.sortKey, string][] = [['ordem', 'Ordem de abertura'], ['nome', 'Nome'], ['formato', 'Formato'], ['tamanho', 'Tamanho']];
  const groups: MenuGroup[] = [
    { title: 'Adicionar', items: [
      { id: 'open-files', label: 'Abrir arquivos…', icon: 'plus', shortcut: 'Ctrl+O', run: browse },
      { id: 'open-link', label: 'Abrir mídia por link…', icon: 'link', run: openLinkForm },
      { id: 'paste', label: 'Colar imagem', icon: 'paste', shortcut: 'Ctrl+V', run: () => { void pasteFromClipboard(); } }
    ] },
    { title: 'Exibição', items: [
      { id: 'view-grid', label: 'Miniaturas', icon: 'grid', checked: prefs.libraryView === 'grade', run: () => { prefs.libraryView = 'grade'; } },
      { id: 'view-list', label: 'Lista', icon: 'list', checked: prefs.libraryView === 'lista', run: () => { prefs.libraryView = 'lista'; } }
    ] }
  ];
  if (files.value.length) {
    groups.push({ title: 'Ordenar por', items: [
      ...sorts.map(([id, label]) => ({ id: 'sort-' + id, label, icon: 'sort' as const, checked: prefs.sortKey === id, run: () => { prefs.sortKey = id; } })),
      { id: 'sort-desc', label: 'Ordem inversa', icon: 'sort', checked: prefs.sortDesc, run: () => { prefs.sortDesc = !prefs.sortDesc; } }
    ] });
    const sel: MenuGroup['items'] = [
      { id: 'select-mode', label: 'Selecionar vários', icon: 'select', checked: selectMode.value, run: () => { selectMode.value = !selectMode.value; } },
      { id: 'select-all', label: 'Selecionar todos', icon: 'check', run: () => { selectMode.value = true; selected.value = shown.value.map((f) => f.id); } }
    ];
    if (query.value.trim() || kinds.value.length) sel.push({ id: 'clear-filters', label: 'Limpar pesquisa e filtros', icon: 'close', run: clearFilters });
    groups.push({ items: sel });
  }
  return groups;
}

function openMenu(x: number, y: number, groups: MenuGroup[], title = ''): void {
  menu.value = null;
  void nextTick(() => { menu.value = { x, y, groups, title, key: ++menuKey }; });
}
/** Escolhe o menu pela região tocada: arquivo da biblioteca, mídia aberta ou área vazia. */
function menuFor(target: Element | null): { groups: MenuGroup[]; title: string } | null {
  if (!target) return null;
  const item = target.closest<HTMLElement>('[data-ctx-file]');
  if (item) {
    const f = files.value.find((x) => x.id === item.dataset.ctxFile);
    if (f) return { groups: fileMenu(f), title: f.name };
  }
  if (target.closest('[data-ctx="stage"]')) return current.value ? { groups: mediaMenu(), title: current.value.name } : { groups: libraryMenu(), title: 'Visualizador' };
  if (target.closest('[data-ctx="library"]')) return { groups: libraryMenu(), title: 'Biblioteca' };
  return null;
}
function openMenuFor(x: number, y: number, target: Element | null): boolean {
  const m = menuFor(target);
  if (!m) return false;
  openMenu(x, y, m.groups, m.title);
  return true;
}
const press = createLongPress({
  onOpen: (x, y, target) => { openMenuFor(x, y, target); },
  onFired: () => { swallowUntil = Date.now() + 700; }
});
let swallowUntil = 0;
function onContextMenu(e: MouseEvent): void {
  const t = e.target as Element | null;
  if (!t || isEditableTarget(t) || t.closest('.vm') || e.shiftKey) return;
  if (press.recentlyOpened()) { e.preventDefault(); return; }
  if (openMenuFor(e.clientX, e.clientY, t)) e.preventDefault();
}
function onPointerDown(e: PointerEvent): void {
  const t = e.target as Element | null;
  if (!t || isEditableTarget(t) || t.closest('.vm,[data-testid="text-body"]')) return; // campos e texto mantêm o toque nativo (seleção)
  press.down(e);
}
function onClickCapture(e: MouseEvent): void {
  if (Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
}
/** Botão "mais" da barra do formato e do topo: abre o menu da mídia ancorado no próprio botão. */
function openMenuAtButton(event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement | null;
  const r = el?.getBoundingClientRect();
  const groups = current.value ? mediaMenu() : libraryMenu();
  openMenu(r ? r.right : 8, r ? r.bottom : 8, groups, current.value?.name ?? 'Visualizador');
}
function openMenuFromKeyboard(): void {
  const active = document.activeElement as HTMLElement | null;
  const base = active && rootEl.value?.contains(active) ? active : rootEl.value?.querySelector<HTMLElement>('[data-ctx="stage"]') ?? null;
  if (!base) return;
  const r = base.getBoundingClientRect();
  const x = r.left + Math.min(r.width / 2, 160), y = r.top + Math.min(r.height / 2, 120);
  if (!openMenuFor(x, y, base)) openMenuFor(x, y, rootEl.value?.querySelector('[data-ctx="stage"]') ?? null);
}

// ---------------------------------------------------------------- teclado
function onKeydown(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (menu.value) return;
  if (!rootEl.value || (t && !rootEl.value.contains(t) && t !== document.body)) return;
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openMenuFromKeyboard(); return; }
  if (e.key === 'Escape') {
    if (playing.value) { playing.value = false; ok('Apresentação parada.'); e.preventDefault(); return; }
    if (clean.value && !fullscreenOn.value) { clean.value = false; e.preventDefault(); return; }
    if (!libDocked.value && drawerLib.value) { drawerLib.value = false; return; }
    if (!insDocked.value && drawerIns.value) { drawerIns.value = false; return; }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); browse(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (isEditableTarget(t)) return;
  const interactive = !!t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY' || t.getAttribute('role') === 'button');
  if (interactive && (e.key === ' ' || e.key === 'Enter')) return;
  if (viewerRef.value?.key(e)) { e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case 'f': case 'F': e.preventDefault(); void toggleFullscreen(); return;
    case 'i': case 'I': e.preventDefault(); toggleInspector(); return;
    case 'b': case 'B': e.preventDefault(); toggleLibrary(); return;
    case 'c': case 'C': e.preventDefault(); toggleClean(); return;
    case 'Delete': if (current.value && !t?.closest('[data-testid="viewer-menu"]')) { e.preventDefault(); removeFiles(selectMode.value && selected.value.length ? selected.value.slice() : [current.value.id]); } return;
    case 'ArrowLeft': case 'ArrowRight': {
      const k = current.value?.kind;
      if (!k || k === 'image' || k === 'svg' || k === 'unknown') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
      return;
    }
    default:
  }
}

onMounted(() => {
  window.addEventListener('paste', onPaste);
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
});
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  clearInterval(slideTimer); clearTimeout(messageTimer); press.cancel();
  disposeThumbs();
});
const slideOptions = SLIDE_SECONDS;
const hasMany = computed(() => ordered.value.length > 1);
const canSlide = computed(() => !!current.value && (current.value.kind === 'image' || current.value.kind === 'svg'));
</script>

<template>
  <EditorShell app="viewer" :doc="doc" layout="free">
    <div ref="rootEl" class="vw" :class="{ 'is-clean': chromeHidden, 'is-fs': fullscreenOn }" data-context-native data-testid="viewer-root"
      @contextmenu="onContextMenu" @click.capture="onClickCapture" @pointerdown="onPointerDown" @pointermove="press.move" @pointerup="press.up" @pointercancel="press.cancel"
      @dragover.prevent @dragenter="onDragEnter" @dragleave="onDragLeave" @drop.prevent="onDrop">
      <input ref="fileInput" type="file" class="sr-only" multiple tabindex="-1" aria-label="Escolher arquivos para visualizar" data-testid="viewer-input" @change="onPick" />

      <div v-if="!chromeHidden" class="vwt" role="toolbar" aria-label="Arquivo aberto" data-testid="viewer-bar">
        <button type="button" class="vw-btn" :aria-pressed="libOpen" aria-label="Biblioteca" title="Biblioteca (B)" data-testid="toggle-library" @click="toggleLibrary"><VIcon name="panelLeft" /></button>
        <div class="vwt-title">
          <strong class="vwt-name" data-testid="viewer-name">{{ title || 'Nenhum arquivo aberto' }}</strong>
          <span v-if="current" class="vwt-meta" data-testid="viewer-meta">{{ metaText }}</span>
        </div>
        <div v-if="hasMany" class="vw-group">
          <button type="button" class="vw-btn" aria-label="Arquivo anterior" title="Arquivo anterior (Alt+←)" data-testid="viewer-prev" @click="step(-1)"><VIcon name="chevronLeft" /></button>
          <span class="vwt-pos vw-hide-sm" data-testid="viewer-position">{{ position + 1 }} de {{ ordered.length }}</span>
          <button type="button" class="vw-btn" aria-label="Próximo arquivo" title="Próximo arquivo (Alt+→)" data-testid="viewer-next" @click="step(1)"><VIcon name="chevronRight" /></button>
        </div>
        <div v-if="canSlide" class="vw-group vw-hide-sm">
          <button type="button" class="vw-btn" :aria-pressed="playing" :aria-label="playing ? 'Parar a apresentação' : 'Apresentação de imagens'" title="Apresentação de imagens" data-testid="slideshow" @click="toggleSlideshow"><VIcon name="slideshow" /></button>
          <label class="sr-only" for="vw-slide">Segundos por imagem</label>
          <select id="vw-slide" v-model.number="prefs.slideSeconds" class="vw-sel" data-testid="slide-interval">
            <option v-for="s in slideOptions" :key="s" :value="s">{{ s }} s</option>
          </select>
        </div>
        <div class="vw-group vw-hide-sm">
          <button type="button" class="vw-btn" aria-label="Imprimir" title="Imprimir (Ctrl+P)" data-testid="print-app" @click="requestPrint()"><VIcon name="print" /></button>
          <button type="button" class="vw-btn" aria-label="Tela cheia" title="Tela cheia (F)" data-testid="viewer-fullscreen" :disabled="!current" @click="toggleFullscreen"><VIcon name="fullscreen" /></button>
          <button type="button" class="vw-btn" aria-label="Visualização limpa" title="Visualização limpa (C)" data-testid="clean-mode" @click="toggleClean"><VIcon name="eye" /></button>
          <button type="button" class="vw-btn" :aria-pressed="insOpen" aria-label="Propriedades" title="Propriedades (I)" data-testid="toggle-properties" @click="toggleInspector"><VIcon name="panelRight" /></button>
        </div>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="top-more" @click="openMenuAtButton"><VIcon name="more" /></button>
      </div>

      <div class="vww">
        <div v-if="!chromeHidden && libOpen" class="vwl" :class="{ drawer: !libDocked }" :style="libDocked ? { width: libSize.width.value + 'px' } : undefined" data-testid="viewer-library-pane">
          <LibraryPanel ref="libraryRef" :files="shown" :total="files.length" :counts="counts" :active-id="state.activeId" :selected="selected" :prefs="prefs" :blob-of="blobOf"
            v-model:query="query" :kinds="kinds" v-model:selectMode="selectMode" :link-error="linkError" :drawer="!libDocked"
            @toggle-kind="toggleKind" @clear-filters="clearFilters" @open="openFile" @toggle-select="toggleSelect" @select-range="selectRange"
            @select-all="selected = shown.map((f) => f.id)" @select-none="selected = []" @browse="browse" @add-url="addUrl"
            @remove-selected="removeFiles(selected.slice())" @download-selected="downloadSelected" @close="drawerLib = false" />
          <div v-if="libDocked" class="vwr right" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Ajustar a largura da biblioteca" :aria-valuenow="libSize.width.value"
            :aria-valuemin="libSize.min" :aria-valuemax="libSize.max" :class="{ active: libSize.dragging.value }"
            @pointerdown="libSize.start" @pointermove="libSize.move" @pointerup="libSize.end" @pointercancel="libSize.end" @dblclick="libSize.reset" @keydown="libSize.keys"></div>
        </div>
        <div v-if="!chromeHidden && !libDocked && drawerLib" class="vw-scrim" aria-hidden="true" @click="drawerLib = false"></div>

        <div class="vws" role="region" data-ctx="stage" data-testid="viewer-stage" :class="{ drop: dropping }" aria-label="Mídia aberta">
          <div v-if="doc.loading.value" class="vw-empty"><p class="vw-spin" role="status">Abrindo o projeto…</p></div>
          <div v-else-if="!current" class="vw-empty" data-testid="viewer-empty">
            <VIcon name="image" :size="48" />
            <h2>Visualizador</h2>
            <p data-testid="viewer-empty-hint">Abra imagens, SVG, vídeos, áudios, PDFs, modelos 3D e textos. Arraste arquivos para cá, cole com Ctrl+V ou cole o endereço direto de uma mídia. Arquivos locais não saem do aparelho; links acessam o servidor de origem.</p>
            <div class="vw-empty-actions">
              <button type="button" class="vw-btn primary" data-testid="empty-open-files" @click="browse"><VIcon name="plus" /> Abrir arquivos</button>
              <button type="button" class="vw-btn" data-testid="empty-open-link" @click="openLinkForm"><VIcon name="link" /> Abrir por link</button>
            </div>
          </div>
          <div v-else-if="missingBlob" class="vw-empty" data-testid="viewer-error" role="alert">
            <VIcon name="file" :size="44" />
            <h2>Conteúdo indisponível</h2>
            <p>Os dados de “{{ current.name }}” não estão salvos neste aparelho (podem ter sido apagados pelo navegador). Remova o item e abra o arquivo de novo.</p>
            <button type="button" class="vw-btn" @click="removeFiles([current.id])"><VIcon name="trash" /> Remover do projeto</button>
          </div>
          <template v-else>
            <p v-if="problem" class="vw-problem" role="alert" data-testid="viewer-error">
              <VIcon name="info" :size="18" /><span>{{ problem }}</span>
              <button v-if="!current.sourceUrl" type="button" class="vw-btn" data-testid="error-download" @click="downloadFile(current)"><VIcon name="download" /> Baixar</button>
              <a v-else class="vw-btn" :href="current.sourceUrl" target="_blank" rel="noopener noreferrer"><VIcon name="external" /> Abrir o endereço</a>
            </p>
            <p v-if="current.sourceUrl && !problem" class="vw-linkbar" data-testid="viewer-link-note"><VIcon name="link" :size="14" /> Mídia de um link: precisa de internet.</p>
            <template v-if="!problem || isMediaKind">
              <ImageViewer v-if="current.kind === 'image' || current.kind === 'svg'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
              <VideoPlayer v-else-if="current.kind === 'video'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
              <AudioPlayer v-else-if="current.kind === 'audio'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" :playlist="audioList" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" @select="openFile" />
              <PdfViewer v-else-if="current.kind === 'pdf'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
              <ModelViewer v-else-if="current.kind === 'model'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
              <TextViewer v-else-if="current.kind === 'text'" :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" :prefs="prefs" :can-open-in-code="canOpenInCode" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
              <UnknownViewer v-else :key="current.id" ref="viewerRef" :file="current" :blob="currentBlob" @meta="onMeta" @error="onError" @notice="notice" @action="onAction" @open-menu="openMenuAtButton" />
            </template>
          </template>
          <div v-if="dropping" class="vw-drop" aria-hidden="true"><VIcon name="plus" :size="40" /><p>Solte para abrir</p></div>
          <p v-if="message" class="vw-toast" role="status" data-testid="viewer-message">
            <span>{{ message }}</span>
            <button v-if="canUndoToast && doc.canUndo.value" type="button" class="vw-toast-btn" data-testid="toast-undo" @click="doc.undo(); message = ''">Desfazer</button>
          </p>
        </div>

        <div v-if="!chromeHidden && !insDocked && drawerIns" class="vw-scrim" aria-hidden="true" @click="drawerIns = false"></div>
        <div v-if="!chromeHidden && insOpen" class="vwi" :class="{ drawer: !insDocked }" :style="insDocked ? { width: insSize.width.value + 'px' } : undefined" data-testid="viewer-inspector">
          <div v-if="insDocked" class="vwr left" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Ajustar a largura das propriedades" :aria-valuenow="insSize.width.value"
            :aria-valuemin="insSize.min" :aria-valuemax="insSize.max" :class="{ active: insSize.dragging.value }"
            @pointerdown="insSize.start" @pointermove="insSize.move" @pointerup="insSize.end" @pointercancel="insSize.end" @dblclick="insSize.reset" @keydown="insSize.keys"></div>
          <InspectorPanel :file="current" :details="details" :position="position" :total="ordered.length" :can-open-in-code="canOpenInCode" :can-print="!printReason()" :drawer="!insDocked"
            @rename="(n) => current && renameFile(current.id, n)" @action="onAction" @close="insDocked ? (prefs.inspectorOpen = false) : (drawerIns = false)" />
        </div>
      </div>

      <div v-if="chromeHidden" class="vwf" role="group" aria-label="Controles da visualização limpa">
        <template v-if="hasMany">
          <button type="button" class="vw-btn" aria-label="Arquivo anterior" data-testid="fs-prev" @click="step(-1)"><VIcon name="chevronLeft" /></button>
          <button type="button" class="vw-btn" aria-label="Próximo arquivo" data-testid="fs-next" @click="step(1)"><VIcon name="chevronRight" /></button>
        </template>
        <button v-if="canSlide" type="button" class="vw-btn" :aria-pressed="playing" :aria-label="playing ? 'Parar a apresentação' : 'Apresentação de imagens'" data-testid="fs-slideshow" @click="toggleSlideshow"><VIcon name="slideshow" /></button>
        <button v-if="fullscreenOn" type="button" class="vw-btn primary" data-testid="viewer-exit-fullscreen" @click="toggleFullscreen"><VIcon name="exitFullscreen" /> <span class="vw-hide-sm">Sair da tela cheia</span></button>
        <button v-else type="button" class="vw-btn primary" data-testid="exit-clean" @click="clean = false"><VIcon name="exitFullscreen" /> <span class="vw-hide-sm">Mostrar painéis</span></button>
      </div>

      <ViewerContextMenu v-if="menu" :key="menu.key" :groups="menu.groups" :x="menu.x" :y="menu.y" :title="menu.title" @close="menu = null" />
    </div>
  </EditorShell>
</template>

<style scoped>
.vw { flex: 1 1 0; min-height: 0; min-width: 0; display: flex; flex-direction: column; position: relative; overflow: hidden; background: var(--st-bg); color: var(--st-fg); }
.vw.is-fs { height: 100%; width: 100%; }
.vwt { flex: none; display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--st-bar); border-bottom: 1px solid var(--st-line); min-width: 0; }
.vwt-title { flex: 1 1 auto; min-width: 0; display: grid; padding: 0 6px; }
.vwt-name { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vwt-meta { font-size: 12px; color: var(--st-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vwt-pos { font-size: 12.5px; color: var(--st-mut); font-variant-numeric: tabular-nums; padding: 0 4px; white-space: nowrap; }
.vww { flex: 1 1 0; min-height: 0; display: flex; position: relative; }
.vwl, .vwi { flex: none; position: relative; min-height: 0; display: flex; flex-direction: column; }
.vwl > :first-child, .vwi > :last-child { flex: 1 1 0; min-width: 0; min-height: 0; }
.vwl.drawer, .vwi.drawer { position: absolute; z-index: 30; top: 0; bottom: 0; width: min(350px, 90vw) !important; box-shadow: 0 0 40px rgb(0 0 0 / 55%); }
.vwl.drawer { left: 0; }
.vwi.drawer { right: 0; }
.vw-scrim { position: absolute; inset: 0; z-index: 25; background: rgb(0 0 0 / 45%); }
.vwr { position: absolute; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 5; touch-action: none; }
.vwr.right { right: -4px; }
.vwr.left { left: -4px; }
.vwr:hover, .vwr.active, .vwr:focus-visible { background: color-mix(in srgb, var(--app) 45%, transparent); outline: none; }
.vws { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; background: var(--st-bg); }
.vws.drop { outline: 3px dashed var(--app); outline-offset: -8px; }
.vw-empty { margin: auto; max-width: 520px; padding: 24px 18px; display: grid; justify-items: center; gap: 10px; text-align: center; color: var(--st-mut); }
.vw-empty h2 { margin: 4px 0 0; color: var(--st-fg); font-size: 22px; }
.vw-empty p { margin: 0; font-size: 14px; line-height: 1.55; }
.vw-empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.vw-problem { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 0; padding: 8px 14px; background: rgb(255 120 120 / 14%); border-bottom: 1px solid rgb(255 120 120 / 40%); color: var(--st-bad); font-size: 13.5px; }
.vw-problem span { flex: 1 1 240px; min-width: 0; }
.vw-linkbar { flex: none; display: flex; align-items: center; gap: 6px; margin: 0; padding: 4px 14px; font-size: 12px; color: var(--st-mut); background: var(--st-bg2); border-bottom: 1px solid var(--st-line); }
.vw-drop { position: absolute; inset: 0; z-index: 20; display: grid; place-content: center; justify-items: center; gap: 6px; background: rgb(13 17 23 / 78%); color: var(--st-fg); font-size: 18px; font-weight: 800; pointer-events: none; }
.vw-drop p { margin: 0; }
.vw-toast { position: absolute; left: 50%; bottom: calc(76px + var(--sa-b)); transform: translateX(-50%); z-index: 22; max-width: min(92%, 560px); margin: 0; padding: 8px 8px 8px 16px; display: flex; align-items: center; gap: 10px;
  background: #232c3d; color: var(--st-fg); border: 1px solid var(--st-line); border-radius: 14px; box-shadow: 0 10px 34px rgb(0 0 0 / 50%); font-size: 13.5px; }
.vw-toast-btn { flex: none; min-height: 40px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--app); color: var(--ink); font: inherit; font-weight: 800; cursor: pointer; }
.vwf { position: absolute; z-index: 40; top: calc(8px + var(--sa-t, 0px)); right: 8px; display: flex; gap: 4px; padding: 4px; background: rgb(13 17 23 / 72%); border: 1px solid var(--st-line); border-radius: 14px; backdrop-filter: blur(6px); }
.vws :deep(.vw-body) { flex: 1 1 0; }
@media (max-width: 599px) {
  .vwt { padding: 2px 4px; }
  .vwt-meta { display: none; }
  .vw-toast { bottom: calc(120px + var(--sa-b)); }
}
</style>
