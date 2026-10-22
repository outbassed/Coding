<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { listCopySummaries, watchCopies, type CopySummary } from '../../storage/documents';
import { normalize, toolIdForType, typeLabel, formatDate } from '../../library/model';
import { findTool, type ToolId } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';
import ModalDialog from '../library/ModalDialog.vue';
import PageNavigator from '../library/PageNavigator.vue';
import { PAGE_SIZE, boundedPage, pageCount } from '../../library/pagination';

/** Read-only metadata only: never creates sample documents or loads every file's image Blobs. */
const props = defineProps<{ toolId?: ToolId }>();
const all = ref<CopySummary[]>([]);
const expanded = ref(false);
const query = ref('');
const page = ref(1);
let stop: (() => void) | undefined;
let alive = true;
const matching = computed(() => all.value
  .filter(copy => !props.toolId || toolIdForType(copy.type) === props.toolId)
  .sort((a,b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)));
const recent = computed(() => matching.value.slice(0, 8));
const searched = computed(() => matching.value.filter(copy => normalize(copy.label).includes(normalize(query.value.trim()))));
const totalPages = computed(() => pageCount(searched.value.length));
const pageItems = computed(() => searched.value.slice((page.value-1)*PAGE_SIZE, page.value*PAGE_SIZE));
const toolName = computed(() => props.toolId ? findTool(props.toolId)?.name ?? 'Aplicativo' : 'Documentos');
watch(query, () => { page.value = 1; });
watch(totalPages, max => { page.value = boundedPage(page.value, max); });

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
function href(copy: CopySummary): string | null {
  if (copy.type === 'labels') return '/apps/etiquetas/?doc=' + encodeURIComponent(copy.id);
  if (copy.type === 'texts' && copy.legacyId.startsWith('v2-texts-')) return '/apps/texto/?doc=' + encodeURIComponent(copy.id);
  return null;
}
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
          <span class="paper" aria-hidden="true"><AppIcon v-if="toolOf(copy)" :id="toolOf(copy)!.id" size="md" /><img v-else src="/legacy-icons/documents.svg" alt="" width="44" height="44" /></span>
          <strong class="name">{{ copy.label || 'Sem título' }}</strong><small class="muted">{{ typeLabel(copy.type) }}</small>
        </a>
        <RouterLink v-else :to="{ name: 'docs', query: { ferramenta: toolIdForType(copy.type) ?? undefined } }" class="tile-link" :aria-label="'Ver ' + (copy.label || 'documento sem título') + ' na biblioteca'">
          <span class="paper" aria-hidden="true"><AppIcon v-if="toolOf(copy)" :id="toolOf(copy)!.id" size="md" /><img v-else src="/legacy-icons/documents.svg" alt="" width="44" height="44" /></span>
          <strong class="name">{{ copy.label || 'Sem título' }}</strong><small class="muted">{{ typeLabel(copy.type) }}</small>
        </RouterLink>
      </div>
    </div>
    <p v-else class="muted empty">Nenhum arquivo salvo ainda.</p>
    <ModalDialog :open="expanded" :label="'Histórico de ' + toolName" variant="center" backdrop-close @close="expanded = false">
      <div class="modal-head"><h2 tabindex="-1" data-autofocus>Histórico completo · {{ toolName }}</h2><button type="button" class="close" aria-label="Fechar histórico" @click="expanded = false">✕</button></div>
      <label class="search-label" for="history-search">Buscar arquivos</label>
      <input id="history-search" v-model="query" class="search" type="search" placeholder="Nome do documento" />
      <p class="muted total">{{ searched.length }} {{ searched.length === 1 ? 'arquivo' : 'arquivos' }}</p>
      <ul v-if="pageItems.length" class="full-list" data-testid="history-list">
        <li v-for="copy in pageItems" :key="copy.id">
          <AppIcon v-if="toolOf(copy)" :id="toolOf(copy)!.id" size="sm" />
          <a v-if="href(copy)" :href="href(copy)!">{{ copy.label || 'Documento sem título' }}</a>
          <RouterLink v-else :to="{ name: 'docs', query: { ferramenta: toolIdForType(copy.type) ?? undefined } }" @click="expanded = false">{{ copy.label || 'Documento sem título' }}</RouterLink>
          <small class="muted">{{ formatDate(copy.updatedAt) }}</small>
        </li>
      </ul>
      <p v-else class="muted empty">Nenhum arquivo encontrado.</p>
      <PageNavigator :page="page" :total-pages="totalPages" @change="n => page = n" />
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
.paper { aspect-ratio:3/4; background:var(--surface); display:grid; place-items:center; border-radius:14px; border:1px solid var(--border); box-shadow:var(--shadow); }
.tile-link:hover .paper { border-color:var(--accent); background:var(--panel); }
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
.full-list li { display:flex; flex-wrap:wrap; align-items:center; gap:8px; border-bottom:1px solid var(--border); padding:8px 0; }
.full-list a { flex:1; min-width:110px; overflow-wrap:anywhere; color:var(--accent); font-weight:700; }
.full-list small { font-size:11px; }
@media(max-width:599px) { .scroller { margin-right:-12px; } .tile { flex-basis:118px; } .head { gap:8px; } .count { display:none; } }
</style>