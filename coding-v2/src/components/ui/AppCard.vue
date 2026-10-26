<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { availabilityLabel, availabilityOf, categories, type CodingTool } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';
import { useFavoritesStore } from '../../stores/favorites';
import { useOfflineStore } from '../../stores/offline';

/** Todo aplicativo está sempre disponível online: o cartão só abre, favorita e informa o uso offline. */
const props = defineProps<{ tool: CodingTool }>();
const favorites = useFavoritesStore();
const offline = useOfflineStore();
const offlineReady = computed(() => offline.supported && ['installed', 'update-available'].includes(offline.stateOf(props.tool.id)));
const fav = computed(() => favorites.isFavorite(props.tool.id));
const avail = computed(() => availabilityOf(props.tool));
const category = computed(() => categories.find((c) => c.id === props.tool.category)?.label ?? '');
</script>

<template>
  <article class="card" :style="{ '--app': tool.color }" :data-tool="tool.id">
    <button type="button" class="star" :aria-pressed="fav" :aria-label="(fav ? 'Remover ' : 'Favoritar ') + tool.name + (fav ? ' dos favoritos' : '')" data-testid="favorite" @click.stop="favorites.toggle(tool.id)">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" :fill="fav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
    </button>
    <div class="top">
      <AppIcon :id="tool.id" size="lg" />
      <span v-if="offlineReady" class="off-ok" data-testid="card-offline" title="Os arquivos deste app estão guardados neste navegador">Offline</span>
    </div>
    <h3><RouterLink :to="{ name: 'app', params: { id: tool.id } }" class="name">{{ tool.name }}</RouterLink></h3>
    <p class="meta" data-testid="card-meta"><span class="avail" :data-avail="avail">{{ availabilityLabel[avail] }}</span><span class="dot" aria-hidden="true">·</span><span>{{ category }}</span></p>
    <p class="muted desc">{{ tool.description }}</p>
    <div class="actions">
      <a v-if="tool.path" :href="tool.path" class="btn btn-app" :aria-label="'Abrir o editor de ' + tool.name">Abrir</a>
    </div>
  </article>
</template>

<style scoped>
.card { display:flex; flex-direction:column; align-items:center; text-align:center; min-width:0; padding:20px 12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:20px; position:relative; gap:8px; }
.card:hover { border-color:color-mix(in srgb,var(--accent) 42%,var(--border)); background:var(--panel); }
.star { position:absolute; top:2px; right:2px; z-index:2; display:grid; place-items:center; width:44px; height:44px; padding:0; border:0; background:transparent; border-radius:12px; color:var(--muted); }
.star[aria-pressed="true"] { color:var(--app); }
.star:hover { color:var(--text); }
.top { display:grid; justify-items:center; gap:7px; margin-bottom:1px; }
.off-ok { font-size:11px; font-weight:700; color:var(--ok); }
.top :deep(.app-icon) { width:78px; height:78px; }
h3 { font-size:15px; line-height:1.25; margin:0; max-width:100%; font-weight:760; overflow-wrap:anywhere; }
.name { text-decoration:none; }
.name::after { content:""; position:absolute; inset:0; border-radius:20px; }
.name:focus-visible { outline:none; }
.card:has(.name:focus-visible) { outline:3px solid var(--accent); outline-offset:2px; }
.meta { margin:0; display:block; max-width:100%; font-size:11px; color:var(--muted); }
.avail[data-avail="functional"] { color:var(--ok); }
.dot, .meta span:last-child { display:none; }
.desc { margin:0; font-size:12px; line-height:1.4; min-height:34px; max-width:100%; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.actions { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; position:relative; z-index:1; margin-top:auto; }
.actions .btn { font-size:12px; min-height:40px; padding:7px 10px; }
@media(max-width:599px) {
  .card { padding:9px 3px 10px; border:0; background:transparent; border-radius:13px; gap:5px; }
  .card:hover { background:var(--panel); }
  .top { margin:0; }
  .top :deep(.app-icon) { width:clamp(58px,18vw,72px); height:clamp(58px,18vw,72px); }
  h3 { font-size:12px; font-weight:690; min-height:29px; max-width:100%; }
  .meta,.desc,.actions { display:none; }
}
@media(min-width:600px) and (max-width:899px) {
  .card { padding:14px 6px; } .top { max-width:100%; min-width:0; } .top :deep(.app-icon) { width:68px;height:68px; }
}
</style>