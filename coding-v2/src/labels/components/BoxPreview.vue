<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BoxSheet, { type BoxEditField } from './BoxSheet.vue';
import { PAPER } from '../model';
import type { BoxData } from '../model';

const props = defineProps<{ boxes: BoxData; pages: number[][]; stamp: string; page: number }>();
const emit = defineEmits<{ page: [index: number]; edit: [field: BoxEditField, value: string] }>();
const zoom = ref(1);
const area = ref<HTMLElement | null>(null);
const size = ref({ w: 800, h: 800 });
const paper = computed(() => PAPER[props.boxes.layout.orientation]);
const natural = computed(() => ({ w: paper.value.w * (96 / 25.4), h: paper.value.h * (96 / 25.4) }));
const fit = computed(() => Math.min(
  1.5,
  Math.max(0.05, (size.value.w - 28) / natural.value.w),
  Math.max(0.05, (size.value.h - 28) / natural.value.h)
));
const scale = computed(() => fit.value * zoom.value);
const frame = computed(() => ({ width: (natural.value.w * scale.value) + 'px', height: (natural.value.h * scale.value) + 'px' }));
const paperStyle = computed(() => ({
  width: paper.value.w + 'mm', height: paper.value.h + 'mm',
  transform: 'scale(' + scale.value + ')'
}));
let observer: ResizeObserver | undefined;
function measure(): void {
  if (area.value) size.value = { w: area.value.clientWidth, h: area.value.clientHeight };
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && area.value) {
    observer = new ResizeObserver(measure); observer.observe(area.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.pages.length, (length) => { if (props.page >= length) emit('page', Math.max(0, length - 1)); });
function adjust(delta: number): void { zoom.value = Math.max(.25, Math.min(3, Math.round((zoom.value + delta) * 100) / 100)); }
</script>

<template>
  <div class="box-preview" data-testid="box-preview">
    <div ref="area" class="box-preview-scroll" data-testid="canvas" tabindex="0" role="region" aria-label="Folha de etiquetas de caixas">
      <div class="box-preview-pages">
        <div class="box-preview-frame" :style="frame" data-testid="sheet">
          <div class="box-preview-sheet" :style="paperStyle">
            <BoxSheet :boxes="boxes" :numbers="pages[page] ?? []" :stamp="stamp" editable @edit="(field, value) => emit('edit', field, value)" />
          </div>
        </div>
      </div>
    </div>
    <div class="box-zoom" role="group" aria-label="Zoom da folha">
      <button type="button" aria-label="Diminuir zoom" :disabled="zoom <= .25" @click="adjust(-.25)">−</button>
      <span data-testid="box-zoom-label">{{ Math.round(zoom * 100) }}%</span>
      <button type="button" aria-label="Aumentar zoom" :disabled="zoom >= 3" @click="adjust(.25)">+</button>
      <button type="button" class="fit" data-testid="box-fit" @click="zoom = 1">Ajustar à folha</button>
    </div>
  </div>
</template>

<style scoped>
.box-preview { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--raised); }
.box-preview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0; }
.box-preview-pages { display: flex; justify-content: flex-start; align-items: flex-start; width: max-content; min-width: 100%; min-height: 100%; padding: 12px; box-sizing: border-box; }
.box-preview-frame { flex: none; position: relative; margin: auto; box-shadow: 0 9px 26px #0003; }
.box-preview-sheet { position: absolute; top: 0; left: 0; background: #fff; transform-origin: top left; }
.box-zoom { display: flex; gap: 3px; align-items: center; justify-content: center; padding: 4px 10px; border-top: 1px solid var(--border); background: var(--surface); }
.box-zoom button { min-height: 42px; min-width: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font-weight: 700; }
.box-zoom .fit { font-size: 12px; min-width: 100px; }
.box-zoom button:disabled { opacity: .4; }
.box-zoom span { font-size: 13px; font-weight: 700; min-width: 52px; text-align: center; }
</style>
