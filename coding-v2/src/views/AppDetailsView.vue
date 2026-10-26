<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { availabilityLabel, availabilityOf, categories, findTool } from '../shared/catalog';
import { historyPath, latestOf } from '../shared/versions';
import { versionRecords } from '../shared/versions-data';
import { useOfflineStore } from '../stores/offline';
import { useAnnouncer } from '../composables/useAnnouncer';
import PageHeader from '../components/ui/PageHeader.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';
import OfflineRow from '../components/ui/OfflineRow.vue';

const props = defineProps<{ id: string }>();
const offline = useOfflineStore();
const { say } = useAnnouncer();
onMounted(() => { void offline.init(); });
const tool = computed(() => findTool(props.id));
const avail = computed(() => (tool.value ? availabilityOf(tool.value) : 'planned'));
const categoryName = computed(() => categories.find(c => c.id === tool.value?.category)?.label ?? '');
const release = computed(() => (tool.value ? latestOf(tool.value.id, versionRecords) : null));
</script>

<template>
  <template v-if="tool">
    <p class="crumb"><RouterLink :to="{ name: 'catalog' }" class="back"><NavIcon name="back" />Catálogo</RouterLink></p>
    <header class="hero" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }">
      <AppIcon :id="tool.id" size="xl" />
      <div class="hero-details">
        <PageHeader :title="tool.name" :lead="tool.description" />
        <p class="developer">Coding</p>
      </div>
    </header>
    <dl class="stats" data-testid="detail-meta">
      <div><dt>Disponibilidade</dt><dd>{{ availabilityLabel[avail] }}</dd></div>
      <div><dt>Categoria</dt><dd>{{ categoryName }}</dd></div>
      <div v-if="tool.ready.length"><dt>Recursos prontos</dt><dd>{{ tool.ready.length }}</dd></div>
      <div v-if="release"><dt>Versão</dt><dd data-testid="app-version">{{ release.version }}</dd></div>
      <div v-if="release"><dt>Compilação</dt><dd data-testid="app-build">{{ release.build }}</dd></div>
    </dl>
    <p class="history"><a :href="historyPath(tool.id)" class="hist-link" data-testid="app-history-link">Ver histórico de versões</a></p>
    <div class="cta" :style="{ '--app': tool.color }">
      <a v-if="tool.path" :href="tool.path" class="btn btn-primary" data-testid="open-editor">Abrir editor</a>
    </div>

    <section class="offline" aria-labelledby="off-h" data-testid="app-offline">
      <h2 id="off-h">Uso offline</h2>
      <p class="muted intro">{{ tool.name }} sempre funciona online. Instale-o aqui para abri-lo também sem internet, neste navegador. Isso não muda seus documentos.</p>
      <p v-if="!offline.supported" class="muted" data-testid="offline-unsupported">{{ offline.reason }}</p>
      <template v-else>
        <p v-if="offline.manifestError" class="muted" role="status" data-testid="offline-manifest-error">{{ offline.manifestError }} <button type="button" class="link" @click="offline.loadManifest()">Tentar de novo</button></p>
        <ul class="rows" aria-label="Uso offline deste aplicativo"><OfflineRow :id="tool.id" bare @say="say($event)" /></ul>
        <p class="muted small">Também dá para gerenciar todos os aplicativos em <RouterLink :to="{ name: 'settings', query: { aba: 'offline' } }" data-testid="manage-offline">Ajustes → Offline</RouterLink>.</p>
      </template>
    </section>

    <RecentDocs v-if="tool.ready.length" :tool-id="tool.id" />

    <section class="features" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }" aria-labelledby="features-h">
      <h2 id="features-h">Sobre este aplicativo</h2>
      <template v-if="tool.ready.length">
        <h3 class="app-text">O que já funciona</h3>
        <ul class="plan" data-testid="ready-list"><li v-for="item in tool.ready" :key="item">{{ item }}</li></ul>
      </template>
      <details class="future" v-if="tool.planned.length">
        <summary>{{ tool.ready.length ? 'Recursos planejados' : 'O que está previsto' }}</summary>
        <ul class="plan"><li v-for="item in tool.planned" :key="item">{{ item }}</li></ul>
      </details>
    </section>
  </template>
  <template v-else>
    <PageHeader title="Aplicativo não encontrado" />
    <EmptyState title="Não existe um app com esse endereço." text="Confira o catálogo para ver todos os aplicativos.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Ver catálogo</RouterLink>
    </EmptyState>
  </template>
</template>

<style scoped>
.crumb { margin:0 0 12px; }
.back { display:inline-flex; gap:7px; align-items:center; min-height:44px; text-decoration:none; color:var(--accent); font-weight:700; }
.hero { display:flex; align-items:center; gap:22px; padding:18px 0 8px; }
.hero :deep(.app-icon) { width:110px; height:110px; flex:none; }
.hero-details { flex:1; min-width:0; }
.hero :deep(.ph) { margin-bottom:6px; }
.hero :deep(.ph h1) { margin:0 0 3px; }
.hero :deep(.lead) { font-size:14px; line-height:1.35; }
.developer { color:var(--accent); font-size:14px; font-weight:700; margin:3px 0 8px; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); row-gap:10px; margin:14px 0 4px; padding:10px 0; border-block:1px solid var(--border); }
.stats > div { padding:0 10px; text-align:center; min-width:0; }
.stats dt { font-size:11px; color:var(--muted); font-weight:650; margin-bottom:3px; }
.stats dd { margin:0; font-size:13.5px; font-weight:780; overflow-wrap:anywhere; }
.cta { margin:15px 0 18px; display:flex; gap:8px; }
.cta .btn { min-width:min(240px,100%); }
.features { margin-top:30px; }
h2 { font-size:20px; margin:0 0 12px; }
h3 { font-size:16px; margin:14px 0 6px; }
.plan { padding-left:22px; margin:0 0 12px; line-height:1.75; }
.future { padding:10px 0; }
summary { cursor:pointer; min-height:44px; display:flex; align-items:center; font-weight:700; color:var(--text); }
.history { margin:6px 0 0; }
.hist-link { display:inline-flex; min-height:44px; align-items:center; color:var(--accent); font-weight:700; text-underline-offset:2px; }
.offline { margin:6px 0 26px; padding:16px; border:1px solid var(--border); border-radius:16px; background:var(--surface); }
.offline h2 { margin:0 0 4px; font-size:18px; }
.intro { margin:0 0 12px; font-size:13.5px; }
.rows { list-style:none; margin:0 0 10px; padding:0; display:grid; gap:8px; }
.small { font-size:12.5px; margin:0; }
.small a { color:var(--accent); font-weight:700; }
.link { background:none; border:0; padding:0; color:var(--accent); font-weight:700; text-decoration:underline; }
@media(max-width:599px) { .stats dd { font-size:12.5px; } .stats > div { padding:0 6px; } .hero { gap:14px; align-items:flex-start; padding-top:6px; } .hero :deep(.app-icon) { width:85px; height:85px; } .hero :deep(.ph h1) { font-size:26px; } .hero :deep(.lead) { font-size:12px; } .cta .btn { flex:1; } }
</style>