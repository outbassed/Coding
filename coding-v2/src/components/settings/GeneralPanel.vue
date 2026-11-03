<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useCopyCounts } from '../../composables/useCopyCounts';
import { useOfflineStore } from '../../stores/offline';
import { estimateStorage, type StorageEstimate } from '../../storage/documents';
import { tools } from '../../shared/catalog';
import { formatBytes } from '../../shared/bytes';
import { latestOf } from '../../shared/versions';
import { versionRecords } from '../../shared/versions-data';

/** Resumo real deste navegador: o que antes ficava no topo do Início. */
const { copies } = useCopyCounts();
const offline = useOfflineStore();
const estimate = ref<StorageEstimate | null>(null);
onMounted(async () => {
  void offline.init();
  try { estimate.value = await estimateStorage(); } catch { estimate.value = null; }
});
const release = computed(() => latestOf('launcher', versionRecords));
const installed = computed(() => (offline.supported && offline.loaded ? offline.installedApps.length : null));
const storageText = computed(() => (estimate.value && estimate.value.usage !== null ? formatBytes(estimate.value.usage) : 'não informado'));
</script>

<template>
  <section class="card" aria-labelledby="resumo-h" data-testid="general-summary">
    <h2 id="resumo-h">Resumo deste navegador</h2>
    <dl class="sum">
      <div><dt>Aplicativos</dt><dd data-testid="stat-apps">{{ tools.length }}<small> disponíveis online</small></dd></div>
      <div><dt>Documentos salvos</dt><dd data-testid="stat-docs">{{ copies === null ? '—' : copies.length }}</dd></div>
      <div><dt>Espaço usado</dt><dd data-testid="stat-storage">{{ storageText }}<small v-if="estimate && estimate.quota !== null"> (cota estimada {{ formatBytes(estimate.quota) }})</small></dd></div>
      <div><dt>Instalados offline</dt><dd data-testid="stat-offline">{{ installed === null ? '—' : installed }}<small v-if="installed !== null"> de {{ tools.length }}</small></dd></div>
      <div v-if="release"><dt>Versão do Coding</dt><dd data-testid="stat-version">{{ release.version }}<small> · compilação {{ release.build }}</small></dd></div>
    </dl>
    <p class="muted">Seus documentos ficam neste navegador. O uso offline de cada aplicativo é opcional e fica na aba <RouterLink :to="{ name: 'settings', query: { aba: 'offline' } }">Offline</RouterLink>.</p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.sum { margin: 0 0 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 10px; }
.sum > div { min-width: 0; padding: 10px 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; }
dt { font-size: 12.5px; color: var(--muted); }
dd { margin: 2px 0 0; font-size: 19px; font-weight: 760; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
dd small { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.muted a { color: var(--accent); font-weight: 700; }
</style>
