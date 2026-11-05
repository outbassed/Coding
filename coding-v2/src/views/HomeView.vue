<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { tools, type CodingTool } from '../shared/catalog';
import { useFavoritesStore } from '../stores/favorites';
import { useOfflineStore } from '../stores/offline';
import { matchesQuery } from '../stores/pageState';
import { VERSIONS_BASE, formatRelease, historyPath, latestOf, newestFirst, targetName } from '../shared/versions';
import { versionRecords } from '../shared/versions-data';
import PageHeader from '../components/ui/PageHeader.vue';
import PageSearch from '../components/ui/PageSearch.vue';
import AppGrid from '../components/ui/AppGrid.vue';
import AppCard from '../components/ui/AppCard.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import RecentDocs from '../components/ui/RecentDocs.vue';

/**
 * Início: um resumo do Coding. Continuar de onde parou, favoritos, o que há neste aparelho (offline),
 * novidades da Central de Versões e sugestões do Catálogo. A lista completa de aplicativos fica no Catálogo
 * e os instalados em Meus apps; aqui a busca só mostra os resultados quando alguém digita.
 */
const favorites = useFavoritesStore();
const offline = useOfflineStore();
onMounted(() => { void offline.init(); });
const query = ref('');
const searching = computed(() => query.value.trim() !== '');
const found = computed(() => tools.filter((t) => matchesQuery(query.value, t.name, t.description)));

const favoriteTools = computed<CodingTool[]>(() => favorites.ids.map((id) => tools.find((t) => t.id === id)).filter((t): t is CodingTool => !!t));
const installedCount = computed(() => offline.installedApps.length);

/** Sugestões: três aplicativos que a pessoa ainda não favoritou nem instalou, trocando uma vez por dia (sem aleatoriedade, para os testes). */
const suggestions = computed<CodingTool[]>(() => {
  const pool = tools.filter((t) => t.path && !favorites.isFavorite(t.id) && !offline.installedApps.includes(t.id));
  const base = pool.length >= 3 ? pool : tools.filter((t) => t.path);
  const day = Math.floor(Date.now() / 86_400_000);
  return [0, 1, 2].map((i) => base[(day + i) % base.length]).filter((t, i, all) => all.indexOf(t) === i);
});

/** As três últimas versões registradas (Launcher ou aplicativos), da mais nova para a mais antiga. */
const news = computed(() => [...versionRecords].sort(newestFirst).slice(0, 3).map((r) => ({
  key: r.target + r.version,
  name: targetName(r.target),
  version: r.version,
  when: formatRelease(r),
  note: r.novidades?.[0] ?? r.melhorias?.[0] ?? r.correcoes?.[0] ?? r.alteracoesTecnicas?.[0] ?? '',
  href: historyPath(r.target)
})));
const launcherVersion = computed(() => latestOf('launcher', versionRecords)?.version ?? '');
</script>

<template>
  <PageHeader compact title="Coding Launcher" logo="/brand/icon.svg" lead="Seu resumo do Coding: continue de onde parou ou abra um aplicativo." />

  <div class="bar">
    <PageSearch v-model="query" input-id="home-search" label="Buscar aplicativos" placeholder="Buscar aplicativos…" />
  </div>

  <section v-if="searching" aria-labelledby="aplicativos" class="apps" data-testid="home-apps">
    <h2 id="aplicativos" class="sr-only">Resultados da busca</h2>
    <AppGrid v-if="found.length">
      <AppCard v-for="tool in found" :key="tool.id" :tool="tool" />
    </AppGrid>
    <EmptyState v-else title="Nenhum aplicativo combina com a busca." text="Tente outro termo ou limpe o campo.">
      <button type="button" class="btn btn-primary" @click="query = ''">Limpar busca</button>
    </EmptyState>
    <p class="sr-only" role="status">{{ found.length }} aplicativos mostrados</p>
  </section>

  <template v-else>
    <RecentDocs compact />

    <div class="panels" data-testid="home-panels">
      <section class="panel favs" aria-labelledby="favoritos" data-testid="home-favorites">
        <header><h2 id="favoritos">Favoritos</h2><RouterLink :to="{ name: 'catalog' }" class="more">Escolher no Catálogo</RouterLink></header>
        <ul v-if="favoriteTools.length" class="chips">
          <li v-for="tool in favoriteTools" :key="tool.id">
            <a v-if="tool.path" :href="tool.path" class="chip" :style="{ '--app': tool.color }" :aria-label="'Abrir o editor de ' + tool.name"><AppIcon :id="tool.id" size="sm" /><span>{{ tool.name }}</span></a>
          </li>
        </ul>
        <p v-else class="muted empty">Toque na estrela de um aplicativo para deixá-lo aqui, a um toque de distância.</p>
      </section>

      <section class="panel device" aria-labelledby="neste-aparelho" data-testid="home-device">
        <header><h2 id="neste-aparelho">Neste aparelho</h2><RouterLink :to="{ name: 'my-apps' }" class="more">Ver meus apps</RouterLink></header>
        <p v-if="offline.supported" class="big"><strong>{{ installedCount }}</strong> <span>de {{ tools.length }} aplicativos instalados para uso offline</span></p>
        <p v-else class="muted">O uso offline não está disponível neste endereço ou navegador. Todos os aplicativos funcionam online.</p>
        <p v-if="offline.supported && offline.anyUpdate" class="update" data-testid="home-update">Há atualizações para os aplicativos instalados.</p>
        <p class="links"><RouterLink :to="{ name: 'docs' }">Biblioteca de documentos</RouterLink><RouterLink :to="{ name: 'settings' }">Ajustes do Launcher</RouterLink></p>
      </section>

      <section class="panel discover" aria-labelledby="descubra" data-testid="home-discover">
        <header><h2 id="descubra">Descubra no Catálogo</h2><RouterLink :to="{ name: 'catalog' }" class="more">Ver todos</RouterLink></header>
        <ul class="suggest">
          <li v-for="tool in suggestions" :key="tool.id" :style="{ '--app': tool.color }">
            <AppIcon :id="tool.id" size="md" />
            <span class="txt"><RouterLink :to="{ name: 'app', params: { id: tool.id } }" class="name">{{ tool.name }}</RouterLink><small class="muted">{{ tool.description }}</small></span>
          </li>
        </ul>
      </section>

      <section class="panel news" aria-labelledby="novidades" data-testid="home-news">
        <header><h2 id="novidades">Novidades</h2><a :href="VERSIONS_BASE" class="more">Central de Versões</a></header>
        <ul class="log">
          <li v-for="item in news" :key="item.key">
            <a :href="item.href" class="rel"><strong>{{ item.name }}</strong> <span class="ver">{{ item.version }}</span></a>
            <small class="muted">{{ item.when }}</small>
            <span v-if="item.note" class="note">{{ item.note }}</span>
          </li>
        </ul>
        <p class="muted foot">Coding Launcher {{ launcherVersion }}</p>
      </section>
    </div>
  </template>
</template>

<style scoped>
.bar { display: flex; margin-bottom: 16px; }
.apps { margin-top: 4px; }
.panels { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 22px; }
.panel { min-width: 0; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; }
.panel header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.panel h2 { font-size: 16px; margin: 0; }
.more { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; font-weight: 700; color: var(--accent); }
.empty, .foot { font-size: 13px; margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.chip { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 14px 4px 6px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--text); font-weight: 650; text-decoration: none; }
.chip:hover { border-color: var(--app); }
.chip :deep(.app-icon) { width: 32px; height: 32px; min-width: 32px; }
.big { margin: 0 0 8px; display: flex; align-items: baseline; gap: 8px; }
.big strong { font-size: 34px; line-height: 1; letter-spacing: -.03em; }
.big span { color: var(--muted); font-size: 14px; }
.update { margin: 0 0 8px; font-size: 13.5px; font-weight: 700; color: var(--accent); }
.links { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0 0; }
.links a { display: inline-flex; align-items: center; font-weight: 650; font-size: 14px; color: var(--accent); min-height: 44px; }
.suggest, .log { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.suggest li { display: flex; align-items: center; gap: 12px; min-width: 0; }
.suggest .txt { display: grid; min-width: 0; }
.suggest .name { font-weight: 700; color: var(--text); text-decoration: none; min-height: 24px; }
.suggest small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log li { display: grid; gap: 2px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.log li:last-child { padding-bottom: 0; border-bottom: 0; }
.rel { color: var(--text); text-decoration: none; min-height: 24px; }
.ver { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.log small { font-size: 12px; }
.note { font-size: 13px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { margin-top: 10px; }
@media (min-width: 700px) {
  .panels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1100px) {
  .panels { grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .favs { grid-column: span 7; }
  .device { grid-column: span 5; }
  .discover { grid-column: span 6; }
  .news { grid-column: span 6; }
}
</style>
