<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalDialog from '../../components/library/ModalDialog.vue';
import { readTableFile, colName } from '../../shared/files/xlsx';
import { friendlyError } from '../../library/errors';
import { convertRows, guessMapping, type ColumnMap } from '../import';
import { MAX_ITEMS, type LabelItem } from '../model';

/** Importa itens de uma planilha CSV/XLSX com escolha das colunas e validação linha a linha. */
const props = defineProps<{ open: boolean; currentItems: number }>();
const emit = defineEmits<{ close: []; apply: [items: LabelItem[], replace: boolean] }>();
const tables = ref<{ name: string; rows: string[][] }[]>([]);
const sheet = ref(0);
const hasHeader = ref(true);
const map = ref<ColumnMap>({ code: 0, desc: 1, qty: -1 });
const defaultQty = ref(1);
const error = ref('');
const fileName = ref('');
const confirmReplace = ref(false);
const input = ref<HTMLInputElement | null>(null);
watch(() => props.open, (o) => { if (o) { tables.value = []; error.value = ''; fileName.value = ''; confirmReplace.value = false; } });
const rows = computed(() => tables.value[sheet.value]?.rows ?? []);
const width = computed(() => Math.max(0, ...rows.value.slice(0, 50).map((r) => r.length)));
const options = computed(() => [{ v: -1, label: '(não usar)' }, ...Array.from({ length: width.value }, (_, i) => ({ v: i, label: colName(i) + (hasHeader.value && rows.value[0]?.[i] ? ' · ' + rows.value[0][i] : '') }))]);
const result = computed(() => convertRows(rows.value, map.value, { hasHeader: hasHeader.value, defaultQty: Math.max(1, Math.min(500, Math.round(defaultQty.value) || 1)) }));
const overLimit = computed(() => props.currentItems + result.value.items.length > MAX_ITEMS);
async function pick(event: Event): Promise<void> {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0]; el.value = '';
  if (!file) return;
  error.value = '';
  try {
    tables.value = await readTableFile(file);
    fileName.value = file.name; sheet.value = 0;
    autodetect();
  } catch (e) { error.value = 'Não foi possível ler o arquivo: ' + friendlyError(e); tables.value = []; }
}
function autodetect(): void {
  const head = rows.value[0] ?? [];
  hasHeader.value = head.some((h) => /[a-zà-ú]/i.test(h)) && rows.value.length > 1;
  map.value = guessMapping(head, hasHeader.value);
}
watch(sheet, autodetect);
function apply(replace: boolean): void {
  if (!result.value.items.length) return;
  if (replace && props.currentItems > 0 && !confirmReplace.value) { confirmReplace.value = true; return; }
  emit('apply', result.value.items, replace);
}
</script>

<template>
  <ModalDialog :open="open" label="Importar planilha" variant="sheet" initial-focus="#ti-pick" @close="emit('close')">
    <div class="ti" data-testid="table-import">
      <h2>Importar planilha (CSV ou XLSX)</h2>
      <div class="ed-row">
        <button id="ti-pick" type="button" class="btn btn-primary" @click="input?.click()">{{ fileName ? 'Escolher outro arquivo' : 'Escolher arquivo' }}</button>
        <input ref="input" type="file" class="sr-only" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Arquivo CSV ou XLSX" data-testid="table-import-input" @change="pick" />
        <span v-if="fileName" class="muted">{{ fileName }} · {{ rows.length }} linhas</span>
      </div>
      <p v-if="error" class="ed-error" role="alert">{{ error }}</p>
      <template v-if="rows.length">
        <div class="ed-row">
          <label v-if="tables.length > 1" class="ed-field"><span class="ed-label">Aba</span><select v-model.number="sheet" class="inp"><option v-for="(t, i) in tables" :key="i" :value="i">{{ t.name }}</option></select></label>
          <label class="check"><input v-model="hasHeader" type="checkbox" /> Primeira linha é cabeçalho</label>
        </div>
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Coluna do código</span><select v-model.number="map.code" class="inp" data-testid="ti-code"><option v-for="o in options" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Coluna da descrição</span><select v-model.number="map.desc" class="inp" data-testid="ti-desc"><option v-for="o in options" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Coluna da quantidade</span><select v-model.number="map.qty" class="inp" data-testid="ti-qty"><option v-for="o in options" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Quantidade padrão</span><input v-model.number="defaultQty" class="inp inp-num" type="number" min="1" max="500" /></label>
        </div>
        <p class="sum" data-testid="ti-summary"><strong>{{ result.items.length }}</strong> itens · <strong>{{ result.totalLabels }}</strong> etiquetas<template v-if="result.ignored"> · {{ result.ignored }} linha(s) vazia(s)</template><template v-if="result.issues.length"> · {{ result.issues.length }} com problema</template></p>
        <ul v-if="result.issues.length" class="issues"><li v-for="i in result.issues.slice(0, 8)" :key="i.row" class="ed-error">{{ i.message }}</li></ul>
        <div class="prev" role="region" aria-label="Itens que serão importados" tabindex="0">
          <table><thead><tr><th scope="col">Código</th><th scope="col">Descrição</th><th scope="col">Qtd.</th></tr></thead>
            <tbody><tr v-for="it in result.items.slice(0, 30)" :key="it.id"><td>{{ it.code }}</td><td>{{ it.description }}</td><td>{{ it.copies }}</td></tr></tbody></table>
        </div>
        <p v-if="overLimit" class="ed-error">Passa do limite de {{ MAX_ITEMS }} itens: o excedente fica de fora ao acrescentar.</p>
        <p v-if="confirmReplace" class="ed-error" role="alert">Os {{ currentItems }} itens atuais serão trocados. Toque de novo em “Substituir itens” para confirmar.</p>
      </template>
      <div class="ed-row end">
        <button type="button" class="btn" @click="emit('close')">Cancelar</button>
        <button type="button" class="btn" :disabled="!result.items.length" data-testid="ti-replace" @click="apply(true)">Substituir itens</button>
        <button type="button" class="btn btn-primary" :disabled="!result.items.length" data-testid="ti-append" @click="apply(false)">Acrescentar itens</button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.ti { display: grid; gap: 10px; }
.ti h2 { font-size: 18px; margin: 0; }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.sum { margin: 0; }
.issues { margin: 0; padding-left: 18px; }
.prev { max-height: 30vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
.prev table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.prev th, .prev td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: left; overflow-wrap: anywhere; }
.prev th { position: sticky; top: 0; background: var(--panel); }
.end { justify-content: flex-end; }
</style>
