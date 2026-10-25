<script setup lang="ts">
import type { CopySummary } from '../../storage/documents';
import { formatDate, imagesSizeText, imagesText, isLegacySheet, openEditorName, openHref as editorHref, originText, typeLabel } from '../../library/model';

import { computed, ref } from 'vue';
import { getCopy } from '../../storage/documents';
import { createDoc } from '../../editors/docs';
import { converterFor, sheetToLabels } from '../../library/convert';
import { createLabelsDocument } from '../../labels/store';
import { friendlyError } from '../../library/errors';

const props = defineProps<{ copy: CopySummary; busy: boolean }>();
const openHref = computed(() => editorHref(props.copy));
const converter = computed(() => (openHref.value ? null : converterFor(props.copy)));
const legacySheet = computed(() => isLegacySheet(props.copy.type));
const converting = ref(false);
const convertError = ref('');
/** Cria um documento NOVO no formato 2.0; a cópia do Coding 1.0 continua como estava. */
async function convert(): Promise<void> {
  const c = converter.value; if (!c || converting.value) return;
  converting.value = true; convertError.value = '';
  try {
    const record = await getCopy(props.copy.id);
    if (!record) throw new Error('Esta cópia não existe mais.');
    const state = c.kind.normalize(c.convert(record.snapshot.doc.state));
    const files = c.files ? c.files(state, record.snapshot.images ?? []) : [];
    const created = await createDoc(c.kind, state, files.map((f) => ({ ...f })));
    location.assign(c.path + '?doc=' + encodeURIComponent(created.id));
  } catch (err) { convertError.value = 'Não foi possível converter: ' + friendlyError(err); converting.value = false; }
}
/** Planilha → Etiquetas (descontinuado): gera um documento novo no editor de Etiquetas; o original continua na Biblioteca. */
async function convertSheetToLabels(): Promise<void> {
  if (converting.value) return;
  converting.value = true; convertError.value = '';
  try {
    const record = await getCopy(props.copy.id);
    if (!record) throw new Error('Esta cópia não existe mais.');
    const { labels, rows } = sheetToLabels(record.snapshot.doc.state, props.copy.legacyId);
    if (!rows) throw new Error('A planilha não tem linhas válidas para gerar etiquetas.');
    const created = await createLabelsDocument(labels);
    location.assign('/apps/etiquetas/?doc=' + encodeURIComponent(created.id));
  } catch (err) { convertError.value = 'Não foi possível converter: ' + friendlyError(err); converting.value = false; }
}
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
      <button v-if="legacySheet" type="button" class="btn btn-primary wide" data-copy-action="to-labels" :disabled="converting" :aria-label="'Converter ' + copy.label + ' em um documento de Etiquetas'" @click="convertSheetToLabels">{{ converting ? 'Convertendo…' : 'Converter em Etiquetas' }}</button>
      <p v-if="legacySheet" class="note muted wide">O app Planilha → Etiquetas foi removido: a importação de CSV/XLSX agora fica dentro de Etiquetas. A conversão cria um documento novo; esta cópia continua aqui e pode ser exportada.</p>
      <button v-if="converter" type="button" class="btn btn-primary wide" data-copy-action="convert" :disabled="converting" :aria-label="'Converter ' + copy.label + ' para o Coding 2.0 e abrir em ' + typeLabel(copy.type)" @click="convert">{{ converting ? 'Convertendo…' : 'Converter e abrir no ' + typeLabel(copy.type) }}</button>
      <p v-if="converter" class="note muted wide">A conversão cria um documento novo; esta cópia do Coding 1.0 não muda.</p>
      <p v-if="convertError" class="wide err" role="alert">{{ convertError }}</p>
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
.actions .note { margin: 0; }
.err { color: var(--danger); font-weight: 600; margin: 0; }
</style>
