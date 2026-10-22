<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { listCopySummaries, watchCopies, type CopySummary } from '../../storage/documents';
import { toolIdForType, typeLabel, formatDate } from '../../library/model';
import { findTool } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';

/** Últimos documentos da versão 2.0. Não cria o banco: se ele ainda não existe, a seção nem aparece. */
const LIMIT = 4;
const recent = ref<CopySummary[]>([]);
let stop: (() => void) | undefined;
let alive = true;

async function dbExists(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    if (typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some((d) => d.name === 'coding-v2-documents');
  } catch { return false; }
}
async function refresh(): Promise<void> {
  try {
    if (!(await dbExists())) { recent.value = []; return; }
    const all = await listCopySummaries();
    if (alive) recent.value = [...all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIMIT);
  } catch { if (alive) recent.value = []; }
}
const href = (copy: CopySummary): string | null => (copy.type === 'labels' ? '/apps/etiquetas/?doc=' + encodeURIComponent(copy.id) : null);
const toolOf = (copy: CopySummary) => { const id = toolIdForType(copy.type); return id ? findTool(id) ?? null : null; };

onMounted(() => { void refresh(); try { stop = watchCopies(() => { void refresh(); }); } catch { /* sem aviso entre abas */ } });
onBeforeUnmount(() => { alive = false; stop?.(); });
</script>

<template>
  <section v-if="recent.length" aria-labelledby="recentes" data-testid="recent-docs">
    <div class="head"><h2 id="recentes">Documentos recentes</h2><RouterLink :to="{ name: 'docs' }" class="more">Ver todos</RouterLink></div>
    <ul class="list">
      <li v-for="copy in recent" :key="copy.id" class="row">
        <AppIcon v-if="toolOf(copy)" :id="toolOf(copy)!.id" size="md" />
        <img v-else src="/legacy-icons/documents.svg" alt="" width="44" height="44" class="gen" draggable="false" />
        <div class="txt">
          <strong class="nm">{{ copy.label || 'Documento sem título' }}</strong>
          <span class="muted sub">{{ typeLabel(copy.type) }} · alterado em {{ formatDate(copy.updatedAt) }}</span>
        </div>
        <a v-if="href(copy)" :href="href(copy)!" class="btn btn-ghost" :aria-label="'Abrir ' + (copy.label || 'documento sem título') + ' no editor'">Abrir</a>
        <RouterLink v-else :to="{ name: 'docs' }" class="btn btn-ghost" :aria-label="'Ver ' + (copy.label || 'documento sem título') + ' na biblioteca'">Ver</RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
section { margin-top: 36px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
h2 { font-size: 20px; margin: 0; }
.more { color: var(--accent); font-weight: 700; text-decoration: none; padding: 10px 4px; }
.more:hover { text-decoration: underline; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; min-width: 0; }
.gen { border-radius: 25%; flex: none; }
.txt { flex: 1; min-width: 0; display: grid; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 12.5px; }
.row .btn { min-height: 44px; flex: none; }
</style>
