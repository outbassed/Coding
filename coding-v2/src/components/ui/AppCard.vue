<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { availabilityLabel, availabilityOf, categories, type CodingTool } from '../../shared/catalog';
import { legacyLink } from '../../shared/links';
import AppIcon from './AppIcon.vue';
import StatusPill from './StatusPill.vue';
import ActivateButton from './ActivateButton.vue';

const props = defineProps<{ tool: CodingTool; enabled: boolean }>();
const avail = computed(() => availabilityOf(props.tool));
const category = computed(() => categories.find((c) => c.id === props.tool.category)?.label ?? '');
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
    <p class="meta" data-testid="card-meta"><span class="avail" :data-avail="avail">{{ availabilityLabel[avail] }}</span><span class="dot" aria-hidden="true">·</span><span>{{ category }}</span></p>
    <p class="muted desc">{{ tool.description }}</p>
    <div class="actions">
      <template v-if="tool.status === 'preview'">
        <a v-if="enabled && tool.path" :href="tool.path" class="btn btn-app" :aria-label="'Abrir ' + (avail === 'functional' ? 'o editor de ' : 'prévia de ') + tool.name">{{ avail === 'functional' ? 'Abrir' : 'Abrir prévia' }}</a>
        <ActivateButton :tool="tool" :enabled="enabled" />
      </template>
      <a v-else class="btn btn-ghost" :href="legacyLink(tool.legacyHash)" :aria-label="'Abrir ' + tool.name + ' no Coding atual'">Abrir no Coding atual ↗</a>
    </div>
  </article>
</template>

<style scoped>
.card { display:flex; flex-direction:column; align-items:center; text-align:center; min-width:0; padding:20px 12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:20px; position:relative; gap:8px; }
.card:hover { border-color:color-mix(in srgb,var(--accent) 42%,var(--border)); background:var(--panel); }
.top { display:grid; justify-items:center; gap:7px; margin-bottom:1px; }
.top :deep(.app-icon) { width:78px; height:78px; }
h3 { font-size:15px; line-height:1.25; margin:0; max-width:100%; font-weight:760; overflow-wrap:anywhere; }
.name { text-decoration:none; }
.name::after { content:""; position:absolute; inset:0; border-radius:20px; }
.name:focus-visible { outline:none; }
.card:has(.name:focus-visible) { outline:3px solid var(--accent); outline-offset:2px; }
.meta { margin:0; display:block; max-width:100%; font-size:11px; color:var(--muted); }
.avail[data-avail="functional"] { color:var(--ok); }
.dot, .meta span:last-child { display:none; }
.desc { margin:0; font-size:12px; line-height:1.4; min-height:34px; max-width:100%; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.actions { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; position:relative; z-index:1; margin-top:auto; }
.actions .btn { font-size:12px; min-height:40px; padding:7px 10px; }
@media(max-width:599px) {
  .card { padding:9px 3px 10px; border:0; background:transparent; border-radius:13px; gap:5px; }
  .card:hover { background:var(--panel); }
  .top { margin:0; }
  .top :deep(.app-icon) { width:clamp(58px,18vw,72px); height:clamp(58px,18vw,72px); }
  .top :deep([data-testid="status-pill"]) { display:none; }
  h3 { font-size:12px; font-weight:690; min-height:29px; max-width:100%; }
  .meta,.desc,.actions { display:none; }
}
@media(min-width:600px) and (max-width:899px) { .card { padding:14px 8px; } .top :deep(.app-icon) { width:68px;height:68px; } }
</style>