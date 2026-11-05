<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import VIcon from './VIcon.vue';
import ThumbTile from './ThumbTile.vue';
import { KIND_ICON } from './icons';
import { KIND_LABELS, type ViewKind } from './kinds';
import { formatBytes } from '../../shared/bytes';
import type { MediaLinkChoice } from '../../shared/media-links';
import type { ViewerFile } from './model';
import type { SortKey, ViewerPrefs } from './prefs';

/**
 * Biblioteca do Visualizador: miniaturas ou lista, pesquisa, filtro por tipo, ordem, seleção em lote e link de mídia.
 * Não guarda arquivos: só mostra o que o Visualizador mandar e avisa o que a pessoa pediu.
 */
const props = defineProps<{
  files: ViewerFile[];
  total: number;
  counts: { kind: ViewKind; count: number }[];
  activeId: string;
  selected: string[];
  prefs: ViewerPrefs;
  blobOf: (file: ViewerFile) => Blob | null;
  query: string;
  kinds: ViewKind[];
  selectMode: boolean;
  linkError: string;
  drawer: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'toggle-kind', kind: ViewKind): void;
  (e: 'clear-filters'): void;
  (e: 'update:selectMode', value: boolean): void;
  (e: 'open', id: string): void;
  (e: 'toggle-select', id: string): void;
  (e: 'select-range', id: string): void;
  (e: 'select-all'): void;
  (e: 'select-none'): void;
  (e: 'browse'): void;
  (e: 'add-url', payload: { url: string; choice: MediaLinkChoice; done: (ok: boolean) => void }): void;
  (e: 'remove-selected'): void;
  (e: 'download-selected'): void;
  (e: 'close'): void;
}>();

const listEl = ref<HTMLElement | null>(null);
const linkOpen = ref(false);
const linkUrl = ref('');
const linkChoice = ref<MediaLinkChoice>('auto');
const linkInput = ref<HTMLInputElement | null>(null);
const grid = computed(() => props.prefs.libraryView === 'grade');
const selectedSet = computed(() => new Set(props.selected));
const filtered = computed(() => !!props.query.trim() || props.kinds.length > 0);
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'ordem', label: 'Ordem de abertura' }, { id: 'nome', label: 'Nome' }, { id: 'formato', label: 'Formato' }, { id: 'tamanho', label: 'Tamanho' }
];

function openLink(): void {
  linkOpen.value = true;
  void nextTick(() => linkInput.value?.focus());
}
function toggleLink(): void {
  linkOpen.value = !linkOpen.value;
  if (linkOpen.value) void nextTick(() => linkInput.value?.focus());
}
function submitLink(): void {
  if (!linkUrl.value.trim()) return;
  emit('add-url', { url: linkUrl.value, choice: linkChoice.value, done: (ok) => { if (ok) { linkUrl.value = ''; linkOpen.value = false; } } });
}

function onItem(file: ViewerFile, event: MouseEvent): void {
  if (event.shiftKey) { emit('select-range', file.id); return; }
  if (props.selectMode || event.ctrlKey || event.metaKey) { if (!props.selectMode) emit('update:selectMode', true); emit('toggle-select', file.id); return; }
  emit('open', file.id);
}
function onItemKey(event: KeyboardEvent): void {
  const keys = grid.value ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] : ['ArrowUp', 'ArrowDown'];
  if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const items = Array.from(listEl.value?.querySelectorAll<HTMLElement>('button.lib-item') ?? []);
  const at = items.indexOf(event.currentTarget as HTMLElement);
  if (at < 0) return;
  let cols = 1;
  if (grid.value && items.length > 1) {
    const top = items[0]!.getBoundingClientRect().top;
    cols = Math.max(1, items.findIndex((it, i) => i > 0 && Math.abs(it.getBoundingClientRect().top - top) > 4));
    if (cols < 0 || items.findIndex((it, i) => i > 0 && Math.abs(it.getBoundingClientRect().top - top) > 4) < 0) cols = items.length;
  }
  const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -cols : cols;
  const next = items[at + delta];
  if (next) { event.preventDefault(); next.focus(); }
}
const sub = (f: ViewerFile): string => KIND_LABELS[f.kind] + ' · ' + (f.sourceUrl ? 'link' : formatBytes(f.size));
defineExpose({ openLink, focusSearch: (): void => linkInput.value?.ownerDocument.getElementById('vw-find')?.focus() });
</script>

<template>
  <section class="lib" aria-label="Biblioteca de arquivos" data-testid="viewer-library" data-ctx="library">
    <header class="lib-head">
      <h2 class="lib-title">Biblioteca <span class="lib-count" data-testid="viewer-filter-count">{{ filtered ? files.length + ' de ' + total : total }}</span></h2>
      <div class="lib-tools">
        <button type="button" class="vw-btn" aria-label="Abrir arquivos" title="Abrir arquivos (Ctrl+O)" data-testid="open-files" @click="emit('browse')"><VIcon name="plus" /></button>
        <button type="button" class="vw-btn" :aria-pressed="linkOpen" aria-label="Abrir mídia por link" title="Abrir mídia por link" data-testid="viewer-link-toggle" @click="toggleLink"><VIcon name="link" /></button>
        <button type="button" class="vw-btn" :aria-label="grid ? 'Mostrar como lista' : 'Mostrar como miniaturas'" :title="grid ? 'Mostrar como lista' : 'Mostrar como miniaturas'" data-testid="library-view" @click="prefs.libraryView = grid ? 'lista' : 'grade'"><VIcon :name="grid ? 'list' : 'grid'" /></button>
        <button type="button" class="vw-btn" :aria-pressed="selectMode" aria-label="Selecionar vários" title="Selecionar vários" data-testid="select-mode" @click="emit('update:selectMode', !selectMode)"><VIcon name="select" /></button>
        <button v-if="drawer" type="button" class="vw-btn" aria-label="Fechar a biblioteca" data-testid="library-close" @click="emit('close')"><VIcon name="close" /></button>
      </div>
    </header>

    <form v-if="linkOpen" class="lib-link" data-testid="viewer-link-form" @submit.prevent="submitLink">
      <label class="lib-lbl" for="vw-url">Endereço direto da mídia</label>
      <input id="vw-url" ref="linkInput" v-model="linkUrl" class="lib-in" type="url" inputmode="url" autocomplete="url" placeholder="https://exemplo.com/foto.png" aria-label="Endereço da mídia" data-testid="viewer-media-url" />
      <div class="lib-row">
        <label class="sr-only" for="vw-kind">Tipo da mídia</label>
        <select id="vw-kind" v-model="linkChoice" class="vw-sel" data-testid="viewer-media-kind"><option value="auto">Tipo automático</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="audio">Áudio</option></select>
        <button type="submit" class="vw-btn primary" :disabled="!linkUrl.trim()" data-testid="viewer-open-url">Abrir link</button>
      </div>
      <p v-if="linkError" class="lib-err" role="alert" data-testid="viewer-link-error">{{ linkError }}</p>
      <p class="lib-hint">Use o endereço de um arquivo (termina em .jpg, .mp4, .mp3…), não de uma página como o YouTube. O link fica salvo no projeto, mas a mídia precisa de internet e o servidor pode bloquear o carregamento. Nada é contornado: login, DRM e bloqueios de origem continuam valendo.</p>
    </form>

    <div class="lib-find">
      <label class="sr-only" for="vw-find">Pesquisar arquivos</label>
      <span class="lib-find-icon" aria-hidden="true"><VIcon name="search" :size="18" /></span>
      <input id="vw-find" :value="query" type="search" class="lib-in lib-search" autocomplete="off" placeholder="Pesquisar por nome ou tipo" data-testid="viewer-filter" @input="emit('update:query', ($event.target as HTMLInputElement).value)" />
    </div>
    <div class="lib-sort">
      <label class="sr-only" for="vw-sort">Ordenar por</label>
      <select id="vw-sort" v-model="prefs.sortKey" class="vw-sel" data-testid="library-sort"><option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option></select>
      <button type="button" class="vw-btn" :aria-pressed="prefs.sortDesc" aria-label="Inverter a ordem" title="Inverter a ordem" data-testid="library-sort-dir" @click="prefs.sortDesc = !prefs.sortDesc"><VIcon name="sort" /></button>
    </div>
    <div v-if="counts.length > 1" class="lib-chips" role="group" aria-label="Filtrar por tipo">
      <button v-for="c in counts" :key="c.kind" type="button" class="chip" :aria-pressed="kinds.includes(c.kind)" :data-testid="'kind-' + c.kind" @click="emit('toggle-kind', c.kind)">
        <VIcon :name="KIND_ICON[c.kind]" :size="14" /> {{ KIND_LABELS[c.kind] }} <b>{{ c.count }}</b>
      </button>
    </div>

    <div v-if="selectMode" class="lib-batch" role="toolbar" aria-label="Ações em lote" data-testid="library-batch">
      <span class="lib-sel" role="status">{{ selected.length }} selecionado{{ selected.length === 1 ? '' : 's' }}</span>
      <button type="button" class="vw-btn" data-testid="select-all" @click="emit('select-all')">Todos</button>
      <button type="button" class="vw-btn" :disabled="!selected.length" data-testid="select-none" @click="emit('select-none')">Nenhum</button>
      <button type="button" class="vw-btn" :disabled="!selected.length" aria-label="Baixar selecionados" title="Baixar selecionados" data-testid="batch-download" @click="emit('download-selected')"><VIcon name="download" /></button>
      <button type="button" class="vw-btn danger" :disabled="!selected.length" aria-label="Remover selecionados" title="Remover selecionados do projeto" data-testid="batch-remove" @click="emit('remove-selected')"><VIcon name="trash" /></button>
    </div>

    <div class="lib-scroll">
      <div v-if="!total" class="lib-empty" data-testid="library-empty">
        <VIcon name="image" :size="34" />
        <p><strong>Nenhum arquivo ainda</strong></p>
        <p>Arraste arquivos para cá, cole com Ctrl+V ou use os botões acima.</p>
        <button type="button" class="vw-btn primary" data-testid="library-open-files" @click="emit('browse')">Abrir arquivos</button>
      </div>
      <div v-else-if="!files.length" class="lib-empty" data-testid="library-nomatch">
        <VIcon name="search" :size="30" />
        <p><strong>Nada encontrado</strong></p>
        <button type="button" class="vw-btn" data-testid="clear-filters" @click="emit('clear-filters')">Limpar pesquisa e filtros</button>
      </div>
      <ul v-else ref="listEl" class="lib-list" :class="grid ? 'as-grid' : 'as-list'" data-testid="viewer-files" data-ctx="library">
        <li v-for="f in files" :key="f.id" class="lib-li">
          <button type="button" class="lib-item" :class="{ on: f.id === activeId, picked: selectedSet.has(f.id) }" :data-ctx-file="f.id" :aria-current="f.id === activeId ? 'true' : undefined"
            :aria-pressed="selectMode ? selectedSet.has(f.id) : undefined" :title="f.name + ' — ' + sub(f)" :data-testid="'file-' + f.id" @click="onItem(f, $event)" @keydown="onItemKey">
            <span class="lib-thumb"><ThumbTile :file="f" :blob-of="blobOf" /></span>
            <span v-if="selectMode" class="lib-check" aria-hidden="true"><VIcon v-if="selectedSet.has(f.id)" name="check" :size="16" /></span>
            <span class="lib-meta"><span class="lib-name">{{ f.name }}</span><span class="lib-sub">{{ sub(f) }}</span></span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--st-bg2); color: var(--st-fg); border-right: 1px solid var(--st-line); }
.lib-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 8px 2px 14px; }
.lib-title { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: .02em; display: flex; align-items: center; gap: 8px; }
.lib-count { font-size: 12px; font-weight: 700; color: var(--st-mut); background: var(--st-bg); border: 1px solid var(--st-line); border-radius: 999px; padding: 1px 8px; }
.lib-tools { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.lib-find { position: relative; flex: none; margin: 4px 12px 0; }
.lib-find-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--st-mut); pointer-events: none; display: grid; }
.lib-in { width: 100%; min-height: 44px; padding: 0 10px; border: 1px solid var(--st-line); border-radius: 12px; background: var(--st-bg); color: var(--st-fg); font: inherit; font-size: 14px; }
.lib-search { padding-left: 34px; }
.lib-in:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.lib-sort { flex: none; display: flex; gap: 4px; align-items: center; margin: 6px 12px 0; }
.lib-sort .vw-sel { flex: 1 1 auto; min-width: 0; }
.lib-chips { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px 0; }
.chip { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px; border: 1px solid var(--st-line); border-radius: 999px; background: var(--st-bg); color: var(--st-fg); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.chip b { color: var(--st-mut); font-weight: 700; }
.chip:hover { background: var(--st-hover); }
.chip:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.chip[aria-pressed="true"] { background: color-mix(in srgb, var(--app) 30%, transparent); border-color: var(--app); }
.lib-link { flex: none; display: grid; gap: 6px; margin: 6px 12px 0; padding: 10px; border: 1px solid var(--st-line); border-radius: 14px; background: var(--st-bg); }
.lib-lbl { font-size: 12.5px; font-weight: 700; color: var(--st-mut); }
.lib-row { display: flex; gap: 6px; flex-wrap: wrap; }
.lib-row .vw-sel { flex: 1 1 130px; }
.lib-err { margin: 0; color: var(--st-bad); font-size: 13px; }
.lib-hint { margin: 0; color: var(--st-mut); font-size: 12px; line-height: 1.45; }
.lib-batch { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 8px 12px 0; padding: 4px 6px; border: 1px solid var(--app); border-radius: 12px; background: color-mix(in srgb, var(--app) 14%, var(--st-bg)); }
.lib-sel { flex: 1 1 auto; font-size: 13px; font-weight: 700; padding-left: 6px; }
.vw-btn.danger:hover:not(:disabled) { background: rgb(255 120 120 / 22%); color: var(--st-bad); }
.lib-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 10px 12px calc(12px + var(--sa-b)); }
.lib-empty { display: grid; justify-items: center; gap: 4px; text-align: center; padding: 28px 8px; color: var(--st-mut); font-size: 13.5px; }
.lib-empty p { margin: 0; }
.lib-empty strong { color: var(--st-fg); font-size: 15px; }
.lib-empty .vw-btn { margin-top: 10px; }
.lib-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.lib-list.as-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
.lib-li { min-width: 0; }
.lib-item { position: relative; width: 100%; padding: 0; border: 2px solid transparent; border-radius: 14px; background: var(--st-bg); color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; display: flex; }
.lib-item:hover { border-color: var(--st-line); }
.lib-item:focus-visible { outline: 2px solid var(--app); outline-offset: 2px; }
.lib-item.on { border-color: var(--app); box-shadow: 0 0 0 1px var(--app); }
.lib-item.picked { background: color-mix(in srgb, var(--app) 22%, var(--st-bg)); }
.as-grid .lib-item { flex-direction: column; }
.as-grid .lib-thumb { width: 100%; aspect-ratio: 1; display: block; }
.as-grid .lib-meta { padding: 6px 8px 8px; }
.as-list .lib-item { align-items: center; gap: 10px; padding: 4px; min-height: 52px; }
.as-list .lib-thumb { width: 44px; height: 44px; flex: none; display: block; }
.lib-meta { display: grid; min-width: 0; gap: 1px; flex: 1 1 auto; }
.lib-name { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-sub { font-size: 11.5px; color: var(--st-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-check { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 7px; border: 2px solid #fff; background: rgb(13 17 23 / 70%); display: grid; place-items: center; color: #fff; }
.picked .lib-check { background: var(--app); border-color: var(--app); color: var(--ink); }
.as-list .lib-check { position: static; flex: none; order: -1; }
</style>
