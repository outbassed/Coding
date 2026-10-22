<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { listCopySummaries, watchCopies, type CopySummary } from '../../storage/documents';
import { applyFilters, defaultFilters, imagesText, openHref, toolIdForType, typeLabel, formatDate, sortLabels, type SortKey } from '../../library/model';
import { positionFor, readMemory, withPosition, writeMemory } from '../../library/view';
import { findTool, type ToolId } from '../../shared/catalog';
import DocThumb from './DocThumb.vue';
import ModalDialog from '../library/ModalDialog.vue';
import PageNavigator from '../library/PageNavigator.vue';
import { PAGE_SIZE, boundedPage, pageCount } from '../../library/pagination';

/** Read-only metadata only: never creates sample documents or loads every file's image Blobs. */
const props = defineProps<{ toolId?: ToolId }>();
const all = ref<CopySummary[]>([]);
const expanded = ref(false);
const query = ref('');
const memoryKey = 'history:' + (props.toolId ?? 'all');
const page = ref(positionFor(readMemory(), memoryKey, Number.MAX_SAFE_INTEGER));
const sort = ref<SortKey>('recent');
const sortKeys: SortKey[] = ['recent', 'oldest', 'name-asc', 'name-desc', 'images'];
let stop: (() => void) | undefined;
let alive = true;
const matching = computed(() => all.value
  .filter(copy => !props.toolId || toolIdForType(copy.type) === props.toolId)
  .sort((a,b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)));
const recent = computed(() => matching.value.slice(0, 8));
const searched = computed(() => applyFilters(matching.value, { ...defaultFilters(), q: query.value, sort: sort.value }));
const totalPages = computed(() => pageCount(searched.value.length));
const pageItems = computed(() => searched.value.slice((page.value-1)*PAGE_SIZE, page.value*PAGE_SIZE));
const toolName = computed(() => props.toolId ? findTool(props.toolId)?.name ?? 'Aplicativo' : 'Documentos');
// A posição do histórico é lembrada por aplicativo, na aba atual, e só vale enquanto há páginas suficientes.
function remember(value: number): void { const memory = readMemory(); writeMemory(withPosition(memory, memoryKey, value)); }
function goTo(value: number): void { page.value = boundedPage(value, totalPages.value); remember(page.value); }
watch([query, sort], () => { page.value = 1; remember(1); });
watch(totalPages, max => { if (all.value.length) page.value = boundedPage(page.value, max); });

async function dbExists(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    if (typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some(d => d.name === 'coding-v2-documents');
  } catch { return false; }
}
async function refresh(): Promise<void> {
  try {
    if (!(await dbExists())) { if (alive) all.value = []; return; }
    const next = await listCopySummaries();
    if (alive) all.value = next;
  } catch { if (alive) all.value = []; }
}
const href = openHref;
const toolOf = (copy: CopySummary) => { const id = toolIdForType(copy.type); return id ? findTool(id) ?? null : null; };
onMounted(() => { alive = true; void refresh(); try { stop = watchCopies(() => { void refresh(); }); } catch { /* no cross-tab channel */ } });
onBeforeUnmount(() => { alive = false; stop?.(); });
</script>

<template>
  <section v-if="recent.length || toolId" class="recent" aria-labelledby="recentes" data-testid="recent-docs">
    <div class="head">
      <button type="button" class="all" data-testid="open-history" @click="expanded = true">☰ <span>Ver histórico</span></button>
      <h2 id="recentes">{{ toolId ? 'Arquivos recentes' : 'Documentos recentes' }}</h2>
      <span v-if="recent.length" class="count muted">{{ recent.length }} recentes</span>
    </div>
    <div v-if="recent.length" class="scroller" role="list" aria-label="Últimos oito arquivos editados">
      <div v-for="copy in recent" :key="copy.id" class="tile" role="listitem" data-testid="history-tile">
        <a v-if="href(copy)" class="tile-link" :href="href(copy)!" :aria-label="'Abrir ' + (copy.label || 'documento sem título') + ' no editor'">
          <span class="paper"><DocThumb :copy="copy" /></span>
          <strong class="name">{{ copy.label || 'Sem título' }}</strong><small class="muted">{{ typeLabel(copy.type) }}</small>
        </a>
        <RouterLink v-else :to="{ name: 'docs', query: { ferramenta: toolIdForType(copy.type) ?? undefined } }" class="tile-link" :aria-label="'Ver ' + (copy.label || 'documento sem título') + ' na biblioteca'">
          <span class="paper"><DocThumb :copy="copy" /></span>
          <strong class="name">{{ copy.label || 'Sem título' }}</strong><small class="muted">{{ typeLabel(copy.type) }}</small>
        </RouterLink>
      </div>
    </div>
    <p v-else class="muted empty">Nenhum arquivo salvo ainda.</p>
    <ModalDialog :open="expanded" :label="'Histórico de ' + toolName" variant="center" backdrop-close @close="expanded = false">
      <div class="modal-head"><h2 tabindex="-1" data-autofocus>Histórico completo · {{ toolName }}</h2><button type="button" class="close" aria-label="Fechar histórico" @click="expanded = false">✕</button></div>
      <div class="controls">
        <div class="grow"><label class="search-label" for="history-search">Buscar arquivos</label>
          <input id="history-search" v-model="query" class="search" type="search" placeholder="Nome do documento" autocomplete="off" /></div>
        <div><label class="search-label" for="history-sort">Ordenar por</label>
          <select id="history-sort" v-model="sort" class="search"><option v-for="key in sortKeys" :key="key" :value="key">{{ sortLabels[key] }}</option></select></div>
      </div>
      <p class="muted total" aria-live="polite">{{ searched.length }} {{ searched.length === 1 ? 'arquivo' : 'arquivos' }}<template v-if="totalPages > 1"> · página {{ page }} de {{ totalPages }}</template></p>
      <ul v-if="pageItems.length" class="full-list" data-testid="history-list">
        <li v-for="copy in pageItems" :key="copy.id">
          <span class="row-thumb"><DocThumb :copy="copy" /></span>
          <span class="row-text">
            <a v-if="href(copy)" :href="href(copy)!">{{ copy.label || 'Documento sem título' }}</a>
            <RouterLink v-else :to="{ name: 'docs', query: { ferramenta: toolIdForType(copy.type) ?? undefined } }" @click="expanded = false">{{ copy.label || 'Documento sem título' }}</RouterLink>
            <small class="muted">{{ typeLabel(copy.type) }} · {{ formatDate(copy.updatedAt) }}<template v-if="copy.imageCount"> · {{ imagesText(copy.imageCount) }}</template></small>
          </span>
        </li>
      </ul>
      <p v-else class="muted empty">Nenhum arquivo encontrado.</p>
      <PageNavigator :page="page" :total-pages="totalPages" @change="goTo" />
      <RouterLink :to="{ name: 'docs', query: toolId ? { ferramenta: toolId } : {} }" class="btn btn-ghost" @click="expanded = false">Biblioteca de documentos</RouterLink>
    </ModalDialog>
  </section>
</template>

<style scoped>
.recent { margin-top:30px; min-width:0; }
.head { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.head h2 { font-size:19px; margin:0; flex:1; }
.all { min-height:44px; background:var(--panel); border:1px solid var(--border); color:var(--accent); font-weight:750; border-radius:12px; padding:0 10px; white-space:nowrap; }
.count { font-size:12px; }
.scroller { display:flex; gap:13px; overflow-x:auto; overflow-y:hidden; padding:3px 1px 14px; scrollbar-width:thin; scroll-snap-type:x mandatory; }
.tile { flex:0 0 clamp(112px,19vw,152px); min-width:0; scroll-snap-align:start; }
.tile-link { display:grid; gap:4px; text-decoration:none; min-width:0; color:var(--text); }
.paper { display:block; border-radius:10px; box-shadow:var(--shadow); }
.tile-link:hover .paper { outline:2px solid var(--accent); outline-offset:1px; }
.name { font-size:12px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.tile small { font-size:11px; }
.empty { margin:6px 0 14px; }
.modal-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:14px; }
.modal-head h2 { font-size:19px; margin:0; }
.close { width:44px; height:44px; border:1px solid var(--border); background:var(--panel); border-radius:12px; }
.search-label { display:block; font-size:13px; font-weight:700; margin-bottom:5px; }
.search { box-sizing:border-box; width:100%; min-height:44px; border:1px solid var(--border); border-radius:10px; padding:8px 12px; background:var(--panel); color:var(--text); }
.total { font-size:12px; margin:10px 0; }
.full-list { padding:0; margin:0; list-style:none; max-height:46dvh; overflow:auto; }
.full-list li { display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--border); padding:8px 0; content-visibility:auto; contain-intrinsic-size:auto 66px; }
.full-list a { overflow-wrap:anywhere; color:var(--accent); font-weight:700; min-height:24px; }
.full-list small { font-size:11.5px; }
.row-text { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
.row-thumb { flex:0 0 40px; width:40px; }
.controls { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,190px); gap:10px; }
@media(max-width:480px) { .controls { grid-template-columns:minmax(0,1fr); } }
@media(max-width:599px) { .scroller { margin-right:-12px; } .tile { flex-basis:118px; } .head { gap:8px; } .count { display:none; } }
</style>