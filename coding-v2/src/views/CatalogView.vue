<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { categories, tools } from '../shared/catalog';
import { useOfflineStore } from '../stores/offline';
import { matchesQuery, usePageStateStore } from '../stores/pageState';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import CategoryMenu from '../components/ui/CategoryMenu.vue';

const page = usePageStateStore();
const offline = useOfflineStore();
onMounted(() => { void offline.init(); });
const offlineFilters = [{ id: 'any' as const, label: 'Qualquer acesso' }, { id: 'yes' as const, label: 'Instalados offline' }, { id: 'no' as const, label: 'Não instalados offline' }];
const showOffline = computed(() => offline.supported && (offline.loaded || page.offline !== 'any'));
const query = computed(() => page.catalogQuery.trim());
const filtering = computed(() => query.value !== '' || page.category !== 'all' || page.offline !== 'any');

/** Busca, categoria e uso offline se combinam (E lógico). */
const visible = computed(() => tools.filter((tool) => {
  if (page.category !== 'all' && tool.category !== page.category) return false;
  if (!matchesQuery(page.catalogQuery, tool.name, tool.description)) return false;
  if (page.offline === 'yes' && offline.stateOf(tool.id) === 'not-installed') return false;
  if (page.offline === 'no' && offline.stateOf(tool.id) !== 'not-installed') return false;
  return true;
}));
/** Sem busca nem filtro o Catálogo é uma vitrine: um bloco por categoria, na ordem do catálogo. */
const shelves = computed(() => categories.map((c) => ({ ...c, items: visible.value.filter((t) => t.category === c.id) })).filter((c) => c.items.length));
</script>

<template>
  <PageHeader compact title="Catálogo" logo="/legacy-icons/catalog.svg" />

  <div class="bar" data-testid="catalog-toolbar">
    <PageSearch v-model="page.catalogQuery" input-id="catalog-search" label="Buscar no catálogo" placeholder="Buscar no catálogo…" />
    <CategoryMenu v-model="page.category" menu-id="catalog-categories" />
  </div>
  <div v-if="showOffline" class="filters" role="group" aria-label="Filtrar por uso offline" data-testid="offline-filters">
    <button v-for="item in offlineFilters" :key="item.id" type="button" class="f" :aria-pressed="page.offline === item.id" :data-testid="'offline-filter-' + item.id" @click="page.offline = item.id">{{ item.label }}</button>
  </div>

  <p class="summary muted" data-testid="catalog-summary">
    <span>{{ visible.length }} {{ visible.length === 1 ? 'aplicativo' : 'aplicativos' }}<template v-if="!filtering"> · todos disponíveis online</template></span>
    <button v-if="filtering" type="button" class="clear" data-testid="clear-filters" @click="page.resetCatalog()">Limpar busca e filtros</button>
  </p>

  <section aria-label="Aplicativos do Catálogo">
    <h2 v-if="filtering" id="resultados" class="sr-only">Resultados</h2>
    <div v-if="visible.length && !filtering" class="shelves" data-testid="catalog-shelves">
      <section v-for="shelf in shelves" :key="shelf.id" class="shelf" :aria-labelledby="'cat-' + shelf.id" :data-category="shelf.id">
        <h2 :id="'cat-' + shelf.id" class="shelf-title">{{ shelf.label }}<span class="n muted">{{ shelf.items.length }}</span></h2>
        <AppGrid>
          <AppCard v-for="tool in shelf.items" :key="tool.id" :tool="tool" />
        </AppGrid>
      </section>
    </div>
    <AppGrid v-else-if="visible.length">
      <AppCard v-for="tool in visible" :key="tool.id" :tool="tool" />
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
.shelves { display: grid; gap: 26px; }
.shelf-title { display: flex; align-items: baseline; gap: 8px; margin: 0 0 10px; font-size: 17px; letter-spacing: -.01em; }
.shelf-title .n { font-size: 12.5px; font-weight: 650; }
.clear { min-height: 44px; padding: 0 8px; background: none; border: 0; color: var(--accent); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
</style>
