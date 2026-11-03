<script setup lang="ts">
import { computed } from 'vue';
import type { LabelsState } from '../model';
import type { LayoutInfo } from './LabelsPreview.vue';

const props = defineProps<{ state: LabelsState; layout: LayoutInfo; busy: boolean; progress: string; message: string; error: string }>();
const emit = defineEmits<{ print: []; pdf: [] }>();
const blocked = computed(() => Boolean(props.layout.warning) || props.layout.labelCount === 0);
const sheets = computed(() => props.layout.pageCount + (props.layout.pageCount === 1 ? ' folha' : ' folhas'));
const paper = computed(() => 'A4 ' + (props.state.orientation === 'portrait' ? 'retrato' : 'paisagem'));
</script>

<template>
  <div class="ex" data-testid="export-panel">
    <section class="grp">
      <h2>Saída</h2>
      <p class="info" data-testid="export-info"><span class="muted">Resultado</span> <strong>{{ blocked ? 'indisponível' : sheets + ' · ' + paper }}</strong></p>
      <p v-if="blocked" class="warn" data-testid="export-blocked">{{ layout.warning || 'Preencha ao menos um item para imprimir.' }}</p>
      <div class="buttons">
        <button type="button" class="btn btn-primary" data-testid="print" :disabled="blocked || busy" @click="emit('print')">Imprimir folhas</button>
        <button type="button" class="btn" data-testid="pdf" :disabled="blocked || busy" @click="emit('pdf')">{{ busy ? 'Gerando PDF…' : 'Baixar PDF' }}</button>
      </div>
      <p v-if="progress" class="muted small" role="status" data-testid="pdf-progress">{{ progress }}</p>
      <p v-if="message" class="ok small" role="status" data-testid="export-message">{{ message }}</p>
      <p v-if="error" class="err small" role="alert" data-testid="export-error">{{ error }}</p>
    </section>
    <section class="grp">
      <h2>Como sai</h2>
      <ul class="notes">
        <li>Imprimir usa a janela de impressão do navegador. Para guardar em PDF por lá, escolha “Salvar como PDF” e deixe as margens em “Nenhuma”.</li>
        <li>Baixar PDF gera o arquivo direto, com a mesma aparência da prévia (as folhas viram imagens, então o texto não pode ser selecionado).</li>
        <li>As fontes usadas são as instaladas neste aparelho; em outro computador elas podem variar.</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ex { display: grid; gap: 14px; }
.grp { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 12px; display: grid; gap: 10px; }
h2 { font-size: 14px; margin: 0; }
.info { margin: 0; display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; }
.buttons { display: grid; gap: 8px; }
.buttons .btn { min-height: 48px; }
.small { font-size: 12.5px; margin: 0; }
.warn { margin: 0; font-size: 13px; font-weight: 600; color: var(--warn); }
.ok { color: var(--ok); font-weight: 600; }
.err { color: var(--danger); font-weight: 600; }
.notes { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
</style>
