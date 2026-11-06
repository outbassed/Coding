<script setup lang="ts">
import type { BoxData } from '../model';

const props = defineProps<{ boxes: BoxData }>();
const emit = defineEmits<{ boxes: [value: BoxData] }>();
const models = [
  { name: 'Gigante', hint: '1 por folha', cols: 1, rows: 1 },
  { name: 'Uma coluna', hint: '2 por folha', cols: 1, rows: 2 },
  { name: 'Quatro', hint: '4 por folha', cols: 2, rows: 2 },
  { name: 'Seis', hint: '6 por folha', cols: 2, rows: 3 },
  { name: 'Padrão', hint: '8 por folha', cols: 2, rows: 4 }
];
function apply(cols: number, rows: number): void {
  emit('boxes', { ...props.boxes, layout: { ...props.boxes.layout, cols, rows } });
}
</script>

<template>
  <div class="box-models" data-testid="box-models">
    <h2>Modelos de impressão</h2>
    <p>Escolha quantas etiquetas cabem em cada folha A4. Para criar outro formato, ajuste colunas e linhas em Propriedades.</p>
    <div class="box-model-grid">
      <button v-for="item in models" :key="item.name" type="button" :class="{ chosen: boxes.layout.cols === item.cols && boxes.layout.rows === item.rows }"
        :aria-pressed="boxes.layout.cols === item.cols && boxes.layout.rows === item.rows"
        :data-testid="'box-model-' + (item.cols * item.rows)" @click="apply(item.cols, item.rows)">
        <span class="model-paper" :style="{ gridTemplateColumns: 'repeat(' + item.cols + ',1fr)', gridTemplateRows: 'repeat(' + item.rows + ',1fr)' }">
          <i v-for="n in item.cols * item.rows" :key="n"></i>
        </span>
        <strong>{{ item.name }}</strong>
        <small>{{ item.hint }}</small>
      </button>
    </div>
    <p class="box-custom">Modelo atual: <strong>{{ boxes.layout.cols }} coluna(s) × {{ boxes.layout.rows }} linha(s)</strong>. O modelo escolhido é salvo junto ao documento.</p>
  </div>
</template>

<style scoped>
.box-models { display: grid; gap: 12px; }
.box-models h2 { font-size: 15px; margin: 0; }
.box-models p { font-size: 12.5px; color: var(--muted); margin: 0; line-height: 1.45; }
.box-model-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
.box-model-grid button { border: 2px solid var(--border); border-radius: 13px; background: var(--panel); color: var(--text); padding: 10px; display: grid; justify-items: center; gap: 5px; min-height: 140px; }
.box-model-grid button.chosen { border-color: var(--app); background: var(--surface); }
.box-model-grid strong { font-size: 13px; }
.box-model-grid small { font-size: 12px; color: var(--muted); }
.model-paper { display: grid; width: 64px; height: 85px; gap: 2px; padding: 5px; box-sizing: border-box; background: white; border: 1px solid #aaa; }
.model-paper i { border: 1px dashed #888; display: block; }
.box-custom { border-top: 1px solid var(--border); padding-top: 12px; }
</style>
