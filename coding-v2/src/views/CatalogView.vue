<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { availabilityOf, categories, getTool, tools, type CategoryId } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';

type Filter = 'all' | 'on' | 'off' | 'soon';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'on', label: 'Ativados' }, { id: 'off', label: 'Não ativados' }, { id: 'soon', label: 'Em breve' }
];
const route = useRoute();
const router = useRouter();
const apps = useAppsStore();
const filter = ref<Filter>('all');
const category = ref<CategoryId | 'all'>('all');
const query = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''));
const featured = getTool('labels');
const showSpotlight = computed(() => filter.value === 'all' && category.value === 'all' && !query.value);
const clearAll = (): void => { filter.value = 'all'; category.value = 'all'; void router.replace({ name: 'catalog', query: {} }); };
const counts = computed(() => ({
  functional: tools.filter((t) => availabilityOf(t) === 'functional').length,
  preview: tools.filter((t) => availabilityOf(t) === 'preview').length,
  planned: tools.filter((t) => availabilityOf(t) === 'planned').length
}));
const norm = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

const visible = computed(() => {
  const q = norm(typeof route.query.q === 'string' ? route.query.q : '');
  return tools.filter((tool) => {
    if (category.value !== 'all' && tool.category !== category.value) return false;
    if (q && !norm(tool.name + ' ' + tool.description).includes(q)) return false;
    if (filter.value === 'on') return apps.isEnabled(tool.id);
    if (filter.value === 'off') return tool.status === 'preview' && !apps.isEnabled(tool.id);
    if (filter.value === 'soon') return tool.status !== 'preview';
    return true;
  });
});
</script>

<template>
  <PageHeader eyebrow="Explorar" title="Catálogo" logo="/legacy-icons/catalog.svg" lead="Explore as ferramentas.">
    <div class="filters" role="group" aria-label="Filtrar aplicativos">
      <button v-for="item in filters.filter((f) => f.id !== 'soon' || counts.planned > 0)" :key="item.id" type="button" class="f" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button>
    </div>
    <div class="cats" role="group" aria-label="Categorias">
      <button type="button" class="cat" :aria-pressed="category === 'all'" @click="category = 'all'">Todas as categorias</button>
      <button v-for="c in categories" :key="c.id" type="button" class="cat" :aria-pressed="category === c.id" @click="category = c.id">{{ c.label }}</button>
    </div>
  </PageHeader>

  <section v-if="showSpotlight" class="spot" aria-labelledby="spot-h" :style="{ '--app': featured.color }" data-testid="spotlight">
    <AppIcon :id="featured.id" size="xl" />
    <div class="spot-txt">
      <p class="tag">Destaque · editor funcional</p>
      <h2 id="spot-h">{{ featured.name }}</h2>
      <p class="muted">Crie suas etiquetas A4 e imprima em PDF.</p>
      <div class="spot-actions">
        <RouterLink :to="{ name: 'app', params: { id: featured.id } }" class="btn btn-primary">Ver detalhes</RouterLink>
        <ActivateButton :tool="featured" :enabled="apps.isEnabled(featured.id)" />
      </div>
    </div>
  </section>

  <p class="summary muted" data-testid="catalog-summary">{{ counts.functional }} editores disponíveis<template v-if="counts.planned"> · {{ counts.planned }} em breve</template></p>
  <p v-if="query || filter !== 'all' || category !== 'all'" class="active-filters">
    <span v-if="query">Busca: <strong>“{{ query }}”</strong></span>
    <button type="button" class="clear" data-testid="clear-filters" @click="clearAll">Limpar busca e filtros</button>
  </p>

  <section aria-labelledby="resultados">
    <h2 id="resultados" class="sr-only">Resultados</h2>
    <AppGrid v-if="visible.length">
      <AppCard v-for="tool in visible" :key="tool.id" :tool="tool" :enabled="apps.isEnabled(tool.id)" />
    </AppGrid>
    <EmptyState v-else title="Nada encontrado." text="Tente outro termo ou limpe o filtro.">
      <button type="button" class="btn btn-primary" @click="clearAll">Limpar busca e filtros</button>
    </EmptyState>
    <p class="sr-only" role="status">{{ visible.length }} aplicativos mostrados</p>
  </section>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.cats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cat { min-height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-weight: 650; }
.cat[aria-pressed="true"] { border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text); background: var(--surface); }
.spot { display: flex; align-items: center; gap: 24px; margin-bottom: 20px; padding: 24px; border-radius: 24px; border: 1px solid var(--border); background: linear-gradient(135deg, color-mix(in srgb, var(--app) 22%, var(--surface)), var(--surface) 70%); }
.spot h2 { font-size: clamp(24px, 3vw, 30px); margin: 0 0 8px; }
.tag { margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ok); }
.ready { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 2px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); column-gap: 24px; font-size: 14px; }
.spot-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.spot-txt { min-width: 0; flex: 1; }
.summary { margin: 0 0 12px; font-size: 13.5px; }
.active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 14px; }
.clear { min-height: 44px; padding: 0 8px; background: none; border: 0; color: var(--accent); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 599px) { .spot { flex-direction: column; align-items: flex-start; padding: 18px; gap: 14px; } .spot-actions .btn { flex: 1 1 100%; } }
.f { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font-weight: 650; }
.f[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
</style>
