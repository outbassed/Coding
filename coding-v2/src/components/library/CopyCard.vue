<script setup lang="ts">
import { computed } from 'vue';
import type { CopySummary } from '../../storage/documents';
import { copyTool, formatDate, imagesText, originText, typeLabel } from '../../library/model';
import AppIcon from '../ui/AppIcon.vue';
import NavIcon from '../ui/NavIcon.vue';

const props = defineProps<{ copy: CopySummary; selected: boolean }>();
defineEmits<{ select: [id: string] }>();
const tool = computed(() => copyTool(props.copy));
</script>

<template>
  <li class="item">
    <button type="button" class="card" :data-copy-card="copy.id" :aria-current="selected ? 'true' : undefined" @click="$emit('select', copy.id)">
      <AppIcon v-if="tool" :id="tool" size="lg" />
      <span v-else class="generic" aria-hidden="true"><NavIcon name="docs" /></span>
      <span class="txt">
        <strong class="name"><span class="sr-only">Detalhes de </span>{{ copy.label }}</strong>
        <span class="meta">{{ typeLabel(copy.type) }} · {{ originText(copy) }}</span>
        <span class="meta">Atualizada em {{ formatDate(copy.updatedAt) }} · {{ imagesText(copy.imageCount) }}</span>
      </span>
    </button>
  </li>
</template>

<style scoped>
.item { list-style: none; min-width: 0; }
.card { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 76px; padding: 12px 14px; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
.card:hover { background: var(--panel); }
.card[aria-current="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.generic { width: 56px; height: 56px; flex: none; display: grid; place-items: center; border-radius: 16px; background: var(--raised); color: var(--muted); }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-size: 15px; overflow-wrap: anywhere; }
.meta { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; line-height: 1.4; }
</style>
