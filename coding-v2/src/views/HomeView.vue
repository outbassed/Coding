<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { tools, getTool, availabilityOf, availabilityLabel } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import PageHeader from '../components/ui/PageHeader.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import ActivateButton from '../components/ui/ActivateButton.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';

const apps = useAppsStore();
const featured = getTool('labels');
const textTool = getTool('texts');
const textOn = computed(() => apps.isEnabled(textTool.id));
const featuredOn = computed(() => apps.isEnabled(featured.id));
const counts = computed(() => ({
  functional: tools.filter((t) => availabilityOf(t) === 'functional').length,
  preview: tools.filter((t) => availabilityOf(t) === 'preview').length,
  planned: tools.filter((t) => availabilityOf(t) === 'planned').length
}));
</script>

<template>
  <PageHeader eyebrow="Coding 2.0 · Prévia" title="Seu espaço de criação." lead="Seus aplicativos em um só lugar." />

  <section class="hero" aria-labelledby="destaque" :style="{ '--app': featured.color }" data-testid="featured">
    <AppIcon :id="featured.id" size="xl" />
    <div class="hero-txt">
      <p class="tag">{{ availabilityLabel[availabilityOf(featured)] }} · já disponível</p>
      <h2 id="destaque">{{ featured.name }}</h2>
      <p class="muted">Crie, organize e imprima etiquetas A4.</p>
      <div class="hero-actions">
        <a v-if="featuredOn && featured.path" :href="featured.path" class="btn btn-app" aria-label="Abrir o editor de Etiquetas">Abrir Etiquetas</a>
        <ActivateButton v-else :tool="featured" :enabled="featuredOn" />
        <RouterLink :to="{ name: 'app', params: { id: featured.id } }" class="btn btn-ghost">Ver detalhes</RouterLink>
      </div>
    </div>
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

  <section class="store" aria-labelledby="textos">
    <AppIcon id="texts" size="lg" />
    <div>
      <h2 id="textos">Escreva e formate no Texto</h2>
      <p class="muted">Documentos A4 com formatação e salvamento automático.</p>
    </div>
    <a v-if="textOn && textTool.path" class="btn btn-primary" :href="textTool.path">Abrir Texto</a>
    <ActivateButton v-else :tool="textTool" :enabled="textOn" />
  </section>

  <RecentDocs />

  <section class="store" aria-labelledby="loja">
    <div>
      <h2 id="loja">Explorar o catálogo</h2>
      <p class="muted">{{ counts.functional }} editores disponíveis<template v-if="counts.planned"> · {{ counts.planned }} em breve</template>.</p>
    </div>
    <RouterLink :to="{ name: 'catalog' }" class="btn btn-primary">Abrir catálogo</RouterLink>
  </section>

</template>

<style scoped>
section { margin-top: 36px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
h2 { font-size: 20px; margin: 0; }
.more { color: var(--accent); font-weight: 700; text-decoration: none; padding: 10px 4px; }
.more:hover { text-decoration: underline; }
.hero { display: flex; align-items: center; gap: 24px; padding: 24px; border-radius: 24px; border: 1px solid var(--border); background: linear-gradient(135deg, color-mix(in srgb, var(--app) 22%, var(--surface)), var(--surface) 70%); }
.hero-txt { min-width: 0; }
.hero h2 { font-size: clamp(24px, 3vw, 32px); margin: 0 0 6px; }
.hero p { max-width: 60ch; }
.tag { margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ok); }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.store { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); }
.store h2 { margin-bottom: 4px; }
.store p { margin: 0; max-width: 60ch; }
.soon { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.chip { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px 10px 10px; border: 1px solid var(--border); background: var(--surface); border-radius: 14px; text-decoration: none; font-weight: 650; }
.chip:hover { background: var(--panel); }
.ct { display: grid; min-width: 0; }
.ct small { font-size: 12.5px; }
@media (max-width: 599px) {
  .hero { flex-direction: column; align-items: flex-start; gap: 14px; padding: 18px; }
  .hero-actions .btn { flex: 1 1 100%; }
  .store { flex-direction: column; align-items: stretch; }
}
</style>
