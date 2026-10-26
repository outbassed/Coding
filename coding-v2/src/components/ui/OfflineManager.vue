<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useOfflineStore } from '../../stores/offline';
import { tools } from '../../shared/catalog';
import { formatBytes } from '../../shared/bytes';
import { deviceInstallAvailable, onInstallPromptChange, promptDeviceInstall, watchInstallPrompt } from '../../pwa';
import { estimateStorage, type StorageEstimate } from '../../storage/documents';
import OfflineRow from './OfflineRow.vue';

const emit = defineEmits<{ announce: [text: string] }>();
const offline = useOfflineStore();
const estimate = ref<StorageEstimate | null>(null);
const canInstallDevice = ref(deviceInstallAvailable());
let stop: (() => void) | undefined;
onMounted(async () => {
  watchInstallPrompt();
  stop = onInstallPromptChange(() => { canInstallDevice.value = deviceInstallAvailable(); });
  await offline.init();
  try { estimate.value = await estimateStorage(); } catch { estimate.value = null; }
});
onBeforeUnmount(() => stop?.());
async function installDevice(): Promise<void> { const r = await promptDeviceInstall(); emit('announce', r === 'accepted' ? 'Instalação no aparelho iniciada.' : 'Instalação no aparelho não concluída.'); }
</script>

<template>
  <section class="card" aria-labelledby="off-h" data-testid="offline-manager">
    <h2 id="off-h">Uso sem internet</h2>
    <p class="muted">Todos os aplicativos funcionam online. Cada um também pode ser baixado para este navegador e aberto sem rede, o que é diferente de instalar o Coding como aplicativo no aparelho. Os tamanhos abaixo são dos arquivos reais desta versão, no disco; o download pela rede pode usar menos por causa da compressão.</p>
    <p v-if="!offline.supported" class="muted" data-testid="offline-unsupported">{{ offline.reason }}</p>
    <template v-else>
      <p v-if="offline.manifestError" class="muted" role="status" data-testid="offline-manifest-error">{{ offline.manifestError }} <button type="button" class="link" @click="offline.loadManifest()">Tentar de novo</button></p>
      <p v-if="offline.anyUpdate" class="muted" data-testid="offline-update-note">Há uma versão nova. A atualização baixa só os arquivos que mudaram e vale para todos os apps instalados, porque eles compartilham arquivos.</p>
      <ul class="rows" aria-label="Aplicativos para uso offline">
        <OfflineRow v-if="offline.records['core'] || offline.job?.ids.includes('core')" id="core" @say="emit('announce', $event)" />
        <OfflineRow v-for="t in tools" :key="t.id" :id="t.id" @say="emit('announce', $event)" />
      </ul>
      <p v-if="estimate && estimate.usage !== null" class="muted small" data-testid="offline-storage">Uso do navegador (todo o site, aproximado): {{ formatBytes(estimate.usage) }}<template v-if="estimate.quota !== null"> de uma cota estimada de {{ formatBytes(estimate.quota) }}</template>. A cota estimada não é espaço livre garantido.</p>
      <p class="muted small">Se o navegador limpar os dados do site, os apps instalados aparecem como “Falhou” e podem ser reparados aqui (Reparar instalação). Seus documentos ficam em outro armazenamento e não são apagados ao remover um app.</p>
      <p v-if="canInstallDevice" class="dev"><button type="button" class="btn" data-testid="install-device" @click="installDevice">Instalar o Coding neste aparelho</button> <span class="muted small">Opcional: o navegador oferece instalar o Launcher como aplicativo. Não substitui a instalação offline de cada app.</span></p>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: 720px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.rows { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.small { font-size: 12.5px; }
.link { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 700; text-decoration: underline; }
.dev { margin: 14px 0 0; }
</style>
