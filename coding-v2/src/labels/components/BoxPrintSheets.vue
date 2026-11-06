<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { boxPages } from '../boxes';
import BoxSheet from './BoxSheet.vue';
import type { BoxData } from '../model';
const props = defineProps<{ boxes: BoxData; stamp: string }>();
const pages = computed(() => boxPages(props.boxes.total));
const ID = 'labels-boxes-page-size';
onMounted(() => {
  const el = document.createElement('style');
  el.id = ID;
  el.textContent = '@page { size: A4 portrait; margin: 0; }';
  document.head.appendChild(el);
});
onBeforeUnmount(() => document.getElementById(ID)?.remove());
</script>

<template>
  <Teleport to="body">
    <div class="print-root box-print-root" aria-hidden="true" data-testid="print-root" data-orientation="portrait">
      <div v-for="(numbers, index) in pages" :key="index" class="print-sheet box-print-sheet" data-testid="print-sheet">
        <BoxSheet :boxes="boxes" :numbers="numbers" :stamp="stamp" />
      </div>
    </div>
  </Teleport>
</template>

<style>
.box-print-root { position: absolute; top: 0; left: -99999px; background: #fff; color: #111; pointer-events: none; }
.box-print-sheet { box-sizing: border-box; width: 210mm; height: 297mm; background: #fff; overflow: hidden; }
@media print {
  html, body { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
  body > *:not(.print-root) { display: none !important; }
  .box-print-root { display: block !important; position: static !important; left: auto !important; }
  .box-print-sheet { break-after: page; page-break-after: always; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .box-print-sheet:last-child { break-after: auto; page-break-after: auto; }
}
</style>
