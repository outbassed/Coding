<script setup lang="ts">
import NavIcon from './NavIcon.vue';
export type PillTone = 'on' | 'off' | 'soon' | 'warn';
defineProps<{ tone: PillTone; label: string }>();
</script>

<template>
  <span class="pill" :class="'t-' + tone" data-testid="status-pill">
    <NavIcon v-if="tone === 'on'" name="check" class="ico" />
    <NavIcon v-else-if="tone === 'warn'" name="info" class="ico" />
    {{ label }}
  </span>
</template>

<style scoped>
.pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel); color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; line-height: 1.3; }
.ico { width: 14px; height: 14px; }
.t-on { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--border)); }
.t-warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--border)); }
.t-soon { border-style: dashed; }
</style>
