<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { tools, availabilityOf } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import { useFavoritesStore } from '../stores/favorites';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';
import HomeStats from '../components/ui/HomeStats.vue';

const apps = useAppsStore();
const favorites = useFavoritesStore();
const favoriteTools = computed(() => tools.filter((t) => favorites.isFavorite(t.id)));
const counts = computed(() => ({
  functional: tools.filter((t) => availabilityOf(t) === 'functional').length,
  planned: tools.filter((t) => availabilityOf(t) === 'planned').length
}));
</script>

<template>
  <PageHeader compact title="Seu espaço de criação." lead="Aplicativos, documentos e atalhos em um só lugar.">
    <div class="actions" data-testid="home-actions">
      <RouterLink :to="{ name: 'my-apps' }" class="btn btn-primary">Meus apps</RouterLink>
      <RouterLink :to="{ name: 'catalog' }" class="btn">Catálogo</RouterLink>
      <RouterLink :to="{ name: 'docs' }" class="btn">Documentos</RouterLink>
    </div>
  </PageHeader>

  <HomeStats />

  <RecentDocs />

  <section v-if="favoriteTools.length" aria-labelledby="favoritos" data-testid="favorites">
    <div class="head"><h2 id="favoritos">Favoritos</h2></div>
    <AppGrid>
      <AppCard v-for="tool in favoriteTools" :key="tool.id" :tool="tool" :enabled="apps.isEnabled(tool.id)" />
    </AppGrid>
  </section>

  <section aria-labelledby="meus">
    <div class="head"><h2 id="meus">Meus aplicativos</h2><RouterLink :to="{ name: 'my-apps' }" class="more">Gerenciar</RouterLink></div>
    <AppGrid v-if="apps.activeTools.length">
      <AppCard v-for="tool in apps.activeTools" :key="tool.id" :tool="tool" :enabled="true" />
    </AppGrid>
    <EmptyState v-else title="Nenhum app ativado ainda." text="Escolha uma ferramenta no catálogo para ela aparecer aqui.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Abrir catálogo</RouterLink>
    </EmptyState>
  </section>

  <section class="store" aria-labelledby="loja">
    <div>
      <h2 id="loja">Explorar o catálogo</h2>
      <p class="muted">{{ counts.functional }} editores disponíveis<template v-if="counts.planned"> · {{ counts.planned }} em breve</template>.</p>
    </div>
    <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Abrir catálogo</RouterLink>
  </section>

  <p class="tip muted">Dica: ativar um app só o coloca em Meus apps; ele ainda é aberto pela internet. Seus documentos ficam salvos neste navegador.</p>
</template>

<style scoped>
section { margin-top: 30px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
h2 { font-size: 20px; margin: 0; }
.more { color: var(--accent); font-weight: 700; text-decoration: none; padding: 10px 4px; }
.more:hover { text-decoration: underline; }
.store { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); }
.store h2 { margin-bottom: 4px; }
.store p { margin: 0; max-width: 60ch; }
.tip { margin: 22px 0 0; font-size: 13px; max-width: 70ch; }
@media (max-width: 599px) {
  .actions .btn { flex: 1 1 30%; }
  .store { flex-direction: column; align-items: stretch; }
}
</style>
