<script setup lang="ts">
import { RouterLink } from 'vue-router';
import NavIcon from '../ui/NavIcon.vue';
import { navItems } from './nav';
import { LEGACY_URL } from '../../shared/links';
</script>

<template>
  <aside class="side" aria-label="Navegação principal">
    <nav>
      <RouterLink v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="item" :title="item.label">
        <NavIcon :name="item.icon" />
        <span class="label">{{ item.label }}</span>
      </RouterLink>
    </nav>
    <a :href="LEGACY_URL" class="item legacy" title="Abrir o Coding atual">
      <NavIcon name="external" />
      <span class="label">Coding atual</span>
    </a>
  </aside>
</template>

<style scoped>
.side { display: none; position: sticky; top: calc(64px + var(--sa-t)); height: calc(100dvh - 64px - var(--sa-t)); flex: 0 0 auto; flex-direction: column; justify-content: space-between; gap: 12px; padding: 16px 10px 16px max(10px, var(--sa-l)); background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; }
nav { display: grid; gap: 4px; }
.item { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: 12px; color: var(--muted); text-decoration: none; font-weight: 650; }
.item:hover { color: var(--text); background: var(--panel); }
.item.router-link-exact-active { color: var(--text); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); box-shadow: inset 3px 0 var(--accent); }
.label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (min-width: 600px) { .side { display: flex; width: 76px; } }
@media (min-width: 900px) {
  .side { width: 240px; }
  .item { justify-content: flex-start; }
  .label { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
}
</style>
