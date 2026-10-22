<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { getTool } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import AppIcon from '../components/ui/AppIcon.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import { RevisionConflict, type CopyRecord } from '../storage/documents';
import { friendlyError } from '../library/errors';
import { MAX_IMAGE_BYTES, initialTextState, normalizedTextState, sanitizeTextHtml, type TextState } from './model';
import { createTextDocument, openTextDocument, saveTextDocument } from './store';

useSettingsStore();
const tool = getTool('texts');
const editor = ref<HTMLElement | null>(null);
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
function capture(): void {
  if (!editor.value) return;
  state.value.html = editor.value.innerHTML;
  checkChange();
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
    committed = JSON.stringify(result.state); status.value = 'saved'; error.value = '';
    message('Versão salva reaberta.');
  } catch (err) { error.value = friendlyError(err); }
}
function storeSelection(): void {
  const el = editor.value, selection = window.getSelection();
  if (!el || !selection?.rangeCount || !selection.anchorNode || !el.contains(selection.anchorNode)) return;
  savedRange = selection.getRangeAt(0).cloneRange();
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
function command(name: string, value?: string): void {
  restoreSelection();
  document.execCommand(name, false, value);
  capture();
  storeSelection();
}
function pastePlain(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  restoreSelection();
  document.execCommand('insertText', false, text);
  capture();
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
    capture();
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault(); void saveNow();
  }
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
  <div class="text-app" :style="{ '--app': tool.color }">
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
        <section class="toolbar" aria-label="Ferramentas de texto">
          <div class="toolbar-row">
            <button type="button" class="tool" title="Negrito" aria-label="Negrito" @mousedown.prevent @click="command('bold')"><strong>N</strong></button>
            <button type="button" class="tool" title="Itálico" aria-label="Itálico" @mousedown.prevent @click="command('italic')"><em>I</em></button>
            <button type="button" class="tool" title="Sublinhado" aria-label="Sublinhado" @mousedown.prevent @click="command('underline')"><u>S</u></button>
            <span class="sep" aria-hidden="true"></span>
            <button type="button" class="tool" aria-label="Título" @mousedown.prevent @click="command('formatBlock', 'h2')">Título</button>
            <button type="button" class="tool" aria-label="Parágrafo" @mousedown.prevent @click="command('formatBlock', 'p')">Texto</button>
            <span class="sep" aria-hidden="true"></span>
            <button type="button" class="tool" aria-label="Lista com marcadores" @mousedown.prevent @click="command('insertUnorderedList')">• Lista</button>
            <button type="button" class="tool" aria-label="Lista numerada" @mousedown.prevent @click="command('insertOrderedList')">1. Lista</button>
            <button type="button" class="tool" aria-label="Alinhar à esquerda" @mousedown.prevent @click="command('justifyLeft')">☷</button>
            <button type="button" class="tool" aria-label="Centralizar" @mousedown.prevent @click="command('justifyCenter')">≡</button>
            <span class="sep" aria-hidden="true"></span>
            <button type="button" class="tool" data-testid="text-image-button" @click="pictureInput?.click()">Imagem</button>
            <input ref="pictureInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" aria-label="Selecionar imagem para o texto" @change="addPicture" />
          </div>
          <div class="toolbar-row output">
            <button type="button" class="tool" @click="exportHtml">Exportar HTML</button>
            <button type="button" class="tool" @click="exportTxt">Exportar TXT</button>
            <button type="button" class="tool strong" @click="printDocument">Imprimir / PDF</button>
          </div>
        </section>
        <main class="stage" tabindex="0" aria-label="Área de edição">
          <p v-if="loading" class="muted" role="status">Abrindo documento…</p>
          <section v-show="!loading" class="paper" aria-label="Página do documento">
            <div id="text-body" ref="editor" class="body" contenteditable="true" role="textbox"
              aria-label="Conteúdo do documento" aria-multiline="true" data-testid="text-editor"
              spellcheck="true" @input="capture" @paste="pastePlain" @drop.prevent />
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
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px; padding: 8px 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
.toolbar-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.tool { border: 1px solid transparent; background: var(--panel); border-radius: 9px; min-width: 42px; min-height: 44px; padding: 7px 10px; font-size: 13px; font-weight: 700; white-space: nowrap; }
.tool:hover { border-color: var(--accent); }
.strong { background: var(--accent); color: var(--accent-ink); }
.sep { display: block; width: 1px; height: 24px; margin: 0 4px; background: var(--border); }
.stage { flex: 1; min-height: 0; overflow: auto; padding: 28px 20px 56px; background: var(--bg); }
.paper { background: #fff; color: #171c25; width: min(100%,794px); margin-inline: auto; min-height: 1000px; box-shadow: 0 12px 35px #0002; border: 1px solid #d7dce5; }
.body { min-height: 1000px; padding: clamp(22px,8vw,76px); outline-offset: -4px; overflow-wrap: anywhere; font: 16px/1.6 Georgia,serif; }
.body :deep(h1) { font-size: 28px; line-height: 1.2; }
.body :deep(h2) { font-size: 22px; line-height: 1.3; }
.body :deep(img) { max-width: 100%; height: auto; display: block; }
.body :deep(blockquote) { border-left: 3px solid #8da5d9; padding-left: 15px; margin-left: 0; color: #36475c; }
.alert { margin: 0; padding: 12px 16px; background: var(--panel); border-bottom: 2px solid var(--danger); color: var(--text); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hint { margin: 0; padding: 6px 18px; background: var(--surface); font-size: 12px; border-top: 1px solid var(--border); }
@media (max-width: 899px) {
  .toolbar { flex-direction: column; align-items: stretch; order: 2; padding: 4px 8px calc(4px + var(--sa-b)); border-bottom: 0; border-top: 1px solid var(--border); }
  .toolbar-row { overflow-x: auto; overscroll-behavior-x: contain; padding: 3px 0; }
  .output { justify-content: flex-start; }
  .stage { order: 1; padding: 14px 8px; }
  .paper, .body { min-height: 660px; }
}
@media (max-width: 599px) {
  .top { gap: 6px; }
  .title h1 { font-size: 16px; }
  .tiny,.back-label { display: none; }
  .document-meta { flex-wrap: wrap; gap: 6px; padding: 6px 10px; }
  .document-meta label { width: 100%; }
  .document-meta .btn { flex: 0 0 auto; padding-inline: 10px; }
  .body { font-size: 15px; padding: 22px 18px; }
  .hint { display: none; }
}
@media print {
  :global(html), :global(body), :global(#app) { height: auto !important; background: white !important; }
  .text-app, .editing, .stage { display: block !important; height: auto !important; overflow: visible !important; background: white !important; }
  .top, .document-meta, .toolbar, .hint, .alert { display: none !important; }
  .stage { padding: 0 !important; }
  .paper { width: auto; min-height: 0; border: 0; box-shadow: none; margin: 0; }
  .body { min-height: 0; padding: 0; }
  @page { size: A4; margin: 20mm; }
}
</style>
