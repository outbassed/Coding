<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { availabilityLabel, availabilityOf, categories, findTool } from '../shared/catalog';
import { levelsFor, type LevelState } from '../shared/levels';
import { legacyLink } from '../shared/links';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import StatusPill, { type PillTone } from '../components/ui/StatusPill.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import EmptyState from '../components/ui/EmptyState.vue';

const props = defineProps<{ id: string }>();
const apps = useAppsStore();
const tool = computed(() => findTool(props.id));
const enabled = computed(() => (tool.value ? apps.isEnabled(tool.value.id) : false));
const levels = computed(() => (tool.value ? levelsFor(tool.value, enabled.value) : []));
const avail = computed(() => (tool.value ? availabilityOf(tool.value) : 'planned'));
const categoryName = computed(() => categories.find((c) => c.id === tool.value?.category)?.label ?? '');
const tone = (state: LevelState): PillTone => (state === 'on' ? 'on' : state === 'unverified' || state === 'unproven' ? 'warn' : state === 'unavailable' ? 'soon' : 'off');
</script>

<template>
  <template v-if="tool">
    <p class="crumb"><RouterLink :to="{ name: 'catalog' }" class="back"><NavIcon name="back" />Catálogo</RouterLink></p>
    <div class="hero" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }">
      <AppIcon :id="tool.id" size="xl" />
      <PageHeader :title="tool.name" :lead="tool.description">
        <p class="chips" data-testid="detail-meta"><span class="chip2">{{ availabilityLabel[avail] }}</span><span class="chip2">{{ categoryName }}</span></p>
      </PageHeader>
    </div>

    <section aria-labelledby="niveis">
      <h2 id="niveis">Como este app está neste aparelho</h2>
      <p class="muted intro">São três coisas diferentes: uma não garante a outra.</p>
      <ul class="levels">
        <li v-for="level in levels" :key="level.key" class="level" :data-level="level.key">
          <div class="lh"><h3>{{ level.title }}</h3><StatusPill :tone="tone(level.state)" :label="level.label" /></div>
          <p class="muted">{{ level.text }}</p>
          <div v-if="level.key === 'activation' && tool.status === 'preview'" class="la">
            <ActivateButton :tool="tool" :enabled="enabled" />
          </div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="previsto" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }">
      <template v-if="tool.ready.length">
        <h2 id="pronto" class="app-text">O que já funciona</h2>
        <ul class="plan" data-testid="ready-list"><li v-for="item in tool.ready" :key="item">{{ item }}</li></ul>
      </template>
      <h2 id="previsto" class="app-text">{{ tool.ready.length ? 'O que ainda falta' : 'O que está previsto' }}</h2>
      <ul class="plan"><li v-for="item in tool.planned" :key="item">{{ item }}</li></ul>
      <p v-if="tool.status === 'preview' && !tool.ready.length" class="muted">A prévia mostra só a estrutura visual. Nenhuma edição é salva.</p>
      <div class="cta">
        <a v-if="tool.status === 'preview' && enabled && tool.path" :href="tool.path" class="btn btn-app">{{ tool.ready.length ? 'Abrir editor' : 'Abrir prévia' }}</a>
        <p v-else-if="tool.status === 'preview'" class="muted hint">Ative o app para abrir {{ tool.ready.length ? 'o editor' : 'a prévia' }}.</p>
        <a class="btn btn-ghost" :href="legacyLink(tool.legacyHash)">Usar no Coding atual <NavIcon name="external" /></a>
      </div>
    </section>
  </template>
  <template v-else>
    <PageHeader title="Aplicativo não encontrado" />
    <EmptyState title="Não existe um app com esse endereço." text="Confira o catálogo para ver os nove aplicativos."><RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Ver catálogo</RouterLink></EmptyState>
  </template>
</template>

<style scoped>
.crumb { margin-bottom: 8px; }
.back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: var(--accent); font-weight: 700; text-decoration: none; }
.hero { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
.hero :deep(.ph) { margin-bottom: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.chip2 { padding: 4px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); font-size: 12.5px; font-weight: 700; }
section { margin-top: 32px; }
h2 { font-size: 20px; margin-bottom: 4px; }
.intro { margin-bottom: 16px; }
.levels { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
.level { padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
.lh { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
h3 { font-size: 16px; margin: 0; }
.level p { margin-bottom: 0; font-size: 14px; }
.la { margin-top: 14px; }
.plan { padding-left: 20px; line-height: 1.8; }
.cta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
.hint { margin: 0; }
@media (max-width: 599px) { .hero { flex-direction: column; align-items: flex-start; gap: 12px; } .cta .btn { flex: 1 1 100%; } }
</style>
