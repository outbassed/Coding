<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { availabilityLabel, availabilityOf, categories, findTool } from '../shared/catalog';
import { levelsFor, type LevelState, type OfflineInfo } from '../shared/levels';
import { legacyLink } from '../shared/links';
import { useAppsStore } from '../stores/apps';
import { useOfflineStore } from '../stores/offline';
import PageHeader from '../components/ui/PageHeader.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import StatusPill, { type PillTone } from '../components/ui/StatusPill.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';

const props = defineProps<{ id: string }>();
const apps = useAppsStore();
const offline = useOfflineStore();
onMounted(() => { void offline.init(); });
const tool = computed(() => findTool(props.id));
const enabled = computed(() => (tool.value ? apps.isEnabled(tool.value.id) : false));
const offlineInfo = computed<OfflineInfo>(() => {
  if (!tool.value) return { supported: false };
  if (!offline.supported) return { supported: false, reason: offline.reason };
  if (!offline.loaded) return { supported: true };
  const id = tool.value.id;
  return { supported: true, state: offline.stateOf(id), bytes: offline.records[id]?.bytes ?? offline.entryOf(id)?.bytes ?? null };
});
const levels = computed(() => (tool.value ? levelsFor(tool.value, enabled.value, offlineInfo.value) : []));
const avail = computed(() => (tool.value ? availabilityOf(tool.value) : 'planned'));
const categoryName = computed(() => categories.find(c => c.id === tool.value?.category)?.label ?? '');
const tone = (state: LevelState): PillTone => state === 'on' ? 'on' : state === 'busy' || state === 'unverified' ? 'warn' : state === 'unavailable' ? 'soon' : 'off';
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
    </dl>
    <div class="cta" :style="{ '--app': tool.color }">
      <a v-if="tool.status === 'preview' && enabled && tool.path" :href="tool.path" class="btn btn-primary">Abrir editor</a>
      <ActivateButton v-else-if="tool.status === 'preview'" :tool="tool" :enabled="enabled" />
      <a v-else :href="legacyLink(tool.legacyHash)" class="btn btn-primary">Abrir no Coding atual ↗</a>
    </div>

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
      <p v-if="tool.status === 'preview' && !tool.ready.length" class="muted">Ainda é uma demonstração, sem edição ou salvamento.</p>
      <a v-if="tool.status === 'preview'" :href="legacyLink(tool.legacyHash)" class="original">Usar no Coding atual ↗</a>
    </section>

    <details class="technical">
      <summary>Disponibilidade e instalação</summary>
      <p class="muted intro">Ativar um atalho não baixa o programa nem garante acesso offline: são três coisas separadas.</p>
      <ul class="levels" aria-label="Estados do aplicativo">
        <li v-for="level in levels" :key="level.key" class="level" :data-level="level.key">
          <div class="lh"><h3>{{ level.title }}</h3><StatusPill :tone="tone(level.state)" :label="level.label" /></div>
          <p class="muted">{{ level.text }}</p>
          <div v-if="level.key === 'activation' && tool.status === 'preview'" class="la"><ActivateButton :tool="tool" :enabled="enabled" /></div>
          <div v-else-if="level.key === 'offline' && tool.status === 'preview' && offline.supported" class="la"><RouterLink :to="{ name: 'settings' }" class="btn" data-testid="manage-offline">Gerenciar em Ajustes</RouterLink></div>
        </li>
      </ul>
    </details>
  </template>
  <template v-else>
    <PageHeader title="Aplicativo não encontrado" />
    <EmptyState title="Não existe um app com esse endereço." text="Confira o catálogo para ver os oito aplicativos.">
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
.stats { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); margin:14px 0 4px; padding:10px 0; border-block:1px solid var(--border); }
.stats > div { padding:0 10px; text-align:center; min-width:0; }
.stats > div + div { border-inline-start:1px solid var(--border); }
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
.original { display:inline-flex; min-height:44px; align-items:center; color:var(--accent); text-decoration:none; font-weight:700; }
.technical { margin:24px 0 38px; border-top:1px solid var(--border); padding-top:10px; }
.intro { font-size:13px; }
.levels { list-style:none; padding:0; margin:0; display:grid; gap:9px; grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr)); }
.level { border:1px solid var(--border); border-radius:14px; padding:12px; background:var(--surface); }
.lh { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
.level h3 { margin:0; font-size:14px; }
.level p { margin:0; font-size:12px; }
.la { margin-top:10px; }
@media(max-width:599px) { .stats dd { font-size:12.5px; } .stats > div { padding:0 6px; } .hero { gap:14px; align-items:flex-start; padding-top:6px; } .hero :deep(.app-icon) { width:85px; height:85px; } .hero :deep(.ph h1) { font-size:26px; } .hero :deep(.lead) { font-size:12px; } .cta .btn { flex:1; } }
</style>