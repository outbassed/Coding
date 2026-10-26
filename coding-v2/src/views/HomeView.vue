<script setup lang="ts">
import { computed, ref } from 'vue';
import { tools } from '../shared/catalog';
import { useFavoritesStore } from '../stores/favorites';
import { matchesQuery } from '../stores/pageState';
import PageHeader from '../components/ui/PageHeader.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';

/** Início: acesso rápido. Identidade, busca de aplicativos, os aplicativos e os documentos recentes, nessa ordem. */
const favorites = useFavoritesStore();
const query = ref('');
/** Favoritos primeiro; dentro de cada grupo vale a ordem do catálogo. */
const list = computed(() => {
  const found = tools.filter((t) => matchesQuery(query.value, t.name, t.description));
  return [...found].sort((a, b) => Number(favorites.isFavorite(b.id)) - Number(favorites.isFavorite(a.id)));
});
</script>

<template>
  <PageHeader compact title="Coding Launcher" logo="/legacy-icons/coding.svg" lead="Abra um aplicativo ou continue de onde parou." />

  <div class="bar">
    <PageSearch v-model="query" input-id="home-search" label="Buscar aplicativos" placeholder="Buscar aplicativos…" />
  </div>

  <section aria-labelledby="aplicativos" class="apps" data-testid="home-apps">
    <h2 id="aplicativos" class="sr-only">Aplicativos</h2>
    <AppGrid v-if="list.length">
      <AppCard v-for="tool in list" :key="tool.id" :tool="tool" />
    </AppGrid>
    <EmptyState v-else title="Nenhum aplicativo combina com a busca." text="Tente outro termo ou limpe o campo.">
      <button type="button" class="btn btn-primary" @click="query = ''">Limpar busca</button>
    </EmptyState>
    <p class="sr-only" role="status">{{ list.length }} aplicativos mostrados</p>
  </section>

  <RecentDocs compact />
</template>

<style scoped>
.bar { display: flex; margin-bottom: 16px; }
.apps { margin-top: 4px; }
</style>
