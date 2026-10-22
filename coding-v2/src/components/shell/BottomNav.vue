<script setup lang="ts">
import { RouterLink } from 'vue-router';
import NavIcon from '../ui/NavIcon.vue';
import { navItems } from './nav';
</script>

<template>
  <nav class="bottom" aria-label="Navegação móvel">
    <RouterLink v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="item">
      <NavIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom { position: sticky; bottom: 0; z-index: 30; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 4px max(4px, var(--sa-r)) calc(4px + var(--sa-b)) max(4px, var(--sa-l)); background: var(--surface); border-top: 1px solid var(--border); }
.item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 52px; border-radius: 12px; text-decoration: none; color: var(--muted); font-size: 11px; font-weight: 650; line-height: 1.2; text-align: center; }
.item.router-link-exact-active { color: var(--accent); }
.item.router-link-exact-active :deep(.legacy-nav-icon) { box-shadow: 0 0 0 2px var(--accent); }
.item.router-link-exact-active span { font-weight: 800; }
@media (min-width: 600px) { .bottom { display: none; } }
</style>
