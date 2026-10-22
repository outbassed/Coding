<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import { tools, isPreviewTool } from '../shared/catalog';
import EmptyState from '../components/ui/EmptyState.vue';

const apps = useAppsStore();
const available = computed(() => tools.filter((t) => isPreviewTool(t) && !apps.isEnabled(t.id)));
</script>

<template>
  <PageHeader eyebrow="Sua área" title="Meus apps" logo="/legacy-icons/my-apps.svg" lead="Desativar remove só o atalho aqui no Launcher. Seus documentos nunca são apagados." />
  <section aria-labelledby="ativados">
    <h2 id="ativados" class="sr-only">Aplicativos ativados</h2>
    <AppGrid v-if="apps.activeTools.length">
      <AppCard v-for="tool in apps.activeTools" :key="tool.id" :tool="tool" :enabled="true" />
    </AppGrid>
    <EmptyState v-else title="Esta área está vazia." text="Ative uma ferramenta do catálogo para ela aparecer aqui.">
      <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Escolher aplicativo</RouterLink>
    </EmptyState>
  </section>
  <section v-if="available.length" aria-labelledby="disp" class="avail" data-testid="available-to-activate">
    <h2 id="disp">Disponíveis para ativar</h2>
    <p class="muted">Ativar só põe o atalho aqui no Launcher; não instala nada no aparelho.</p>
    <ul class="alist">
      <li v-for="tool in available" :key="tool.id" class="arow">
        <AppIcon :id="tool.id" size="md" />
        <span class="an"><strong>{{ tool.name }}</strong><small class="muted">{{ tool.description }}</small></span>
        <ActivateButton :tool="tool" :enabled="false" />
      </li>
    </ul>
  </section>
  <p v-if="apps.activeTools.length" class="after"><RouterLink :to="{ name: 'catalog' }" class="btn btn-ghost">Adicionar aplicativos</RouterLink></p>
</template>

<style scoped>
.after { margin-top: 22px; }
.avail { margin-top: 32px; }
.avail h2 { font-size: 20px; margin-bottom: 4px; }
.alist { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.arow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
.an { flex: 1; min-width: 0; display: grid; }
.arow .btn { min-height: 44px; flex: none; }
</style>
