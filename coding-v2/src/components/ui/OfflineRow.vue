<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOfflineStore } from '../../stores/offline';
import { formatBytes } from '../../shared/bytes';
import { findTool, type ToolId } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';
import StatusPill, { type PillTone } from './StatusPill.vue';
import ModalDialog from '../library/ModalDialog.vue';

/**
 * Gerenciador offline de UM app: estado real, tamanho, progresso verificado, erro com nova tentativa e as ações
 * Instalar offline · Atualizar offline · Reparar instalação · Desinstalar offline. É o mesmo componente (e o mesmo estado)
 * em Ajustes → Offline e na página de Detalhes do app. `bare` esconde ícone e nome (a página de Detalhes já tem os dois).
 */
const props = defineProps<{ id: string; compact?: boolean; bare?: boolean }>();
const emit = defineEmits<{ say: [text: string] }>();
const offline = useOfflineStore();
const confirm = ref(false);
const isCore = computed(() => props.id === 'core');
const tool = computed(() => (isCore.value ? null : findTool(props.id)));
const entry = computed(() => offline.entryOf(props.id));
const name = computed(() => (isCore.value ? 'Núcleo do Launcher' : (tool.value?.name ?? props.id)));
const state = computed(() => offline.stateOf(props.id));
const plan = computed(() => offline.plan(props.id));
const record = computed(() => offline.records[props.id]);
const progress = computed(() => (offline.job?.ids.includes(props.id) ? offline.job.progress : null));
const busyElsewhere = computed(() => offline.job !== null && !offline.job.ids.includes(props.id));
const pill = computed<{ tone: PillTone; label: string }>(() => ({
  'not-installed': { tone: 'off' as const, label: 'Não instalado' },
  installing: { tone: 'warn' as const, label: 'Instalando…' },
  installed: { tone: 'on' as const, label: 'Instalado offline' },
  'update-available': { tone: 'warn' as const, label: 'Atualização disponível' },
  updating: { tone: 'warn' as const, label: 'Atualizando…' },
  failed: { tone: 'off' as const, label: 'Falhou' }
}[state.value]));
const percent = computed(() => (progress.value && progress.value.bytesTotal > 0 ? Math.min(100, Math.round((progress.value.bytesDone / progress.value.bytesTotal) * 100)) : 0));
const canRemove = computed(() => !isCore.value || offline.installedApps.length === 0);
const sizeText = computed(() => {
  if (record.value) return 'Ocupa ' + formatBytes(record.value.bytes) + ' neste navegador (soma dos arquivos; os comuns são compartilhados com outros apps).';
  const p = plan.value, e = entry.value;
  if (!p || !e) return 'Tamanho indisponível agora.';
  const parts = 'app ' + formatBytes(p.ownBytes) + ' + arquivos comuns ' + formatBytes(Math.max(0, (e.bytes) - p.ownBytes));
  return 'Download: ' + formatBytes(p.toDownload) + (p.includesCore ? ' (inclui o Núcleo do Launcher, ' + formatBytes(p.coreBytes) + ', necessário para abrir o Launcher sem internet)' : ' (' + parts + ')') + '.';
});

async function install(): Promise<void> { emit('say', 'Instalando ' + name.value + ' para uso offline.'); const ok = await offline.install(props.id); emit('say', ok ? name.value + ' instalado para uso offline.' : (offline.errors[props.id] ?? 'Instalação não concluída.')); }
async function retry(): Promise<void> { const ok = await offline.retry(props.id); emit('say', ok ? name.value + ' instalado para uso offline.' : (offline.errors[props.id] ?? 'Instalação não concluída.')); }
async function update(): Promise<void> { emit('say', 'Atualizando os apps instalados.'); const ok = await offline.updateAll(); emit('say', ok ? 'Apps atualizados.' : 'Atualização não concluída.'); }
async function remove(): Promise<void> { confirm.value = false; await offline.uninstall(props.id); emit('say', name.value + ' desinstalado do uso offline. Seus documentos continuam salvos e o app segue disponível online.'); }
const installedAt = computed(() => {
  const at = record.value?.installedAt;
  if (!at) return '';
  const d = new Date(at);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR');
});
</script>

<template>
  <li class="row" :class="{ compact }" :data-testid="'offline-' + id" :data-state="state">
    <template v-if="!bare">
      <AppIcon v-if="tool" :id="tool.id as ToolId" size="md" />
      <span v-else class="core-ico" aria-hidden="true">⚙</span>
    </template>
    <div class="main">
      <div class="head"><strong v-if="!bare">{{ name }}</strong><StatusPill :tone="pill.tone" :label="pill.label"/></div>
      <p class="muted size" :data-testid="'offline-size-' + id">{{ sizeText }}</p>
      <template v-if="progress">
        <progress class="bar" :max="Math.max(1, progress.bytesTotal)" :value="progress.bytesDone" :aria-label="'Progresso da instalação de ' + name" :data-testid="'offline-progress-' + id"></progress>
        <p class="muted small" role="status">{{ formatBytes(progress.bytesDone) }} de {{ formatBytes(progress.bytesTotal) }} · {{ percent }}% · {{ progress.filesDone }} de {{ progress.filesTotal }} arquivos</p>
      </template>
      <p v-if="record && !progress" class="muted small" :data-testid="'offline-info-' + id">Instalado em {{ installedAt }}. Vale só para este navegador e este aparelho.</p>
      <p v-if="state === 'update-available'" class="muted small" :data-testid="'offline-update-hint-' + id">Há uma versão mais nova. Enquanto você não atualizar, a versão instalada continua funcionando offline. A atualização vale para todos os apps instalados, porque eles compartilham arquivos.</p>
      <p v-if="offline.errors[id]" class="err" role="alert" :data-testid="'offline-error-' + id">{{ offline.errors[id] }}</p>
      <p v-else-if="(offline.damaged[id]?.length ?? 0) > 0" class="err" role="alert" :data-testid="'offline-damaged-' + id">O navegador apagou {{ offline.damaged[id]!.length }} arquivo(s) deste app. Use “Reparar instalação” para baixar de novo só o que falta.</p>
    </div>
    <div class="acts">
      <button v-if="state === 'not-installed'" type="button" class="btn btn-primary" :disabled="busyElsewhere || !offline.manifest" :data-testid="'install-' + id" :aria-label="'Instalar ' + name + ' para uso offline'" @click="install">Instalar offline</button>
      <button v-else-if="state === 'installing' || state === 'updating'" type="button" class="btn" :data-testid="'cancel-' + id" :aria-label="'Cancelar a instalação de ' + name" @click="offline.cancel()">Cancelar</button>
      <button v-else-if="state === 'failed'" type="button" class="btn btn-primary" :disabled="busyElsewhere" :data-testid="'retry-' + id" @click="retry">{{ record ? 'Reparar instalação' : 'Tentar de novo' }}</button>
      <button v-else-if="state === 'update-available'" type="button" class="btn btn-primary" :disabled="busyElsewhere" :data-testid="'update-' + id" :aria-label="'Atualizar ' + name + ' offline'" @click="update">Atualizar offline</button>
      <button v-if="record && state !== 'installing' && state !== 'updating' && canRemove" type="button" class="btn" :disabled="busyElsewhere" :data-testid="'uninstall-' + id" :aria-label="'Desinstalar ' + name + ' do uso offline'" @click="confirm = true">Desinstalar offline</button>
    </div>
    <ModalDialog :open="confirm" :label="'Desinstalar ' + name + ' do uso offline'" @close="confirm = false">
      <div class="dlg" :data-testid="'confirm-' + id">
        <h2>Desinstalar {{ name }} do uso offline?</h2>
        <p>Isso apaga só os arquivos do aplicativo guardados neste navegador. O app continua funcionando com internet.</p>
        <p><strong>Seus documentos, modelos, backups e ajustes não são apagados.</strong> Arquivos compartilhados com outros apps instalados são mantidos.</p>
        <div class="acts"><button type="button" class="btn btn-primary" data-autofocus :data-testid="'confirm-remove-' + id" @click="remove">Desinstalar offline</button><button type="button" class="btn" @click="confirm = false">Cancelar</button></div>
      </div>
    </ModalDialog>
  </li>
</template>

<style scoped>
.row { display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 16px; min-width: 0; }
.core-ico { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); font-size: 20px; }
.main { flex: 1; min-width: 0; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.size { margin: 4px 0 0; font-size: 13px; }
.small { font-size: 12.5px; margin: 2px 0 0; }
.bar { width: 100%; height: 10px; margin-top: 8px; accent-color: var(--accent); }
.err { margin: 6px 0 0; color: var(--danger); font-weight: 600; font-size: 13px; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
.acts .btn { min-height: 44px; }
.dlg h2 { font-size: 18px; margin: 0 0 8px; }
.dlg .acts { justify-content: flex-start; margin-top: 14px; }
@media (max-width: 599px) { .row { flex-wrap: wrap; } .acts { width: 100%; justify-content: stretch; } .acts .btn { flex: 1 1 140px; } }
</style>
