<script setup lang="ts">
import { computed } from 'vue';
import { getTool, INK, type ToolId } from '../../shared/catalog';

const props = withDefaults(defineProps<{ id: ToolId; size?: 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'md' });
const tool = computed(() => getTool(props.id));
</script>

<template>
  <span class="app-icon" :class="'s-' + size" :style="{ background: tool.color, color: INK }" aria-hidden="true" data-testid="app-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <template v-if="id === 'labels'"><rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6.5" width="4" height="4" rx=".8"/><rect x="13" y="6.5" width="4" height="4" rx=".8"/><rect x="7" y="13.5" width="4" height="4" rx=".8"/><rect x="13" y="13.5" width="4" height="4" rx=".8"/></template>
      <template v-else-if="id === 'texts'"><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M8 12h8M8 15.5h8M8 19h5"/></template>
      <template v-else-if="id === 'calc'"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 15h18M9.5 4v16M15 4v16"/></template>
      <template v-else-if="id === 'images'"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-4.2 3.6 3 3-3 4.4 4.2"/></template>
      <template v-else-if="id === 'pdf'"><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5"/><path d="M8 17.5l5.5-5.5 2 2-5.5 5.5H8z"/></template>
      <template v-else-if="id === 'codes'"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M17 20.5h3.5"/></template>
      <template v-else-if="id === 'sheet-labels'"><rect x="3" y="4" width="11" height="16" rx="2"/><path d="M3 9.5h11M3 15h11M8.5 4v16M16.5 12h5m-2-2.2 2.2 2.2-2.2 2.2"/></template>
      <template v-else-if="id === 'draw'"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></template>
      <template v-else><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h4"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/></template>
    </svg>
  </span>
</template>

<style scoped>
.app-icon { display: inline-grid; place-items: center; flex: 0 0 auto; border-radius: 28%; }
.app-icon svg { width: 56%; height: 56%; }
.s-sm { width: 32px; height: 32px; }
.s-md { width: 44px; height: 44px; }
.s-lg { width: 56px; height: 56px; }
.s-xl { width: 80px; height: 80px; }
</style>
