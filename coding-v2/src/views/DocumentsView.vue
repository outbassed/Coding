<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import CopyCard from '../components/library/CopyCard.vue';
import PageNavigator from '../components/library/PageNavigator.vue';
import { PAGE_SIZE, pageCount, boundedPage } from '../library/pagination';
import { positionFor, readMemory, readView, withPosition, writeMemory, writeView, type LibraryMemory, type ViewMode } from '../library/view';
import CopyDetails from '../components/library/CopyDetails.vue';
import ModalDialog from '../components/library/ModalDialog.vue';
import RenameDialog, { type RenameMode } from '../components/library/RenameDialog.vue';
import ImportWizard from '../components/library/ImportWizard.vue';
import StoragePanel from '../components/library/StoragePanel.vue';
import { useMediaQuery } from '../composables/useMediaQuery';
import { LEGACY_URL } from '../shared/links';
import { getTool, tools, type ToolId } from '../shared/catalog';
import {
  listCopySummaries, getCopy, saveCopyRevision, forkCopy, deleteCopy, watchCopies, RevisionConflict, MissingCopy,
  type CopySummary, type CopyRecord
} from '../storage/documents';
import { importBackupToCopies, decodeBackupEntries } from '../storage/archive';
import { encodeSafeBackup, encodeBinaryPackage, decodeBinaryPackage, importBinaryPackage } from '../storage/archive-pack';
import { friendlyError } from '../library/errors';
import {
  activeFilterCount, applyFilters, defaultFilters, filtersFromQuery, filtersToQuery, originLabels, sortLabels,
  toolIdForType, toolsPresent, type LibraryFilters, type SortKey
} from '../library/model';
import type { Source } from '../storage/documents';

const newLabelsHref = getTool('labels').path ?? '/apps/etiquetas/';
const route = useRoute();
const router = useRouter();
const wide = useMediaQuery('(min-width: 900px)', true);

const copies = shallowRef<CopySummary[]>([]);
const storageKey = ref(0);
const loaded = ref(false);
const loadError = ref('');
const busy = ref(false);
const saveState = ref<SaveState>('idle');
const status = ref('');
const error = ref('');
const filters = ref<LibraryFilters>(filtersFromQuery(route.query as Record<string, unknown>));
const filtersOpen = ref(false);
// Cada aplicativo (aba) lembra a própria página; sobrevive à ida e volta a um editor (sessionStorage da aba).
const memory = ref<LibraryMemory>(readMemory());
let restoredTool = false;
if (!Object.hasOwn(route.query, 'ferramenta') && memory.value.tool !== 'all') {
  const saved = filtersFromQuery({ ferramenta: memory.value.tool });
  if (saved.tool !== 'all') { filters.value = { ...filters.value, tool: saved.tool }; restoredTool = true; }
}
const viewMode = ref<ViewMode>(readView());
function setView(mode: ViewMode): void { viewMode.value = mode; writeView(mode); say(mode === 'grid' ? 'Exibindo em grade.' : 'Exibindo em lista.'); }
const toolCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const copy of copies.value) { const key = toolIdForType(copy.type) ?? String(copy.type); counts.set(key, (counts.get(key) ?? 0) + 1); }
  return counts;
});
const selectedId = ref<string | null>(null);
const detailOpen = ref(false);
const importOpen = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const listHeading = ref<HTMLElement | null>(null);
let stopWatching: (() => void) | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
/** Gravações desta janela também disparam o aviso de mudança; só avisamos de mudanças vindas de OUTRA janela. */
let ownUntil = 0;
const markOwn = (): void => { ownUntil = Date.now() + 1500; };

// --- renomear: a revisão esperada é capturada UMA vez, ao abrir, e nunca é trocada por atualizações da lista ---
const renameOpen = ref(false);
const renameMode = ref<RenameMode>('edit');
const renameText = ref('');
const renameError = ref('');
let renameBase: { id: string; revision: number; label: string } | null = null;
const conflictCurrent = ref<{ label: string; revision: number; updatedAt: number } | null>(null);

// --- excluir ---
const deleteOpen = ref(false);
let deleteBase: { id: string; revision: number; label: string } | null = null;
const deleteLabel = ref('');
let deleteOrigin: HTMLElement | null = null;

const selected = computed(() => copies.value.find((c) => c.id === selectedId.value) ?? null);
const filtered = computed(() => applyFilters(copies.value, filters.value));
const totalPages = computed(() => pageCount(filtered.value.length));
const page = computed({
  get: () => (loaded.value ? positionFor(memory.value, filters.value.tool, totalPages.value) : (memory.value.positions[filters.value.tool] ?? 1)),
  set: (value: number) => {
    memory.value = { ...withPosition(memory.value, filters.value.tool, value), tool: filters.value.tool };
    writeMemory(memory.value);
  }
});
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
function goPage(value: number): void {
  page.value = boundedPage(value, totalPages.value);
  if (selectedId.value && !shown.value.some(c => c.id === selectedId.value)) selectedId.value = null;
}
const toolOptions = computed(() => {
  const ids = new Set<ToolId>(toolsPresent(copies.value));
  if (filters.value.tool !== 'all') ids.add(filters.value.tool);
  return tools.filter((t) => ids.has(t.id));
});
const filtering = computed(() => filters.value.q.trim() !== '' || activeFilterCount(filters.value) > 0);
const showFilterPanel = computed(() => wide.value || filtersOpen.value);
const countText = computed(() => {
  const n = filtered.value.length;
  return filtering.value ? n + (n === 1 ? ' cópia encontrada' : ' cópias encontradas') + ' de ' + copies.value.length : copies.value.length + (copies.value.length === 1 ? ' cópia' : ' cópias');
});

function say(text: string): void { status.value = ''; void nextTick(() => { status.value = text; }); }
function fail(text: string): void { error.value = ''; void nextTick(() => { error.value = text; }); }
const focusCard = async (id: string | null): Promise<void> => {
  await nextTick();
  const card = id ? document.querySelector<HTMLElement>('[data-copy-card="' + id + '"]') : null;
  (card ?? listHeading.value)?.focus();
};
const cardFallback = (): HTMLElement | null =>
  (selectedId.value ? document.querySelector<HTMLElement>('[data-copy-card="' + selectedId.value + '"]') : null) ?? listHeading.value;

async function refresh(): Promise<void> {
  try {
    copies.value = await listCopySummaries();
    storageKey.value += 1;
    loadError.value = '';
    if (selectedId.value && !copies.value.some((c) => c.id === selectedId.value)) { selectedId.value = null; detailOpen.value = false; }
    if (restoredTool) {
      restoredTool = false;
      if (!toolsPresent(copies.value).includes(filters.value.tool as ToolId)) filters.value = { ...filters.value, tool: 'all' };
    }
  } catch (err) { loadError.value = 'Não foi possível abrir o armazenamento das cópias. ' + friendlyError(err); }
  finally { loaded.value = true; }
}
async function manualRefresh(): Promise<void> {
  await refresh();
  if (!loadError.value) say('Biblioteca atualizada. ' + countText.value + '.');
}
onMounted(() => {
  if (restoredTool) void router.replace({ query: filtersToQuery(filters.value) });
  void refresh();
  stopWatching = watchCopies(() => {
    // Atualiza a lista em segundo plano; o que o usuário está editando não é tocado.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const foreign = Date.now() > ownUntil;
      void refresh().then(() => { if (foreign && !loadError.value) say('A biblioteca foi atualizada: outra janela alterou as cópias.'); });
    }, 150);
  });
});
onUnmounted(() => { stopWatching?.(); clearTimeout(refreshTimer); });

// --- filtros na URL ---
// Mudar busca, origem ou ordem muda o conjunto de resultados: todas as posições voltam à primeira página.
// Trocar de aplicativo (aba) não mexe nas posições: cada um mantém a sua.
const searchSignature = computed(() => JSON.stringify([filters.value.q, filters.value.origin, filters.value.sort]));
watch(searchSignature, () => {
  const kept = Object.fromEntries(Object.entries(memory.value.positions).filter(([key]) => key.startsWith('history:')));
  memory.value = { ...memory.value, positions: kept };
  writeMemory(memory.value);
});
watch(() => filters.value.tool, (tool) => { memory.value = { ...memory.value, tool }; writeMemory(memory.value); });
watch(filters, (value) => { void router.replace({ query: filtersToQuery(value) }); }, { deep: true });
watch(() => route.query, (query) => {
  const next = filtersFromQuery(query as Record<string, unknown>);
  if (JSON.stringify(next) !== JSON.stringify(filters.value)) filters.value = next;
});
function clearFilters(): void { filters.value = defaultFilters(); say('Filtros removidos.'); }
const setTool = (event: Event): void => { filters.value = { ...filters.value, tool: (event.target as HTMLSelectElement).value as ToolId | 'all' }; };
const setOrigin = (event: Event): void => { filters.value = { ...filters.value, origin: (event.target as HTMLSelectElement).value as Source | 'all' }; };
const setSort = (event: Event): void => { filters.value = { ...filters.value, sort: (event.target as HTMLSelectElement).value as SortKey }; };
watch(filtered, (list) => { if (loaded.value && filtering.value) say(list.length === 1 ? '1 cópia encontrada.' : list.length + ' cópias encontradas.'); });

function select(id: string): void {
  selectedId.value = id;
  if (!wide.value) detailOpen.value = true;
}
function closeDetail(): void { detailOpen.value = false; }

// --- renomear ---
function startRename(): void {
  const copy = selected.value; if (!copy) return;
  renameBase = { id: copy.id, revision: copy.revision, label: copy.label };
  renameText.value = copy.label; renameError.value = ''; renameMode.value = 'edit'; conflictCurrent.value = null;
  saveState.value = 'pending';
  detailOpen.value = false;
  renameOpen.value = true;
}
function closeRename(text?: string): void {
  renameOpen.value = false; renameBase = null; conflictCurrent.value = null; renameError.value = '';
  saveState.value = 'idle';
  if (text) say(text);
}
async function saveRename(): Promise<void> {
  const base = renameBase; if (!base || busy.value) return;
  const name = renameText.value.trim();
  if (!name) { renameError.value = 'Digite um nome para a cópia.'; return; }
  if (name === base.label) { closeRename('O nome não mudou. Nada foi salvo.'); return; }
  busy.value = true; saveState.value = 'saving'; renameError.value = '';
  try {
    markOwn();
    await saveCopyRevision(base.id, base.revision, { label: name });
    markOwn();
    await refresh();
    selectedId.value = base.id;
    saveState.value = 'saved';
    renameOpen.value = false; renameBase = null;
    say('Nome salvo: ' + name + '. O conteúdo da cópia não foi alterado.');
  } catch (err) {
    saveState.value = 'error';
    if (err instanceof RevisionConflict) {
      const current = await getCopy(base.id).catch(() => undefined);
      if (!current) { renameMode.value = 'missing'; }
      else {
        conflictCurrent.value = { label: current.label, revision: current.revision, updatedAt: current.updatedAt };
        renameMode.value = 'conflict';
      }
      renameError.value = 'Nada foi sobrescrito.';
      say('Conflito: esta cópia foi alterada em outra janela. Escolha como continuar.');
    } else if (err instanceof MissingCopy) {
      renameMode.value = 'missing'; say('Esta cópia não existe mais.');
    } else { renameError.value = friendlyError(err); }
  } finally { busy.value = false; }
}
async function conflictRefresh(): Promise<void> {
  const id = renameBase?.id ?? null;
  await refresh();
  selectedId.value = copies.value.some((c) => c.id === id) ? id : null;
  closeRename(selected.value ? 'Lista atualizada. O nome atual é: ' + selected.value.label + '.' : 'Lista atualizada. A cópia não existe mais.');
}
async function conflictSaveAsNew(): Promise<void> {
  const base = renameBase; if (!base || busy.value) return;
  busy.value = true; saveState.value = 'saving'; renameError.value = '';
  try {
    markOwn();
    const created = await forkCopy(base.id, renameText.value);
    markOwn();
    await refresh();
    selectedId.value = created.id;
    saveState.value = 'saved';
    closeRename('Nova cópia criada com o nome “' + created.label + '”. A cópia original ficou como estava na outra janela.');
    saveState.value = 'saved';
  } catch (err) { saveState.value = 'error'; renameError.value = friendlyError(err); }
  finally { busy.value = false; }
}

// --- exportar / duplicar / excluir ---
type BackupChoice = 'auto' | 'binary';
/** A download request does not prove the user saved the file on their device. */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function checkedExport(records: readonly CopyRecord[], format: BackupChoice) {
  const result = format === 'binary'
    ? { blob: await encodeBinaryPackage(records), extension: '.codingpack' as const, kind: 'binary' as const }
    : await encodeSafeBackup(records);
  // Verify the exact bytes handed to the browser, not just the source records.
  if (result.kind === 'binary') {
    if ((await decodeBinaryPackage(result.blob)).length !== records.length) throw new Error('Falha na verificação do pacote.');
  } else {
    const entries = await decodeBackupEntries(await result.blob.text());
    if (entries.length !== records.length) throw new Error('Falha na verificação do backup JSON.');
  }
  return result;
}
async function exportOne(): Promise<void> {
  const copy = selected.value; if (!copy || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const full = await getCopy(copy.id);
    if (!full) throw new MissingCopy();
    const result = await checkedExport([toRaw(full)], 'auto');
    const safe = copy.label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'copia';
    downloadFile(result.blob, 'coding-v2-' + safe + '-' + new Date().toISOString().slice(0, 10) + result.extension);
    say('Backup de “' + copy.label + '” (' + result.extension + ') verificado. Confirme que o arquivo foi salvo no aparelho.');
  } catch (err) { fail('Não foi possível exportar. ' + friendlyError(err)); }
  finally { busy.value = false; }
}
async function exportAll(format: BackupChoice = 'auto'): Promise<void> {
  if (busy.value || !copies.value.length) return;
  busy.value = true; error.value = '';
  try {
    const full: CopyRecord[] = [];
    for (const summary of copies.value) {
      // Read payloads only for the export, not while rendering the library.
      const record = await getCopy(summary.id);
      if (!record) throw new MissingCopy(); // Never silently omit an unsaved document.
      full.push(toRaw(record));
    }
    const result = await checkedExport(full, format);
    downloadFile(result.blob, 'coding-v2-copias-' + new Date().toISOString().slice(0, 10) + result.extension);
    say('Backup de ' + full.length + ' cópia(s) (' + result.extension + ') verificado. Confirme que o arquivo foi salvo no aparelho.');
  } catch (err) { fail('Não foi possível exportar. ' + friendlyError(err)); }
  finally { busy.value = false; }
}
async function duplicate(): Promise<void> {
  const copy = selected.value; if (!copy || busy.value) return;
  busy.value = true; saveState.value = 'saving'; error.value = '';
  try {
    markOwn();
    const created = await forkCopy(copy.id, ('Cópia de ' + copy.label).slice(0, 250));
    markOwn();
    await refresh();
    selectedId.value = created.id; saveState.value = 'saved';
    const position = filtered.value.findIndex(c => c.id === created.id);
    if (position >= 0) page.value = Math.floor(position / PAGE_SIZE) + 1;
    say('Nova cópia criada: “' + created.label + '”. A original não foi alterada.');
    await focusCard(created.id);
  } catch (err) { saveState.value = 'error'; fail('Não foi possível criar a cópia. ' + friendlyError(err)); }
  finally { busy.value = false; }
}
function askDelete(): void {
  const copy = selected.value; if (!copy) return;
  deleteBase = { id: copy.id, revision: copy.revision, label: copy.label };
  deleteLabel.value = copy.label;
  deleteOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  detailOpen.value = false;
  deleteOpen.value = true;
}
async function cancelDelete(): Promise<void> {
  deleteOpen.value = false; deleteBase = null;
  await nextTick();
  (deleteOrigin?.isConnected && deleteOrigin !== document.body ? deleteOrigin : cardFallback())?.focus();
}
async function confirmDelete(): Promise<void> {
  const base = deleteBase; if (!base || busy.value) return;
  busy.value = true; error.value = '';
  deleteOpen.value = false;
  try {
    markOwn();
    await deleteCopy(base.id, base.revision);
    markOwn();
    deleteBase = null;
    selectedId.value = null;
    await refresh();
    say('Cópia “' + base.label + '” excluída. O documento no Coding antigo não foi afetado.');
    await nextTick(); listHeading.value?.focus();
  } catch (err) {
    deleteBase = null;
    await refresh();
    if (err instanceof RevisionConflict) fail('A cópia “' + base.label + '” foi alterada em outra janela, então nada foi excluído. Confira e tente de novo.');
    else if (err instanceof MissingCopy) fail('A cópia “' + base.label + '” já não existia.');
    else fail('Não foi possível excluir. ' + friendlyError(err));
    await focusCard(base.id);
  } finally { busy.value = false; }
}

// --- importar backup ---
async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  busy.value = true; saveState.value = 'saving'; error.value = '';
  try {
    const isPackage = file.name.toLowerCase().endsWith('.codingpack')
      || (await file.slice(0, 14).text()) === 'CODING-PACK-1\n';
    if (!isPackage && file.size > 64 * 1024 * 1024) throw new Error('Backup JSON acima do limite de 64 MB. Use .codingpack.');
    markOwn();
    const count = isPackage ? await importBinaryPackage(file) : await importBackupToCopies(await file.text());
    markOwn();
    await refresh();
    saveState.value = 'saved';
    say(count + ' documento(s) restaurado(s) do backup. Nada foi gravado no banco antigo.');
  } catch (err) { saveState.value = 'error'; fail('Importação não concluída. ' + friendlyError(err)); }
  finally { busy.value = false; input.value = ''; }
}
function wizardDone(): void { markOwn(); void refresh(); }
function wizardAnnounce(text: string): void { markOwn(); say(text); }
function wizardClose(): void { importOpen.value = false; }
const toolName = (id: ToolId): string => getTool(id).name;
</script>

<template>
  <PageHeader title="Documentos" logo="/legacy-icons/documents.svg" lead="Seus arquivos e backups." />

  <div class="live" role="status" aria-live="polite" data-testid="library-status">{{ status }}</div>
  <p class="live-error" role="alert" data-testid="library-error">{{ error }}</p>

  <section aria-labelledby="copies-heading" class="block">
    <div class="head">
      <div>
        <h2 id="copies-heading" ref="listHeading" tabindex="-1">Minhas cópias</h2>
        <p class="muted count" data-testid="copy-count">{{ loaded ? countText : 'Carregando…' }}</p>
      </div>
      <div class="head-actions">
        <SaveStatus :state="saveState" />
        <a class="btn" data-testid="new-labels" :href="newLabelsHref">Nova etiqueta</a>
        <button type="button" class="btn btn-primary" data-testid="open-import" :disabled="busy" @click="importOpen = true">Importar do Coding antigo</button>
        <button type="button" class="btn" :disabled="busy" @click="manualRefresh">Atualizar biblioteca</button>
      </div>
    </div>

    <p v-if="loadError" class="problem" data-testid="load-error">{{ loadError }}</p>
    <nav v-if="copies.length && toolOptions.length" class="app-tabs" aria-label="Documentos por aplicativo" data-testid="document-app-tabs">
      <button type="button" :aria-pressed="filters.tool === 'all'" @click="filters.tool = 'all'">Todos ({{ copies.length }})</button>
      <button v-for="t in toolOptions" :key="t.id" type="button" :aria-pressed="filters.tool === t.id" @click="filters.tool = t.id">
        <img :src="'/legacy-icons/' + t.id + '.svg'" alt="" width="22" height="22" />
        {{ t.name }} ({{ toolCounts.get(t.id) ?? 0 }})
      </button>
    </nav>

    <div v-if="loaded && !loadError && copies.length" class="toolbar" role="search" aria-label="Buscar nas cópias">
      <div class="search">
        <label for="lib-q" class="lbl">Buscar por nome</label>
        <input id="lib-q" v-model="filters.q" type="search" class="field" placeholder="Digite parte do nome" autocomplete="off" enterkeyhint="search" />
      </div>
      <button v-if="!wide" type="button" class="btn" :aria-expanded="filtersOpen" aria-controls="lib-filters" @click="filtersOpen = !filtersOpen">
        Filtros<template v-if="activeFilterCount(filters)"> ({{ activeFilterCount(filters) }})</template>
      </button>
      <div class="view-toggle" role="group" aria-label="Modo de exibição" data-testid="view-toggle">
        <button type="button" :aria-pressed="viewMode === 'grid'" data-view-mode="grid" @click="setView('grid')">Grade</button>
        <button type="button" :aria-pressed="viewMode === 'list'" data-view-mode="list" @click="setView('list')">Lista</button>
      </div>
      <div v-show="showFilterPanel" id="lib-filters" class="filters">
        <div><label for="lib-tool" class="lbl">Ferramenta</label>
          <select id="lib-tool" class="field" :value="filters.tool" @change="setTool"><option value="all">Todas as ferramentas</option><option v-for="t in toolOptions" :key="t.id" :value="t.id">{{ toolName(t.id) }}</option></select></div>
        <div><label for="lib-origin" class="lbl">Origem</label>
          <select id="lib-origin" class="field" :value="filters.origin" @change="setOrigin"><option value="all">Todas as origens</option><option v-for="(label, key) in originLabels" :key="key" :value="key">{{ label }}</option></select></div>
        <div><label for="lib-sort" class="lbl">Ordenar por</label>
          <select id="lib-sort" class="field" :value="filters.sort" @change="setSort"><option v-for="(label, key) in sortLabels" :key="key" :value="key">{{ label }}</option></select></div>
        <button v-if="filtering" type="button" class="btn btn-ghost" @click="clearFilters">Limpar filtros</button>
      </div>
    </div>

    <div class="layout" :class="{ split: wide && copies.length > 0 }">
      <div class="listcol">
        <template v-if="!loaded"><p class="muted">Carregando as cópias…</p></template>
        <EmptyState v-else-if="!loadError && !copies.length" title="Você ainda não tem cópias" text="Importe documentos do Coding antigo (somente leitura) ou restaure um backup do Coding 2.0. As cópias aparecem aqui e podem ser renomeadas, exportadas e duplicadas.">
          <button type="button" class="btn btn-primary" @click="importOpen = true">Importar do Coding antigo</button>
          <button type="button" class="btn" :disabled="busy" @click="importInput?.click()">Importar backup do Coding 2.0</button>
        </EmptyState>
        <EmptyState v-else-if="!loadError && !filtered.length" title="Nenhuma cópia encontrada" text="Nenhuma cópia combina com a busca e os filtros atuais.">
          <button type="button" class="btn btn-primary" @click="clearFilters">Limpar busca e filtros</button>
        </EmptyState>
        <template v-else-if="!loadError">
          <ul class="cards" :class="viewMode" :data-view="viewMode" data-testid="v2-copies" aria-labelledby="copies-heading">
            <CopyCard v-for="copy in shown" :key="copy.id" :copy="copy" :selected="copy.id === selectedId" :view="viewMode" @select="select" />
          </ul>
          <PageNavigator :page="page" :total-pages="totalPages" @change="goPage" />
          <p v-if="totalPages > 1" class="page-summary muted">Página {{ page }} de {{ totalPages }} · {{ filtered.length }} documentos</p>
        </template>
      </div>

      <div v-if="wide && copies.length" class="panel" role="group" aria-labelledby="detail-heading" data-testid="details-panel">
        <template v-if="selected">
          <h2 id="detail-heading">{{ selected.label }}</h2>
          <CopyDetails :copy="selected" :busy="busy" @rename="startRename" @export="exportOne" @duplicate="duplicate" @remove="askDelete" />
        </template>
        <template v-else>
          <h2 id="detail-heading">Detalhes</h2>
          <p class="muted">Escolha uma cópia na lista para ver os detalhes e as ações: renomear, exportar, criar cópia e excluir.</p>
        </template>
      </div>
    </div>
  </section>

  <section aria-labelledby="backup-heading" class="block">
    <h2 id="backup-heading" class="h2s">Backups</h2>
    <p class="muted small">Exportar ou restaurar todos os documentos.</p>
    <div class="row">
      <button type="button" class="btn" :disabled="busy || !copies.length" @click="exportAll()">Exportar backup das cópias</button>
      <button type="button" class="btn" :disabled="busy || !copies.length" data-testid="export-codingpack" @click="exportAll('binary')">Baixar .codingpack</button>
      <button type="button" class="btn" :disabled="busy" @click="importInput?.click()">Importar backup do Coding 2.0</button>
      <input ref="importInput" type="file" accept=".json,.codingpack,application/json,application/octet-stream" class="visually-hidden" aria-label="Escolher backup JSON ou CODINGPACK do Coding 2.0" @change="importFile" />
    </div>
    <details class="backup-help"><summary>Sobre os formatos e a segurança dos backups</summary><p class="muted small">JSON: até 64 MB por arquivo. O .codingpack suporta imagens binárias verificadas por SHA-256. Importações não substituem documentos existentes e dependem do espaço disponível no navegador.</p></details>
    <StoragePanel :refresh-key="storageKey" @announce="say" />
    <details class="backup-help"><summary>Compatibilidade com o Coding antigo</summary><p class="muted small">O Coding 1.0 não é alterado. Ferramentas não migradas continuam no <a :href="LEGACY_URL">Coding atual</a>.</p></details>
  </section>

  <ModalDialog :open="detailOpen && !wide && !!selected" :label="selected ? 'Detalhes de ' + selected.label : 'Detalhes'" variant="sheet" :fallback-focus="cardFallback" backdrop-close @close="closeDetail">
    <template v-if="selected">
      <h2 class="sheet-h" tabindex="-1" data-autofocus>{{ selected.label }}</h2>
      <CopyDetails :copy="selected" :busy="busy" @rename="startRename" @export="() => { closeDetail(); void exportOne(); }" @duplicate="() => { closeDetail(); void duplicate(); }" @remove="askDelete" />
      <div class="sheet-close"><button type="button" class="btn btn-ghost" @click="closeDetail">Fechar</button></div>
    </template>
  </ModalDialog>

  <RenameDialog
    :open="renameOpen" :mode="renameMode" v-model="renameText"
    :current-label="conflictCurrent?.label ?? ''" :current-revision="conflictCurrent?.revision ?? 0" :current-updated-at="conflictCurrent?.updatedAt ?? 0"
    :error="renameError" :busy="busy" :fallback-focus="cardFallback"
    @save="saveRename" @cancel="closeRename('Renomeação cancelada. Nada foi alterado.')" @refresh="conflictRefresh" @save-as-new="conflictSaveAsNew"
  />

  <ConfirmDialog :open="deleteOpen" :title="'Excluir a cópia “' + deleteLabel + '”?'" confirm-label="Excluir cópia" danger @cancel="cancelDelete" @confirm="confirmDelete">
    <p>Isto remove somente esta cópia da versão 2.0 e as imagens guardadas nela. O documento original no Coding antigo <strong>não é afetado</strong>. Esta ação não pode ser desfeita; exporte um backup antes se tiver dúvida.</p>
  </ConfirmDialog>

  <ImportWizard :open="importOpen" :existing="copies" @close="wizardClose" @done="wizardDone" @announce="wizardAnnounce" />
</template>

<style scoped>
.backup-help { margin-top:8px; }
.backup-help summary { min-height:44px; display:flex; align-items:center; font-weight:700; cursor:pointer; }

.app-tabs { display:flex; align-items:center; gap:8px; overflow-x:auto; padding:3px 0 14px; margin:0 0 12px; scrollbar-width:thin; }
.app-tabs button { display:flex; align-items:center; gap:7px; white-space:nowrap; flex:none; min-height:44px; padding:6px 11px; border-radius:12px; border:1px solid var(--border); background:var(--surface); font-weight:700; }
.app-tabs button[aria-pressed="true"] { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 12%,var(--surface)); }
.app-tabs img { border-radius:6px; }
.page-summary { text-align:center; font-size:12px; margin:0; }

.live:empty { display: none; }
.live { padding: 10px 14px; margin: 0 0 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--ok); font-size: 14px; }
.live-error { margin: 0 0 12px; font-weight: 600; color: var(--danger); }
.live-error:empty { display: none; }
.live-error:not(:empty) { padding: 10px 14px; border: 1px solid var(--danger); border-radius: 12px; background: var(--panel); }
.block { margin: 0 0 24px; padding: clamp(14px, 2vw, 22px); border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
.head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.head h2, .h2s { font-size: 21px; margin: 0; }
h2:focus { outline: none; }
.count { margin: 2px 0 0; font-size: 13px; }
.head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.problem { padding: 12px 14px; border: 1px solid var(--danger); border-radius: 12px; color: var(--danger); font-weight: 600; }
.toolbar { display: grid; gap: 10px; margin-bottom: 16px; }
.lbl { display: block; font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
.field { display: block; width: 100%; min-height: 44px; padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); }
.field:focus { border-color: var(--accent); }
.filters { display: grid; gap: 10px; align-items: end; }
@media (min-width: 900px) { .filters { grid-template-columns: repeat(3, minmax(0, 1fr)) auto; } .toolbar { grid-template-columns: minmax(0, 1fr); } }
.layout { display: block; }
.layout.split { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
.cards { padding: 0; margin: 0; display: grid; gap: 10px; }
.cards.grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 600px) { .cards.grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
@media (min-width: 600px) and (max-width: 899px) { .cards.list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.view-toggle { display: inline-flex; width: fit-content; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.view-toggle button { min-height: 44px; padding: 0 16px; background: var(--surface); font-weight: 700; border: 0; }
.view-toggle button + button { border-left: 1px solid var(--border); }
.view-toggle button[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
@media (min-width: 1280px) { .layout.split { grid-template-columns: minmax(0, 1fr) 380px; } }
.panel { position: sticky; top: 16px; padding: 18px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); }
.panel h2 { font-size: 18px; overflow-wrap: anywhere; }
.more { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.more p { margin: 0; }
.row { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
.small { font-size: 12.5px; }
.sheet-h { font-size: 19px; margin-bottom: 12px; overflow-wrap: anywhere; }
.sheet-h:focus { outline: none; }
.sheet-close { margin-top: 12px; display: flex; justify-content: flex-end; }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip: rect(0 0 0 0); overflow: hidden; white-space: nowrap; }
@media (max-width: 599px) { .head-actions .btn, .row .btn { flex: 1 1 100%; } .sheet-close .btn { width: 100%; } }
</style>
