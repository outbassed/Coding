<script setup lang="ts">
import { computed } from 'vue';
import type { ToolId } from '../../shared/catalog';

/** SVGs copied without redrawing from the original Coding #pi-* symbols. */
const props = withDefaults(defineProps<{ id: ToolId; size?: 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'md' });
const originalNames: Record<ToolId, string> = {
  labels: 'labels', texts: 'texts', calc: 'calc', images: 'images',
  pdf: 'pdf', codes: 'codes', 'sheet-labels': 'sheet',
  draw: 'draw', split: 'split'
};
const src = computed(() => '/legacy-icons/' + originalNames[props.id] + '.svg');
</script>

<template>
  <span class="app-icon" :class="'s-' + size" aria-hidden="true" data-testid="app-icon">
    <img :src="src" alt="" draggable="false" width="48" height="48" />
  </span>
</template>

<style scoped>
.app-icon { display: inline-grid; place-items: center; flex: 0 0 auto; border-radius: 25%; overflow: hidden; }
.app-icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
.s-sm { width: 32px; height: 32px; }
.s-md { width: 44px; height: 44px; }
.s-lg { width: 56px; height: 56px; }
.s-xl { width: 80px; height: 80px; }
</style>
