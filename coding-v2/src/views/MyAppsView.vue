<script setup lang="ts">
import { computed } from 'vue';
import { useFavoritesStore } from '../stores/favorites';
import { matchesQuery, usePageStateStore } from '../stores/pageState';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import { tools } from '../shared/catalog';
import EmptyState from '../components/ui/EmptyState.vue';

const page = usePageStateStore();
const favorites = useFavoritesStore();
const query = computed(() => page.myAppsQuery.trim());
/** Todos os aplicativos, sempre disponíveis; a busca e a ordem são só preferências de exibição. */
const list = computed(() => {
  const found = tools.filter((t) => matchesQuery(page.myAppsQuery, t.name, t.description));
  if (page.mySort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  if (page.mySort === 'favorites') return [...found].sort((a, b) => Number(favorites.isFavorite(b.id)) - Number(favorites.isFavorite(a.id)));
  return found;
});
</script>

<template>
  <PageHeader compact title="Meus apps" logo="/legacy-icons/my-apps.svg" lead="Todos os aplicativos, com seus favoritos e a ordem que você preferir." />
  <div class="bar">
    <PageSearch v-model="page.myAppsQuery" input-id="myapps-search" label="Buscar nos meus apps" placeholder="Buscar nos meus apps…" />
    <label class="sort"><span class="sr-only">Ordenar meus apps</span>
      <select v-model="page.mySort" data-testid="myapps-sort">
        <option value="catalog">Ordem do catálogo</option>
        <option value="name">Nome (A a Z)</option>
        <option value="favorites">Favoritos primeiro</option>
      </select>
    </label>
  </div>
  <p class="sr-only" role="status">{{ list.length }} aplicativos mostrados</p>

  <section aria-labelledby="todos" class="sec">
    <h2 id="todos" class="sr-only">Aplicativos</h2>
    <AppGrid v-if="list.length">
      <AppCard v-for="tool in list" :key="tool.id" :tool="tool" />
    </AppGrid>
    <EmptyState v-else-if="query" title="Nenhum aplicativo combina com a busca." text="Tente outro termo ou limpe o campo.">
      <button type="button" class="btn btn-primary" @click="page.myAppsQuery = ''">Limpar busca</button>
    </EmptyState>
  </section>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.sort { flex: 0 0 auto; }
.sort select { min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font-size: 15px; }
</style>
