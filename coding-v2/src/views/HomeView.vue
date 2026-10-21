<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { tools, isPreviewTool } from '../shared/catalog';
import { LEGACY_URL } from '../shared/links';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import EmptyState from '../components/ui/EmptyState.vue';

const apps = useAppsStore();
const upcoming = tools.filter((tool) => !isPreviewTool(tool));
</script>

<template>
  <PageHeader eyebrow="Coding Launcher 2.0 · Prévia" title="Seu espaço de criação." lead="Uma central com todas as ferramentas, cada uma no seu cantinho. Aqui você escolhe quais ficam à mão.">
    <p class="notice">
      <strong>Versão experimental.</strong> Seus documentos e os editores completos continuam no
      <a :href="LEGACY_URL">Coding atual</a>. Esta prévia não lê nem altera nada do que você já salvou.
    </p>
  </PageHeader>

  <section aria-labelledby="meus">
    <div class="head"><h2 id="meus">Meus aplicativos</h2><RouterLink :to="{ name: 'my-apps' }" class="more">Gerenciar</RouterLink></div>
    <AppGrid v-if="apps.activeTools.length">
      <AppCard v-for="tool in apps.activeTools" :key="tool.id" :tool="tool" :enabled="true" />
    </AppGrid>
    <EmptyState v-else title="Nenhum app ativado ainda." text="Escolha uma ferramenta no catálogo para ela aparecer aqui.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Abrir catálogo</RouterLink>
    </EmptyState>
  </section>

  <section aria-labelledby="breve">
    <div class="head"><h2 id="breve">Em breve na versão 2.0</h2><RouterLink :to="{ name: 'catalog' }" class="more">Ver catálogo</RouterLink></div>
    <ul class="soon">
      <li v-for="tool in upcoming" :key="tool.id">
        <RouterLink :to="{ name: 'app', params: { id: tool.id } }" class="chip"><AppIcon :id="tool.id" size="sm" />{{ tool.name }}</RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.notice { margin: 0; padding: 14px 16px; border: 1px solid var(--border); border-left: 4px solid var(--accent); background: var(--surface); border-radius: 12px; color: var(--muted); max-width: 70ch; }
.notice strong { color: var(--text); }
.notice a { color: var(--accent); font-weight: 700; }
section { margin-top: 36px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
h2 { font-size: 20px; margin: 0; }
.more { color: var(--accent); font-weight: 700; text-decoration: none; padding: 10px 4px; }
.more:hover { text-decoration: underline; }
.soon { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.chip { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 14px 6px 8px; border: 1px solid var(--border); background: var(--surface); border-radius: 14px; text-decoration: none; font-weight: 650; }
.chip:hover { background: var(--panel); }
</style>
