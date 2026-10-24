<script setup lang="ts">
import { computed } from 'vue';
import type { LabelItem, LabelsState } from '../model';
import { renderCode } from '../../apps/codes/render';

const props = defineProps<{ item: LabelItem; state: LabelsState }>();
/** QR ou barras do código do item (SVG local, textos escapados). Código inválido para o formato: sem gráfico. */
const graphic = computed(() => {
  const kind = props.state.barcode;
  const value = props.item.code.trim();
  if (!kind || kind === 'none' || !value) return '';
  try { return renderCode(kind, value, { module: 2, height: 40, fg: '#000000', bg: '#ffffff', showText: false, ecl: 'M', margin: kind === 'qr' ? 2 : 4 }).svg; } catch { return ''; }
});
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
  <section class="entry" :class="{ bordered: state.border }">
    <div v-if="graphic" class="graphic" :class="state.barcode" aria-hidden="true" v-html="graphic"></div>
    <p v-if="item.code.trim()" class="code" :style="style('code')">{{ state.prefix + item.code }}</p>
    <p v-if="item.description.trim()" class="desc" :style="style('desc')">{{ item.description }}</p>
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
