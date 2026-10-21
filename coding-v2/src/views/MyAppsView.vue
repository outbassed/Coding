<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import EmptyState from '../components/ui/EmptyState.vue';

const apps = useAppsStore();
</script>

<template>
  <PageHeader eyebrow="Sua área" title="Meus apps" lead="Desativar remove só o atalho aqui no Launcher. Seus documentos nunca são apagados." />
  <section aria-label="Aplicativos ativados">
    <AppGrid v-if="apps.activeTools.length">
      <AppCard v-for="tool in apps.activeTools" :key="tool.id" :tool="tool" :enabled="true" />
    </AppGrid>
    <EmptyState v-else title="Esta área está vazia." text="Ative uma ferramenta do catálogo para ela aparecer aqui.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Escolher aplicativo</RouterLink>
    </EmptyState>
  </section>
  <p v-if="apps.activeTools.length" class="after"><RouterLink :to="{ name: 'catalog' }" class="btn btn-ghost">Adicionar aplicativos</RouterLink></p>
</template>

<style scoped>
.after { margin-top: 22px; }
</style>
