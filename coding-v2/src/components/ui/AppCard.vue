<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { CodingTool } from '../../shared/catalog';
import { legacyLink } from '../../shared/links';
import AppIcon from './AppIcon.vue';
import StatusPill from './StatusPill.vue';
import ActivateButton from './ActivateButton.vue';

const props = defineProps<{ tool: CodingTool; enabled: boolean }>();
const pill = computed(() => props.tool.status !== 'preview'
  ? { tone: 'soon' as const, label: 'Em breve' }
  : props.enabled ? { tone: 'on' as const, label: 'Ativado' } : { tone: 'off' as const, label: 'Não ativado' });
</script>

<template>
  <article class="card" :style="{ '--app': tool.color }" :data-tool="tool.id">
    <div class="top">
      <AppIcon :id="tool.id" size="lg" />
      <StatusPill :tone="pill.tone" :label="pill.label" />
    </div>
    <h3><RouterLink :to="{ name: 'app', params: { id: tool.id } }" class="name">{{ tool.name }}</RouterLink></h3>
    <p class="muted desc">{{ tool.description }}</p>
    <div class="actions">
      <template v-if="tool.status === 'preview'">
        <a v-if="enabled && tool.path" :href="tool.path" class="btn btn-app" :aria-label="'Abrir prévia de ' + tool.name">Abrir prévia</a>
        <ActivateButton :tool="tool" :enabled="enabled" />
      </template>
      <a v-else class="btn btn-ghost" :href="legacyLink(tool.legacyHash)" :aria-label="'Abrir ' + tool.name + ' no Coding atual'">Abrir no Coding atual ↗</a>
    </div>
  </article>
</template>

<style scoped>
.card { display: flex; flex-direction: column; min-width: 0; padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--shadow); position: relative; }
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
h3 { font-size: 17px; margin-bottom: 4px; }
.name { text-decoration: none; }
.name::after { content: ""; position: absolute; inset: 0; border-radius: 20px; }
.name:focus-visible { outline: none; }
.card:has(.name:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }
.desc { font-size: 13.5px; margin-bottom: 16px; }
.actions { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; position: relative; z-index: 1; }
@media (max-width: 599px) {
  .card { padding: 14px; }
  .actions .btn { flex: 1 1 100%; }
}
</style>
