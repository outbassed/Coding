<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getTool } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useResizableSidebar } from '../composables/useResizableSidebar';
import type { EditorTab } from '../editors/model';
import ProjectTabs from '../editors/ProjectTabs.vue';
import { useProjectTabs } from '../editors/projectTabs';
import { forgetDocument, restoreTarget } from '../workspace/prefs';
import AppIcon from '../components/ui/AppIcon.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import ToolStrip from '../components/editor/ToolStrip.vue';
import BottomSheet, { type SheetSnap } from '../components/editor/BottomSheet.vue';
import LabelsPreview, { type LayoutInfo } from './components/LabelsPreview.vue';
import ItemsPanel from './components/ItemsPanel.vue';
import FormatPanel from './components/FormatPanel.vue';
import PagePanel from './components/PagePanel.vue';
import ExportPanel from './components/ExportPanel.vue';
import BulkDialog from './components/BulkDialog.vue';
import TableImportDialog from './components/TableImportDialog.vue';
import { LABEL_TEMPLATES, stateFromTemplate } from './templates';
import PrintSheets from './components/PrintSheets.vue';
import { downloadBytes, exportSheetsToPdf, pdfFileName } from './raster';
import type { BulkRow } from './bulk';
import { useLabelsEditor } from './useLabelsEditor';
import { MAX_COPIES, PAPER, toInt, type LabelItem, type LabelsState } from './model';

useSettingsStore();
const tool = getTool('labels');
const wide = useMediaQuery('(min-width: 900px)', true);
const roomy = useMediaQuery('(min-width: 600px)', true);
const desktopSide = useResizableSidebar('labels', 380);

const live = ref('');
const announce = (text: string): void => { live.value = ''; void nextTick(() => { live.value = text; }); };

const editor = useLabelsEditor({
  announce,
  onIdentified: (id) => { try { history.replaceState(null, '', location.pathname + '?doc=' + encodeURIComponent(id)); } catch { /* sem URL, segue editando */ } }
});
const { state } = editor;

const tabs: EditorTab[] = [
  { id: 'itens', label: 'Itens', blurb: '', groups: [] },
  { id: 'formato', label: 'Formato', blurb: '', groups: [] },
  { id: 'pagina', label: 'Página', blurb: '', groups: [] },
  { id: 'modelos', label: 'Modelos', blurb: '', groups: [] },
  { id: 'exportar', label: 'Exportar', blurb: '', groups: [] }
];
const tab = ref('itens');
const sheetOpen = ref(true);
const snap = ref<SheetSnap>('half');
const layout = ref<LayoutInfo>({ pageCount: 1, labelCount: 0, itemCount: 0, rowsOnFirstPage: 0, warning: '' });
const pages = ref<number[][][]>([[]]);
const bulkOpen = ref(false);
const tableOpen = ref(false);
const busy = ref(false);
const progress = ref('');
const exportMessage = ref('');
const exportError = ref('');
const blocked = computed(() => Boolean(layout.value.warning) || layout.value.labelCount === 0);
const itemsRef = ref<InstanceType<typeof ItemsPanel>[] | InstanceType<typeof ItemsPanel> | null>(null);
const showSide = computed(() => roomy.value && wide.value);
const showSheet = computed(() => !showSide.value && sheetOpen.value);

const query = new URLSearchParams(location.search);
const explicitDoc = query.get('doc');
// Sem ?doc, ?modelo ou ?novo o app volta ao último projeto aberto (preferência "Continuar de onde parei").
const restoredDoc = !explicitDoc && !query.has('modelo') && !query.has('novo') ? restoreTarget('labels') : null;
const docId = explicitDoc ?? restoredDoc;

let leaving = false;
const projects = useProjectTabs({
  type: 'labels',
  path: location.pathname,
  currentId: () => editor.copyId.value,
  canLeave: async () => {
    await editor.saveNow();
    const st = editor.saveState.value;
    if (st === 'pending' || st === 'saving' || st === 'error' || st === 'conflict') {
      if (!confirm('Há alterações que podem não ter sido salvas. Sair deste projeto mesmo assim?')) return false;
    }
    leaving = true;
    return true;
  },
  renameCurrent: (name) => { editor.setField('name', name); }
});
// Registra a aba quando o documento ganha id (abrir ou primeira gravação) e acompanha o nome.
watch(() => editor.copyId.value, (id) => { if (id) { projects.register(id, editor.state.value.name.trim() || 'Etiquetas'); void projects.refreshCount(); } });
watch(() => editor.state.value.name, (name) => { const id = editor.copyId.value; if (id && editor.saveState.value === 'saved') projects.retitle(id, name.trim() || 'Etiquetas'); });
watch(() => editor.saveState.value, (st) => { const id = editor.copyId.value; if (id && st === 'saved') projects.retitle(id, editor.state.value.name.trim() || 'Etiquetas'); });
function guardUnload(event: BeforeUnloadEvent): void { if (leaving) event.stopImmediatePropagation(); }
window.addEventListener('beforeunload', guardUnload, true);
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload, true));

onMounted(async () => {
  if (!docId) { editor.startNew(stateFromTemplate(query.get('modelo')) ?? undefined); return; }
  await editor.load(docId);
  if (!editor.loadError.value) {
    if (restoredDoc) { try { history.replaceState(null, '', location.pathname + '?doc=' + encodeURIComponent(docId)); } catch { /* sem URL */ } }
    return;
  }
  const lost = editor.loadError.value;
  if (/não existe mais/i.test(lost)) { forgetDocument(docId); projects.reload(); }
  if (restoredDoc && /não existe mais/i.test(lost)) {
    // O último projeto não existe mais: abre um em branco, sem alarme.
    editor.loadError.value = '';
    editor.startNew();
    try { history.replaceState(null, '', location.pathname + '?novo=1'); } catch { /* sem URL */ }
    announce('O último projeto não está mais neste aparelho. Abri um projeto novo.');
  }
});

const saveState = computed<SaveState>(() => editor.loadError.value ? 'unavailable' : editor.saveState.value);
const statusDetail = computed(() => {
  if (editor.saveState.value === 'saved' && editor.lastSavedAt.value) return 'Salvo às ' + new Date(editor.lastSavedAt.value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return '';
});

function field(name: keyof LabelsState, value: LabelsState[keyof LabelsState]): void { editor.setField(name, value as never); }
function focusNew(id: string | null): void {
  if (!id) return;
  const panel = Array.isArray(itemsRef.value) ? itemsRef.value[0] : itemsRef.value;
  void panel?.focusCode(id);
}
function pickTab(id: string): void {
  if (sheetOpen.value && tab.value === id && !showSide.value) { sheetOpen.value = false; return; }
  tab.value = id; sheetOpen.value = true;
}
function onTabKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const index = tabs.findIndex((t) => t.id === tab.value);
  const next = tabs[(index + delta + tabs.length) % tabs.length];
  if (!next) return;
  tab.value = next.id;
  requestAnimationFrame(() => document.getElementById('tab-' + next.id)?.focus());
}
function applyTable(items: LabelItem[], replace: boolean): void {
  editor.addMany(items.map((it, i) => ({ line: i + 1, code: it.code, description: it.description, copies: it.copies, notes: [] })), replace);
  tableOpen.value = false;
  tab.value = 'itens';
}
function applyBulk(rows: BulkRow[], replace: boolean): void {
  editor.addMany(rows, replace);
  bulkOpen.value = false;
  tab.value = 'itens';
}
/** Espera a prévia terminar de medir e de desenhar as folhas antes de imprimir ou exportar. */
async function settled(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await nextTick();
}
async function printSheets(): Promise<void> {
  exportError.value = ''; exportMessage.value = '';
  if (blocked.value) { announce(layout.value.warning || 'Preencha ao menos um item para imprimir.'); return; }
  await settled();
  window.print();
}
async function downloadPdf(): Promise<void> {
  exportError.value = ''; exportMessage.value = '';
  if (blocked.value) { announce(layout.value.warning || 'Preencha ao menos um item para exportar.'); return; }
  busy.value = true;
  try {
    await settled();
    const sheets = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="print-sheet"]'));
    const paper = PAPER[state.value.orientation];
    const result = await exportSheetsToPdf(sheets, paper.w, paper.h, state.value.name.trim() || 'Etiquetas', (done, total) => { progress.value = done < total ? 'Gerando folha ' + (done + 1) + ' de ' + total + '…' : ''; });
    downloadBytes(result.bytes, pdfFileName(state.value.name));
    exportMessage.value = 'PDF gerado com ' + result.pages + (result.pages === 1 ? ' folha.' : ' folhas.');
    announce(exportMessage.value);
  } catch (error) {
    exportError.value = (error instanceof Error && error.message ? error.message : 'Não foi possível gerar o PDF.') + ' Use “Imprimir folhas” e escolha “Salvar como PDF”.';
  } finally {
    busy.value = false; progress.value = '';
  }
}
function focusCanvas(): void { document.querySelector<HTMLElement>('[data-testid="canvas"]')?.focus(); }
function onKey(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); editor.undo(); }
  else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); editor.redo(); }
  else if (key === 's') { event.preventDefault(); void editor.saveNow(); }
  else if (key === 'p' && !event.shiftKey && !event.altKey) { event.preventDefault(); void printSheets(); }
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
document.title = 'Etiquetas · Coding 2.0';
const copiesChange = (id: string, value: number): void => editor.setItem(id, { copies: toInt(value, 1, 1, MAX_COPIES) });
const title = computed(() => state.value.name.trim() || 'Documento sem título');
</script>

<template>
  <div class="ed" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }" data-app="labels" :data-layout="roomy ? (wide ? 'wide' : 'tablet') : 'phone'">
    <a class="skip-link" href="#folha" @click.prevent="focusCanvas">Pular para a folha</a>
    <header class="bar">
      <a class="back" :href="LAUNCHER_PATH + '#/'" aria-label="Voltar ao início" data-testid="back-home"><NavIcon name="back" /><span class="t">Início</span></a>
      <AppIcon id="labels" size="sm" class="appicon" />
      <div class="titles">
        <h1 class="name">Etiquetas</h1>
        <span class="doc" data-testid="doc-title">{{ title }}</span>
      </div>
      <div class="undo" role="group" aria-label="Histórico">
        <button type="button" class="ib" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" :disabled="!editor.canUndo.value" data-testid="undo" @click="editor.undo()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>
        <button type="button" class="ib" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" :disabled="!editor.canRedo.value" data-testid="redo" @click="editor.redo()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
      </div>
      <SaveStatus :state="saveState" class="status" />
    </header>
    <ProjectTabs v-if="!editor.loadError.value" :projects="projects" :wide="roomy" />

    <div class="live sr-only" role="status" aria-live="polite" data-testid="editor-status">{{ live }}</div>

    <section v-if="editor.saveState.value === 'conflict'" class="conflict" role="alert" aria-labelledby="cf-h" data-testid="conflict">
      <h2 id="cf-h">Este documento mudou em outra janela</h2>
      <p>{{ editor.saveError.value }}</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-primary" data-testid="conflict-copy" @click="editor.saveCopyOfConflict()">Salvar o que digitei como nova cópia</button>
        <button type="button" class="btn" data-testid="conflict-reload" @click="editor.reloadSaved()">Descartar e abrir a versão salva</button>
      </div>
    </section>
    <p v-else-if="editor.saveState.value === 'error'" class="problem" role="alert" data-testid="save-error">
      {{ editor.saveError.value }} Suas alterações continuam na tela.
      <button type="button" class="btn" @click="editor.saveNow()">Tentar salvar de novo</button>
    </p>

    <main id="folha" class="main">
      <p v-if="editor.loadError.value" class="problem load" role="alert" data-testid="load-error">
        {{ editor.loadError.value }} <a :href="LAUNCHER_PATH + '#/documentos'">Voltar à biblioteca</a>
      </p>
      <section v-if="showSide && !editor.loadError.value" class="side" aria-label="Editor de etiquetas" :style="wide ? { width: desktopSide.width.value + 'px' } : {}">
        <div class="tabs" role="tablist" aria-label="Seções do editor" @keydown="onTabKey">
          <button v-for="t in tabs" :id="'tab-' + t.id" :key="t.id" type="button" role="tab" class="tabbtn" :aria-selected="tab === t.id" :aria-controls="'tabpanel'" :tabindex="tab === t.id ? 0 : -1" @click="tab = t.id">{{ t.label }}</button>
        </div>
        <div id="tabpanel" class="panel" role="tabpanel" :aria-labelledby="'tab-' + tab">
          <ItemsPanel v-if="tab === 'itens'" ref="itemsRef" :items="state.items" @code="(id, v) => editor.setItem(id, { code: v })" @description="(id, v) => editor.setItem(id, { description: v })" @copies="copiesChange" @step="editor.stepCopies" @add="focusNew(editor.addItem())" @bulk="bulkOpen = true" @import="tableOpen = true" @duplicate="(id) => focusNew(editor.duplicateItem(id))" @move="editor.moveItem" @remove="editor.removeItem" />
          <FormatPanel v-else-if="tab === 'formato'" :state="state" @field="field" />
          <PagePanel v-else-if="tab === 'pagina'" :state="state" :layout="layout" @field="field" />
          <div v-else-if="tab === 'modelos'" class="tpls" data-testid="templates-panel">
            <h2 class="tpl-h">Aplicar layout a este documento</h2>
            <ul class="tpl-list"><li v-for="t in LABEL_TEMPLATES" :key="t.id"><button type="button" class="tpl-btn" :data-layout="t.id" @click="editor.applyLayout(t.layout)"><strong>{{ t.name }}</strong><span>{{ t.description }}</span></button></li></ul>
            <h2 class="tpl-h">Novo documento a partir de um modelo</h2>
            <ul class="tpl-list"><li v-for="t in LABEL_TEMPLATES" :key="t.id"><a class="tpl-btn" :href="'/apps/etiquetas/?modelo=' + t.id" :data-template="t.id"><strong>{{ t.name }}</strong><span>Com itens de exemplo editáveis</span></a></li></ul>
          </div>
          <ExportPanel v-else :state="state" :layout="layout" :busy="busy" :progress="progress" :message="exportMessage" :error="exportError" @print="printSheets" @pdf="downloadPdf" />
        </div>
        <div v-if="wide" class="desktop-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Ajustar largura do painel de ferramentas" title="Arraste para ajustar; dois cliques para restaurar" :aria-valuenow="desktopSide.width.value" :aria-valuemin="desktopSide.min" :aria-valuemax="desktopSide.max" :class="{ active: desktopSide.dragging.value }" @pointerdown="desktopSide.start" @pointermove="desktopSide.move" @pointerup="desktopSide.end" @pointercancel="desktopSide.end" @dblclick="desktopSide.reset" @keydown="desktopSide.keys" />
      </section>

      <div v-if="!editor.loadError.value" class="stage">
        <LabelsPreview :state="state" :roomy="roomy" @layout="layout = $event" @pages="pages = $event" />
        <p v-if="roomy" class="summary" data-testid="summary">{{ layout.labelCount }} {{ layout.labelCount === 1 ? 'etiqueta' : 'etiquetas' }} · {{ layout.itemCount }} {{ layout.itemCount === 1 ? 'item' : 'itens' }}<template v-if="statusDetail"> · {{ statusDetail }}</template></p>
        <p v-if="layout.warning" class="warn" role="status" data-testid="layout-warning">{{ layout.warning }}</p>
      </div>
    </main>

    <TableImportDialog :open="tableOpen" :current-items="state.items.filter((i) => i.code.trim() || i.description.trim()).length" @close="tableOpen = false" @apply="applyTable" />
    <BulkDialog :open="bulkOpen" :current-items="state.items.filter((i) => i.code.trim() || i.description.trim()).length" @close="bulkOpen = false" @apply="applyBulk" />
    <PrintSheets v-if="!editor.loadError.value" :state="state" :pages="pages" />

    <template v-if="!showSide && !editor.loadError.value">
      <BottomSheet v-if="showSheet" v-model:snap="snap" :title="tabs.find((t) => t.id === tab)?.label ?? 'Editor'" :style="{ '--chrome': '180px', ...(snap === 'full' ? { maxHeight: '85dvh' } : {}) }" @close="sheetOpen = false">
        <ItemsPanel v-if="tab === 'itens'" ref="itemsRef" :items="state.items" @code="(id, v) => editor.setItem(id, { code: v })" @description="(id, v) => editor.setItem(id, { description: v })" @copies="copiesChange" @step="editor.stepCopies" @add="focusNew(editor.addItem())" @bulk="bulkOpen = true" @import="tableOpen = true" @duplicate="(id) => focusNew(editor.duplicateItem(id))" @move="editor.moveItem" @remove="editor.removeItem" />
        <FormatPanel v-else-if="tab === 'formato'" :state="state" @field="field" />
        <PagePanel v-else-if="tab === 'pagina'" :state="state" :layout="layout" @field="field" />
        <div v-else-if="tab === 'modelos'" class="tpls" data-testid="templates-panel">
          <h2 class="tpl-h">Aplicar layout a este documento</h2>
          <ul class="tpl-list"><li v-for="t in LABEL_TEMPLATES" :key="t.id"><button type="button" class="tpl-btn" :data-layout="t.id" @click="editor.applyLayout(t.layout)"><strong>{{ t.name }}</strong><span>{{ t.description }}</span></button></li></ul>
          <h2 class="tpl-h">Novo documento a partir de um modelo</h2>
          <ul class="tpl-list"><li v-for="t in LABEL_TEMPLATES" :key="t.id"><a class="tpl-btn" :href="'/apps/etiquetas/?modelo=' + t.id" :data-template="t.id"><strong>{{ t.name }}</strong><span>Com itens de exemplo editáveis</span></a></li></ul>
        </div>
          <ExportPanel v-else :state="state" :layout="layout" :busy="busy" :progress="progress" :message="exportMessage" :error="exportError" @print="printSheets" @pdf="downloadPdf" />
      </BottomSheet>
      <ToolStrip :tabs="tabs" :active="sheetOpen ? tab : null" @select="pickTab" />
    </template>
  </div>
</template>

<style scoped>
.ed { height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.bar { display: flex; align-items: center; gap: 10px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(12px, var(--sa-r)) 0 max(8px, var(--sa-l)); background: var(--surface); border-bottom: 3px solid var(--app); }
.back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; justify-content: center; padding: 0 8px; border-radius: 12px; color: var(--accent); font-weight: 700; text-decoration: none; }
.back:hover { background: var(--panel); }
.titles { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; flex: 1; }
.name { font-size: 16px; margin: 0; font-weight: 800; }
.doc { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.undo { display: inline-flex; }
.ib { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.ib:hover:not(:disabled) { background: var(--panel); }
.ib:disabled { opacity: .35; }
.load { flex: 1; align-self: flex-start; }
.problem, .conflict { margin: 0; padding: 10px max(16px, var(--sa-r)) 10px max(16px, var(--sa-l)); border-bottom: 1px solid var(--danger); background: var(--panel); color: var(--danger); font-weight: 600; }
.problem a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.bar .status { min-width: 0; }
.conflict h2 { font-size: 16px; margin: 0 0 4px; }
.conflict p { margin: 0 0 8px; }
.cf-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.main { flex: 1; min-height: 0; display: flex; }
.side { width: 380px; position: relative; flex: none; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); min-height: 0; }
.desktop-resizer { position:absolute; top:0; right:-5px; bottom:0; width:10px; z-index:5; cursor:col-resize; touch-action:none; }
.desktop-resizer:hover, .desktop-resizer.active, .desktop-resizer:focus-visible { background:color-mix(in srgb,var(--app) 45%,transparent); outline:none; }
.tabs { display: flex; border-bottom: 1px solid var(--border); }
.tabbtn { flex: 1; min-height: 48px; border: 0; border-bottom: 3px solid transparent; background: transparent; font-weight: 700; color: var(--muted); }
.tabbtn[aria-selected="true"] { color: var(--text); border-bottom-color: var(--app); }
.panel { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.summary { margin: 0; padding: 6px max(16px, var(--sa-r)) 6px max(16px, var(--sa-l)); font-size: 12.5px; color: var(--muted); background: var(--surface); border-top: 1px solid var(--border); }
.warn { margin: 0; padding: 8px max(16px, var(--sa-r)) 8px max(16px, var(--sa-l)); font-size: 13px; background: var(--panel); color: var(--warn); font-weight: 600; border-top: 1px solid var(--border); }
.tpls { display: grid; gap: 10px; }
.tpl-h { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 6px 0 0; }
.tpl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.tpl-btn { width: 100%; box-sizing: border-box; min-height: 56px; display: grid; gap: 2px; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); color: var(--text); text-decoration: none; }
.tpl-btn:hover { border-color: var(--app); }
.tpl-btn span { font-size: 12.5px; color: var(--muted); }
@media (max-width: 420px) { .bar .appicon { display: none; } .bar .status { white-space: normal; text-align: center; max-width: 104px; font-size: 11px; line-height: 1.2; } }
@media (max-width: 599px) { .t { display: none; } .doc { display: none; } .bar { gap: 6px; } }
</style>
