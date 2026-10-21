<script setup lang="ts">
import type { EditorTab } from '../../editors/model';

defineProps<{ tabs: EditorTab[]; active: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div class="strip" role="toolbar" aria-label="Ferramentas do editor" data-testid="tool-strip">
    <button v-for="tab in tabs" :key="tab.id" type="button" class="chip" :aria-pressed="active === tab.id" @click="emit('select', tab.id)">{{ tab.label }}</button>
  </div>
</template>

<style scoped>
.strip { display: flex; gap: 8px; align-items: center; min-height: 64px; padding: 8px max(12px, var(--sa-r)) calc(8px + var(--sa-b)) max(12px, var(--sa-l)); background: var(--surface); border-top: 1px solid var(--border); overflow-x: auto; scroll-snap-type: x proximity; }
.chip { flex: none; scroll-snap-align: start; min-height: 48px; padding: 0 20px; border-radius: 14px; border: 1px solid var(--border); background: var(--panel); font-weight: 700; }
.chip[aria-pressed="true"] { border-color: var(--app); background: var(--app); color: var(--ink); }
</style>
