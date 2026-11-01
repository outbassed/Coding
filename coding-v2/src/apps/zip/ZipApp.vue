<script setup lang="ts">
import { computed, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import SegTabs from '../../editors/SegTabs.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { formatBytes } from '../../shared/bytes';
import type { LegacyImage } from '../../storage/documents';
import { savingsText, totalSize, zipFileName, type ZipState } from './model';
import { zipKind, zipTemplates } from './kind';
import { buildZip, canCompress, canDecompress, extractEntry, listZip, MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, safeEntryName, uniqueName, ZipError, type ZipEntry, type ZipListing } from './zip';

const doc = useDocument<ZipState>({
  kind: zipKind, templates: zipTemplates, path: '/apps/zip/', withImages: true,
  imagesFor: (state, images) => { const used = new Set(state.files.map((f) => f.id)); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
/** Layout livre: os arquivos do projeto ficam sempre à vista; as operações (compactar, abrir um ZIP, arquivo) trocam num painel ao lado. */
const tabs = [{ id: 'compactar', label: 'Compactar' }, { id: 'abrir', label: 'Abrir ZIP' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('compactar');
const busy = ref(false);
const problem = ref('');
const info = ref('');
function ok(text: string): void { info.value = text; problem.value = ''; doc.say(text); }
function fail(text: string): void { problem.value = text; info.value = ''; doc.say(text); }
const messageOf = (e: unknown): string => (e instanceof ZipError ? e.message : 'Não foi possível concluir. Tente de novo.');

const total = computed(() => totalSize(state.value));
const MB = (n: number): number => Math.round(n / 1048576);

// ---- arquivos do projeto
async function addBytes(name: string, blob: Blob, modified: number): Promise<boolean> {
  if (state.value.files.length >= MAX_ENTRIES) { fail('O limite é de ' + MAX_ENTRIES + ' arquivos por ZIP.'); return false; }
  if (blob.size > MAX_ENTRY_BYTES) { fail('“' + name + '” passa de ' + MB(MAX_ENTRY_BYTES) + ' MB.'); return false; }
  if (total.value + blob.size > MAX_TOTAL_BYTES) { fail('Os arquivos passariam de ' + MB(MAX_TOTAL_BYTES) + ' MB no total.'); return false; }
  const wanted = safeEntryName(name) || 'arquivo';
  const path = uniqueName(wanted, new Set(state.value.files.map((f) => f.path)));
  const id = 'zf-' + crypto.randomUUID();
  const image: LegacyImage = { id, docId: '', blob, mime: blob.type || 'application/octet-stream', name: path };
  images.value = [...images.value, image];
  state.value.files.push({ id, path, size: blob.size, modified });
  return true;
}
const fileInput = ref<HTMLInputElement | null>(null);
async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []); input.value = '';
  if (!list.length) return;
  busy.value = true;
  let added = 0;
  for (const file of list) { if (await addBytes(file.name, file, file.lastModified)) added++; else break; }
  busy.value = false;
  if (added) ok(added + (added === 1 ? ' arquivo adicionado.' : ' arquivos adicionados.'));
}
function removeFile(id: string): void {
  const f = state.value.files.find((x) => x.id === id);
  state.value.files = state.value.files.filter((x) => x.id !== id);
  images.value = images.value.filter((i) => i.id !== id);
  result.value = null;
  if (f) doc.say('“' + f.path + '” removido do projeto.');
}
function renameFile(id: string, event: Event): void {
  const input = event.target as HTMLInputElement;
  const f = state.value.files.find((x) => x.id === id);
  if (!f) return;
  const wanted = safeEntryName(input.value);
  if (!wanted) { input.value = f.path; fail('O nome não pode ficar vazio.'); return; }
  const taken = new Set(state.value.files.filter((x) => x.id !== id).map((x) => x.path));
  if ([...taken].some((t) => t.toLowerCase() === wanted.toLowerCase())) { input.value = f.path; fail('Já existe um arquivo chamado “' + wanted + '” no projeto.'); return; }
  f.path = wanted; input.value = wanted; result.value = null;
}
function clearProject(): void {
  state.value.files = []; images.value = []; result.value = null;
  ok('Projeto esvaziado.');
}
const visibleFiles = computed(() => state.value.files.slice(0, 300));

// ---- compactar
interface Result { name: string; size: number; files: number; original: number; packed: number; savings: string; stored: number }
const result = ref<Result | null>(null);
async function createZip(): Promise<void> {
  if (!state.value.files.length) { fail('Adicione pelo menos um arquivo antes de compactar.'); return; }
  busy.value = true; result.value = null;
  try {
    const inputs = [];
    for (const f of state.value.files) {
      const image = images.value.find((i) => i.id === f.id);
      if (!image?.blob) throw new ZipError('O arquivo “' + f.path + '” não está mais disponível. Remova-o e adicione de novo.');
      inputs.push({ name: f.path, data: new Uint8Array(await image.blob.arrayBuffer()), modified: f.modified || Date.now() });
    }
    const built = await buildZip(inputs, { compress: state.value.compress });
    const name = zipFileName(state.value.name);
    downloadBlob(new Blob([built.bytes as BlobPart], { type: 'application/zip' }), name);
    result.value = { name, size: built.bytes.length, files: built.files, original: built.storedBytes, packed: built.bytes.length, savings: savingsText(built.storedBytes, built.bytes.length), stored: built.files - built.compressedEntries };
    ok('ZIP criado: ' + name + ' (' + formatBytes(built.bytes.length) + ').');
  } catch (e) { fail(messageOf(e)); }
  finally { busy.value = false; }
}

// ---- abrir um .zip
interface Opened { name: string; bytes: Uint8Array; listing: ZipListing }
const opened = ref<Opened | null>(null);
const verified = ref<{ ok: number; bad: string[] } | null>(null);
async function onZip(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  opened.value = null; verified.value = null;
  if (file.size > MAX_TOTAL_BYTES) { fail('O arquivo passa de ' + MB(MAX_TOTAL_BYTES) + ' MB.'); return; }
  busy.value = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    opened.value = { name: file.name, bytes, listing: listZip(bytes) };
    ok('“' + file.name + '” aberto: ' + opened.value.listing.entries.length + ' itens.');
  } catch (e) { fail(messageOf(e)); }
  finally { busy.value = false; }
}
const openedFiles = computed(() => (opened.value?.listing.entries ?? []).filter((e) => !e.directory));
const visibleEntries = computed(() => (opened.value?.listing.entries ?? []).slice(0, 300));
async function downloadEntry(entry: ZipEntry): Promise<void> {
  if (!opened.value) return;
  try {
    const data = await extractEntry(opened.value.bytes, entry);
    downloadBlob(new Blob([data as BlobPart]), safeFileName(entry.name.split('/').pop() ?? '', 'arquivo'));
    ok('“' + entry.name + '” extraído.');
  } catch (e) { fail(messageOf(e)); }
}
async function addEntry(entry: ZipEntry): Promise<void> {
  if (!opened.value) return;
  try {
    const data = await extractEntry(opened.value.bytes, entry);
    if (await addBytes(entry.name, new Blob([data as BlobPart]), entry.modified || Date.now())) ok('“' + entry.name + '” adicionado ao projeto.');
  } catch (e) { fail(messageOf(e)); }
}
async function addAll(): Promise<void> {
  if (!opened.value) return;
  busy.value = true;
  let added = 0;
  try {
    for (const entry of openedFiles.value) {
      const data = await extractEntry(opened.value.bytes, entry);
      if (!(await addBytes(entry.name, new Blob([data as BlobPart]), entry.modified || Date.now()))) break;
      added++;
    }
    if (added === openedFiles.value.length) ok(added + (added === 1 ? ' arquivo adicionado' : ' arquivos adicionados') + ' ao projeto.');
  } catch (e) { fail(messageOf(e)); }
  finally { busy.value = false; }
}
async function verify(): Promise<void> {
  if (!opened.value) return;
  busy.value = true;
  const bad: string[] = [];
  let good = 0;
  for (const entry of openedFiles.value) {
    try { await extractEntry(opened.value.bytes, entry); good++; } catch { bad.push(entry.name || entry.rawName); }
  }
  verified.value = { ok: good, bad };
  busy.value = false;
  ok(bad.length ? bad.length + (bad.length === 1 ? ' arquivo com problema.' : ' arquivos com problema.') : 'Integridade confirmada: ' + good + (good === 1 ? ' arquivo conferido.' : ' arquivos conferidos.'));
}
function closeZip(): void { opened.value = null; verified.value = null; }
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
function listText(): void {
  const lines = [state.value.name, '', ...state.value.files.map((f) => f.path + '\t' + f.size + ' bytes')];
  downloadText(lines.join('\n') + '\n', safeFileName(state.value.name, 'arquivos') + '.txt');
  doc.say('Lista de arquivos exportada.');
}
</script>

<template>
  <EditorShell app="zip" layout="free" :doc="doc" :history="false">
    <div class="zx" data-testid="zip-stage">
      <section class="files" aria-label="Arquivos do projeto">
        <div class="bar">
          <label class="add btn btn-app">
            <span>Adicionar arquivos</span>
            <input ref="fileInput" type="file" multiple class="pick" aria-label="Escolher arquivos para o ZIP" data-testid="zip-files-input" @change="onFiles" />
          </label>
          <p class="sum" data-testid="project-summary">{{ state.files.length }} {{ state.files.length === 1 ? 'arquivo' : 'arquivos' }} · {{ formatBytes(total) }} · {{ state.compress ? 'compactado' : 'sem compressão' }}</p>
          <button type="button" class="btn" :disabled="!state.files.length" data-testid="clear-project" @click="clearProject">Esvaziar projeto</button>
        </div>
        <p class="ed-hint">Até {{ MAX_ENTRIES }} arquivos e {{ MB(MAX_TOTAL_BYTES) }} MB no total. Tudo é feito neste aparelho, nada é enviado. Os arquivos ficam salvos no projeto.</p>
        <p v-if="problem" class="ed-error" role="alert" data-testid="zip-error">{{ problem }}</p>
        <p v-else-if="info" class="ed-ok" role="status" data-testid="zip-info">{{ info }}</p>

        <h2 id="proj-h" class="sh">Projeto</h2>
        <ul v-if="state.files.length" class="rows" data-testid="file-list" aria-labelledby="proj-h">
          <li v-for="(f, i) in visibleFiles" :key="f.id" :data-testid="'file-' + i">
            <input class="inp nm" :value="f.path" maxlength="240" :aria-label="'Nome de ' + f.path + ' no ZIP'" @change="renameFile(f.id, $event)" />
            <span class="sz">{{ formatBytes(f.size) }}</span>
            <button type="button" class="btn" :aria-label="'Remover ' + f.path" :data-testid="'remove-' + i" @click="removeFile(f.id)">Remover</button>
          </li>
        </ul>
        <div v-else class="empty" data-testid="file-empty">
          <strong>Nenhum arquivo ainda</strong>
          <span>Use “Adicionar arquivos” para montar o seu ZIP, ou abra um ZIP existente no painel ao lado.</span>
        </div>
        <p v-if="state.files.length > 300" class="ed-hint">Mostrando os primeiros 300 de {{ state.files.length }} arquivos.</p>

        <section v-if="opened" aria-labelledby="open-h" class="opened" data-testid="opened-zip">
          <h2 id="open-h" class="sh">Dentro de {{ opened.name }}</h2>
          <p class="sum" data-testid="opened-summary">{{ opened.listing.entries.length }} {{ opened.listing.entries.length === 1 ? 'item' : 'itens' }} · {{ formatBytes(opened.listing.totalSize) }} descompactado</p>
          <ul class="rows" data-testid="entry-list">
            <li v-for="(e, i) in visibleEntries" :key="i" :data-testid="'entry-' + i" :data-directory="e.directory ? 'sim' : 'nao'">
              <span class="nm"><span class="path">{{ e.name || e.rawName }}</span>
                <small class="muted">{{ e.directory ? 'pasta' : formatBytes(e.size) + (e.method === 8 ? ' · compactado' : e.method === 0 ? ' · armazenado' : ' · método ' + e.method) }}{{ e.modified ? ' · ' + dateFmt.format(e.modified) : '' }}</small>
                <small v-if="e.unsafe" class="warn" data-testid="entry-unsafe">Caminho suspeito: o nome foi limpo para {{ e.name || '(vazio)' }}.</small>
              </span>
              <template v-if="!e.directory && e.name">
                <button type="button" class="btn" :aria-label="'Extrair ' + e.name" :data-testid="'extract-' + i" @click="downloadEntry(e)">Extrair</button>
                <button type="button" class="btn" :aria-label="'Adicionar ' + e.name + ' ao projeto'" :data-testid="'to-project-' + i" @click="addEntry(e)">Ao projeto</button>
              </template>
            </li>
          </ul>
          <p v-if="opened.listing.entries.length > 300" class="ed-hint">Mostrando os primeiros 300 itens.</p>
        </section>
      </section>

      <section class="ops" aria-label="Operações">
        <SegTabs v-model="tab" :tabs="tabs" label="Operações do ZIP" prefix="zx" panel-id="zx-panel" fill />
        <div id="zx-panel" class="panel" role="tabpanel" :aria-labelledby="'zx-tab-' + tab" data-testid="editor-panel">
          <div v-if="tab === 'compactar'" class="ed-group">
            <fieldset class="seg">
              <legend class="ed-label">Como gravar</legend>
              <label class="radio"><input type="radio" name="zip-mode" :checked="state.compress" data-testid="mode-compress" @change="state.compress = true" /> Compactar (menor)</label>
              <label class="radio"><input type="radio" name="zip-mode" :checked="!state.compress" data-testid="mode-store" @change="state.compress = false" /> Só agrupar (rápido)</label>
            </fieldset>
            <p v-if="state.compress && !canCompress()" class="ed-error" role="alert">Este navegador não consegue compactar; o ZIP será criado sem compressão.</p>
            <p class="ed-hint">O arquivo se chamará <strong>{{ zipFileName(state.name) }}</strong> (o nome do projeto, no alto). Arquivos que já são compactados, como JPG, MP4 ou PDF, quase não diminuem.</p>
            <div class="ed-row"><button type="button" class="btn btn-app go" :disabled="busy || !state.files.length" data-testid="create-zip" @click="createZip">{{ busy ? 'Criando…' : 'Criar e baixar o ZIP' }}</button></div>
            <p v-if="!state.files.length" class="ed-hint">Adicione arquivos ao projeto primeiro.</p>
            <section v-if="result" aria-labelledby="res-h" class="card" data-testid="zip-result">
              <h2 id="res-h" class="sh">ZIP criado</h2>
              <p><strong>{{ result.name }}</strong> · {{ formatBytes(result.size) }} ({{ result.savings }}; original {{ formatBytes(result.original) }})</p>
              <p class="ed-hint">{{ result.files }} {{ result.files === 1 ? 'arquivo' : 'arquivos' }}, {{ result.stored }} gravado{{ result.stored === 1 ? '' : 's' }} sem compressão por não diminuírem. O download foi iniciado: confira a pasta de downloads.</p>
            </section>
          </div>

          <div v-else-if="tab === 'abrir'" class="ed-group">
            <label class="ed-field"><span class="ed-label">Arquivo ZIP</span>
              <input type="file" accept=".zip,application/zip,application/x-zip-compressed" class="inp" aria-label="Escolher um arquivo ZIP para abrir" data-testid="zip-open-input" @change="onZip" /></label>
            <p v-if="!canDecompress()" class="ed-error" role="alert">Este navegador não descompacta ZIP. Atualize o navegador.</p>
            <template v-if="opened">
              <div class="ed-row">
                <button type="button" class="btn" :disabled="busy" data-testid="verify-zip" @click="verify">Testar integridade</button>
                <button type="button" class="btn btn-app" :disabled="busy || !openedFiles.length" data-testid="add-all" @click="addAll">Adicionar tudo ao projeto</button>
                <button type="button" class="btn" data-testid="close-zip" @click="closeZip">Fechar ZIP</button>
              </div>
              <p v-if="verified" :class="verified.bad.length ? 'ed-error' : 'ed-ok'" role="status" data-testid="verify-result">
                {{ verified.bad.length ? 'Com problema: ' + verified.bad.join(', ') : verified.ok === 1 ? 'O arquivo confere (tamanho e CRC-32).' : 'Todos os ' + verified.ok + ' arquivos conferem (tamanho e CRC-32).' }}
              </p>
            </template>
            <p v-else class="ed-hint">Veja o que há dentro de um ZIP, confira se não está corrompido e extraia só o que precisar. ZIPs com senha e acima de 4 GB não são suportados.</p>
          </div>

          <FileTab v-else :templates="zipTemplates" @new="doc.newFrom">
            <button type="button" class="btn" :disabled="!state.files.length" data-testid="export-list" @click="listText">Lista de arquivos (TXT)</button>
          </FileTab>
        </div>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
/* Os arquivos são o centro; as operações ficam ao lado (PC) ou antes da lista (celular), para o botão principal nunca ficar enterrado. */
.zx { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; box-sizing: border-box; padding: 14px max(14px, var(--sa-r)) 28px max(14px, var(--sa-l)); }
.files { display: grid; gap: 10px; align-content: start; min-width: 0; order: 2; }
.ops { display: grid; gap: 10px; align-content: start; min-width: 0; order: 1; padding: 12px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.add { position: relative; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; cursor: pointer; overflow: hidden; }
.pick { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; }
.add:has(.pick:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }
.sh { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.sum { margin: 0; font-weight: 700; flex: 1 1 160px; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.rows li { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); min-width: 0; }
.nm { flex: 1 1 160px; min-width: 0; display: grid; gap: 2px; }
input.nm { display: block; }
.path { overflow-wrap: anywhere; font-weight: 650; }
.sz { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; min-width: 64px; text-align: right; }
.warn { color: var(--danger); font-weight: 600; }
.empty { display: grid; gap: 6px; place-items: center; text-align: center; padding: 36px 18px; border: 2px dashed color-mix(in srgb, var(--app) 55%, var(--border)); border-radius: 18px; background: color-mix(in srgb, var(--app) 6%, var(--surface)); color: var(--muted); }
.empty strong { color: var(--text); font-size: 17px; }
.opened { display: grid; gap: 8px; margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--border); }
.card { padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
.card p { margin: 0 0 4px; }
.seg { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; }
.radio { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 650; }
.radio input { width: 20px; height: 20px; }
.go { min-height: 48px; }
@media (min-width: 900px) {
  .zx { grid-template-columns: minmax(0, 1fr) 360px; column-gap: 18px; padding-top: 18px; }
  .files { order: 1; }
  .ops { order: 2; position: sticky; top: 0; align-self: start; }
}
</style>
