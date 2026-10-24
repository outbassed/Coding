<script setup lang="ts">
import { computed } from 'vue';
export type NavIconName = 'home' | 'apps' | 'catalog' | 'docs' | 'settings' | 'search' | 'back' | 'external' | 'check' | 'info' | 'close' | 'minus' | 'plus' | 'panel' | 'chevron-up' | 'chevron-down' | 'copy' | 'eye' | 'eye-off' | 'arrow-up' | 'arrow-down' | 'duplicate' | 'trash';
const props = defineProps<{ name: NavIconName }>();
/** Logos oficiais das cinco seções: casinha e chave inglesa clássicas + três logos novos no mesmo estilo. */
const navLogos = {
  home: '/legacy-icons/home.svg',
  apps: '/legacy-icons/my-apps.svg',
  catalog: '/legacy-icons/catalog.svg',
  docs: '/legacy-icons/documents.svg',
  settings: '/legacy-icons/tools.svg'
} as const;
const restored: Partial<Record<NavIconName, string>> = navLogos;
const original = computed(() => restored[props.name]);
</script>

<template>
  <img v-if="original" :src="original" alt="" width="28" height="28" class="legacy-nav-icon" aria-hidden="true" draggable="false" />
  <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'copy'"><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M8.5 13h7M8.5 17h5"/></template>
    <template v-else-if="name === 'eye'"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5-9.5-6.5-9.5-6.5z"/><circle cx="12" cy="12" r="2.5"/></template>
    <template v-else-if="name === 'eye-off'"><path d="M3 3l18 18M9.6 5.8A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.3 16.3 0 0 1-3 3.7M6 6.9C3.7 8.5 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.4 3.9-1"/></template>
    <template v-else-if="name === 'arrow-up'"><path d="M12 20V4M5 11l7-7 7 7"/></template>
    <template v-else-if="name === 'arrow-down'"><path d="M12 4v16M5 13l7 7 7-7"/></template>
    <template v-else-if="name === 'duplicate'"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></template>
    <template v-else-if="name === 'home'"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/></template>
    <template v-else-if="name === 'apps'"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></template>
    <template v-else-if="name === 'catalog'"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><path d="M16.75 13.5v7M13.25 17h7"/></template>
    <template v-else-if="name === 'docs'"><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M8.5 13h7M8.5 17h5"/></template>
    <template v-else-if="name === 'settings'"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></template>
    <template v-else-if="name === 'back'"><path d="M19 12H5m6-6-6 6 6 6"/></template>
    <template v-else-if="name === 'external'"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></template>
    <template v-else-if="name === 'check'"><path d="m5 12.5 4.5 4.5L19 7.5"/></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18"/></template>
    <template v-else-if="name === 'minus'"><path d="M5 12h14"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'panel'"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M15 4.5v15"/></template>
    <template v-else-if="name === 'chevron-up'"><path d="m6 15 6-6 6 6"/></template>
    <template v-else><path d="m6 9 6 6 6-6"/></template>
  </svg>
</template>

<style scoped>
.legacy-nav-icon { display: inline-block; width: 28px; height: 28px; flex: 0 0 auto; object-fit: contain; border-radius: 7px; }
</style>
