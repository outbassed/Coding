<script setup lang="ts">
import { computed } from 'vue';
import { availabilityOf, tools } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import { matchesQuery, usePageStateStore, type CatalogState } from '../stores/pageState';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import CategoryMenu from '../components/ui/CategoryMenu.vue';

const apps = useAppsStore();
const page = usePageStateStore();
const counts = computed(() => ({
  functional: tools.filter((t) => availabilityOf(t) === 'functional').length,
  planned: tools.filter((t) => availabilityOf(t) === 'planned').length
}));
const filters = computed<{ id: CatalogState; label: string }[]>(() => [
  { id: 'all', label: 'Todos' }, { id: 'on', label: 'Ativados' }, { id: 'off', label: 'Não ativados' },
  ...(counts.value.planned > 0 ? [{ id: 'soon' as const, label: 'Em breve' }] : [])
]);
const query = computed(() => page.catalogQuery.trim());
const filtering = computed(() => query.value !== '' || page.category !== 'all' || page.state !== 'all');

/** Busca, categoria e situação se combinam (E lógico). */
const visible = computed(() => tools.filter((tool) => {
  if (page.category !== 'all' && tool.category !== page.category) return false;
  if (!matchesQuery(page.catalogQuery, tool.name, tool.description)) return false;
  if (page.state === 'on') return apps.isEnabled(tool.id);
  if (page.state === 'off') return tool.status === 'preview' && !apps.isEnabled(tool.id);
  if (page.state === 'soon') return tool.status !== 'preview';
  return true;
}));
</script>

<template>
  <PageHeader compact title="Catálogo" logo="/legacy-icons/catalog.svg" />

  <div class="bar" data-testid="catalog-toolbar">
    <PageSearch v-model="page.catalogQuery" input-id="catalog-search" label="Buscar no catálogo" placeholder="Buscar no catálogo…" />
    <CategoryMenu v-model="page.category" menu-id="catalog-categories" />
  </div>
  <div class="filters" role="group" aria-label="Filtrar por situação">
    <button v-for="item in filters" :key="item.id" type="button" class="f" :aria-pressed="page.state === item.id" @click="page.state = item.id">{{ item.label }}</button>
  </div>

  <p class="summary muted" data-testid="catalog-summary">
    <span>{{ visible.length }} {{ visible.length === 1 ? 'aplicativo' : 'aplicativos' }}<template v-if="!filtering"> · {{ counts.functional }} editores disponíveis<template v-if="counts.planned"> · {{ counts.planned }} em breve</template></template></span>
    <button v-if="filtering" type="button" class="clear" data-testid="clear-filters" @click="page.resetCatalog()">Limpar busca e filtros</button>
  </p>

  <section aria-labelledby="resultados">
    <h2 id="resultados" class="sr-only">Resultados</h2>
    <AppGrid v-if="visible.length">
      <AppCard v-for="tool in visible" :key="tool.id" :tool="tool" :enabled="apps.isEnabled(tool.id)" />
    </AppGrid>
    <EmptyState v-else title="Nada encontrado." text="Tente outro termo ou limpe o filtro.">
      <button type="button" class="btn btn-primary" @click="page.resetCatalog()">Limpar busca e filtros</button>
    </EmptyState>
    <p class="sr-only" role="status">{{ visible.length }} aplicativos mostrados</p>
  </section>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.f { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font-weight: 650; }
.f[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 10px 0 12px; font-size: 13.5px; }
.clear { min-height: 44px; padding: 0 8px; background: none; border: 0; color: var(--accent); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
</style>
