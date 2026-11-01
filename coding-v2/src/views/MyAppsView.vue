<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useOfflineStore } from '../stores/offline';
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
const offline = useOfflineStore();
onMounted(() => { void offline.init(); });
const query = computed(() => page.myAppsQuery.trim());
/** Sem suporte a uso offline (endereço, modo privado…) ninguém consegue instalar nada: aí aparecem todos, com um aviso. */
const everything = computed(() => !offline.supported);
/** Evita mostrar “nenhum instalado” enquanto o registro ainda está sendo lido. */
const reading = computed(() => offline.supported && !offline.ready);
/** Só os aplicativos instalados para uso offline neste navegador; a busca e a ordem são só preferências de exibição. */
const mine = computed(() => (everything.value ? tools : tools.filter((t) => offline.installedApps.includes(t.id))));
const list = computed(() => {
  const found = mine.value.filter((t) => matchesQuery(page.myAppsQuery, t.name, t.description));
  if (page.mySort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  if (page.mySort === 'favorites') return [...found].sort((a, b) => Number(favorites.isFavorite(b.id)) - Number(favorites.isFavorite(a.id)));
  return found;
});
</script>

<template>
  <PageHeader compact title="Meus apps" logo="/legacy-icons/my-apps.svg" lead="Os aplicativos instalados para uso offline neste navegador, com seus favoritos e a ordem que você preferir." />
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
  <p v-if="!everything && !reading && mine.length" class="status" data-testid="myapps-status"><strong>{{ mine.length }}</strong> de {{ tools.length }} aplicativos instalados offline<template v-if="offline.anyUpdate"> · <span class="upd">há atualizações disponíveis</span></template></p>
  <p v-if="everything" class="muted note" data-testid="myapps-offline-unsupported">O uso offline não está disponível neste endereço ou navegador, então todos os aplicativos aparecem aqui.</p>
  <p class="sr-only" role="status">{{ reading ? 'Carregando os aplicativos instalados' : list.length + ' aplicativos mostrados' }}</p>

  <section aria-labelledby="todos" class="sec">
    <h2 id="todos" class="sr-only">Aplicativos</h2>
    <AppGrid v-if="list.length">
      <AppCard v-for="tool in list" :key="tool.id" :tool="tool" />
    </AppGrid>
    <EmptyState v-else-if="reading" title="Carregando…" />
    <EmptyState v-else-if="query && mine.length" title="Nenhum aplicativo combina com a busca." text="Tente outro termo ou limpe o campo.">
      <button type="button" class="btn btn-primary" @click="page.myAppsQuery = ''">Limpar busca</button>
    </EmptyState>
    <EmptyState v-else title="Nenhum aplicativo instalado ainda." text="Instale um aplicativo no Catálogo para usá-lo offline e vê-lo aqui. Seus documentos não mudam.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary" data-testid="myapps-empty-catalog">Abrir o Catálogo</RouterLink>
    </EmptyState>
  </section>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.sort { flex: 0 0 auto; }
.status { margin: 0 0 12px; font-size: 14px; color: var(--muted); }
.status strong { color: var(--text); font-size: 18px; }
.upd { color: var(--accent); font-weight: 700; }
.note { margin: 0 0 12px; font-size: 13.5px; }
.sort select { min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font-size: 15px; }
</style>
