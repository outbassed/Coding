<script setup lang="ts">
import { ref, watch } from 'vue';
import BoxSheet from './BoxSheet.vue';
import type { BoxData } from '../model';

const props = defineProps<{ boxes: BoxData; pages: number[][]; stamp: string }>();
const current = ref(0);
watch(() => props.pages.length, (length) => { current.value = Math.min(current.value, Math.max(0, length - 1)); });
</script>

<template>
  <div class="box-preview" data-testid="box-preview">
    <div class="box-preview-nav">
      <strong>Prévia da impressão · A4</strong>
      <div class="box-page-controls">
        <button type="button" aria-label="Folha anterior" :disabled="current === 0" @click="current--">‹</button>
        <span data-testid="box-page-index">Folha {{ current + 1 }} de {{ pages.length }}</span>
        <button type="button" aria-label="Próxima folha" :disabled="current + 1 >= pages.length" @click="current++">›</button>
      </div>
    </div>
    <div class="box-preview-scroll" data-testid="canvas" tabindex="0" aria-label="Prévia das etiquetas de caixas">
      <div class="box-preview-sheet" data-testid="sheet">
        <BoxSheet :boxes="boxes" :numbers="pages[current] ?? []" :stamp="stamp" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.box-preview { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.box-preview-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 13px; }
.box-page-controls { display: flex; gap: 9px; align-items: center; color: var(--muted); }
.box-page-controls button { min-width: 44px; min-height: 44px; border: 1px solid var(--border); color: var(--text); background: var(--panel); border-radius: 10px; font-size: 22px; }
.box-page-controls button:disabled { opacity: .35; }
.box-preview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 18px 12px 35px; display: flex; align-items: flex-start; justify-content: center; }
.box-preview-sheet { width: min(100%, 794px); aspect-ratio: 210 / 297; height: auto; flex: none; box-shadow: 0 6px 22px #0003; }
@media (max-width: 480px) { .box-preview-scroll { padding: 12px 6px 80px; } .box-preview-nav { padding: 5px 10px; } }
</style>
