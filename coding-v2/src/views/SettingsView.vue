<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useSettingsStore, type Motion, type Theme } from '../stores/settings';
import { useAppsStore } from '../stores/apps';
import { tools } from '../shared/catalog';
import { LEGACY_URL } from '../shared/links';
import { previewPwaSupported, prepareOffline } from '../pwa';
import { listCopySummaries, type CopySummary } from '../storage/documents';
import { toolIdForType } from '../library/model';
import { readView, writeView, type ViewMode } from '../library/view';
import PageHeader from '../components/ui/PageHeader.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import StoragePanel from '../components/library/StoragePanel.vue';

const settings = useSettingsStore();
const apps = useAppsStore();
const themes: { id: Theme; label: string }[] = [{ id: 'auto', label: 'Automático' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Escuro' }];
const motions: { id: Motion; label: string }[] = [{ id: 'system', label: 'Seguir o aparelho' }, { id: 'reduce', label: 'Reduzir sempre' }];
const view = ref<ViewMode>(readView());
function setView(mode: ViewMode): void { view.value = mode; writeView(mode); announce('Biblioteca abrirá em ' + (mode === 'grid' ? 'grade' : 'lista') + '.'); }
const status = ref('');
const canPrepareOffline = previewPwaSupported();
const offlineState = ref<'idle' | 'working' | 'ready' | 'error'>('idle');
const offlineError = ref('');
onMounted(() => {
  if (!canPrepareOffline) return;
  void navigator.serviceWorker.getRegistration('/').then((registration) => {
    if (registration?.active?.scriptURL.endsWith('/sw.js')) offlineState.value = 'ready';
  }).catch(() => { /* Navegador sem permissão para consultar a instalação */ });
});
async function activateOffline(): Promise<void> {
  offlineState.value = 'working';
  offlineError.value = '';
  try {
    await prepareOffline();
    offlineState.value = 'ready';
    announce('Os arquivos da Prévia foram preparados para uso sem internet.');
  } catch (error) {
    offlineState.value = 'error';
    offlineError.value = error instanceof Error ? error.message : 'Não foi possível preparar o acesso offline.';
    announce(offlineError.value);
  }
}
function announce(text: string): void { status.value = ''; requestAnimationFrame(() => { status.value = text; }); }

/** Contagem por app sem criar o banco: só lê se ele já existir. */
const copies = ref<CopySummary[] | null>(null);
async function dbExists(): Promise<boolean> {
  try { if (typeof indexedDB === 'undefined') return false; if (typeof indexedDB.databases !== 'function') return true; return (await indexedDB.databases()).some((d) => d.name === 'coding-v2-documents'); } catch { return false; }
}
onMounted(async () => { try { copies.value = (await dbExists()) ? await listCopySummaries() : []; } catch { copies.value = null; } });
const perApp = computed(() => tools.map((t) => ({ tool: t, count: (copies.value ?? []).filter((c) => toolIdForType(c.type) === t.id).length })));
</script>

<template>
  <PageHeader eyebrow="Preferências" title="Ajustes" logo="/legacy-icons/tools.svg" />
  <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
  <section class="card" aria-labelledby="tema">
    <h2 id="tema">Aparência</h2>
    <p class="muted">Automático segue o tema do seu aparelho.</p>
    <div class="opts" role="group" aria-label="Tema">
      <button v-for="item in themes" :key="item.id" type="button" class="opt" :aria-pressed="settings.theme === item.id" @click="settings.setTheme(item.id)">{{ item.label }}</button>
    </div>
    <h3>Animações</h3>
    <div class="opts" role="group" aria-label="Movimento">
      <button v-for="item in motions" :key="item.id" type="button" class="opt" :aria-pressed="settings.motion === item.id" data-testid="motion-option" @click="settings.setMotion(item.id); announce('Animações: ' + item.label + '.')">{{ item.label }}</button>
    </div>
    <h3>Biblioteca</h3>
    <div class="opts" role="group" aria-label="Exibição padrão da biblioteca">
      <button type="button" class="opt" :aria-pressed="view === 'grid'" @click="setView('grid')">Grade</button>
      <button type="button" class="opt" :aria-pressed="view === 'list'" @click="setView('list')">Lista</button>
    </div>
  </section>

  <section class="card" aria-labelledby="docs-h">
    <h2 id="docs-h">Documentos e armazenamento</h2>
    <p class="muted">Os documentos do Coding 2.0 ficam neste navegador, em um banco próprio, separado do Coding atual (que nunca é alterado).</p>
    <ul v-if="copies" class="counts" data-testid="doc-counts">
      <li v-for="row in perApp" :key="row.tool.id"><AppIcon :id="row.tool.id" size="sm" /><span>{{ row.tool.name }}</span><strong>{{ row.count }}</strong></li>
    </ul>
    <p v-else class="muted">Não foi possível contar os documentos agora.</p>
    <StoragePanel :refresh-key="0" @announce="announce" />
    <p><RouterLink :to="{ name: 'docs' }" class="btn">Backups e importação na Biblioteca</RouterLink></p>
  </section>

  <section class="card" aria-labelledby="apps-h">
    <h2 id="apps-h">Aplicativos</h2>
    <p class="muted">{{ apps.enabled.length }} de {{ tools.length }} ativados no Launcher. Ativar ou desativar só muda os atalhos; nenhum documento é apagado.</p>
    <RouterLink :to="{ name: 'my-apps' }" class="btn">Gerenciar meus apps</RouterLink>
  </section>

  <section class="card" aria-labelledby="off-h">
    <h2 id="off-h">Uso sem internet</h2>
    <p v-if="!canPrepareOffline" class="muted" data-testid="offline-status">A preparação offline é opcional e está desativada neste ambiente. Ela só pode ser usada em um build de Preview separado, para não interferir no Coding atual.</p>
    <template v-else>
      <p v-if="offlineState === 'ready'" class="muted" data-testid="offline-status">Arquivos do Coding 2.0 preparados neste navegador. Você pode abrir o Launcher e os nove aplicativos sem rede; documentos já salvos continuam no armazenamento local.</p>
      <p v-else class="muted" data-testid="offline-status">{{ offlineState === 'working' ? 'Preparando os arquivos estáticos do Preview…' : 'É possível preparar os arquivos do Preview para abrir os aplicativos sem internet. Seus documentos não são enviados nem armazenados no cache.' }}</p>
      <p v-if="offlineError" class="muted" role="alert">{{ offlineError }}</p>
      <button type="button" class="btn btn-primary" data-testid="prepare-offline" :disabled="offlineState === 'working'" @click="activateOffline">{{ offlineState === 'working' ? 'Preparando…' : offlineState === 'ready' ? 'Preparar novamente' : 'Preparar acesso offline' }}</button>
      <p class="muted small">O armazenamento offline é separado da instalação como aplicativo: o botão de instalar, quando disponível, pertence ao seu navegador. A preparação precisa de conexão inicial.</p>
    </template>
  </section>

  <section class="card" aria-labelledby="sobre-h">
    <h2 id="sobre-h">Sobre</h2>
    <p class="muted">Coding 2.0 · Prévia. O <a :href="LEGACY_URL">Coding atual</a> continua disponível e não é alterado por esta versão.</p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
h3 { font-size: 14px; margin: 16px 0 8px; }
.opts { display: flex; flex-wrap: wrap; gap: 8px; }
.opt { min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-weight: 650; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 -3px var(--accent); }
.counts { list-style: none; margin: 0 0 12px; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.counts li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.counts span { flex: 1; min-width: 0; }
.muted a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
</style>
