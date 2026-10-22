<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalDialog from '../../components/library/ModalDialog.vue';
import { parseBulk, type BulkRow } from '../bulk';
import { MAX_BLOCKS, MAX_ITEMS } from '../model';

const props = defineProps<{ open: boolean; currentItems: number }>();
const emit = defineEmits<{ close: []; apply: [rows: BulkRow[], replace: boolean] }>();

const text = ref('');
const confirmReplace = ref(false);
const parsed = computed(() => parseBulk(text.value));
const SHOWN = 40;
const shown = computed(() => parsed.value.rows.slice(0, SHOWN));
const overLimit = computed(() => props.currentItems + parsed.value.rows.length > MAX_ITEMS);
watch(() => props.open, (isOpen) => { if (isOpen) { text.value = ''; confirmReplace.value = false; } });
watch(text, () => { confirmReplace.value = false; });

const rowsCount = computed(() => parsed.value.rows.length);
function append(): void { if (rowsCount.value) emit('apply', parsed.value.rows, false); }
function replace(): void {
  if (!rowsCount.value) return;
  if (props.currentItems > 0 && !confirmReplace.value) { confirmReplace.value = true; return; }
  emit('apply', parsed.value.rows, true);
}
</script>

<template>
  <ModalDialog :open="open" label="Colar lista de itens" variant="sheet" initial-focus="#bulk-text" @close="emit('close')">
    <form class="bulk" data-testid="bulk-dialog" @submit.prevent="append">
      <h2 class="title">Colar lista de itens</h2>
      <p class="muted help">Uma linha por item: <code>código ; descrição ; cópias</code>. Também funciona colando do Excel ou Planilhas (colunas separadas por tab). Descrição e cópias são opcionais.</p>
      <label for="bulk-text" class="lbl">Lista</label>
      <textarea id="bulk-text" v-model="text" rows="6" spellcheck="false" autocomplete="off" placeholder="190847 ; ARVORE NATAL CANADA 240CM ; 4&#10;250311 ; PISCA PISCA 100 LEDS ; 2"></textarea>

      <section class="prev" aria-labelledby="bulk-prev-h" data-testid="bulk-preview">
        <h3 id="bulk-prev-h">Pré-visualização</h3>
        <p v-if="!rowsCount" class="muted" data-testid="bulk-empty">Cole ou digite a lista para ver como ela será importada. Nada muda antes de você confirmar.</p>
        <template v-else>
          <p class="sum" data-testid="bulk-summary"><strong>{{ rowsCount }}</strong> {{ rowsCount === 1 ? 'item' : 'itens' }} · <strong>{{ parsed.totalLabels }}</strong> {{ parsed.totalLabels === 1 ? 'etiqueta' : 'etiquetas' }}<template v-if="parsed.ignored"> · {{ parsed.ignored }} {{ parsed.ignored === 1 ? 'linha vazia ignorada' : 'linhas vazias ignoradas' }}</template></p>
          <p v-if="overLimit" class="warn" role="status" data-testid="bulk-limit">Passa do limite de {{ MAX_ITEMS }} itens: os que não couberem serão deixados de fora ao adicionar.</p>
          <p v-if="parsed.totalLabels > MAX_BLOCKS" class="warn" role="status">São mais de {{ MAX_BLOCKS }} etiquetas no total; reduza as cópias antes de imprimir.</p>
          <div class="scroll" tabindex="0" role="region" aria-label="Itens que serão importados">
            <table>
              <thead><tr><th scope="col">Linha</th><th scope="col">Código</th><th scope="col">Descrição</th><th scope="col">Cópias</th></tr></thead>
              <tbody>
                <tr v-for="row in shown" :key="row.line" :data-testid="'bulk-row'">
                  <td>{{ row.line }}</td>
                  <td class="mono">{{ row.code }}</td>
                  <td>{{ row.description }}<span v-for="n in row.notes" :key="n" class="note"> ({{ n }})</span></td>
                  <td>{{ row.copies }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="rowsCount > SHOWN" class="muted small">e mais {{ rowsCount - SHOWN }} {{ rowsCount - SHOWN === 1 ? 'item' : 'itens' }} no mesmo formato.</p>
        </template>
      </section>

      <p v-if="confirmReplace" class="warn" role="alert" data-testid="bulk-confirm">Isto troca os {{ currentItems }} {{ currentItems === 1 ? 'item atual' : 'itens atuais' }} pela lista colada. Dá para desfazer logo depois.</p>
      <div class="actions">
        <button type="button" class="btn" data-testid="bulk-cancel" @click="emit('close')">Cancelar</button>
        <button type="button" class="btn" data-testid="bulk-replace" :disabled="!rowsCount" @click="replace">{{ confirmReplace ? 'Confirmar substituição' : 'Substituir lista' }}</button>
        <button type="submit" class="btn btn-primary" data-testid="bulk-append" :disabled="!rowsCount">Adicionar à lista</button>
      </div>
    </form>
  </ModalDialog>
</template>

<style scoped>
.bulk { display: grid; gap: 10px; }
.title { margin: 0; font-size: 18px; }
.help { margin: 0; font-size: 13px; }
.lbl { font-size: 12.5px; font-weight: 700; }
textarea { width: 100%; min-height: 120px; padding: 10px 12px; font: inherit; font-size: 16px; font-family: ui-monospace, Menlo, Consolas, monospace; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); resize: vertical; }
textarea:focus, .scroll:focus-visible { outline: 3px solid var(--accent); outline-offset: 1px; }
.prev { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 10px 12px; display: grid; gap: 8px; }
.prev h3 { margin: 0; font-size: 14px; }
.prev p { margin: 0; }
.sum { font-size: 13.5px; }
.warn { font-size: 13px; font-weight: 600; color: var(--warn); }
.small { font-size: 12.5px; }
.scroll { max-height: 220px; overflow: auto; border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
th { position: sticky; top: 0; background: var(--panel); font-size: 12px; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.note { color: var(--warn); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.actions .btn { min-height: 44px; }
@media (max-width: 480px) { .actions { flex-direction: column-reverse; } .actions .btn { width: 100%; } }
</style>
