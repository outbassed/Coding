<script setup lang="ts">
import { onMounted, ref } from 'vue';
import VIcon from './VIcon.vue';
import { hexDump, type ViewerFile } from './model';
import type { PrintPage } from '../../shared/print/print';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Arquivo que o Visualizador não sabe exibir: mostra os primeiros bytes e oferece o download do original. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();
const hex = ref('');
onMounted(async () => {
  try {
    if (props.blob) hex.value = hexDump(new Uint8Array(await props.blob.slice(0, 256).arrayBuffer()), 256);
    emit('meta', '', []);
  } catch { emit('error', 'Não foi possível ler este arquivo.'); }
});
const printReason = (): string => 'Este tipo de arquivo não pode ser impresso aqui. Baixe o original e abra no programa que o criou.';
async function printPages(): Promise<PrintPage[]> { throw new Error(printReason()); }
function menu(): MenuGroup[] { return []; }
function key(): boolean { return false; }
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
</script>

<template>
  <div class="vw-body uk" data-testid="viewer-unknown">
    <div class="uk-card">
      <VIcon name="file" :size="44" />
      <h2 class="uk-title">Não há visualização para este tipo de arquivo</h2>
      <p class="uk-text">O Visualizador mostra imagens, SVG, vídeos, áudios, PDFs, modelos 3D (STL, OBJ, GLB) e textos. Baixe o original para abri-lo em outro programa.</p>
      <button type="button" class="vw-btn primary" data-testid="uk-download" @click="emit('action', 'download')"><VIcon name="download" /> Baixar o original</button>
      <pre v-if="hex" class="uk-hex" tabindex="0" aria-label="Primeiros bytes do arquivo">{{ hex }}</pre>
    </div>
  </div>
</template>

<style scoped>
.uk { overflow: auto; align-items: center; }
.uk-card { width: min(680px, 100%); margin: auto; padding: 24px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--st-fg); }
.uk-title { margin: 6px 0 0; font-size: 18px; }
.uk-text { margin: 0 0 6px; color: var(--st-mut); font-size: 14px; max-width: 52ch; }
.uk-hex { align-self: stretch; margin: 10px 0 0; padding: 12px; overflow: auto; text-align: left; background: #10151d; border: 1px solid var(--st-line); border-radius: 12px; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #cfd6e4; }
</style>
