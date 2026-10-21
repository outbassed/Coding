<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { estimateStorage, requestPersistentStorage, type StorageEstimate } from '../../storage/documents';
import { formatBytes } from '../../library/model';

const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{ announce: [text: string] }>();

const info = ref<StorageEstimate | null>(null);
const problem = ref('');
const busy = ref(false);
const persistMessage = ref('');

async function load(): Promise<void> {
  try { info.value = await estimateStorage(); problem.value = ''; }
  catch { info.value = null; problem.value = 'O navegador não informou o espaço usado. Isso não afeta seus documentos.'; }
}
onMounted(load);
watch(() => props.refreshKey, load);

/** Só roda por clique do usuário: o navegador pode mostrar um aviso de permissão. */
async function ask(): Promise<void> {
  busy.value = true; persistMessage.value = '';
  try {
    const granted = await requestPersistentStorage();
    await load();
    persistMessage.value = granted || info.value?.persisted
      ? 'Armazenamento persistente ativado: o navegador não apagará estes dados por falta de espaço sem avisar.'
      : 'O navegador não concedeu o armazenamento persistente. Isso é decisão dele (alguns só concedem a sites muito usados). Seus dados continuam salvos, mas podem ser apagados se faltar espaço no aparelho; exporte backups com frequência.';
  } catch {
    persistMessage.value = 'Não foi possível pedir o armazenamento persistente neste navegador.';
  } finally { busy.value = false; emit('announce', persistMessage.value); }
}
const pct = (): number => Math.min(100, Math.max(0, info.value?.percentage ?? 0));
</script>

<template>
  <div class="storage" data-testid="storage-panel">
    <h3>Espaço neste aparelho</h3>
    <p v-if="problem" class="muted" data-testid="storage-problem">{{ problem }}</p>
    <p v-else-if="info && !info.supported" class="muted" data-testid="storage-unsupported">Este navegador não informa o espaço usado nem permite pedir armazenamento persistente.</p>
    <template v-else-if="info">
      <p data-testid="storage-usage">
        Usado por este site: <strong>{{ info.usage === null ? 'não informado' : formatBytes(info.usage) }}</strong>
        <template v-if="info.quota !== null"> de uma cota estimada de <strong>{{ formatBytes(info.quota) }}</strong><template v-if="info.percentage !== null"> ({{ info.percentage.toFixed(1).replace('.', ',') }}%)</template></template>.
      </p>
      <progress v-if="info.percentage !== null" class="bar" max="100" :value="pct()" aria-label="Espaço usado da cota estimada"></progress>
      <p class="muted small">É uma estimativa do site inteiro, incluindo outros dados do Coding neste endereço. Não é o espaço livre do aparelho.</p>
      <p data-testid="storage-persisted">Armazenamento persistente: <strong>{{ info.persisted === null ? 'não informado' : info.persisted ? 'ativado' : 'não ativado' }}</strong></p>
      <button v-if="info.persisted !== true" type="button" class="btn" data-testid="ask-persist" :disabled="busy" :aria-busy="busy" @click="ask">Pedir armazenamento persistente</button>
    </template>
    <p class="muted small persist-msg" role="status" data-testid="persist-message">{{ persistMessage }}</p>
  </div>
</template>

<style scoped>
.storage { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
h3 { font-size: 16px; margin-bottom: 8px; }
.bar { width: 100%; height: 10px; accent-color: var(--accent); margin: 4px 0 8px; }
.small { font-size: 12.5px; }
.persist-msg:empty { display: none; }
@media (max-width: 599px) { .btn { width: 100%; } }
</style>
