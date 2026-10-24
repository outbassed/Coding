<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { readTableFile } from '../../shared/files/xlsx';
import { parseCsv } from '../../shared/files/csv';
import { friendlyError } from '../../library/errors';
import { useMediaQuery } from '../../composables/useMediaQuery';
import LabelsPreview, { type LayoutInfo } from '../../labels/components/LabelsPreview.vue';
import FormatPanel from '../../labels/components/FormatPanel.vue';
import PagePanel from '../../labels/components/PagePanel.vue';
import ExportPanel from '../../labels/components/ExportPanel.vue';
import PrintSheets from '../../labels/components/PrintSheets.vue';
import { createLabelsDocument } from '../../labels/store';
import { downloadBytes, exportSheetsToPdf, pdfFileName } from '../../labels/raster';
import { MAX_BLOCKS, MAX_ITEMS, PAPER, type LabelsState } from '../../labels/model';
import { guessMapping } from '../../labels/import';
import { colName } from '../../shared/files/xlsx';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, sheetLabelsKind, sheetLabelsTemplates, toLabels } from './model';

const doc = useDocument({ kind: sheetLabelsKind, templates: sheetLabelsTemplates, path: '/apps/planilha-etiquetas/' });
const { state } = doc;
const tab = ref('dados');
const tabs = [{ id: 'dados', label: 'Dados' }, { id: 'colunas', label: 'Colunas' }, { id: 'formato', label: 'Formato' }, { id: 'pagina', label: 'Página' }, { id: 'gerar', label: 'Gerar' }, { id: 'arquivo', label: 'Arquivo' }];
const roomy = useMediaQuery('(min-width: 600px)', true);
const generated = computed(() => toLabels(state.value));
const labels = computed(() => generated.value.labels);
const conv = computed(() => generated.value.conv);
const cols = computed(() => Math.max(1, ...state.value.rows.map((r) => r.length)));
const headers = computed(() => Array.from({ length: cols.value }, (_, c) => (state.value.hasHeader ? (state.value.rows[0]?.[c] || 'Coluna ' + colName(c)) : 'Coluna ' + colName(c))));
const layout = ref<LayoutInfo>({ pageCount: 1, labelCount: 0, itemCount: 0, rowsOnFirstPage: 0, warning: '' });
const pages = ref<number[][][]>([[]]);
const shownRows = computed(() => state.value.rows.slice(0, 200));

function field(name: keyof LabelsState, value: LabelsState[keyof LabelsState]): void {
  if (name === 'name' || name === 'items') return;
  (state.value.format as Record<string, unknown>)[name] = value;
}
function setCell(r: number, c: number, value: string): void {
  const row = state.value.rows[r]; if (!row) return;
  while (row.length <= c) row.push('');
  row[c] = value.slice(0, 2000);
}
function addRow(): void { if (state.value.rows.length < MAX_TABLE_ROWS) state.value.rows.push(Array.from({ length: cols.value }, () => '')); void nextTick(() => document.getElementById('t-' + (state.value.rows.length - 1) + '-0')?.focus()); }
function removeRow(r: number): void { if (state.value.rows.length > 1) state.value.rows.splice(r, 1); }
function addCol(): void { if (cols.value >= MAX_TABLE_COLS) return; for (const row of state.value.rows) { while (row.length < cols.value) row.push(''); row.push(''); } if (state.value.hasHeader && state.value.rows[0]) state.value.rows[0][cols.value - 1] = 'Coluna ' + colName(cols.value - 1); }
const fileInput = ref<HTMLInputElement | null>(null);
const fileMessage = ref('');
const sheetsFound = ref<{ name: string; rows: string[][] }[]>([]);
async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  fileMessage.value = '';
  try {
    const tables = await readTableFile(file);
    sheetsFound.value = tables.length > 1 ? tables : [];
    useTable(tables[0]!.rows, file.name + (tables.length > 1 ? ' · ' + tables[0]!.name : ''));
  } catch (e) { fileMessage.value = 'Não foi possível ler o arquivo: ' + friendlyError(e); doc.say(fileMessage.value); }
}
function useTable(rows: string[][], source: string): void {
  const clean = rows.filter((r) => r.some((v) => v.trim() !== '')).slice(0, MAX_TABLE_ROWS).map((r) => r.slice(0, MAX_TABLE_COLS));
  if (!clean.length) { fileMessage.value = 'O arquivo não tem linhas com conteúdo.'; return; }
  state.value.rows = clean;
  const header = clean[0]!;
  const looksHeader = header.some((h) => /[a-zà-ú]/i.test(h)) && clean.length > 1 && !header.every((h) => /^\d+$/.test(h.trim()));
  state.value.hasHeader = looksHeader;
  state.value.map = guessMapping(header, looksHeader);
  state.value.source = source.slice(0, 120);
  fileMessage.value = 'Lidas ' + clean.length + ' linhas de “' + source + '”. Confira as colunas.';
  doc.say(fileMessage.value);
  tab.value = 'colunas';
}
const pasteText = ref('');
function usePaste(): void { if (pasteText.value.trim()) { useTable(parseCsv(pasteText.value), 'Texto colado'); pasteText.value = ''; } }
function pickSheet(event: Event): void { const i = Number((event.target as HTMLSelectElement).value); const t = sheetsFound.value[i]; if (t) useTable(t.rows, t.name); }

const created = ref<{ id: string; name: string } | null>(null);
const createError = ref('');
const busy = ref(false);
const progress = ref('');
const exportMessage = ref('');
const exportError = ref('');
const canGenerate = computed(() => conv.value.items.length > 0 && !conv.value.overBlocks);
async function createDocument(): Promise<void> {
  createError.value = ''; created.value = null;
  if (!canGenerate.value) { createError.value = conv.value.overBlocks ? 'São ' + conv.value.totalLabels + ' etiquetas; o limite de um documento é ' + MAX_BLOCKS + '.' : 'Nenhuma linha válida para gerar etiquetas.'; return; }
  try {
    const record = await createLabelsDocument(labels.value);
    created.value = { id: record.id, name: record.label };
    doc.say('Documento de Etiquetas “' + record.label + '” criado com ' + conv.value.items.length + ' itens.');
  } catch (e) { createError.value = friendlyError(e); }
}
async function settled(): Promise<void> { await nextTick(); await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); await nextTick(); }
async function printSheets(): Promise<void> { if (!canGenerate.value) return; await settled(); window.print(); }
async function downloadPdf(): Promise<void> {
  exportError.value = ''; exportMessage.value = '';
  busy.value = true;
  try {
    await settled();
    const sheets = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="print-sheet"]'));
    const paper = PAPER[labels.value.orientation];
    const result = await exportSheetsToPdf(sheets, paper.w, paper.h, labels.value.name, (done, total) => { progress.value = done < total ? 'Gerando folha ' + (done + 1) + ' de ' + total + '…' : ''; });
    downloadBytes(result.bytes, pdfFileName(labels.value.name));
    exportMessage.value = 'PDF gerado com ' + result.pages + (result.pages === 1 ? ' folha.' : ' folhas.');
    doc.say(exportMessage.value);
  } catch (e) { exportError.value = (e instanceof Error ? e.message : 'Não foi possível gerar o PDF.') + ' Use “Imprimir folhas” e escolha “Salvar como PDF”.'; }
  finally { busy.value = false; progress.value = ''; }
}
const mapOptions = computed(() => [{ v: -1, label: '(não usar)' }, ...headers.value.map((h, i) => ({ v: i, label: colName(i) + ' · ' + h }))]);
</script>

<template>
  <EditorShell v-model:tab="tab" app="sheet-labels" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'dados'" class="data">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="import-table" @click="fileInput?.click()">Importar CSV ou XLSX</button>
          <input ref="fileInput" type="file" class="sr-only" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Escolher planilha CSV ou XLSX" data-testid="table-input" @change="onFile" />
          <label v-if="sheetsFound.length" class="ed-field"><span class="ed-label">Aba do arquivo</span>
            <select class="inp" @change="pickSheet"><option v-for="(t, i) in sheetsFound" :key="i" :value="i">{{ t.name }}</option></select></label>
          <label class="check"><input v-model="state.hasHeader" type="checkbox" data-testid="has-header" /> Primeira linha é cabeçalho</label>
        </div>
        <p v-if="fileMessage" class="ed-hint" role="status" data-testid="file-message">{{ fileMessage }}</p>
        <details class="paste"><summary>Colar dados (copiados do Excel, Planilhas Google ou texto)</summary>
          <label class="sr-only" for="paste-area">Dados colados</label>
          <textarea id="paste-area" v-model="pasteText" class="inp" rows="4" placeholder="Código;Descrição;Quantidade"></textarea>
          <button type="button" class="btn" @click="usePaste">Usar dados colados</button>
        </details>
        <div class="table-wrap">
          <table class="tbl" data-testid="data-table">
            <thead><tr><th scope="col">#</th><th v-for="c in cols" :key="c" scope="col">{{ colName(c - 1) }}</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>
              <tr v-for="(row, r) in shownRows" :key="r" :class="{ head: state.hasHeader && r === 0 }">
                <th scope="row">{{ r + 1 }}</th>
                <td v-for="c in cols" :key="c"><input :id="'t-' + r + '-' + (c - 1)" class="cell" :value="row[c - 1] ?? ''" :aria-label="'Linha ' + (r + 1) + ', coluna ' + colName(c - 1)" @input="setCell(r, c - 1, ($event.target as HTMLInputElement).value)" /></td>
                <td><button type="button" class="ib" :aria-label="'Excluir linha ' + (r + 1)" @click="removeRow(r)">✕</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="state.rows.length > 200" class="ed-hint">Mostrando 200 de {{ state.rows.length }} linhas para edição; todas entram na geração.</p>
        <div class="ed-row"><button type="button" class="btn" data-testid="add-row" @click="addRow">Adicionar linha</button><button type="button" class="btn" @click="addCol">Adicionar coluna</button></div>
      </div>
      <div v-else-if="current === 'colunas'" class="ed-group">
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Código</span><select v-model.number="state.map.code" class="inp" data-testid="map-code"><option v-for="o in mapOptions" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Descrição</span><select v-model.number="state.map.desc" class="inp" data-testid="map-desc"><option v-for="o in mapOptions" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Quantidade</span><select v-model.number="state.map.qty" class="inp" data-testid="map-qty"><option v-for="o in mapOptions" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          <label class="ed-field"><span class="ed-label">Quantidade padrão</span><input v-model.number="state.defaultQty" class="inp inp-num" type="number" min="1" max="500" data-testid="default-qty" /></label>
        </div>
        <p class="ed-hint">Linhas sem código e sem descrição são ignoradas. Quantidade vazia usa a padrão.</p>
      </div>
      <FormatPanel v-else-if="current === 'formato'" :state="labels" @field="field" />
      <PagePanel v-else-if="current === 'pagina'" :state="labels" :layout="layout" @field="field" />
      <div v-else-if="current === 'gerar'" class="ed-group">
        <p class="sum" data-testid="conversion-summary"><strong>{{ conv.items.length }}</strong> itens · <strong>{{ conv.totalLabels }}</strong> etiquetas · {{ layout.pageCount }} folha(s)<template v-if="conv.ignored"> · {{ conv.ignored }} linha(s) vazia(s) ignorada(s)</template></p>
        <ul v-if="conv.issues.length" class="issues" data-testid="issues"><li v-for="i in conv.issues.slice(0, 20)" :key="i.row" class="ed-error">{{ i.message }}</li><li v-if="conv.issues.length > 20" class="ed-error">E mais {{ conv.issues.length - 20 }} linha(s) com problema.</li></ul>
        <p v-if="conv.trimmed" class="ed-error">Só os primeiros {{ MAX_ITEMS }} itens entram em um documento.</p>
        <p v-if="conv.overBlocks" class="ed-error">São {{ conv.totalLabels }} etiquetas; o máximo por documento é {{ MAX_BLOCKS }}. Reduza as quantidades.</p>
        <div class="ed-row"><button type="button" class="btn btn-app" :disabled="!canGenerate" data-testid="create-labels" @click="createDocument">Criar documento de Etiquetas</button></div>
        <p v-if="created" class="ed-ok" role="status" data-testid="created">Criado: “{{ created.name }}”. <a :href="'/apps/etiquetas/?doc=' + encodeURIComponent(created.id)" data-testid="open-created">Abrir em Etiquetas</a></p>
        <p v-if="createError" class="ed-error" role="alert">{{ createError }}</p>
        <ExportPanel :state="labels" :layout="layout" :busy="busy" :progress="progress" :message="exportMessage" :error="exportError" @print="printSheets" @pdf="downloadPdf" />
      </div>
      <FileTab v-else :templates="sheetLabelsTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!canGenerate || busy" @click="downloadPdf">Baixar PDF</button>
        <button type="button" class="btn" :disabled="!canGenerate" @click="printSheets">Imprimir folhas</button>
      </FileTab>
    </template>

    <div class="sl-stage">
      <p v-if="conv.issues.length || !conv.items.length" class="warn" role="status">{{ !conv.items.length ? 'Nenhuma linha válida ainda: confira os dados e as colunas.' : conv.issues.length + ' linha(s) com problema não entram nas etiquetas (veja “Gerar”).' }}</p>
      <LabelsPreview :state="labels" :roomy="roomy" @layout="layout = $event" @pages="pages = $event" />
      <PrintSheets :state="labels" :pages="pages" />
    </div>
  </EditorShell>
</template>

<style scoped>
.data { display: grid; gap: 10px; }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.paste textarea { width: 100%; box-sizing: border-box; margin: 6px 0; font-family: ui-monospace, monospace; }
.paste summary { min-height: 44px; display: flex; align-items: center; font-weight: 700; cursor: pointer; }
.table-wrap { overflow: auto; max-height: 40vh; border: 1px solid var(--border); border-radius: 10px; }
.tbl { border-collapse: collapse; font-size: 14px; min-width: 100%; }
.tbl th, .tbl td { border: 1px solid var(--border); padding: 0; }
.tbl thead th { position: sticky; top: 0; background: var(--panel); font-size: 12px; padding: 4px 8px; z-index: 1; }
.tbl tbody th { background: var(--panel); font-size: 12px; padding: 0 6px; color: var(--muted); }
.tbl tr.head .cell { font-weight: 700; }
.cell { width: 100%; min-width: 120px; min-height: 40px; box-sizing: border-box; border: 0; background: var(--surface); padding: 4px 8px; font: inherit; color: var(--text); }
.cell:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
.sum { margin: 0; }
.issues { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
.sl-stage { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.warn { margin: 0; padding: 8px 16px; background: var(--panel); color: var(--warn); font-weight: 600; border-bottom: 1px solid var(--border); }
</style>
