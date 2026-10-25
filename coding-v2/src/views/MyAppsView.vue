<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppsStore } from '../stores/apps';
import { matchesQuery, usePageStateStore } from '../stores/pageState';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import { tools, isPreviewTool } from '../shared/catalog';
import EmptyState from '../components/ui/EmptyState.vue';

const apps = useAppsStore();
const page = usePageStateStore();
const query = computed(() => page.myAppsQuery.trim());
const active = computed(() => apps.activeTools.filter((t) => matchesQuery(page.myAppsQuery, t.name, t.description)));
const available = computed(() => tools.filter((t) => isPreviewTool(t) && !apps.isEnabled(t.id) && matchesQuery(page.myAppsQuery, t.name, t.description)));
</script>

<template>
  <PageHeader compact title="Meus apps" logo="/legacy-icons/my-apps.svg" lead="Seus aplicativos ativados." />
  <div class="bar"><PageSearch v-model="page.myAppsQuery" input-id="myapps-search" label="Buscar nos meus apps" placeholder="Buscar nos meus apps…" /></div>
  <p class="sr-only" role="status">{{ active.length }} aplicativos ativados e {{ available.length }} disponíveis para ativar</p>

  <section aria-labelledby="ativados" class="sec">
    <h2 id="ativados" class="sr-only">Aplicativos ativados</h2>
    <AppGrid v-if="active.length">
      <AppCard v-for="tool in active" :key="tool.id" :tool="tool" :enabled="true" />
    </AppGrid>
    <EmptyState v-else-if="query && apps.activeTools.length" title="Nenhum dos seus apps combina com a busca." text="Tente outro termo ou limpe o campo.">
      <button type="button" class="btn btn-primary" @click="page.myAppsQuery = ''">Limpar busca</button>
    </EmptyState>
    <EmptyState v-else-if="!apps.activeTools.length" title="Esta área está vazia." text="Ative uma ferramenta do catálogo para ela aparecer aqui.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Escolher aplicativo</RouterLink>
    </EmptyState>
  </section>
  <section v-if="available.length" aria-labelledby="disp" class="avail" data-testid="available-to-activate">
    <h2 id="disp">Disponíveis para ativar</h2>
    <p class="muted">Ativar não instala nada no aparelho.</p>
    <ul class="alist">
      <li v-for="tool in available" :key="tool.id" class="arow">
        <AppIcon :id="tool.id" size="md" />
        <span class="an"><strong>{{ tool.name }}</strong><small class="muted">{{ tool.description }}</small></span>
        <ActivateButton :tool="tool" :enabled="false" />
      </li>
    </ul>
  </section>
  <p v-if="apps.activeTools.length && !query" class="after"><RouterLink :to="{ name: 'catalog' }" class="btn btn-ghost">Adicionar aplicativos</RouterLink></p>
</template>

<style scoped>
.bar { display: flex; margin-bottom: 14px; }
.after { margin-top: 22px; }
.avail { margin-top: 32px; }
.avail h2 { font-size: 20px; margin-bottom: 4px; }
.alist { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.arow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
.an { flex: 1; min-width: 0; display: grid; }
.arow .btn { min-height: 44px; flex: none; }
</style>
