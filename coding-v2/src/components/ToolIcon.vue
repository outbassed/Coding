<script setup lang="ts">
import type { ToolId } from '../shared/catalog';
defineProps<{ id: ToolId }>();
</script>
<template>
  <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="id === 'labels'"><rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="4" height="4" rx=".6" fill="#F28B30"/><rect x="13" y="6" width="4" height="4" rx=".6"/><rect x="7" y="13" width="4" height="4" rx=".6"/><rect x="13" y="13" width="4" height="4" rx=".6"/></template>
    <template v-else-if="id === 'texts'"><path d="M6 3h8l5 5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M8 12h8M8 16h8M8 19h5"/><path d="M8 9h3" stroke="#4C8DF6" stroke-width="3"/></template>
    <template v-else-if="id === 'calc'"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M15 4v16M3 15h18"/><rect x="10" y="10" width="4" height="4" fill="#34A853" stroke="none"/></template>
    <template v-else-if="id === 'images'"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2" fill="#E8538F" stroke="none"/><path d="m4 17 5-4 4 3 3-3 4 4"/></template>
    <template v-else-if="id === 'pdf'"><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 17l6-6 2 2-6 6H8z" fill="none"/></template>
    <template v-else-if="id === 'codes'"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3M20 14v7M14 20h4"/></template>
    <template v-else-if="id === 'sheet-labels'"><rect x="3" y="4" width="12" height="16" rx="2"/><path d="M3 9h12M9 4v16M3 14h12M17 12h5m-2-2 2 2-2 2" stroke="#14B8A6"/></template>
    <template v-else-if="id === 'draw'"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.8" fill="#F5B820"/><circle cx="15" cy="15" r="1.8" fill="#F5B820"/></template>
    <template v-else><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h4"/><circle cx="16" cy="15" r="2" fill="#84CC16"/></template>
  </svg>
</template>
