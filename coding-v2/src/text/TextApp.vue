<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { getTool } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import AppIcon from '../components/ui/AppIcon.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import { RevisionConflict, type CopyRecord } from '../storage/documents';
import { friendlyError } from '../library/errors';
import { MAX_IMAGE_BYTES, MIN_IMAGE_PERCENT, TEXT_FONTS, TEXT_SIZES, cleanFont, initialTextState, normalizedTextState, sanitizeTextHtml, type TextState } from './model';
import { TextHistory } from './history';
import { readOffsets, writeOffsets } from './selection';
import { useVisualViewport } from '../composables/useVisualViewport';
import { createTextDocument, openTextDocument, saveTextDocument } from './store';

useSettingsStore();
const root = ref<HTMLElement | null>(null);
useVisualViewport(() => root.value);
const tool = getTool('texts');
const editor = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const paperEl = ref<HTMLElement | null>(null);
const pictureInput = ref<HTMLInputElement | null>(null);
const state = ref<TextState>(initialTextState());
const status = ref<SaveState>('new');
const error = ref('');
const loadError = ref('');
const note = ref('');
const loading = ref(true);
const documentRecord = shallowRef<CopyRecord | null>(null);
let committed = JSON.stringify(normalizedTextState(state.value));
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
let mounted = false;
let savedRange: Range | null = null;
let pendingSizePx = 16;

// --- desfazer / refazer ---
const editHistory = new TextHistory({ html: '', start: 0, end: 0 });
const historyTick = ref(0);
const canUndo = computed(() => { void historyTick.value; return editHistory.canUndo; });
const canRedo = computed(() => { void historyTick.value; return editHistory.canRedo; });

// --- estado de formatação sob o cursor ---
const format = reactive({ bold: false, italic: false, underline: false, block: 'p', font: 'Georgia', size: 16, align: 'left', list: '' });
const blockOptions = [
  { value: 'p', label: 'Parágrafo' }, { value: 'h1', label: 'Título 1' }, { value: 'h2', label: 'Título 2' },
  { value: 'h3', label: 'Título 3' }, { value: 'blockquote', label: 'Citação' }
] as const;
const sizeSelected = computed(() => ((TEXT_SIZES as readonly number[]).includes(format.size) ? String(format.size) : ''));

// --- imagem selecionada ---
const selectedImg = shallowRef<HTMLImageElement | null>(null);
const frame = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const imagePercent = ref(100);

const docId = new URLSearchParams(location.search).get('doc');

function message(text: string): void { note.value = text; }
function dirty(): boolean {
  try { return JSON.stringify(normalizedTextState(state.value)) !== committed; }
  catch { return true; } // Invalid or oversized input remains pending until corrected.
}
function checkChange(): void {
  if (status.value === 'conflict') return;
  if (!dirty()) {
    clearTimeout(pendingTimer);
    if (!saving) status.value = documentRecord.value ? 'saved' : 'new';
    return;
  }
  if (!saving) status.value = 'pending';
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { void saveNow(); }, 900);
}
/** Converte os <font> que o navegador cria em <span> com estilo, que é o que o documento guarda. */
function normalizeFonts(): void {
  const host = editor.value;
  if (!host) return;
  host.querySelectorAll('font').forEach((font) => {
    const span = document.createElement('span');
    const size = font.getAttribute('size');
    if (size === '7') span.style.fontSize = pendingSizePx + 'px';
    const face = font.getAttribute('face'); if (face) span.style.fontFamily = face;
    const color = font.getAttribute('color'); if (color) span.style.color = color;
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  });
}
function ensureCaretVisible(): void {
  const stage = stageEl.value, selection = window.getSelection();
  if (!stage || !selection?.rangeCount || !editor.value?.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  let rect: DOMRect | undefined = range.getClientRects()[0];
  if (!rect || (!rect.height && !rect.width)) {
    const node = range.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    rect = el?.getBoundingClientRect();
  }
  if (!rect) return;
  const box = stage.getBoundingClientRect(), margin = 28;
  if (rect.bottom > box.bottom - margin) stage.scrollTop += rect.bottom - box.bottom + margin;
  else if (rect.top < box.top + margin) stage.scrollTop -= box.top + margin - rect.top;
}
/** `key` junta digitação seguida num único passo do desfazer; comandos usam key vazia. */
function capture(key = 'typing'): void {
  if (!editor.value) return;
  normalizeFonts();
  state.value.html = editor.value.innerHTML;
  const at = readOffsets(editor.value) ?? { start: 0, end: 0 };
  if (editHistory.record({ html: state.value.html, start: at.start, end: at.end }, key)) historyTick.value += 1;
  checkChange();
  ensureCaretVisible();
  updateFrame();
}
function applySnapshot(snap: { html: string; start: number; end: number }): void {
  const host = editor.value;
  if (!host) return;
  host.innerHTML = snap.html;
  state.value.html = snap.html;
  clearImage();
  host.focus();
  try { writeOffsets(host, snap.start, snap.end); } catch { /* cursor fora do texto novo */ }
  storeSelection();
  checkChange();
  historyTick.value += 1;
  ensureCaretVisible();
}
function undo(): void {
  if (!editor.value) return;
  const at = readOffsets(editor.value);
  if (at) editHistory.moveCursor(at.start, at.end);
  const snap = editHistory.undo();
  if (snap) { applySnapshot(snap); message('Desfeito.'); }
}
function redo(): void {
  const snap = editHistory.redo();
  if (snap) { applySnapshot(snap); message('Refeito.'); }
}
function onBeforeInput(raw: Event): void {
  const event = raw as InputEvent;
  if (event.inputType === 'historyUndo') { event.preventDefault(); undo(); }
  else if (event.inputType === 'historyRedo') { event.preventDefault(); redo(); }
}
function onNameChange(): void { checkChange(); }

async function saveNow(): Promise<void> {
  clearTimeout(pendingTimer);
  if (saving || loading.value || status.value === 'conflict' || status.value === 'unavailable' || !dirty()) return;
  saving = (async () => {
    while (dirty()) {
      let snapshot: TextState;
      try { snapshot = normalizedTextState(state.value); }
      catch (err) { status.value = 'error'; error.value = friendlyError(err); return; }
      const value = JSON.stringify(snapshot);
      status.value = 'saving';
      error.value = '';
      try {
        const created = documentRecord.value
          ? await saveTextDocument(documentRecord.value, snapshot)
          : await createTextDocument(snapshot);
        const first = !documentRecord.value;
        documentRecord.value = created;
        committed = value;
        if (first) history.replaceState(null, '', location.pathname + '?doc=' + encodeURIComponent(created.id));
        status.value = dirty() ? 'pending' : 'saved';
        if (status.value === 'saved') message('Documento salvo neste aparelho.');
      } catch (err) {
        status.value = err instanceof RevisionConflict ? 'conflict' : 'error';
        error.value = err instanceof RevisionConflict
          ? 'Outra aba alterou este documento. Suas alterações continuam na tela, mas não foram sobrescritas.'
          : friendlyError(err);
        return;
      }
    }
  })();
  try { await saving; } finally { saving = null; }
}
async function resolveConflictCopy(): Promise<void> {
  try {
    const data = normalizedTextState(state.value);
    const created = await createTextDocument({ ...data, name: data.name + ' (cópia)' });
    documentRecord.value = created;
    state.value.name = data.name + ' (cópia)';
    committed = JSON.stringify(normalizedTextState(state.value));
    history.replaceState(null, '', location.pathname + '?doc=' + encodeURIComponent(created.id));
    status.value = 'saved'; error.value = '';
    message('Nova cópia salva. A versão de outra aba permaneceu intacta.');
  } catch (err) { status.value = 'error'; error.value = friendlyError(err); }
}
async function reloadSaved(): Promise<void> {
  if (!documentRecord.value) return;
  try {
    const result = await openTextDocument(documentRecord.value.id);
    documentRecord.value = result.record; state.value = result.state;
    if (editor.value) editor.value.innerHTML = result.state.html;
    clearImage();
    editHistory.reset({ html: editor.value?.innerHTML ?? result.state.html, start: 0, end: 0 }); historyTick.value += 1;
    committed = JSON.stringify(result.state); status.value = 'saved'; error.value = '';
    message('Versão salva reaberta.');
  } catch (err) { error.value = friendlyError(err); }
}
function storeSelection(): void {
  const el = editor.value, selection = window.getSelection();
  if (!el || !selection?.rangeCount || !selection.anchorNode || !el.contains(selection.anchorNode)) return;
  savedRange = selection.getRangeAt(0).cloneRange();
  updateFormat();
}
function updateFormat(): void {
  const host = editor.value, selection = window.getSelection();
  if (!host || !selection?.anchorNode || !host.contains(selection.anchorNode)) return;
  try {
    format.bold = document.queryCommandState('bold');
    format.italic = document.queryCommandState('italic');
    format.underline = document.queryCommandState('underline');
  } catch { /* comando indisponível neste navegador */ }
  const node = selection.anchorNode;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!el) return;
  const block = el.closest('h1,h2,h3,blockquote,p,li');
  format.block = block && ['H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(block.tagName) ? block.tagName.toLowerCase() : 'p';
  const css = getComputedStyle(el);
  format.font = cleanFont(css.fontFamily) ?? 'Georgia';
  format.size = Math.round(Number.parseFloat(css.fontSize)) || 16;
  const a = css.textAlign;
  format.align = a === 'center' || a === 'right' || a === 'justify' ? a : 'left';
  format.list = el.closest('ul') ? 'ul' : el.closest('ol') ? 'ol' : '';
}
function restoreSelection(): void {
  editor.value?.focus();
  if (!savedRange) return;
  try {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
  } catch { /* cursor removed when document changed, edit at current position */ }
}
/** Executa um comando sobre a seleção guardada. `css` faz o navegador gravar estilos em vez de tags (cores e fonte). */
function command(name: string, value?: string, css = false): boolean {
  restoreSelection();
  document.execCommand('styleWithCSS', false, css ? 'true' : 'false');
  const ok = document.execCommand(name, false, value);
  document.execCommand('styleWithCSS', false, 'false');
  capture('');
  storeSelection();
  return ok;
}
function setBlock(event: Event): void { command('formatBlock', (event.target as HTMLSelectElement).value); }
function setFont(event: Event): void { command('fontName', (event.target as HTMLSelectElement).value, true); }
function setSize(event: Event): void {
  const px = Number((event.target as HTMLSelectElement).value);
  if (!px) return;
  pendingSizePx = px;
  command('fontSize', '7');
}
function setColor(event: Event): void { command('foreColor', (event.target as HTMLInputElement).value, true); }
function setHighlight(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (!command('hiliteColor', value, true)) command('backColor', value, true);
}
function clearHighlight(): void {
  if (!command('hiliteColor', 'transparent', true)) command('backColor', 'transparent', true);
  const host = editor.value;
  host?.querySelectorAll<HTMLElement>('span').forEach((span) => {
    const bg = span.style.backgroundColor;
    if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') { span.style.removeProperty('background-color'); if (!span.getAttribute('style')) span.removeAttribute('style'); }
  });
  capture('');
}

// --- imagem: seleção, tamanho e remoção ---
function clearImage(): void { selectedImg.value = null; frame.value = null; }
function updateFrame(): void {
  const img = selectedImg.value, paper = paperEl.value;
  if (!img || !paper || !img.isConnected) { frame.value = null; return; }
  const r = img.getBoundingClientRect(), p = paper.getBoundingClientRect();
  frame.value = { left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height };
  const content = contentWidth();
  imagePercent.value = content ? Math.min(100, Math.round((r.width / content) * 100)) : 100;
}
function contentWidth(): number {
  const host = editor.value;
  if (!host) return 0;
  const css = getComputedStyle(host);
  return host.clientWidth - Number.parseFloat(css.paddingLeft) - Number.parseFloat(css.paddingRight);
}
function onEditorClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof HTMLImageElement && editor.value?.contains(target)) {
    selectedImg.value = target;
    updateFrame();
    message('Imagem selecionada: use os botões de tamanho ou arraste o canto.');
  } else if (selectedImg.value) clearImage();
}
function setImagePercent(percent: number): void {
  const img = selectedImg.value;
  if (!img) return;
  const value = Math.max(MIN_IMAGE_PERCENT, Math.min(100, Math.round(percent)));
  img.style.width = value + '%';
  img.style.height = '';
  capture('');
  message('Imagem com ' + value + '% da largura da página.');
}
const stepImage = (delta: number): void => setImagePercent(imagePercent.value + delta);
function removeImage(): void {
  const img = selectedImg.value;
  if (!img) return;
  img.remove();
  clearImage();
  capture('');
  editor.value?.focus();
  message('Imagem removida.');
}
function startResize(event: PointerEvent): void {
  const img = selectedImg.value, handle = event.currentTarget as HTMLElement;
  if (!img) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  const startX = event.clientX, startW = img.getBoundingClientRect().width, full = contentWidth();
  const move = (e: PointerEvent): void => {
    img.style.width = Math.max(MIN_IMAGE_PERCENT, Math.min(100, Math.round(((startW + e.clientX - startX) / full) * 100))) + '%';
    img.style.height = '';
    updateFrame();
  };
  const up = (): void => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    capture('');
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}
function pastePlain(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  restoreSelection();
  document.execCommand('insertText', false, text);
  capture('');
}
async function addPicture(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
    error.value = 'Use PNG, JPG ou WebP de até 1,5 MB por imagem.'; return;
  }
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    restoreSelection();
    document.execCommand('insertImage', false, url);
    capture('');
    message('Imagem inserida. Ela será guardada dentro do documento.');
  } catch (err) { error.value = friendlyError(err); }
}
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function download(name: string, contents: Blob): void {
  const url = URL.createObjectURL(contents);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
const filename = () => (state.value.name.trim() || 'Documento').replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 60);
function exportHtml(): void {
  try {
    const html = sanitizeTextHtml(editor.value?.innerHTML ?? state.value.html);
    const title = escapeHtml(state.value.name);
    const page = '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + title
      + '</title><style>body{font:16px/1.55 Georgia,serif;max-width:170mm;margin:20mm auto;color:#18202d}img{max-width:100%;height:auto}@media print{@page{size:A4;margin:20mm}body{margin:0}}</style></head><body>'
      + html + '</body></html>';
    download(filename() + '.html', new Blob([page], { type: 'text/html;charset=utf-8' }));
    message('HTML exportado. Confira o arquivo salvo pelo navegador.');
  } catch (err) { error.value = friendlyError(err); }
}
function exportTxt(): void {
  download(filename() + '.txt', new Blob([editor.value?.innerText ?? ''], { type: 'text/plain;charset=utf-8' }));
  message('Texto exportado.');
}
function printDocument(): void { window.print(); }
function newDocument(): void {
  if (dirty() || status.value === 'saving' || status.value === 'error' || status.value === 'conflict') {
    if (!confirm('Há alterações que podem não ter sido salvas. Criar outro documento mesmo assim?')) return;
  }
  location.assign('/apps/texto/');
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (dirty() || saving || status.value === 'conflict') { event.preventDefault(); event.returnValue = ''; }
}
function keyboard(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); void saveNow(); return; }
  const active = document.activeElement;
  const inDocument = !!editor.value && (editor.value.contains(active) || active === document.body);
  if (!inDocument) return; // no campo do nome valem os atalhos do próprio campo
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
  else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
}
onMounted(async () => {
  mounted = true;
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('keydown', keyboard);
  document.addEventListener('selectionchange', storeSelection);
  try {
    if (docId) {
      const opened = await openTextDocument(docId);
      if (!mounted) return;
      documentRecord.value = opened.record; state.value = opened.state;
      committed = JSON.stringify(opened.state); status.value = 'saved';
    }
    if (editor.value) editor.value.innerHTML = state.value.html;
    editHistory.reset({ html: editor.value?.innerHTML ?? state.value.html, start: 0, end: 0 });
  } catch (err) { loadError.value = friendlyError(err); status.value = 'unavailable'; }
  finally { loading.value = false; }
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(pendingTimer);
  document.removeEventListener('selectionchange', storeSelection);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('keydown', keyboard);
});
</script>

<template>
  <div ref="root" class="text-app" :style="{ '--app': tool.color }">
    <a class="skip-link" href="#text-body">Pular para o documento</a>
    <header class="top">
      <a class="back" :href="LAUNCHER_PATH + '#/documentos'" aria-label="Voltar à biblioteca">← <span class="back-label">Documentos</span></a>
      <AppIcon id="texts" size="sm" />
      <div class="title">
        <h1>Texto</h1>
        <span class="muted tiny">Editor de documentos · Coding 2.0</span>
      </div>
      <SaveStatus :state="status" />
    </header>
    <section v-if="status === 'conflict'" role="alert" class="alert" data-testid="text-conflict">
      <strong>Conflito de edição.</strong> {{ error }}
      <button class="btn btn-primary" type="button" @click="resolveConflictCopy">Salvar como nova cópia</button>
      <button class="btn" type="button" @click="reloadSaved">Reabrir a versão salva</button>
    </section>
    <section v-else-if="error" role="alert" class="alert" data-testid="text-error">
      {{ error }} Suas alterações continuam na tela.
      <button v-if="status === 'error'" type="button" class="btn" @click="saveNow">Tentar salvar</button>
      <button v-else type="button" class="btn" @click="error = ''">Fechar aviso</button>
    </section>
    <p v-if="loadError" class="alert" role="alert" data-testid="text-load-error">
      {{ loadError }} <a :href="LAUNCHER_PATH + '#/documentos'">Voltar à biblioteca</a>
    </p>
    <template v-else>
      <section class="document-meta" aria-label="Detalhes do documento">
        <label for="text-title">Nome do documento</label>
        <input id="text-title" v-model="state.name" type="text" maxlength="250" placeholder="Documento sem título" @input="onNameChange" />
        <button type="button" class="btn btn-ghost" @click="newDocument">Novo</button>
        <button type="button" class="btn" :disabled="loading" data-testid="text-save" @click="saveNow">Salvar agora</button>
      </section>
      <div class="editing">
        <div class="toolbar" role="toolbar" aria-label="Ferramentas de texto" data-testid="text-toolbar">
          <div class="grp" role="group" aria-label="Histórico">
            <button type="button" class="tool" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" data-testid="text-undo" :disabled="!canUndo" @mousedown.prevent @click="undo">↶</button>
            <button type="button" class="tool" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" data-testid="text-redo" :disabled="!canRedo" @mousedown.prevent @click="redo">↷</button>
          </div>
          <div class="grp" role="group" aria-label="Fonte e estilo">
            <select class="tool sel" aria-label="Estilo do parágrafo" data-testid="text-block" :value="format.block" @change="setBlock">
              <option v-for="b in blockOptions" :key="b.value" :value="b.value">{{ b.label }}</option>
            </select>
            <select class="tool sel" aria-label="Fonte" data-testid="text-font" :value="format.font" @change="setFont">
              <option v-for="f in TEXT_FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
            </select>
            <select class="tool sel narrow" aria-label="Tamanho da fonte" data-testid="text-size" :value="sizeSelected" @change="setSize">
              <option value="" disabled>{{ format.size }}</option>
              <option v-for="n in TEXT_SIZES" :key="n" :value="String(n)">{{ n }}</option>
            </select>
          </div>
          <div class="grp" role="group" aria-label="Caracteres">
            <button type="button" class="tool" :aria-pressed="format.bold" title="Negrito (Ctrl+B)" aria-label="Negrito" @mousedown.prevent @click="command('bold')"><strong>N</strong></button>
            <button type="button" class="tool" :aria-pressed="format.italic" title="Itálico (Ctrl+I)" aria-label="Itálico" @mousedown.prevent @click="command('italic')"><em>I</em></button>
            <button type="button" class="tool" :aria-pressed="format.underline" title="Sublinhado (Ctrl+U)" aria-label="Sublinhado" @mousedown.prevent @click="command('underline')"><u>S</u></button>
            <label class="tool color" title="Cor do texto"><span class="sr-only">Cor do texto</span><input type="color" value="#c0392b" data-testid="text-color" @change="setColor" /><span class="swatch" aria-hidden="true"><b>A</b><i class="bar" style="background:#c0392b"></i></span></label>
            <label class="tool color" title="Cor de destaque"><span class="sr-only">Cor de destaque</span><input type="color" value="#ffe066" data-testid="text-highlight" @change="setHighlight" /><span class="swatch" aria-hidden="true"><b class="hl">A</b></span></label>
            <button type="button" class="tool" aria-label="Remover destaque" title="Remover destaque" data-testid="text-clear-highlight" @mousedown.prevent @click="clearHighlight">A̸</button>
            <button type="button" class="tool" aria-label="Limpar formatação" title="Limpar formatação" @mousedown.prevent @click="command('removeFormat')">Tx</button>
          </div>
          <div class="grp" role="group" aria-label="Parágrafo">
            <button type="button" class="tool" :aria-pressed="format.align === 'left'" aria-label="Alinhar à esquerda" @mousedown.prevent @click="command('justifyLeft')">⇤</button>
            <button type="button" class="tool" :aria-pressed="format.align === 'center'" aria-label="Centralizar" @mousedown.prevent @click="command('justifyCenter')">≡</button>
            <button type="button" class="tool" :aria-pressed="format.align === 'right'" aria-label="Alinhar à direita" @mousedown.prevent @click="command('justifyRight')">⇥</button>
            <button type="button" class="tool" :aria-pressed="format.align === 'justify'" aria-label="Justificar" @mousedown.prevent @click="command('justifyFull')">☰</button>
            <button type="button" class="tool" :aria-pressed="format.list === 'ul'" aria-label="Lista com marcadores" @mousedown.prevent @click="command('insertUnorderedList')">• Lista</button>
            <button type="button" class="tool" :aria-pressed="format.list === 'ol'" aria-label="Lista numerada" @mousedown.prevent @click="command('insertOrderedList')">1. Lista</button>
          </div>
          <div class="grp" role="group" aria-label="Imagem">
            <button type="button" class="tool" data-testid="text-image-button" @click="pictureInput?.click()">Imagem</button>
            <input ref="pictureInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" aria-label="Selecionar imagem para o texto" @change="addPicture" />
            <template v-if="selectedImg">
              <button type="button" class="tool" aria-label="Diminuir imagem" data-testid="img-smaller" @mousedown.prevent @click="stepImage(-10)">−</button>
              <output class="pct" data-testid="img-percent" aria-label="Largura da imagem">{{ imagePercent }}%</output>
              <button type="button" class="tool" aria-label="Aumentar imagem" data-testid="img-bigger" @mousedown.prevent @click="stepImage(10)">+</button>
              <button type="button" class="tool" aria-label="Imagem com 25%" @mousedown.prevent @click="setImagePercent(25)">25%</button>
              <button type="button" class="tool" aria-label="Imagem com 50%" data-testid="img-50" @mousedown.prevent @click="setImagePercent(50)">50%</button>
              <button type="button" class="tool" aria-label="Imagem com 100%" @mousedown.prevent @click="setImagePercent(100)">100%</button>
              <button type="button" class="tool danger" aria-label="Remover imagem" data-testid="img-remove" @mousedown.prevent @click="removeImage">Remover</button>
            </template>
          </div>
          <div class="grp output" role="group" aria-label="Exportar">
            <button type="button" class="tool" aria-label="Exportar HTML" @click="exportHtml"><span class="wide-label">Exportar </span>HTML</button>
            <button type="button" class="tool" aria-label="Exportar TXT" @click="exportTxt"><span class="wide-label">Exportar </span>TXT</button>
            <button type="button" class="tool strong" aria-label="Imprimir / PDF" @click="printDocument"><span class="wide-label">Imprimir / </span>PDF</button>
          </div>
        </div>
        <main ref="stageEl" class="stage" tabindex="0" aria-label="Área de edição" @scroll.passive="updateFrame">
          <p v-if="loading" class="muted" role="status">Abrindo documento…</p>
          <section v-show="!loading" ref="paperEl" class="paper" aria-label="Página do documento">
            <div id="text-body" ref="editor" class="body" contenteditable="true" role="textbox"
              aria-label="Conteúdo do documento" aria-multiline="true" data-testid="text-editor"
              spellcheck="true" @input="capture()" @paste="pastePlain" @drop.prevent @click="onEditorClick" @beforeinput="onBeforeInput" />
            <div v-if="frame" class="img-frame" data-testid="img-frame" aria-hidden="true"
              :style="{ left: frame.left + 'px', top: frame.top + 'px', width: frame.width + 'px', height: frame.height + 'px' }">
              <span class="handle" data-testid="img-handle" @pointerdown="startResize"></span>
            </div>
          </section>
        </main>
      </div>
      <p class="hint muted" role="status" data-testid="text-announcement">{{ note || 'Edite a folha. O documento é salvo após as alterações.' }}</p>
    </template>
  </div>
</template>

<style scoped>
.text-app { height: 100dvh; display: flex; flex-direction: column; background: var(--bg); overflow: hidden; }
.top { display: flex; align-items: center; gap: 10px; min-height: calc(62px + var(--sa-t)); padding: var(--sa-t) max(12px,var(--sa-r)) 0 max(12px,var(--sa-l)); background: var(--surface); border-bottom: 3px solid var(--app); }
.back { display: flex; align-items: center; gap: 6px; min-width: 44px; min-height: 44px; padding: 0 8px; border-radius: 10px; color: var(--accent); font-weight: 700; text-decoration: none; }
.back:hover { background: var(--panel); }
.title { flex: 1; min-width: 0; }
.title h1 { margin: 0; font-size: 18px; }
.tiny { font-size: 12px; }
.document-meta { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.document-meta label { font-weight: 700; font-size: 13px; white-space: nowrap; }
.document-meta input { flex: 1; min-width: 0; padding: 9px 12px; min-height: 44px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; }
.editing { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
.grp { display: flex; align-items: center; gap: 4px; min-width: 0; }
.tool { border: 1px solid transparent; background: var(--panel); color: var(--text); border-radius: 9px; min-width: 44px; min-height: 44px; padding: 7px 10px; font-size: 14px; font-weight: 700; white-space: nowrap; }
.tool:hover:not(:disabled) { border-color: var(--accent); }
.tool:disabled { opacity: .4; }
.tool[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 22%, var(--panel)); border-color: var(--accent); }
.tool:focus-visible, .tool:focus-within { outline: 3px solid var(--accent); outline-offset: 1px; }
.sel { font-weight: 600; max-width: 150px; padding: 7px 6px; }
.sel.narrow { min-width: 64px; max-width: 78px; }
.strong { background: var(--accent); color: var(--accent-ink); }
.danger { color: var(--danger); }
.pct { min-width: 46px; text-align: center; font-weight: 800; font-size: 13px; }
.color { position: relative; display: inline-grid; place-items: center; padding: 0; cursor: pointer; }
.color input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.swatch { display: grid; place-items: center; line-height: 1; pointer-events: none; }
.swatch b { font-size: 16px; }
.swatch .bar { display: block; width: 20px; height: 4px; border-radius: 2px; margin-top: 2px; }
.swatch .hl { background: #ffe066; color: #171c25; padding: 0 5px; border-radius: 3px; }
.stage { flex: 1; min-height: 0; overflow: auto; padding: 28px 20px 56px; background: var(--bg); scroll-padding-block: 40px; }
.paper { position: relative; background: #fff; color: #171c25; width: min(100%, 210mm); margin-inline: auto; min-height: 297mm; box-shadow: 0 12px 35px #0002; border: 1px solid #d7dce5; }
.body { min-height: 297mm; padding: 20mm; outline-offset: -4px; overflow-wrap: anywhere; font: 16px/1.6 Georgia,serif; }
.body :deep(h1) { font-size: 28px; line-height: 1.2; margin: 0 0 .5em; }
.body :deep(h2) { font-size: 22px; line-height: 1.3; margin: 0 0 .5em; }
.body :deep(h3) { font-size: 18px; line-height: 1.35; margin: 0 0 .5em; }
.body :deep(p) { margin: 0 0 .8em; }
.body :deep(img) { max-width: 100%; height: auto; display: block; cursor: pointer; }
.body :deep(blockquote) { border-left: 3px solid #8da5d9; padding-left: 15px; margin: 0 0 .8em; color: #36475c; }
.img-frame { position: absolute; border: 2px solid var(--accent, #3b6ec0); border-radius: 2px; pointer-events: none; box-sizing: border-box; }
.handle { position: absolute; right: -16px; bottom: -16px; width: 32px; height: 32px; pointer-events: auto; cursor: nwse-resize; touch-action: none; }
.handle::after { content: ""; position: absolute; right: 9px; bottom: 9px; width: 14px; height: 14px; border-radius: 50%; background: var(--accent, #3b6ec0); border: 2px solid #fff; }
.alert { margin: 0; padding: 12px 16px; background: var(--panel); border-bottom: 2px solid var(--danger); color: var(--text); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hint { margin: 0; padding: 6px 18px; background: var(--surface); font-size: 12px; border-top: 1px solid var(--border); }
@media (max-width: 899px) {
  /* Celular: a página ocupa a parte de cima; UMA barra horizontal rolável fica embaixo, acima do teclado. */
  .text-app { position: fixed; left: 0; right: 0; top: var(--vv-top, 0px); height: var(--vv-h, 100dvh); }
  .toolbar { flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: flex-start; gap: 4px 12px; order: 2; min-height: 52px; padding: 4px 8px calc(4px + var(--sa-b)); border-bottom: 0; border-top: 1px solid var(--border); overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
  .grp { flex: none; padding: 3px 0; }
  .wide-label { display: none; }
  .stage { order: 1; padding: 14px 8px; }
  .paper, .body { min-height: 560px; }
  .body { padding: 22px 18px; }
}
@media (max-width: 599px) {
  .top { gap: 6px; }
  .title h1 { font-size: 16px; }
  .tiny,.back-label { display: none; }
  .document-meta { flex-wrap: wrap; gap: 6px; padding: 6px 10px; }
  .document-meta label { width: 100%; }
  .document-meta .btn { flex: 0 0 auto; padding-inline: 10px; }
  .body { font-size: 15px; }
  .hint { display: none; }
}
@media print {
  :global(html), :global(body), :global(#app) { height: auto !important; background: white !important; }
  .text-app, .editing, .stage { display: block !important; position: static !important; height: auto !important; overflow: visible !important; background: white !important; }
  .top, .document-meta, .toolbar, .hint, .alert, .img-frame { display: none !important; }
  .stage { padding: 0 !important; }
  .paper { width: auto; min-height: 0; border: 0; box-shadow: none; margin: 0; }
  .body { min-height: 0; padding: 0; }
  @page { size: A4; margin: 20mm; }
}
</style>
