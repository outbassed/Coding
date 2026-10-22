<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavIcon from '../ui/NavIcon.vue';

const route = useRoute();
const router = useRouter();
const q = ref(typeof route.query.q === 'string' ? route.query.q : '');

watch(() => route.query.q, (value) => { q.value = typeof value === 'string' ? value : ''; });

function search(): void {
  const query = q.value.trim() ? { q: q.value.trim() } : {};
  if (route.name === 'catalog') void router.replace({ name: 'catalog', query });
  else if (q.value.trim()) void router.push({ name: 'catalog', query });
}
</script>

<template>
  <header class="top">
    <RouterLink :to="{ name: 'home' }" class="brand" aria-label="Coding Launcher 2.0, ir para o início">
      <img class="mark" src="/legacy-icons/coding.svg" alt="" width="34" height="34" aria-hidden="true" draggable="false" />
      <span class="name"><strong>Coding</strong> Launcher <sup>2.0</sup></span>
    </RouterLink>
    <form class="search" role="search" @submit.prevent="search">
      <NavIcon name="search" class="s-ico" />
      <input v-model="q" type="search" name="q" aria-label="Buscar aplicativos" placeholder="Buscar aplicativos…" autocomplete="off" @input="search" />
    </form>
    <span class="beta">Prévia técnica</span>
  </header>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 16px; min-height: calc(64px + var(--sa-t)); padding: var(--sa-t) max(24px, var(--sa-r)) 0 max(24px, var(--sa-l)); background: var(--surface); border-bottom: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; white-space: nowrap; font-size: 17px; letter-spacing: -.02em; min-height: 44px; }
.mark { display: block; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 8px; object-fit: cover; }
.name sup { color: var(--muted); font-size: 11px; }
.search { display: flex; align-items: center; gap: 8px; flex: 0 1 420px; margin-inline: auto; height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--muted); }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.search input { flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; outline: none; color: var(--text); font-size: 15px; }
.beta { border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
@media (max-width: 599px) {
  .top { gap: 10px; padding-inline: max(12px, var(--sa-l)) max(12px, var(--sa-r)); min-height: calc(56px + var(--sa-t)); }
  .name, .beta { display: none; }
  .search { flex: 1; margin-inline: 0; }
}
</style>
