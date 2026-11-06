<script setup lang="ts">
import { computed } from 'vue';
import { shopHeading } from '../boxes';
import type { BoxData } from '../model';

const props = defineProps<{ boxes: BoxData; numbers: number[]; stamp: string }>();
const destination = computed(() => shopHeading(props.boxes));
</script>

<template>
  <div class="box-paper">
    <div class="box-grid">
      <article v-for="number in numbers" :key="number" class="box-label" data-testid="box-label">
        <strong class="box-destination">{{ destination }}</strong>
        <div class="box-fields">
          <div>NF: {{ boxes.nf }}</div>
          <div>CAIXAS: {{ number }}/{{ boxes.total }}</div>
          <div>NOME: {{ boxes.person }}</div>
        </div>
        <div class="box-datetime">{{ stamp }}</div>
      </article>
    </div>
  </div>
</template>

<style>
/* Uma folha A4 com 2 colunas e 4 linhas: oito caixas por folha. */
.box-paper { width: 100%; height: 100%; box-sizing: border-box; background: white; color: #111; padding: 7mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; }
.box-grid { display: grid; width: 100%; height: 100%; grid-template-columns: repeat(2, minmax(0,1fr)); grid-template-rows: repeat(4, minmax(0,1fr)); gap: 2.5mm; }
.box-label { container-type: inline-size; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-around; min-width: 0; min-height: 0; overflow: hidden; padding: 2.5mm 3mm; border: 1px dashed #777; line-height: 1.18; }
.box-destination { font-size: 4.8cqw; text-align: center; line-height: 1.1; overflow-wrap: anywhere; font-weight: 900; }
.box-fields { display: grid; gap: .6em; font-size: 4.35cqw; font-weight: 700; overflow-wrap: anywhere; }
.box-datetime { text-align: center; font-size: 3.7cqw; font-weight: 600; white-space: nowrap; }
</style>
