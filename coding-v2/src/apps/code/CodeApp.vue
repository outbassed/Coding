<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { buildZip } from '../zip/zip';
import { formatBytes } from '../../shared/bytes';
import { buildPreviewDoc, buildStandalone, exportFiles, parseConsoleMessage, SANDBOX, type ConsoleLine } from './build';
import { CODE_FILES, FILE_LABELS, FILE_NAMES, MAX_FILE_CHARS, totalChars, type CodeFile } from './model';
import { codeKind, codeTemplates } from './kind';

const doc = useDocument({ kind: codeKind, templates: codeTemplates, path: '/apps/codigo/' });
const { state } = doc;
const tabs = [{ id: 'executar', label: 'Executar' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('executar');
const active = ref<CodeFile>('html');
const view = ref<'editor' | 'result'>('editor');
const editorEl = ref<HTMLTextAreaElement | null>(null);
const frameEl = ref<HTMLIFrameElement | null>(null);
const info = ref('');
const cursor = ref({ line: 1, col: 1 });

// ---- execução ----
const frameDoc = ref('');
const runId = ref(0);
const lines = ref<ConsoleLine[]>([]);
const MAX_LINES = 300;
function run(): void {
  lines.value = [];
  frameDoc.value = buildPreviewDoc(state.value);
  runId.value++;
}
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(): void {
  clearTimeout(timer);
  if (state.value.auto) timer = setTimeout(run, 700);
}
watch(() => [state.value.html, state.value.css, state.value.js], schedule);
watch(() => state.value.auto, (on) => { if (on) run(); });
// documento aberto, desfazer/refazer ou modelo novo trocam o estado inteiro: mostra o resultado na hora
watch(state, run);
function onMessage(event: MessageEvent): void {
  if (!frameEl.value || event.source !== frameEl.value.contentWindow) return; // só o nosso quadro
  const line = parseConsoleMessage(event.data);
  if (!line) return;
  lines.value = [...lines.value.slice(-(MAX_LINES - 1)), line];
}
onMounted(() => { window.addEventListener('message', onMessage); run(); });
onBeforeUnmount(() => { window.removeEventListener('message', onMessage); clearTimeout(timer); });

// ---- editor ----
const text = computed(() => state.value[active.value]);
function updateCursor(): void {
  const el = editorEl.value; if (!el) return;
  const before = el.value.slice(0, el.selectionStart);
  const nl = before.lastIndexOf('\n');
  cursor.value = { line: before.split('\n').length, col: el.selectionStart - nl };
}
function onInput(event: Event): void {
  const el = event.target as HTMLTextAreaElement;
  doc.setChangeKey('type-' + active.value);
  state.value[active.value] = el.value.slice(0, MAX_FILE_CHARS);
  if (el.value.length > MAX_FILE_CHARS) { el.value = state.value[active.value]; info.value = 'O arquivo passa de ' + MAX_FILE_CHARS.toLocaleString('pt-BR') + ' caracteres; o excedente foi cortado.'; }
  updateCursor();
}
/** Insere texto na posição do cursor mantendo o desfazer nativo do campo quando o navegador deixa. */
function insert(el: HTMLTextAreaElement, value: string): void {
  if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, value)) return;
  el.setRangeText(value, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
let escaped = false; // depois de Esc, a próxima tecla Tab sai do campo (acessibilidade)
function onKey(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement;
  if (event.key === 'Escape') { escaped = true; return; }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); return; }
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (escaped) { escaped = false; return; }
    event.preventDefault();
    const unit = ' '.repeat(state.value.tabSize);
    const { selectionStart: a, selectionEnd: b, value } = el;
    const multi = value.slice(a, b).includes('\n');
    if (!multi && !event.shiftKey) { insert(el, unit); return; }
    // vários trechos de linha: recua ou avança todas as linhas tocadas
    const start = value.lastIndexOf('\n', a - 1) + 1;
    let end = value.indexOf('\n', b); if (end < 0) end = value.length;
    const block = value.slice(start, end).split('\n');
    const next = block.map((l) => (event.shiftKey ? l.replace(new RegExp('^ {1,' + state.value.tabSize + '}'), '') : unit + l)).join('\n');
    el.setSelectionRange(start, end);
    insert(el, next);
    el.setSelectionRange(start, start + next.length);
    return;
  }
  escaped = false;
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const before = el.value.slice(0, el.selectionStart);
    const indent = /^[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[0] ?? '';
    if (indent) { event.preventDefault(); insert(el, '\n' + indent); }
  }
}
function pickFile(file: CodeFile): void {
  active.value = file;
  void nextTick(() => { editorEl.value?.focus(); updateCursor(); });
}
function onFileKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const next = CODE_FILES[(CODE_FILES.indexOf(active.value) + delta + CODE_FILES.length) % CODE_FILES.length]!;
  active.value = next;
  void nextTick(() => document.getElementById('code-file-' + next)?.focus());
}

// ---- exportar ----
const busy = ref(false);
async function exportZip(): Promise<void> {
  busy.value = true;
  try {
    const enc = new TextEncoder();
    const result = await buildZip(exportFiles(state.value).map((f) => ({ name: f.name, data: enc.encode(f.text) })), { compress: true });
    downloadBlob(new Blob([result.bytes as BlobPart], { type: 'application/zip' }), safeFileName(state.value.name, 'projeto') + '.zip');
    info.value = 'ZIP com index.html, style.css e script.js (' + formatBytes(result.bytes.length) + ').';
    doc.say(info.value);
  } catch (e) { info.value = (e as Error).message; doc.say(info.value); }
  finally { busy.value = false; }
}
function exportHtml(): void {
  downloadText(buildStandalone(state.value), safeFileName(state.value.name, 'pagina') + '.html', 'text/html;charset=utf-8');
  info.value = 'Página única baixada, com CSS e JavaScript dentro do HTML.';
  doc.say(info.value);
}
const levelText: Record<ConsoleLine['level'], string> = { log: 'log', info: 'info', warn: 'aviso', error: 'erro' };
</script>

<template>
  <EditorShell v-model:tab="tab" app="code" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'executar'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="run-code" title="Ctrl+Enter" @click="run">Executar</button>
          <label class="check"><input v-model="state.auto" type="checkbox" data-testid="auto-run" /> Executar sozinho ao digitar</label>
          <label class="ed-field"><span class="ed-label">Tecla Tab</span>
            <select v-model.number="state.tabSize" class="inp" data-testid="tab-size"><option :value="2">2 espaços</option><option :value="4">4 espaços</option></select></label>
          <button type="button" class="btn" data-testid="clear-console" @click="lines = []">Limpar console</button>
        </div>
        <p class="ed-hint">Seu código roda num quadro isolado: sem acesso à internet, ao armazenamento do navegador nem aos seus documentos do Coding. <code>console.log</code> e erros aparecem no console abaixo do resultado. Dentro do editor, a tecla Tab insere espaços; aperte Esc e depois Tab para sair do campo. Ctrl+Enter executa.</p>
        <p class="ed-hint">{{ totalChars(state).toLocaleString('pt-BR') }} caracteres no projeto.</p>
      </div>
      <FileTab v-else :templates="codeTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="busy" data-testid="download-zip" @click="exportZip">Baixar ZIP do projeto</button>
        <button type="button" class="btn" data-testid="download-html" @click="exportHtml">Baixar página única (.html)</button>
        <template #after><p v-if="info" class="ed-hint" role="status" data-testid="code-info">{{ info }}</p></template>
      </FileTab>
    </template>

    <div class="code-stage" :data-view="view">
      <div class="views" role="group" aria-label="Alternar entre código e resultado">
        <button type="button" class="btn" :aria-pressed="view === 'editor'" data-testid="view-editor" @click="view = 'editor'">Código</button>
        <button type="button" class="btn" :aria-pressed="view === 'result'" data-testid="view-result" @click="view = 'result'">Resultado</button>
      </div>
      <section class="pane pane-editor" aria-label="Editor">
        <div class="files" role="tablist" aria-label="Arquivos do projeto" @keydown="onFileKey">
          <button v-for="f in CODE_FILES" :id="'code-file-' + f" :key="f" type="button" role="tab" class="file" :aria-selected="active === f" :tabindex="active === f ? 0 : -1" :data-file="f" @click="pickFile(f)">
            {{ FILE_LABELS[f] }} <small>{{ FILE_NAMES[f] }}</small>
          </button>
        </div>
        <textarea ref="editorEl" class="editor" :value="text" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"
          :aria-label="'Código ' + FILE_LABELS[active] + ' (' + FILE_NAMES[active] + ')'" data-testid="code-editor" :data-file="active"
          @input="onInput" @keydown="onKey" @keyup="updateCursor" @click="updateCursor"></textarea>
        <div class="status"><span data-testid="cursor">Linha {{ cursor.line }}, coluna {{ cursor.col }}</span><span>{{ text.length.toLocaleString('pt-BR') }} caracteres</span></div>
      </section>
      <section class="pane pane-result" aria-label="Resultado">
        <iframe :key="runId" ref="frameEl" class="frame" title="Resultado da página" :sandbox="SANDBOX" :srcdoc="frameDoc" referrerpolicy="no-referrer" data-testid="code-frame"></iframe>
        <div class="console" role="log" aria-label="Console" data-testid="console">
          <p v-if="!lines.length" class="empty">O console está vazio. Use <code>console.log()</code> no JavaScript.</p>
          <p v-for="(l, i) in lines" :key="i" class="line" :class="'l-' + l.level" data-testid="console-line"><span class="lv">{{ levelText[l.level] }}</span> {{ l.text }}</p>
        </div>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.code-stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0; background: var(--raised); }
.views { display: none; }
.pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
.pane-editor { border-right: 1px solid var(--border); }
.files { display: flex; gap: 2px; padding: 4px 6px 0; border-bottom: 1px solid var(--border); background: var(--panel); overflow-x: auto; }
.file { flex: none; min-height: 40px; padding: 0 14px; border: 0; border-radius: 10px 10px 0 0; background: transparent; font-weight: 700; color: var(--muted); }
.file small { font-weight: 500; opacity: .85; margin-left: 4px; }
.file[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: inset 0 -3px var(--app); }
.editor { flex: 1; min-height: 0; width: 100%; box-sizing: border-box; resize: none; border: 0; padding: 12px; background: var(--surface); color: var(--text); font: 14px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size: 2; white-space: pre; overflow: auto; outline: none; }
.editor:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.status { display: flex; justify-content: space-between; gap: 8px; padding: 4px 12px; border-top: 1px solid var(--border); background: var(--panel); font-size: 12.5px; color: var(--muted); }
.frame { flex: 1 1 60%; min-height: 0; width: 100%; border: 0; background: #fff; }
.console { flex: 0 0 34%; min-height: 80px; overflow: auto; border-top: 2px solid var(--border); background: var(--panel); font: 13px/1.5 ui-monospace, Consolas, monospace; padding: 6px 10px; }
.console p { margin: 0; }
.empty { color: var(--muted); }
.line { padding: 1px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.lv { display: inline-block; min-width: 44px; font-weight: 700; color: var(--muted); }
.l-warn { color: var(--text); background: color-mix(in srgb, #f5b820 22%, transparent); }
.l-error { color: var(--danger); }
.l-error .lv { color: var(--danger); }
@media (max-width: 1099px) {
  .code-stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .views { display: flex; gap: 6px; padding: 6px 8px; background: var(--panel); border-bottom: 1px solid var(--border); }
  .views .btn { flex: 1; min-height: 44px; }
  .views .btn[aria-pressed="true"] { border-color: var(--accent); box-shadow: inset 0 -3px var(--app); }
  .pane-editor { border-right: 0; }
  .code-stage[data-view="editor"] .pane-result, .code-stage[data-view="result"] .pane-editor { display: none; }
}
</style>
