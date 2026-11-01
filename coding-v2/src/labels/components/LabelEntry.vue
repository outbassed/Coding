<script setup lang="ts">
import { computed } from 'vue';
import type { LabelItem, LabelsState } from '../model';
import { renderCode } from '../../apps/codes/render';
import InlineText from '../../editors/surface/InlineText.vue';

/** Edição direta na folha (EDICAO-DIRETA.md). Sem `edit`, a etiqueta é só leitura: é assim na medição, na impressão e no PDF. */
export interface EntryEdit {
  /** Número do item na lista (1, 2, 3…), para os nomes acessíveis. */
  number: number;
  copy: number;
  copies: number;
  /** Campo que continua na folha mesmo vazio, porque está sendo editado. */
  keep: 'code' | 'desc' | null;
  /** Só a primeira cópia de cada item entra na ordem do Tab; todas aceitam clique e toque. */
  tabbable: boolean;
  describedBy: string;
}
export type EntryField = 'code' | 'desc';

const props = defineProps<{ item: LabelItem; state: LabelsState; edit?: EntryEdit }>();
const emit = defineEmits<{
  change: [field: EntryField, value: string];
  start: [field: EntryField];
  end: [field: EntryField, info: { caret: number; settled: boolean }];
  undo: [];
  redo: [];
}>();
/** QR ou barras do código do item (SVG local, textos escapados). Código inválido para o formato: sem gráfico. */
const graphic = computed(() => {
  const kind = props.state.barcode;
  const value = props.item.code.trim();
  if (!kind || kind === 'none' || !value) return '';
  try { return renderCode(kind, value, { module: 2, height: 40, fg: '#000000', bg: '#ffffff', showText: false, ecl: 'M', margin: kind === 'qr' ? 2 : 4 }).svg; } catch { return ''; }
});
const showCode = computed(() => props.item.code.trim() !== '' || props.edit?.keep === 'code');
const showDesc = computed(() => props.item.description.trim() !== '' || props.edit?.keep === 'desc');
const where = computed(() => (props.edit ? ' na etiqueta (item ' + props.edit.number + ', cópia ' + props.edit.copy + ' de ' + props.edit.copies + ')' : ''));
function style(part: 'code' | 'desc'): Record<string, string> {
  const s = props.state;
  return {
    fontFamily: '"' + s[part === 'code' ? 'codeFont' : 'descFont'] + '", Arial, sans-serif',
    fontSize: s[part === 'code' ? 'codeSize' : 'descSize'] + 'pt',
    fontWeight: (part === 'code' ? s.codeBold : s.descBold) ? '700' : '400',
    fontStyle: (part === 'code' ? s.codeItalic : s.descItalic) ? 'italic' : 'normal',
    textAlign: part === 'code' ? s.codeAlign : s.descAlign
  };
}
</script>

<template>
  <section class="entry" :class="{ bordered: state.border }" :data-item-id="edit ? item.id : undefined">
    <div v-if="graphic" class="graphic" :class="state.barcode" aria-hidden="true" v-html="graphic"></div>
    <template v-if="!edit">
      <p v-if="item.code.trim()" class="code" :style="style('code')">{{ state.prefix + item.code }}</p>
      <p v-if="item.description.trim()" class="desc" :style="style('desc')">{{ item.description }}</p>
    </template>
    <template v-else>
      <p v-if="showCode" class="code" :style="style('code')"><span class="prefix" contenteditable="false">{{ state.prefix }}</span><InlineText :model-value="item.code" :label="'Código' + where" :max-length="160" placeholder="Código" :tabbable="edit.tabbable"
        :edit-key="item.id + ':' + (edit.copy - 1) + '|code'" :described-by="edit.describedBy" @update:model-value="emit('change', 'code', $event)" @start="emit('start', 'code')" @end="emit('end', 'code', $event)" @undo="emit('undo')" @redo="emit('redo')" /></p>
      <p v-if="showDesc" class="desc" :style="style('desc')"><InlineText :model-value="item.description" :label="'Descrição' + where" multiline :max-length="2000" placeholder="Descrição" :tabbable="edit.tabbable"
        :edit-key="item.id + ':' + (edit.copy - 1) + '|desc'" :described-by="edit.describedBy" @update:model-value="emit('change', 'desc', $event)" @start="emit('start', 'desc')" @end="emit('end', 'desc', $event)" @undo="emit('undo')" @redo="emit('redo')" /></p>
    </template>
  </section>
</template>

<style scoped>
/* Mesmas medidas do Coding atual (style.css), para a folha sair igual. */
.entry { min-width: 0; margin: 0; break-inside: avoid; color: #101010; }
.entry.bordered { border: .35mm dashed #6b6b6b; padding: 3mm; }
p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.code { line-height: 1.14; }
.desc { line-height: 1.2; }
.code + .desc { margin-top: 4mm; }
.graphic { display: flex; justify-content: center; margin-bottom: 2mm; }
.graphic :deep(svg) { display: block; height: auto; max-width: 100%; }
.graphic.qr :deep(svg) { width: 22mm; }
.graphic.code128 :deep(svg), .graphic.ean13 :deep(svg) { width: 100%; max-height: 18mm; }
</style>
