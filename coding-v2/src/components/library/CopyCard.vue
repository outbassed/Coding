<script setup lang="ts">
import { computed } from 'vue';
import type { CopySummary } from '../../storage/documents';
import { copyTool, formatDate, imagesText, openHref, originText, typeLabel } from '../../library/model';
import type { ViewMode } from '../../library/view';
import DocThumb from '../ui/DocThumb.vue';

const props = withDefaults(defineProps<{ copy: CopySummary; selected: boolean; view?: ViewMode }>(), { view: 'grid' });
defineEmits<{ select: [id: string] }>();
const href = computed(() => openHref(props.copy));
const known = computed(() => copyTool(props.copy) !== null);
</script>

<template>
  <li class="item" :class="view" :data-view="view">
    <button type="button" class="card" :data-copy-card="copy.id" :aria-current="selected ? 'true' : undefined" @click="$emit('select', copy.id)">
      <span class="thumb-box"><DocThumb :copy="copy" /></span>
      <span class="txt">
        <strong class="name"><span class="sr-only">Detalhes de </span>{{ copy.label }}</strong>
        <span class="meta kind">{{ known ? typeLabel(copy.type) : 'Tipo desconhecido' }} · {{ originText(copy) }}</span>
        <span class="meta">Atualizada em {{ formatDate(copy.updatedAt) }} · {{ imagesText(copy.imageCount) }}</span>
      </span>
    </button>
    <a v-if="href" class="open" :href="href" :aria-label="'Abrir ' + copy.label + ' no editor'">Abrir</a>
  </li>
</template>

<style scoped>
.item { list-style: none; min-width: 0; display: grid; gap: 6px; align-content: start; content-visibility: auto; contain-intrinsic-size: auto 96px; }
.item.grid { contain-intrinsic-size: auto 300px; }
.card { display: flex; gap: 12px; width: 100%; padding: 10px; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; min-width: 0; }
.card:hover { background: var(--panel); }
.card[aria-current="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.name { font-size: 15px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; line-height: 1.4; }
.open { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); color: var(--accent); font-weight: 750; text-decoration: none; }
.open:hover { border-color: var(--accent); }
/* lista: miniatura estreita à esquerda, ação à direita */
.item.list { grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; }
.item.list .thumb-box { flex: 0 0 52px; width: 52px; }
.item.list .card { align-items: center; min-height: 76px; }
.item.list .open { padding: 0 16px; }
/* grade: miniatura A4 em cima */
.item.grid .card { flex-direction: column; gap: 10px; }
.item.grid .thumb-box { display: block; width: 100%; }
@media (max-width: 599px) {
  .item.grid .card { padding: 8px; }
  .item.grid .meta.kind { display: none; }
  .item.list { grid-template-columns: minmax(0, 1fr); }
}
</style>
