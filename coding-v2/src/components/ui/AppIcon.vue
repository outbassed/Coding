<script setup lang="ts">
import { computed } from 'vue';
import type { ToolId } from '../../shared/catalog';

/** SVGs copied without redrawing from the original Coding #pi-* symbols. */
const props = withDefaults(defineProps<{ id: ToolId; size?: 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'md' });
const originalNames: Record<ToolId, string> = {
  labels: 'labels', texts: 'texts', calc: 'calc', images: 'images',
  pdf: 'pdf', codes: 'codes',
  draw: 'draw', split: 'split', calculator: 'calculator', colors: 'colors', zip: 'zip', compare: 'compare', code: 'code'
};
const src = computed(() => '/legacy-icons/' + originalNames[props.id] + '.svg');
</script>

<template>
  <span class="app-icon" :class="'s-' + size" aria-hidden="true" data-testid="app-icon">
    <img :src="src" alt="" draggable="false" width="48" height="48" />
  </span>
</template>

<style scoped>
/* Caixa de tamanho fixo e trilhas minmax(0,1fr): o SVG nunca define o tamanho da caixa (evita ícone gigante ou cortado). */
.app-icon { display: inline-grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); place-items: center; flex: 0 0 auto; box-sizing: border-box; border-radius: 25%; overflow: hidden; }
.app-icon img { display: block; width: 100%; height: 100%; max-width: none; object-fit: contain; }
.s-sm { width: 32px; height: 32px; min-width: 32px; }
.s-md { width: 44px; height: 44px; min-width: 44px; }
.s-lg { width: 56px; height: 56px; min-width: 56px; }
.s-xl { width: 80px; height: 80px; min-width: 80px; }
</style>
