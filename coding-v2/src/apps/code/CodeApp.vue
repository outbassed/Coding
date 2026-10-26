<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import type { LegacyImage } from '../../storage/documents';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { buildZip } from '../zip/zip';
import { formatBytes } from '../../shared/bytes';
import { buildPreview, buildStandalone, exportFiles, parseConsoleMessage, parseNavMessage, SANDBOX, usedAssets, type ConsoleLine } from './build';
import {
  addFile, addFolder, baseName, cleanPath, CodeError, dirName, entryPage, fileCount, importAsset, importText, isAssetPath, isHtmlPath, isTextPath, langOf,
  MAX_FILE_CHARS, MAX_FILES, MAX_TOTAL_CHARS, mimeOf, removeFile, removeFolder, renamePath, totalChars, treeRows,
  type CodeState, type ConflictMode, type TreeRow
} from './model';
import { highlight } from './highlight';
import { findHits, replaceAllIn, type Hit } from './search';
import { readProjectZip, stripCommonRoot } from './projectio';
import { codeKind, codeTemplates } from './kind';

const doc = useDocument<CodeState>({
  kind: codeKind, templates: codeTemplates, path: '/apps/codigo/', withImages: true,
  // só os recursos ainda listados no projeto vão para o disco; na memória ficam todos, para o desfazer funcionar
  imagesFor: (s, imgs) => { const ids = new Set(s.assets.map((a) => a.blobId)); return imgs.filter((i) => ids.has(i.id)); },
  // abrir uma aba ou mudar o arquivo ativo não é um passo de desfazer
  historyView: (s) => ({ name: s.name, files: s.files, assets: s.assets, folders: s.folders, entry: s.entry })
});
const { state, images } = doc;
const tabs = [{ id: 'explorador', label: 'Explorador' }, { id: 'executar', label: 'Executar' }, { id: 'buscar', label: 'Buscar' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('explorador');
const view = ref<'editor' | 'result'>('editor');
const editorEl = ref<HTMLTextAreaElement | null>(null);
const hlEl = ref<HTMLElement | null>(null);
const gutterEl = ref<HTMLElement | null>(null);
const frameEl = ref<HTMLIFrameElement | null>(null);
const info = ref('');
const cursor = ref({ line: 1, col: 1 });

// ---------------------------------------------------------------- arquivo aberto
const current = computed(() => state.value.files.find((f) => f.path === state.value.active) ?? state.value.files[0] ?? null);
const lang = computed(() => (current.value ? langOf(current.value.path) : 'text'));
const HL_LIMIT = 150_000;
const highlighted = computed(() => !!current.value && current.value.text.length <= HL_LIMIT);
const hlHtml = computed(() => (current.value && highlighted.value ? highlight(lang.value, current.value.text) + '\n' : ''));
const lineCount = computed(() => (current.value ? current.value.text.split('\n').length : 1));
const gutterText = computed(() => { const out: number[] = []; for (let i = 1; i <= lineCount.value; i++) out.push(i); return out.join('\n'); });
const gutterCh = computed(() => String(lineCount.value).length + 1);
const openTabs = computed(() => state.value.open.filter((p) => state.value.files.some((f) => f.path === p)));
const LANG_LABEL: Record<string, string> = { html: 'HTML', css: 'CSS', js: 'JavaScript', json: 'JSON', svg: 'SVG', text: 'Texto' };

function updateCursor(): void {
  const el = editorEl.value; if (!el) return;
  const before = el.value.slice(0, el.selectionStart);
  const nl = before.lastIndexOf('\n');
  cursor.value = { line: before.split('\n').length, col: el.selectionStart - nl };
}
function syncScroll(): void {
  const el = editorEl.value; if (!el) return;
  const code = hlEl.value?.firstElementChild as HTMLElement | null;
  if (code) code.style.transform = 'translate(' + -el.scrollLeft + 'px,' + -el.scrollTop + 'px)';
  const gut = gutterEl.value;
  if (gut) gut.style.transform = 'translateY(' + -el.scrollTop + 'px)';
}
function onInput(event: Event): void {
  const f = current.value; if (!f) return;
  const el = event.target as HTMLTextAreaElement;
  let value = el.value;
  const room = Math.max(0, Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - (totalChars(state.value) - f.text.length)));
  if (value.length > room) {
    value = value.slice(0, room); el.value = value;
    info.value = room >= MAX_FILE_CHARS ? 'O arquivo passa de ' + MAX_FILE_CHARS.toLocaleString('pt-BR') + ' caracteres; o excedente foi cortado.' : 'O projeto passa de ' + MAX_TOTAL_CHARS.toLocaleString('pt-BR') + ' caracteres; o excedente foi cortado.';
  }
  doc.setChangeKey('type-' + f.path);
  f.text = value;
  updateCursor(); syncScroll(); schedule();
}
/** Insere texto na posição do cursor mantendo o desfazer nativo do campo quando o navegador deixa. */
function insert(el: HTMLTextAreaElement, value: string): void {
  if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, value)) return;
  el.setRangeText(value, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);
let escaped = false; // depois de Esc, a próxima tecla Tab sai do campo (acessibilidade)
function onKey(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement;
  if (event.isComposing) return;
  if (event.key === 'Escape') { escaped = true; return; }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key === 'Enter') { event.preventDefault(); void runNow(); return; }
  if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); return; }
  if (event.key === 'Tab' && !mod && !event.altKey) {
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
  if (mod || event.altKey) return;
  const { selectionStart: a, selectionEnd: b, value } = el;
  const k = event.key;
  const code = lang.value !== 'text';
  if (code && k.length === 1) {
    if (CLOSERS.has(k) && a === b && value[a] === k && (k in PAIRS ? value[a - 1] !== '\\' : true)) { event.preventDefault(); el.setSelectionRange(a + 1, a + 1); updateCursor(); return; }
    if (k in PAIRS) {
      const close = PAIRS[k]!;
      if (a !== b) { // com texto selecionado: envolve a seleção
        event.preventDefault();
        insert(el, k + value.slice(a, b) + close);
        el.setSelectionRange(a + 1, b + 1);
        return;
      }
      const prev = value[a - 1] ?? '', next = value[a] ?? '';
      const quote = k === '"' || k === "'" || k === '`';
      const ok = quote ? !/\w/.test(prev) && !/\w/.test(next) : next === '' || /[\s)\]}>,;.]/.test(next);
      if (ok) { event.preventDefault(); insert(el, k + close); el.setSelectionRange(a + 1, a + 1); return; }
    }
  }
  if (event.key === 'Backspace' && a === b && a > 0 && PAIRS[value[a - 1]!] === value[a] && lang.value !== 'text') {
    event.preventDefault(); el.setSelectionRange(a - 1, a + 1); if (!document.execCommand('delete')) { el.setRangeText('', a - 1, a + 1, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const before = value.slice(0, a);
    const indent = /^[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[0] ?? '';
    const unit = ' '.repeat(state.value.tabSize);
    if (a === b && PAIRS[value[a - 1]!] === value[a] && '([{'.includes(value[a - 1]!)) { // Enter entre { } abre um bloco
      event.preventDefault();
      insert(el, '\n' + indent + unit + '\n' + indent);
      const pos = a + 1 + indent.length + unit.length; el.setSelectionRange(pos, pos);
      return;
    }
    if (indent) { event.preventDefault(); insert(el, '\n' + indent); }
  }
}
function onTabKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta || !openTabs.value.length) return;
  event.preventDefault();
  const list = openTabs.value;
  const next = list[(Math.max(0, list.indexOf(current.value?.path ?? '')) + delta + list.length) % list.length]!;
  openFile(next);
  void nextTick(() => (document.querySelector('[data-testid="file-tab"][data-path="' + CSS.escape(next) + '"]') as HTMLElement | null)?.focus());
}
function openFile(path: string): void {
  if (!state.value.files.some((f) => f.path === path)) return;
  if (!state.value.open.includes(path)) state.value.open = [...state.value.open, path];
  state.value.active = path;
  view.value = 'editor';
  void nextTick(() => { updateCursor(); syncScroll(); });
}
function closeTab(path: string): void {
  const list = openTabs.value;
  if (list.length <= 1) return;
  const i = list.indexOf(path);
  const next = list.filter((p) => p !== path);
  state.value.open = next;
  if (state.value.active === path) state.value.active = next[Math.min(i, next.length - 1)]!;
}

// ---------------------------------------------------------------- explorador
const selected = ref<string | null>(null);
const collapsed = ref<Set<string>>(new Set());
const rows = computed(() => treeRows(state.value, collapsed.value));
const isDir = (p: string): boolean => state.value.folders.includes(p) || state.value.files.some((f) => f.path.startsWith(p + '/')) || state.value.assets.some((a) => a.path.startsWith(p + '/'));
const selKind = computed<'file' | 'asset' | 'dir' | null>(() => {
  const p = selected.value; if (!p) return null;
  if (state.value.files.some((f) => f.path === p)) return 'file';
  if (state.value.assets.some((a) => a.path === p)) return 'asset';
  return isDir(p) ? 'dir' : null;
});
const entry = computed(() => entryPage(state.value));
function pickRow(r: TreeRow): void {
  selected.value = r.path;
  if (r.kind === 'dir') {
    const next = new Set(collapsed.value);
    if (next.has(r.path)) next.delete(r.path); else next.add(r.path);
    collapsed.value = next;
  } else if (!r.asset) openFile(r.path);
}

type OpKind = 'file' | 'folder' | 'rename' | 'delete';
const op = ref<{ kind: OpKind; target: string; value: string } | null>(null);
const opError = ref('');
const opInput = ref<HTMLInputElement | null>(null);
function baseDir(): string {
  const p = selected.value;
  if (!p) return '';
  return selKind.value === 'dir' ? p : dirName(p);
}
function beginOp(kind: OpKind): void {
  opError.value = '';
  const sel = selected.value ?? '';
  if (kind === 'file' || kind === 'folder') { const d = baseDir(); op.value = { kind, target: '', value: d ? d + '/' : '' }; }
  else if (sel) op.value = { kind, target: sel, value: kind === 'rename' ? sel : '' };
  void nextTick(() => { opInput.value?.focus(); const el = opInput.value; if (el) el.setSelectionRange(el.value.length, el.value.length); });
}
function cancelOp(): void { op.value = null; opError.value = ''; }
const STARTER_PAGE = '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Nova página</title>\n</head>\n<body>\n\n</body>\n</html>\n';
function commitOp(): void {
  const o = op.value; if (!o) return;
  try {
    const s = state.value;
    let next: CodeState; let target: string | null = null; let said = '';
    if (o.kind === 'file') {
      next = addFile(s, o.value, isHtmlPath(o.value) ? STARTER_PAGE : ''); target = cleanPath(o.value); said = '“' + target + '” criado.';
    } else if (o.kind === 'folder') {
      next = addFolder(s, o.value); target = cleanPath(o.value); said = 'Pasta “' + target + '” criada.';
    } else if (o.kind === 'rename') {
      next = renamePath(s, o.target, o.value); target = cleanPath(o.value); said = 'Renomeado para “' + target + '”.';
    } else if (isDir(o.target)) {
      next = removeFolder(s, o.target); said = 'Pasta “' + o.target + '” excluída (Ctrl+Z desfaz).';
    } else {
      next = removeFile(s, o.target); said = '“' + o.target + '” excluído (Ctrl+Z desfaz).';
    }
    state.value = next;
    selected.value = target;
    op.value = null; opError.value = ''; info.value = said; doc.say(said);
    if (o.kind === 'file') view.value = 'editor';
  } catch (e) {
    if (e instanceof CodeError) { opError.value = e.message; return; }
    throw e;
  }
}
const opLabel = computed(() => (op.value?.kind === 'folder' ? 'Nome da pasta' : op.value?.kind === 'rename' ? 'Novo caminho' : 'Caminho do arquivo (ex.: js/app.js)'));
const opButton = computed(() => (op.value?.kind === 'rename' ? 'Renomear' : 'Criar'));
function setEntry(): void {
  const p = selected.value;
  if (!p || selKind.value !== 'file' || !isHtmlPath(p)) return;
  state.value.entry = p; void run(null);
  info.value = '“' + p + '” é a página inicial.'; doc.say(info.value);
}
const delCount = computed(() => {
  const o = op.value; if (!o || o.kind !== 'delete' || !isDir(o.target)) return 0;
  return state.value.files.filter((f) => f.path.startsWith(o.target + '/')).length + state.value.assets.filter((a) => a.path.startsWith(o.target + '/')).length;
});

// pré-visualização de recurso selecionado
const assetPreview = ref('');
const assetInfo = computed(() => state.value.assets.find((a) => a.path === selected.value) ?? null);
watch(assetInfo, (a) => {
  if (assetPreview.value) { URL.revokeObjectURL(assetPreview.value); assetPreview.value = ''; }
  const blob = a ? images.value.find((i) => i.id === a.blobId)?.blob : undefined;
  if (a && blob && a.mime.startsWith('image/')) assetPreview.value = URL.createObjectURL(blob);
}, { immediate: true });

// ---------------------------------------------------------------- importar
const conflict = ref<ConflictMode>('keep');
const busy = ref(false);
const importInfo = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const folderAttrs = { webkitdirectory: true };
const JUNK = /(^|\/)(\.git|node_modules|__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;
interface Incoming { path: string; file: File }
async function importIncoming(list: Incoming[]): Promise<void> {
  if (!list.length) return;
  busy.value = true; importInfo.value = '';
  let s: CodeState = state.value;
  const fresh: LegacyImage[] = [];
  const skipped: string[] = [];
  let done = 0, lastText = '';
  const place = (path: string, text: string | undefined, blob: Blob | undefined): void => {
    try {
      if (text !== undefined) {
        const r = importText(s, path, text.replace(/\r\n?/g, '\n'), conflict.value); s = r.state; lastText = r.path;
      } else if (blob) {
        const id = 'cf-' + crypto.randomUUID();
        const r = importAsset(s, path, { blobId: id, mime: blob.type || mimeOf(path), size: blob.size }, conflict.value);
        s = r.state; fresh.push({ id, docId: '', blob, mime: blob.type || mimeOf(path), name: r.path });
      }
      done++;
    } catch (e) {
      if (e instanceof CodeError) skipped.push(e.message); else throw e;
    }
  };
  try {
    for (const it of list) {
      const name = it.path;
      if (JUNK.test(name)) { skipped.push('“' + name + '”: ignorado (arquivo de sistema ou de ferramenta)'); continue; }
      if (/\.zip$/i.test(name)) {
        try {
          const z = await readProjectZip(new Uint8Array(await it.file.arrayBuffer()));
          for (const f of z.files) place(f.path, f.text, f.bytes ? new Blob([f.bytes as BlobPart], { type: mimeOf(f.path) }) : undefined);
          skipped.push(...z.skipped);
        } catch (e) { skipped.push('“' + name + '”: ' + (e instanceof Error ? e.message : 'ZIP inválido')); }
        continue;
      }
      const clean = cleanPath(name);
      if (!clean) { skipped.push('“' + name + '”: nome inválido'); continue; }
      if (isTextPath(clean)) {
        if (it.file.size > 4 * MAX_FILE_CHARS) { skipped.push('“' + clean + '”: grande demais para o editor'); continue; }
        place(clean, await it.file.text(), undefined);
      } else if (isAssetPath(clean)) place(clean, undefined, it.file);
      else skipped.push('“' + name + '”: tipo de arquivo não aceito');
    }
    if (done) {
      if (lastText) s = { ...s, active: lastText, open: s.open.includes(lastText) ? s.open : [...s.open, lastText] };
      images.value = [...images.value, ...fresh];
      state.value = s;
    }
    const text = done + (done === 1 ? ' arquivo importado' : ' arquivos importados') + (skipped.length ? '; ' + skipped.length + ' ignorado' + (skipped.length === 1 ? '' : 's') + ': ' + skipped.slice(0, 3).join(' · ') + (skipped.length > 3 ? ' …' : '') : '') + '.';
    importInfo.value = text; doc.say(text);
  } finally { busy.value = false; }
}
function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []); input.value = '';
  void importIncoming(list.map((file) => ({ path: file.name, file })));
}
function onPickFolder(event: Event): void {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []); input.value = '';
  const paths = stripCommonRoot(list.map((f) => f.webkitRelativePath || f.name));
  void importIncoming(list.map((file, i) => ({ path: paths[i]!, file })));
}
function onDrop(event: DragEvent): void {
  const list = Array.from(event.dataTransfer?.files ?? []);
  if (!list.length) return;
  void importIncoming(list.map((file) => ({ path: file.name, file })));
}

// ---------------------------------------------------------------- buscar e substituir
const query = ref('');
const replacement = ref('');
const caseSensitive = ref(false);
const searchInfo = ref('');
const search = computed(() => (tab.value === 'buscar' && query.value ? findHits(state.value.files, query.value, caseSensitive.value) : { hits: [] as Hit[], total: 0, truncated: false }));
function openSearch(): void {
  const el = editorEl.value;
  if (el && el.selectionEnd > el.selectionStart) { const part = el.value.slice(el.selectionStart, el.selectionEnd); if (!part.includes('\n')) query.value = part; }
  tab.value = 'buscar';
  void nextTick(() => { const q = document.querySelector('[data-testid="search-query"]') as HTMLInputElement | null; q?.focus(); q?.select(); });
}
function revealRange(start: number, length: number): void {
  const el = editorEl.value; if (!el) return;
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, start + length);
  const line = el.value.slice(0, start).split('\n').length;
  el.scrollTop = Math.max(0, (line - 4) * 22);
  updateCursor(); syncScroll();
}
function goTo(h: Hit): void {
  openFile(h.path);
  void nextTick(() => revealRange(h.start, h.length));
}
function findNext(): void {
  const f = current.value; if (!f || !query.value) return;
  const from = editorEl.value ? editorEl.value.selectionEnd : 0;
  const hay = caseSensitive.value ? f.text : f.text.toLowerCase();
  const needle = caseSensitive.value ? query.value : query.value.toLowerCase();
  let at = hay.indexOf(needle, from);
  if (at < 0) at = hay.indexOf(needle, 0);
  if (at < 0) { searchInfo.value = 'Nada encontrado em “' + f.path + '”.'; return; }
  searchInfo.value = '';
  revealRange(at, needle.length);
}
function replaceIn(paths: Set<string> | null): void {
  if (!query.value) return;
  let count = 0, changed = 0, total = totalChars(state.value);
  const files = state.value.files.map((f) => {
    if (paths && !paths.has(f.path)) return f;
    const r = replaceAllIn(f.text, query.value, replacement.value, caseSensitive.value);
    if (!r.count) return f;
    count += r.count; changed++; total += r.text.length - f.text.length;
    return { ...f, text: r.text };
  });
  if (!count) { searchInfo.value = 'Nada para substituir.'; return; }
  if (total > MAX_TOTAL_CHARS || files.some((f) => f.text.length > MAX_FILE_CHARS)) { searchInfo.value = 'A substituição deixaria um arquivo ou o projeto grande demais. Nada foi alterado.'; return; }
  state.value = { ...state.value, files };
  searchInfo.value = count + (count === 1 ? ' substituição' : ' substituições') + ' em ' + changed + (changed === 1 ? ' arquivo' : ' arquivos') + ' (Ctrl+Z desfaz).';
  doc.say(searchInfo.value);
}

// ---------------------------------------------------------------- executar
const frameDoc = ref('');
const runId = ref(0);
const shown = ref<string | null>(null);
const lines = ref<ConsoleLine[]>([]);
const MAX_LINES = 300;
const urlCache = new Map<string, string>();
async function dataUrlOf(blobId: string): Promise<string | undefined> {
  const hit = urlCache.get(blobId); if (hit) return hit;
  const blob = images.value.find((i) => i.id === blobId)?.blob; if (!blob) return undefined;
  const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  urlCache.set(blobId, url);
  return url;
}
async function assetUrls(s: CodeState): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const path of usedAssets(s)) {
    const a = s.assets.find((x) => x.path === path); if (!a) continue;
    try { const u = await dataUrlOf(a.blobId); if (u) urls.set(path, u); } catch { /* recurso ilegível: a página mostra o aviso do navegador */ }
  }
  return urls;
}
let token = 0;
/** `page`: undefined = mantém a página mostrada; null = volta à página inicial; texto = essa página. */
async function run(page?: string | null): Promise<void> {
  const mine = ++token;
  const s = state.value;
  const urls = await assetUrls(s);
  if (mine !== token) return;
  const res = buildPreview(s, { assetUrl: (p) => urls.get(p), page: page === undefined ? shown.value : page });
  shown.value = res.page;
  lines.value = res.warnings.map((text) => ({ level: 'warn' as const, text }));
  frameDoc.value = res.doc;
  runId.value++;
}
function runNow(): Promise<void> {
  const f = current.value;
  return run(f && isHtmlPath(f.path) ? f.path : undefined);
}
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(): void {
  clearTimeout(timer);
  if (state.value.auto) timer = setTimeout(() => { void run(); }, 700);
}
watch(() => state.value.auto, (on) => { if (on) void run(); });
// documento aberto, desfazer/refazer, modelo novo e operações de arquivo trocam o estado inteiro: mostra o resultado na hora
watch(state, () => { void run(); });
const pages = computed(() => state.value.files.filter((f) => isHtmlPath(f.path)).map((f) => f.path));
function onMessage(event: MessageEvent): void {
  if (!frameEl.value || event.source !== frameEl.value.contentWindow) return; // só o nosso quadro
  const nav = parseNavMessage(event.data, state.value);
  if (nav) { void run(nav); return; }
  const line = parseConsoleMessage(event.data);
  if (!line) return;
  lines.value = [...lines.value.slice(-(MAX_LINES - 1)), line];
}
onMounted(() => { window.addEventListener('message', onMessage); void run(); void nextTick(syncScroll); });
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage); clearTimeout(timer);
  if (assetPreview.value) URL.revokeObjectURL(assetPreview.value);
});

// ---------------------------------------------------------------- exportar
async function bytesOf(blobId: string): Promise<Uint8Array | null> {
  const blob = images.value.find((i) => i.id === blobId)?.blob;
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
async function exportZip(): Promise<void> {
  busy.value = true;
  try {
    const enc = new TextEncoder();
    const inputs: { name: string; data: Uint8Array }[] = exportFiles(state.value).map((f) => ({ name: f.name, data: enc.encode(f.text) }));
    let missing = 0;
    for (const a of state.value.assets) {
      const data = await bytesOf(a.blobId);
      if (data) inputs.push({ name: a.path, data }); else missing++;
    }
    const result = await buildZip(inputs, { compress: true });
    downloadBlob(new Blob([result.bytes as BlobPart], { type: 'application/zip' }), safeFileName(state.value.name, 'projeto') + '.zip');
    info.value = 'ZIP com ' + inputs.length + (inputs.length === 1 ? ' arquivo' : ' arquivos') + ' (' + formatBytes(result.bytes.length) + ').' + (missing ? ' ' + missing + ' recurso(s) não estavam mais disponíveis e ficaram de fora.' : '');
    doc.say(info.value);
  } catch (e) { info.value = (e as Error).message; doc.say(info.value); }
  finally { busy.value = false; }
}
async function exportHtml(): Promise<void> {
  const urls = await assetUrls(state.value);
  downloadText(buildStandalone(state.value, { assetUrl: (p) => urls.get(p), page: shown.value }), safeFileName(state.value.name, 'pagina') + '.html', 'text/html;charset=utf-8');
  info.value = 'Página única baixada, com CSS, JavaScript e imagens usadas dentro do HTML.';
  doc.say(info.value);
}
function exportCurrent(): void {
  const f = current.value; if (!f) return;
  downloadText(f.text, baseName(f.path), 'text/plain;charset=utf-8');
  info.value = '“' + baseName(f.path) + '” baixado.'; doc.say(info.value);
}
const levelText: Record<ConsoleLine['level'], string> = { log: 'log', info: 'info', warn: 'aviso', error: 'erro' };
const statsText = computed(() => fileCount(state.value) + ' de ' + MAX_FILES + ' arquivos · ' + totalChars(state.value).toLocaleString('pt-BR') + ' caracteres');
</script>

<template>
  <EditorShell v-model:tab="tab" app="code" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: currentTab }">
      <div v-if="currentTab === 'explorador'" class="ed-group" data-testid="explorer">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="new-file" @click="beginOp('file')">Novo arquivo</button>
          <button type="button" class="btn" data-testid="new-folder" @click="beginOp('folder')">Nova pasta</button>
        </div>
        <form v-if="op" class="opform" data-testid="op-form" @submit.prevent="commitOp">
          <p v-if="op.kind === 'delete'" class="ed-hint" data-testid="delete-text">Excluir “{{ op.target }}”<template v-if="delCount"> e os {{ delCount }} arquivo(s) dentro dela</template>? Ctrl+Z desfaz.</p>
          <label v-else class="ed-field"><span class="ed-label">{{ opLabel }}</span>
            <input ref="opInput" v-model="op.value" class="inp" data-testid="name-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120" /></label>
          <div class="ed-row">
            <button type="submit" class="btn btn-app" :data-testid="op.kind === 'delete' ? 'confirm-delete' : 'name-confirm'">{{ op.kind === 'delete' ? 'Excluir' : opButton }}</button>
            <button type="button" class="btn" data-testid="name-cancel" @click="cancelOp">Cancelar</button>
          </div>
          <p v-if="opError" class="err" role="alert" data-testid="op-error">{{ opError }}</p>
        </form>
        <ul class="tree" data-testid="file-tree" aria-label="Arquivos do projeto">
          <li v-for="r in rows" :key="r.kind + r.path">
            <button type="button" class="row" :class="{ sel: selected === r.path }" :style="{ paddingLeft: 8 + r.depth * 16 + 'px' }" data-testid="tree-row" :data-path="r.path" :data-kind="r.kind"
              :aria-current="selected === r.path ? 'true' : undefined" :aria-expanded="r.kind === 'dir' ? !collapsed.has(r.path) : undefined" @click="pickRow(r)">
              <span class="mark" aria-hidden="true">{{ r.kind === 'dir' ? (collapsed.has(r.path) ? '▸' : '▾') : '·' }}</span>
              <span class="nm">{{ r.name }}</span>
              <small v-if="r.path === entry" class="badge">inicial</small>
              <small v-if="r.size !== undefined" class="sz">{{ r.asset ? formatBytes(r.size) : r.size.toLocaleString('pt-BR') + ' car.' }}</small>
            </button>
          </li>
        </ul>
        <p class="ed-hint" data-testid="project-stats">{{ statsText }}</p>
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!selKind" data-testid="rename-item" @click="beginOp('rename')">Renomear</button>
          <button type="button" class="btn" :disabled="!selKind" data-testid="delete-item" @click="beginOp('delete')">Excluir</button>
          <button type="button" class="btn" :disabled="selKind !== 'file' || !selected || !isHtmlPath(selected)" data-testid="set-entry" @click="setEntry">Definir como página inicial</button>
        </div>
        <div v-if="assetInfo" class="asset" data-testid="asset-info">
          <img v-if="assetPreview" :src="assetPreview" :alt="'Prévia de ' + assetInfo.path" data-testid="asset-preview" />
          <p class="ed-hint">{{ assetInfo.path }} · {{ assetInfo.mime }} · {{ formatBytes(assetInfo.size) }}. Use o nome do arquivo no HTML ou no CSS (ex.: <code>src="{{ assetInfo.path }}"</code>).</p>
        </div>
        <h3 class="sub">Importar</h3>
        <div class="ed-row">
          <button type="button" class="btn" :disabled="busy" data-testid="import-files" @click="fileInput?.click()">Arquivos ou ZIP…</button>
          <button type="button" class="btn" :disabled="busy" data-testid="import-folder" @click="folderInput?.click()">Pasta…</button>
        </div>
        <label class="ed-field"><span class="ed-label">Se o nome já existir</span>
          <select v-model="conflict" class="inp" data-testid="conflict-mode"><option value="keep">Manter os dois</option><option value="replace">Substituir</option></select></label>
        <input ref="fileInput" type="file" multiple hidden data-testid="import-input" @change="onPick" />
        <input ref="folderInput" type="file" multiple hidden v-bind="folderAttrs" data-testid="import-folder-input" @change="onPickFolder" />
        <p v-if="importInfo" class="ed-hint" role="status" data-testid="import-info">{{ importInfo }}</p>
        <p class="ed-hint">Aceita HTML, CSS, JS, JSON, SVG, TXT, MD, CSV, XML e imagens, áudio, vídeo e fontes. Também dá para soltar arquivos sobre o editor.</p>
      </div>

      <div v-else-if="currentTab === 'executar'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="run-code" title="Ctrl+Enter" @click="runNow">Executar</button>
          <label class="check"><input v-model="state.auto" type="checkbox" data-testid="auto-run" /> Executar sozinho ao digitar</label>
          <label class="ed-field"><span class="ed-label">Tecla Tab</span>
            <select v-model.number="state.tabSize" class="inp" data-testid="tab-size"><option :value="2">2 espaços</option><option :value="4">4 espaços</option></select></label>
          <button type="button" class="btn" data-testid="clear-console" @click="lines = []">Limpar console</button>
        </div>
        <p class="ed-hint">Seu código roda num quadro isolado: sem acesso à internet, ao armazenamento do navegador nem aos seus documentos do Coding. <code>console.log</code> e erros aparecem no console abaixo do resultado. Links entre as páginas do projeto funcionam; <code>fetch</code> lê os arquivos do projeto. Módulos com <code>import</code> entre arquivos não são resolvidos.</p>
        <p class="ed-hint">Dentro do editor, a tecla Tab insere espaços; aperte Esc e depois Tab para sair do campo. Ctrl+Enter executa, Ctrl+F busca, Ctrl+S salva.</p>
        <p class="ed-hint">{{ statsText }}</p>
      </div>

      <div v-else-if="currentTab === 'buscar'" class="ed-group" data-testid="search-panel">
        <label class="ed-field"><span class="ed-label">Localizar</span>
          <input v-model="query" type="search" class="inp" data-testid="search-query" autocomplete="off" spellcheck="false" @keydown.enter.prevent="findNext" /></label>
        <label class="ed-field"><span class="ed-label">Substituir por</span>
          <input v-model="replacement" class="inp" data-testid="replace-text" autocomplete="off" spellcheck="false" /></label>
        <label class="check"><input v-model="caseSensitive" type="checkbox" data-testid="search-case" /> Diferenciar maiúsculas de minúsculas</label>
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!query" data-testid="find-next" @click="findNext">Próximo neste arquivo</button>
          <button type="button" class="btn" :disabled="!query || !current" data-testid="replace-file" @click="replaceIn(new Set(current ? [current.path] : []))">Substituir neste arquivo</button>
          <button type="button" class="btn btn-app" :disabled="!query" data-testid="replace-all" @click="replaceIn(null)">Substituir em todo o projeto</button>
        </div>
        <p v-if="query" class="ed-hint" role="status" data-testid="search-count">{{ search.total }} {{ search.total === 1 ? 'ocorrência' : 'ocorrências' }}<template v-if="search.truncated"> (mostrando as primeiras {{ search.hits.length }})</template>.</p>
        <p v-if="searchInfo" class="ed-hint" role="status" data-testid="search-info">{{ searchInfo }}</p>
        <ul class="hits" aria-label="Resultados da busca">
          <li v-for="(h, i) in search.hits" :key="h.path + ':' + h.start + ':' + i">
            <button type="button" class="hit" data-testid="search-hit" @click="goTo(h)"><strong>{{ h.path }}</strong> <span class="ln">linha {{ h.line }}</span><code>{{ h.preview }}</code></button>
          </li>
        </ul>
      </div>

      <FileTab v-else :templates="codeTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="busy" data-testid="download-zip" @click="exportZip">Baixar ZIP do projeto</button>
        <button type="button" class="btn" data-testid="download-html" @click="exportHtml">Baixar página única (.html)</button>
        <button type="button" class="btn" :disabled="!current" data-testid="download-file" @click="exportCurrent">Baixar o arquivo aberto</button>
        <template #after><p v-if="info" class="ed-hint" role="status" data-testid="code-info">{{ info }}</p></template>
      </FileTab>
    </template>

    <div class="code-stage" :data-view="view" @dragover.prevent @drop.prevent="onDrop">
      <div class="views" role="group" aria-label="Alternar entre código e resultado">
        <button type="button" class="btn" :aria-pressed="view === 'editor'" data-testid="view-editor" @click="view = 'editor'">Código</button>
        <button type="button" class="btn" :aria-pressed="view === 'result'" data-testid="view-result" @click="view = 'result'">Resultado</button>
      </div>
      <section class="pane pane-editor" aria-label="Editor">
        <div class="filebar">
          <div class="files" role="tablist" aria-label="Arquivos abertos" @keydown="onTabKey">
            <button v-for="p in openTabs" :key="p" type="button" role="tab" class="file" :aria-selected="p === current?.path" :tabindex="p === current?.path ? 0 : -1"
              data-testid="file-tab" :data-path="p" :title="p" @click="openFile(p)">{{ baseName(p) }}</button>
          </div>
          <button type="button" class="closebtn" :disabled="openTabs.length <= 1" aria-label="Fechar a aba aberta" data-testid="close-tab" @click="current && closeTab(current.path)">×</button>
        </div>
        <div class="editor-wrap">
          <div class="gutter" aria-hidden="true" :style="{ width: gutterCh + 'ch' }"><pre ref="gutterEl" data-testid="gutter">{{ gutterText }}</pre></div>
          <div class="codebox" :class="{ plain: !highlighted }" :style="{ tabSize: state.tabSize }">
            <pre ref="hlEl" class="hl" aria-hidden="true"><code v-html="hlHtml"></code></pre>
            <textarea v-if="current" ref="editorEl" class="editor" :value="current.text" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"
              :aria-label="'Código de ' + current.path" data-testid="code-editor" :data-file="current.path"
              @input="onInput" @keydown="onKey" @keyup="updateCursor" @click="updateCursor" @scroll="syncScroll"></textarea>
          </div>
        </div>
        <div class="status">
          <span data-testid="cursor">Linha {{ cursor.line }}, coluna {{ cursor.col }}</span>
          <span data-testid="lang">{{ LANG_LABEL[lang] }}<template v-if="!highlighted"> · sem realce (arquivo grande)</template></span>
          <span>{{ (current?.text.length ?? 0).toLocaleString('pt-BR') }} caracteres</span>
        </div>
      </section>
      <section class="pane pane-result" aria-label="Resultado">
        <div class="pagebar">
          <label for="page-select">Página</label>
          <select id="page-select" class="inp" :value="shown ?? ''" data-testid="page-select" :disabled="!pages.length" @change="run(($event.target as HTMLSelectElement).value)">
            <option v-if="!pages.length" value="">Nenhuma página HTML</option>
            <option v-for="p in pages" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
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
.err { margin: 4px 0 0; color: var(--danger); font-weight: 600; }
.sub { font-size: 14px; margin: 12px 0 0; }
.opform { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.tree { list-style: none; margin: 0; padding: 4px; max-height: 280px; overflow: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.row { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 40px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--text); text-align: left; font-size: 14px; }
.row:hover { background: var(--raised); }
.row.sel { background: color-mix(in srgb, var(--app) 18%, var(--surface)); box-shadow: inset 3px 0 var(--app); }
.row .mark { width: 14px; flex: none; color: var(--muted); }
.row .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row small { color: var(--muted); font-size: 12px; flex: none; }
.badge { padding: 1px 6px; border: 1px solid var(--border); border-radius: 999px; }
.asset { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.asset img { min-width: 32px; min-height: 32px; max-width: 100%; max-height: 140px; object-fit: contain; background: repeating-conic-gradient(#d8dde6 0 25%, #fff 0 50%) 0 / 14px 14px; border-radius: 8px; }
.hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 320px; overflow: auto; }
.hit { display: grid; gap: 2px; width: 100%; min-height: 44px; padding: 6px 10px; text-align: left; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--text); font-size: 13px; }
.hit .ln { color: var(--muted); margin-left: 6px; }
.hit code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: pre; font-size: 12.5px; }
.code-stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0; background: var(--raised); }
.views { display: none; }
.pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
.pane-editor { border-right: 1px solid var(--border); }
.filebar { display: flex; align-items: flex-end; border-bottom: 1px solid var(--border); background: var(--panel); }
.files { display: flex; flex: 1; min-width: 0; gap: 2px; padding: 4px 6px 0; overflow-x: auto; }
.file { flex: none; min-height: 40px; max-width: 200px; padding: 0 14px; border: 0; border-radius: 10px 10px 0 0; background: transparent; font-weight: 700; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: inset 0 -3px var(--app); }
.closebtn { flex: none; width: 44px; min-height: 40px; border: 0; background: transparent; color: var(--text); font-size: 20px; }
.closebtn:disabled { opacity: .4; }
.editor-wrap { display: flex; flex: 1; min-height: 0; background: var(--surface); }
.gutter { flex: none; box-sizing: content-box; padding: 0 8px; overflow: hidden; border-right: 1px solid var(--border); background: var(--panel); color: var(--muted); text-align: right; font: 14px/22px ui-monospace, SFMono-Regular, Consolas, monospace; user-select: none; }
.gutter pre { margin: 0; padding: 12px 0; font: inherit; }
.codebox {
  position: relative; flex: 1; min-width: 0;
  --c-k: #6f2dbd; --c-s: #0b6b3a; --c-n: #a14400; --c-c: #5a6678; --c-p: #3b4658; --c-t: #0b5cad;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .codebox { --c-k: #c9a0ff; --c-s: #8ee0a8; --c-n: #ffb870; --c-c: #9aa7ba; --c-p: #c3cbd8; --c-t: #7cc4ff; }
}
:root[data-theme="dark"] .codebox { --c-k: #c9a0ff; --c-s: #8ee0a8; --c-n: #ffb870; --c-c: #9aa7ba; --c-p: #c3cbd8; --c-t: #7cc4ff; }
.hl, .editor { position: absolute; inset: 0; margin: 0; padding: 12px; box-sizing: border-box; font: 14px/22px ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; tab-size: inherit; }
.hl { overflow: hidden; pointer-events: none; color: var(--text); }
.hl code { display: block; font: inherit; will-change: transform; }
.hl :deep(.t-k) { color: var(--c-k); font-weight: 600; }
.hl :deep(.t-s) { color: var(--c-s); }
.hl :deep(.t-n) { color: var(--c-n); }
.hl :deep(.t-c) { color: var(--c-c); font-style: italic; }
.hl :deep(.t-p) { color: var(--c-p); }
.hl :deep(.t-t) { color: var(--c-t); }
.editor { resize: none; border: 0; background: transparent; color: var(--text); -webkit-text-fill-color: transparent; caret-color: var(--text); overflow: auto; outline: none; }
.editor:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.codebox.plain .hl { display: none; }
.codebox.plain .editor { -webkit-text-fill-color: var(--text); background: var(--surface); }
.status { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; padding: 4px 12px; border-top: 1px solid var(--border); background: var(--panel); font-size: 12.5px; color: var(--muted); }
.pagebar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-bottom: 1px solid var(--border); background: var(--panel); font-size: 13px; font-weight: 600; }
.pagebar select { flex: 1; min-width: 0; min-height: 36px; }
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
