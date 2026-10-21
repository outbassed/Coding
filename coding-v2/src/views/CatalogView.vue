<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { tools } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';

type Filter = 'all' | 'on' | 'off' | 'soon';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'on', label: 'Ativados' }, { id: 'off', label: 'Não ativados' }, { id: 'soon', label: 'Em breve' }
];
const route = useRoute();
const apps = useAppsStore();
const filter = ref<Filter>('all');
const norm = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

const visible = computed(() => {
  const q = norm(typeof route.query.q === 'string' ? route.query.q : '');
  return tools.filter((tool) => {
    if (q && !norm(tool.name + ' ' + tool.description).includes(q)) return false;
    if (filter.value === 'on') return apps.isEnabled(tool.id);
    if (filter.value === 'off') return tool.status === 'preview' && !apps.isEnabled(tool.id);
    if (filter.value === 'soon') return tool.status !== 'preview';
    return true;
  });
});
</script>

<template>
  <PageHeader eyebrow="Explorar" title="Catálogo" lead="Etiquetas e Texto já têm uma prévia própria. As outras sete continuam na versão atual até serem migradas.">
    <div class="filters" role="group" aria-label="Filtrar aplicativos">
      <button v-for="item in filters" :key="item.id" type="button" class="f" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button>
    </div>
  </PageHeader>
  <section aria-label="Resultados">
    <AppGrid v-if="visible.length">
      <AppCard v-for="tool in visible" :key="tool.id" :tool="tool" :enabled="apps.isEnabled(tool.id)" />
    </AppGrid>
    <EmptyState v-else title="Nada encontrado." text="Tente outro termo ou limpe o filtro." />
    <p class="sr-only" role="status">{{ visible.length }} aplicativos mostrados</p>
  </section>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.f { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font-weight: 650; }
.f[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
</style>
