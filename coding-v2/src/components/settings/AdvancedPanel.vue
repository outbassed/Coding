<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useOfflineStore } from '../../stores/offline';
import { estimateStorage } from '../../storage/documents';
import { latestOf } from '../../shared/versions';
import { versionRecords } from '../../shared/versions-data';

/**
 * Só itens que existem de verdade: um diagnóstico do que este navegador oferece e do que o Launcher já guardou,
 * copiável para suporte, e a verificação da lista de arquivos offline. Nenhuma ação destrutiva.
 */
const emit = defineEmits<{ announce: [text: string] }>();
const offline = useOfflineStore();
const persisted = ref<boolean | null>(null);
const controlled = ref<boolean | null>(null);
const checking = ref(false);
const copyNote = ref('');
const release = computed(() => latestOf('launcher', versionRecords));
onMounted(async () => {
  void offline.init();
  try { persisted.value = (await estimateStorage()).persisted; } catch { persisted.value = null; }
  controlled.value = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker.controller !== null : null;
});
const yesNo = (v: boolean | null): string => (v === null ? 'não informado' : v ? 'sim' : 'não');
const rows = computed<[string, string][]>(() => [
  ['Coding Launcher', release.value ? release.value.version + ' · compilação ' + release.value.build : 'sem registro'],
  ['Endereço', location.origin],
  ['Conexão agora', typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : 'não informado'],
  ['IndexedDB (documentos)', typeof indexedDB !== 'undefined' ? 'disponível' : 'indisponível'],
  ['Service worker e cache', offline.supported ? 'disponíveis' : 'indisponíveis: ' + offline.reason],
  ['Página servida pelo cache offline', yesNo(controlled.value)],
  ['Armazenamento persistente', yesNo(persisted.value)],
  ['Apps instalados offline', offline.loaded && offline.supported ? String(offline.installedApps.length) : 'não verificado'],
  ['Lista de arquivos offline', offline.manifest ? 'compilação da lista ' + offline.manifest.build : offline.manifestError || 'não carregada'],
  ['Navegador', typeof navigator !== 'undefined' ? navigator.userAgent : 'não informado']
]);
async function recheck(): Promise<void> {
  checking.value = true;
  try { await offline.loadManifest(); emit('announce', offline.manifestError || 'Lista de arquivos offline verificada.'); }
  finally { checking.value = false; }
}
async function copy(): Promise<void> {
  const text = 'Diagnóstico do Coding\n' + rows.value.map(([k, v]) => k + ': ' + v).join('\n');
  try { await navigator.clipboard.writeText(text); copyNote.value = 'Diagnóstico copiado.'; }
  catch { copyNote.value = 'Este navegador não permitiu copiar. Selecione o texto da tabela e copie manualmente.'; }
  emit('announce', copyNote.value);
}
</script>

<template>
  <section class="card" aria-labelledby="diag-h" data-testid="advanced-panel">
    <h2 id="diag-h">Diagnóstico</h2>
    <p class="muted">O que este navegador oferece e o que o Coding já guardou aqui. Útil para explicar um problema; nada é enviado a lugar nenhum.</p>
    <dl class="diag" data-testid="diagnostics">
      <div v-for="[k, v] in rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
    </dl>
    <div class="acts">
      <button type="button" class="btn" data-testid="copy-diagnostics" @click="copy">Copiar diagnóstico</button>
      <button v-if="offline.supported" type="button" class="btn" data-testid="recheck-manifest" :disabled="checking" :aria-busy="checking" @click="recheck">Verificar lista de arquivos offline</button>
    </div>
    <p class="muted small" role="status" data-testid="copy-note">{{ copyNote }}</p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.diag { margin: 0 0 14px; display: grid; gap: 4px; }
.diag > div { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 4px 12px; padding: 7px 2px; border-bottom: 1px solid var(--border); }
.diag > div:last-child { border-bottom: 0; }
dt { font-weight: 650; }
dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; }
.small { font-size: 12.5px; margin: 8px 0 0; }
@media (max-width: 520px) { .diag > div { grid-template-columns: minmax(0, 1fr); } }
</style>
