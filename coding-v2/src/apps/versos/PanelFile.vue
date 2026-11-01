<script setup lang="ts">
import { computed, ref } from 'vue';
import FileTab from '../../editors/FileTab.vue';
import type { DocTemplate } from '../../editors/templates';
import type { VersosView } from './controller';
import type { ExportKind } from './model';
import { versosTemplates } from './kind';

/** Aba "Arquivo": exportação (PNG e ZIP) e novo projeto a partir de modelos. Cada cena sai na própria resolução. */
const props = defineProps<{ v: VersosView }>();
const emit = defineEmits<{ new: [id: string] }>();
const kind = ref<ExportKind>('full');
const from = ref(1);
const to = ref(1);
const total = computed(() => props.v.sceneCount);
const percent = computed(() => (props.v.progress && props.v.progress.total ? Math.round((props.v.progress.done / props.v.progress.total) * 100) : 0));
const templates = versosTemplates as readonly DocTemplate<unknown>[];
function clampInt(n: number, max: number): number { return Math.min(max, Math.max(1, Math.round(Number.isFinite(n) ? n : 1))); }
function range(): { from: number; to: number } { return { from: clampInt(from.value, total.value), to: clampInt(to.value || total.value, total.value) }; }
const run = (scope: 'current' | 'all' | 'range', as: 'png' | 'zip'): Promise<boolean> => props.v.runExport({ kind: kind.value, scope, as, ...(scope === 'range' ? range() : {}) });
</script>

<template>
  <FileTab :templates="templates" export-title="Exportar imagens" @new="emit('new', $event)">
    <div class="pf">
      <fieldset class="kinds">
        <legend class="ed-label">O que exportar</legend>
        <label class="radio" :class="{ on: kind === 'full' }"><input v-model="kind" type="radio" name="vs-kind" value="full" data-testid="kind-full" /><span><strong>Imagem completa</strong><small>Fundo e textos</small></span></label>
        <label class="radio" :class="{ on: kind === 'text' }"><input v-model="kind" type="radio" name="vs-kind" value="text" data-testid="kind-text" /><span><strong>Só os textos</strong><small>PNG com fundo transparente</small></span></label>
      </fieldset>

      <div class="ed-row">
        <button type="button" class="btn btn-app" :disabled="v.exporting" data-testid="export-scene" @click="run('current', 'png')">Exportar cena {{ v.sceneIndex + 1 }} (PNG)</button>
        <button type="button" class="btn" :disabled="v.exporting || total < 2" data-testid="export-zip" @click="run('all', 'zip')">Todas as cenas em ZIP</button>
        <button type="button" class="btn" :disabled="v.exporting || total < 2" data-testid="export-all-png" @click="run('all', 'png')">Todas em PNGs separados</button>
      </div>

      <div v-if="total > 1" class="range">
        <span class="ed-label">Intervalo de cenas</span>
        <div class="ed-row">
          <label class="ed-field"><span class="sr-only">Da cena</span><input v-model.number="from" class="inp inp-num" type="number" min="1" :max="total" aria-label="Da cena" data-testid="range-from" /></label>
          <span class="to">até</span>
          <label class="ed-field"><span class="sr-only">Até a cena</span><input v-model.number="to" class="inp inp-num" type="number" min="1" :max="total" aria-label="Até a cena" data-testid="range-to" /></label>
          <button type="button" class="btn" :disabled="v.exporting" data-testid="export-range" @click="run('range', 'zip')">Exportar intervalo em ZIP</button>
        </div>
      </div>

      <div v-if="v.progress" class="prog" role="status" data-testid="export-progress">
        <div class="bar"><span class="fill" :style="{ width: percent + '%' }"></span></div>
        <p class="ed-hint">Exportando {{ v.progress.done }} de {{ v.progress.total }}<template v-if="v.progress.current"> · {{ v.progress.current }}</template></p>
        <button type="button" class="btn" data-testid="export-cancel" @click="v.cancelExport()">Cancelar</button>
      </div>
      <p v-if="v.exportError" class="ed-error" role="alert" data-testid="export-error">{{ v.exportError }}</p>
      <p v-else-if="v.exportMessage" class="ed-ok" role="status" data-testid="export-message">{{ v.exportMessage }}</p>

      <p class="ed-hint">Cada cena é exportada no tamanho que tem (largura × altura em px), na ordem do projeto, sem reduzir resolução nem qualidade. Nomes: <code>projeto-001.png</code>, <code>projeto-002.png</code>… O ZIP não leva música nem vídeo.</p>
    </div>
  </FileTab>
</template>

<style scoped>
.pf { display: grid; gap: 12px; width: 100%; min-width: 0; }
.kinds { display: grid; gap: 6px; border: 0; padding: 0; margin: 0; min-width: 0; }
.radio { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; min-height: 44px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); cursor: pointer; }
.radio.on { border-color: var(--app); box-shadow: inset 3px 0 var(--app); }
.radio input { margin-top: 4px; width: 18px; height: 18px; flex: none; accent-color: var(--accent); }
.radio span { display: grid; gap: 1px; }
.radio small { color: var(--muted); font-size: 12px; }
.range { display: grid; gap: 4px; }
.to { align-self: center; color: var(--muted); font-size: 13px; padding-bottom: 8px; }
.prog { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); justify-items: start; }
.bar { width: 100%; height: 8px; border-radius: 99px; background: var(--raised); overflow: hidden; }
.fill { display: block; height: 100%; background: var(--app); transition: width .15s ease; }
code { font-size: 12px; }
</style>
