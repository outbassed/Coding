<script setup lang="ts">
import type { LabelItem, LabelsState } from '../model';

const props = defineProps<{ item: LabelItem; state: LabelsState }>();
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
</style>
