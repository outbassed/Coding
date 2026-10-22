<script setup lang="ts">
import type { CopySummary } from '../../storage/documents';
import { formatDate, imagesSizeText, imagesText, openEditorName, openHref as editorHref, originText, typeLabel } from '../../library/model';

import { computed } from 'vue';

const props = defineProps<{ copy: CopySummary; busy: boolean }>();
const openHref = computed(() => editorHref(props.copy));
defineEmits<{ rename: []; export: []; duplicate: []; remove: [] }>();
</script>

<template>
  <div class="details">
    <dl class="info">
      <div><dt>Tipo</dt><dd>{{ typeLabel(copy.type) }}</dd></div>
      <div><dt>Origem</dt><dd>{{ originText(copy) }}</dd></div>
      <div><dt>Atualizada em</dt><dd>{{ formatDate(copy.updatedAt) }}</dd></div>
      <div><dt>Criada em</dt><dd>{{ formatDate(copy.createdAt) }}</dd></div>
      <div><dt>Imagens</dt><dd>{{ imagesText(copy.imageCount) }} ({{ imagesSizeText(copy.imageCount, copy.imageBytes) }})</dd></div>
      <div><dt>Revisão</dt><dd>{{ copy.revision }}</dd></div>
    </dl>
    <div class="actions">
      <a v-if="openHref" class="btn btn-primary wide" data-copy-action="open" :href="openHref" :aria-label="'Abrir cópia de ' + copy.label + ' no editor de ' + openEditorName(copy.type)">Abrir no editor</a>
      <button type="button" class="btn" data-copy-action="rename" :aria-label="'Renomear cópia de ' + copy.label" :aria-busy="busy" @click="$emit('rename')">Renomear</button>
      <button type="button" class="btn" data-copy-action="export" :aria-label="'Exportar cópia de ' + copy.label" :aria-busy="busy" @click="$emit('export')">Exportar</button>
      <button type="button" class="btn" data-copy-action="duplicate" :aria-label="'Criar nova cópia de ' + copy.label" :aria-busy="busy" @click="$emit('duplicate')">Criar cópia</button>
      <button type="button" class="btn danger" data-copy-action="remove" :aria-label="'Excluir cópia de ' + copy.label" :aria-busy="busy" @click="$emit('remove')">Excluir</button>
    </div>
    <p class="note muted">Excluir remove só esta cópia da v2. O documento no Coding atual não é afetado.</p>
  </div>
</template>

<style scoped>
.info { margin: 0 0 16px; display: grid; gap: 10px; }
.info div { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
dt { color: var(--muted); }
dd { margin: 0; text-align: right; overflow-wrap: anywhere; font-weight: 600; }
.actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.wide { grid-column: 1 / -1; }
.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
.note { font-size: 12.5px; margin: 14px 0 0; }
</style>
