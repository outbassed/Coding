<script setup lang="ts">
import type { CodingTool } from '../../shared/catalog';
import { LAUNCHER_PATH } from '../../shared/links';
import AppIcon from '../ui/AppIcon.vue';
import NavIcon from '../ui/NavIcon.vue';
import SaveStatus from './SaveStatus.vue';

defineProps<{ tool: CodingTool }>();
</script>

<template>
  <header class="bar">
    <a class="back" :href="LAUNCHER_PATH + '#/app/' + tool.id" aria-label="Voltar ao Launcher"><NavIcon name="back" /><span class="t">Launcher</span></a>
    <AppIcon :id="tool.id" size="sm" />
    <div class="titles">
      <h1 class="name">{{ tool.name }}</h1>
      <span class="doc">Documento de exemplo</span>
    </div>
    <SaveStatus state="preview" class="status" />
  </header>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 12px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(16px, var(--sa-r)) 0 max(12px, var(--sa-l)); background: var(--surface); border-bottom: 3px solid var(--app); }
.back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; justify-content: center; padding: 0 8px; border-radius: 12px; color: var(--accent); font-weight: 700; text-decoration: none; }
.back:hover { background: var(--panel); }
.titles { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.name { font-size: 16px; margin: 0; font-weight: 800; }
.doc { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { margin-left: auto; }
@media (max-width: 599px) { .t { display: none; } .doc { display: none; } .bar { gap: 8px; } }
</style>
