<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { boxPages } from '../boxes';
import { PAPER } from '../model';
import BoxSheet from './BoxSheet.vue';
import type { BoxData } from '../model';
const props = defineProps<{ boxes: BoxData; stamp: string }>();
const pages = computed(() => boxPages(props.boxes.total, props.boxes.layout));
const paper = computed(() => PAPER[props.boxes.layout.orientation]);
const ID = 'labels-boxes-page-size';
watch(() => props.boxes.layout.orientation, (orientation) => {
  let el = document.getElementById(ID);
  if (!el) { el = document.createElement('style'); el.id = ID; document.head.appendChild(el); }
  el.textContent = '@page { size: A4 ' + orientation + '; margin: 0; }';
}, { immediate: true });
onBeforeUnmount(() => document.getElementById(ID)?.remove());
</script>

<template>
  <Teleport to="body">
    <div class="print-root box-print-root" aria-hidden="true" data-testid="print-root" :data-orientation="boxes.layout.orientation">
      <div v-for="(numbers, index) in pages" :key="index" class="print-sheet box-print-sheet" data-testid="print-sheet"
        :style="{ width: paper.w + 'mm', height: paper.h + 'mm' }">
        <BoxSheet :boxes="boxes" :numbers="numbers" :stamp="stamp" />
      </div>
    </div>
  </Teleport>
</template>

<style>
.box-print-root { position: absolute; top: 0; left: -99999px; background: #fff; color: #111; pointer-events: none; }
.box-print-sheet { box-sizing: border-box; background: #fff; overflow: hidden; }
@media print {
  html, body { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
  body > *:not(.print-root) { display: none !important; }
  .box-print-root { display: block !important; position: static !important; left: auto !important; }
  .box-print-sheet { break-after: page; page-break-after: always; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .box-print-sheet:last-child { break-after: auto; page-break-after: auto; }
}
</style>
