<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { listCopySummaries, watchCopies } from '../../storage/documents';
import { formatBytes } from '../../shared/bytes';
import { tools } from '../../shared/catalog';
import { useAppsStore } from '../../stores/apps';

/** Números reais: apps ativados, documentos salvos neste navegador e uso estimado do armazenamento. */
const apps = useAppsStore();
const docs = ref<number | null>(null);
const usage = ref<number | null>(null);
const quota = ref<number | null>(null);
let alive = true;
let stop: (() => void) | undefined;

async function dbExists(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    if (typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some((d) => d.name === 'coding-v2-documents');
  } catch { return false; }
}
async function refresh(): Promise<void> {
  try { docs.value = (await dbExists()) ? (await listCopySummaries()).length : 0; } catch { docs.value = null; }
  try {
    const e = await navigator.storage?.estimate?.();
    if (alive && e) { usage.value = typeof e.usage === 'number' ? e.usage : null; quota.value = typeof e.quota === 'number' ? e.quota : null; }
  } catch { /* sem estimativa */ }
}
onMounted(() => { void refresh(); try { stop = watchCopies(() => { void refresh(); }); } catch { /* sem canal entre abas */ } });
onBeforeUnmount(() => { alive = false; stop?.(); });
const storageText = computed(() => (usage.value === null ? 'não informado' : formatBytes(usage.value)));
</script>

<template>
  <ul class="stats" aria-label="Resumo" data-testid="home-stats">
    <li><span class="v">{{ apps.enabled.length }}<small> de {{ tools.length }}</small></span><span class="k">apps ativados</span></li>
    <li><span class="v" data-testid="stat-docs">{{ docs === null ? '—' : docs }}</span><span class="k">{{ docs === 1 ? 'documento salvo' : 'documentos salvos' }}</span></li>
    <li><span class="v" data-testid="stat-storage">{{ storageText }}</span><span class="k">usados neste navegador<template v-if="quota !== null"> (cota estimada {{ formatBytes(quota) }})</template></span></li>
  </ul>
</template>

<style scoped>
.stats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
li { display: grid; gap: 2px; min-width: 0; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
.v { font-size: 22px; font-weight: 780; letter-spacing: -.02em; overflow-wrap: anywhere; }
.v small { font-size: 13px; font-weight: 600; color: var(--muted); }
.k { font-size: 12.5px; color: var(--muted); }
@media (max-width: 599px) { .stats { gap: 6px; } li { padding: 10px; } .v { font-size: 18px; } .k { font-size: 11.5px; } }
</style>
