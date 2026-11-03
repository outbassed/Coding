<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import LabelEntry from './LabelEntry.vue';
import { MARGIN_X_MM, MARGIN_Y_MM, PAPER, activeItems, type LabelsState } from '../model';

/** Folhas em tamanho real (mm), usadas pela impressão do navegador e pela exportação em PDF. */
const props = defineProps<{ state: LabelsState; pages: number[][][] }>();
const active = computed(() => activeItems(props.state));
const paper = computed(() => PAPER[props.state.orientation]);

const STYLE_ID = 'labels-page-size';
watch(() => props.state.orientation, (o) => {
  let el = document.getElementById(STYLE_ID);
  if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
  el.textContent = '@page { size: A4 ' + o + '; margin: 0; }';
}, { immediate: true });
onBeforeUnmount(() => document.getElementById(STYLE_ID)?.remove());
</script>

<template>
  <Teleport to="body">
    <div class="print-root" aria-hidden="true" data-testid="print-root" :data-orientation="state.orientation">
      <div v-for="(rows, p) in pages" :key="p" class="print-sheet" data-testid="print-sheet"
        :style="{ width: paper.w + 'mm', height: paper.h + 'mm', padding: MARGIN_Y_MM + 'mm ' + MARGIN_X_MM + 'mm' }">
        <div class="print-body" :style="{ gap: state.gap + 'mm' }">
          <div v-for="(row, r) in rows" :key="r" class="print-row" :style="{ gridTemplateColumns: 'repeat(' + state.cols + ', minmax(0, 1fr))', columnGap: state.gap + 'mm' }">
            <template v-for="(idx, c) in row" :key="c"><LabelEntry v-if="active[idx]" :item="active[idx]!" :state="state" /></template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.print-root { position: absolute; left: -99999px; top: 0; pointer-events: none; background: #fff; color: #101010; }
.print-sheet { position: relative; box-sizing: border-box; overflow: hidden; background: #fff; color: #101010; }
.print-body { width: 100%; height: 100%; display: flex; flex-direction: column; }
.print-row { flex: none; display: grid; align-items: stretch; }
@media print {
  html, body { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.print-root) { display: none !important; }
  .print-root { position: static !important; left: auto !important; display: block !important; }
  .print-sheet { break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-sheet:last-child { break-after: auto; page-break-after: auto; }
}
</style>
