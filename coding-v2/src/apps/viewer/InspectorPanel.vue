<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VIcon from './VIcon.vue';
import { KIND_ICON } from './icons';
import { KIND_LABELS } from './kinds';
import { extensionOf } from './kinds';
import { cleanFileName } from './library';
import { formatBytes } from '../../shared/bytes';
import type { ViewerFile } from './model';
import type { Detail, ViewerAction } from './types';

/** Propriedades do arquivo aberto: dados reais (os do formato chegam do visualizador), renomear e ações do arquivo. */
const props = defineProps<{
  file: ViewerFile | null;
  details: Detail[];
  position: number;
  total: number;
  canOpenInCode: boolean;
  canPrint: boolean;
  drawer: boolean;
}>();
const emit = defineEmits<{
  (e: 'rename', name: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'close'): void;
}>();

const draft = ref('');
const invalid = ref(false);
watch(() => [props.file?.id, props.file?.name], () => { draft.value = props.file?.name ?? ''; invalid.value = false; }, { immediate: true });

function commit(): void {
  if (!props.file) return;
  const clean = cleanFileName(draft.value);
  if (!clean) { invalid.value = true; return; }
  invalid.value = false;
  if (clean !== props.file.name) emit('rename', clean);
  draft.value = clean;
}
const rows = computed<Detail[]>(() => {
  const f = props.file;
  if (!f) return [];
  const out: Detail[] = [
    { label: 'Tipo', value: KIND_LABELS[f.kind] },
    { label: 'Extensão', value: extensionOf(f.name) ? '.' + extensionOf(f.name) : 'sem extensão' },
    { label: f.sourceUrl ? 'Origem' : 'Tamanho', value: f.sourceUrl ? 'Link externo (precisa de internet)' : formatBytes(f.size) }
  ];
  if (f.mime) out.push({ label: 'Formato (MIME)', value: f.mime });
  out.push(...props.details);
  if (props.total > 1 && props.position >= 0) out.push({ label: 'Posição', value: props.position + 1 + ' de ' + props.total });
  return out;
});
const host = computed(() => { try { return props.file?.sourceUrl ? new URL(props.file.sourceUrl).hostname : ''; } catch { return ''; } });
</script>

<template>
  <section class="ins" aria-label="Propriedades do arquivo" data-testid="viewer-props">
    <header class="ins-head">
      <h2 class="ins-title">Propriedades</h2>
      <button v-if="!drawer" type="button" class="vw-btn" aria-label="Recolher as propriedades" title="Recolher (I)" data-testid="hide-properties" @click="emit('close')"><VIcon name="panelRight" /></button>
      <button v-else type="button" class="vw-btn" aria-label="Fechar as propriedades" data-testid="hide-properties" @click="emit('close')"><VIcon name="close" /></button>
    </header>
    <div v-if="!file" class="ins-empty"><VIcon name="info" :size="28" /><p>Abra um arquivo para ver seus dados.</p></div>
    <div v-else class="ins-body">
      <div class="ins-id"><span class="ins-ic"><VIcon :name="KIND_ICON[file.kind]" :size="26" /></span><span class="ins-kind">{{ KIND_LABELS[file.kind] }}</span></div>
      <form class="ins-name" @submit.prevent="commit">
        <label class="ins-lbl" for="vw-rename">Nome do arquivo</label>
        <div class="ins-row">
          <input id="vw-rename" v-model="draft" class="ins-in" maxlength="160" autocomplete="off" :aria-invalid="invalid" data-testid="viewer-rename" @blur="commit" />
          <button type="submit" class="vw-btn" aria-label="Aplicar o nome" title="Aplicar o nome" data-testid="viewer-rename-apply"><VIcon name="check" /></button>
        </div>
        <p v-if="invalid" class="ins-err" role="alert">O nome não pode ficar vazio.</p>
        <p class="ins-hint">Renomear muda só o nome no projeto, não o arquivo original.</p>
      </form>
      <dl class="ins-list" data-testid="viewer-details">
        <template v-for="d in rows" :key="d.label"><dt>{{ d.label }}</dt><dd>{{ d.value }}</dd></template>
        <template v-if="file.sourceUrl"><dt>Endereço</dt><dd class="ins-url" data-testid="viewer-source-url">{{ file.sourceUrl }}</dd></template>
      </dl>
      <p v-if="file.sourceUrl" class="ins-note">Esta mídia vem de <strong>{{ host }}</strong>. Sem internet ela não carrega, e o servidor pode bloquear a reprodução.</p>
      <div class="ins-actions">
        <button v-if="!file.sourceUrl" type="button" class="vw-btn wide" data-testid="download-original" @click="emit('action', 'download')"><VIcon name="download" /> Baixar o original</button>
        <a v-else class="vw-btn wide" :href="file.sourceUrl" rel="noopener noreferrer" target="_blank" data-testid="viewer-open-original-link"><VIcon name="external" /> Abrir endereço original</a>
        <button type="button" class="vw-btn wide" :disabled="!canPrint" data-testid="print-file" @click="emit('action', 'print')"><VIcon name="print" /> Imprimir</button>
        <button type="button" class="vw-btn wide" data-testid="props-fullscreen" @click="emit('action', 'fullscreen')"><VIcon name="fullscreen" /> Tela cheia</button>
        <button v-if="file.kind === 'pdf'" type="button" class="vw-btn wide" data-testid="open-in-pdf" @click="emit('action', 'open-pdf')"><VIcon name="pdf" /> Abrir uma cópia no Editor PDF</button>
        <button v-if="canOpenInCode" type="button" class="vw-btn wide" data-testid="open-in-code-props" @click="emit('action', 'open-code')"><VIcon name="code" /> Abrir uma cópia no Código</button>
        <button type="button" class="vw-btn wide danger" data-testid="remove-file" @click="emit('action', 'remove')"><VIcon name="trash" /> Remover do projeto</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ins { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--st-bg2); color: var(--st-fg); border-left: 1px solid var(--st-line); }
.ins-head { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 2px 14px; }
.ins-title { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: .02em; }
.ins-empty { display: grid; justify-items: center; gap: 6px; padding: 30px 16px; text-align: center; color: var(--st-mut); font-size: 13.5px; }
.ins-empty p { margin: 0; }
.ins-body { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 8px 14px calc(16px + var(--sa-b)); display: grid; gap: 14px; align-content: start; }
.ins-id { display: flex; align-items: center; gap: 10px; }
.ins-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--st-bg); border: 1px solid var(--st-line); color: var(--app); }
.ins-kind { font-weight: 800; font-size: 15px; }
.ins-name { display: grid; gap: 4px; }
.ins-lbl { font-size: 12.5px; font-weight: 700; color: var(--st-mut); }
.ins-row { display: flex; gap: 4px; }
.ins-in { flex: 1 1 auto; min-width: 0; min-height: 44px; padding: 0 10px; border: 1px solid var(--st-line); border-radius: 12px; background: var(--st-bg); color: var(--st-fg); font: inherit; font-size: 14px; }
.ins-in:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.ins-in[aria-invalid="true"] { border-color: var(--st-bad); }
.ins-err { margin: 0; color: var(--st-bad); font-size: 12.5px; }
.ins-hint { margin: 0; color: var(--st-mut); font-size: 12px; }
.ins-list { margin: 0; display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: 6px 12px; font-size: 13px; }
.ins-list dt { color: var(--st-mut); }
.ins-list dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.ins-url { font-weight: 500; font-size: 12px; }
.ins-note { margin: 0; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--st-warn) 14%, transparent); color: var(--st-warn); font-size: 12.5px; line-height: 1.45; }
.ins-actions { display: grid; gap: 6px; }
.vw-btn.wide { justify-content: flex-start; border-color: var(--st-line); background: var(--st-bg); width: 100%; }
.vw-btn.wide:hover:not(:disabled) { background: var(--st-hover); }
.vw-btn.danger { color: var(--st-bad); }
</style>
