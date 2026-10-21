<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { getTool } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import { useMediaQuery } from '../composables/useMediaQuery';
import type { EditorTab } from '../editors/model';
import AppIcon from '../components/ui/AppIcon.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import ToolStrip from '../components/editor/ToolStrip.vue';
import BottomSheet, { type SheetSnap } from '../components/editor/BottomSheet.vue';
import LabelsPreview, { type LayoutInfo } from './components/LabelsPreview.vue';
import ItemsPanel from './components/ItemsPanel.vue';
import FormatPanel from './components/FormatPanel.vue';
import PagePanel from './components/PagePanel.vue';
import { useLabelsEditor } from './useLabelsEditor';
import { MAX_COPIES, toInt, type LabelsState } from './model';

useSettingsStore();
const tool = getTool('labels');
const wide = useMediaQuery('(min-width: 900px)', true);
const roomy = useMediaQuery('(min-width: 600px)', true);

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
  { id: 'pagina', label: 'Página', blurb: '', groups: [] }
];
const tab = ref('itens');
const sheetOpen = ref(true);
const snap = ref<SheetSnap>('half');
const layout = ref<LayoutInfo>({ pageCount: 1, labelCount: 0, itemCount: 0, rowsOnFirstPage: 0, warning: '' });
const itemsRef = ref<InstanceType<typeof ItemsPanel>[] | InstanceType<typeof ItemsPanel> | null>(null);
const showSide = computed(() => roomy.value && wide.value);
const showSheet = computed(() => !showSide.value && sheetOpen.value);

const docId = new URLSearchParams(location.search).get('doc');
onMounted(() => { if (docId) void editor.load(docId); else editor.startNew(); });

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
function focusCanvas(): void { document.querySelector<HTMLElement>('[data-testid="canvas"]')?.focus(); }
function onKey(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); editor.undo(); }
  else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); editor.redo(); }
  else if (key === 's') { event.preventDefault(); void editor.saveNow(); }
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
      <a class="back" :href="LAUNCHER_PATH + '#/documentos'" aria-label="Voltar à biblioteca"><NavIcon name="back" /><span class="t">Biblioteca</span></a>
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
      <section v-if="showSide && !editor.loadError.value" class="side" aria-label="Editor de etiquetas">
        <div class="tabs" role="tablist" aria-label="Seções do editor" @keydown="onTabKey">
          <button v-for="t in tabs" :id="'tab-' + t.id" :key="t.id" type="button" role="tab" class="tabbtn" :aria-selected="tab === t.id" :aria-controls="'tabpanel'" :tabindex="tab === t.id ? 0 : -1" @click="tab = t.id">{{ t.label }}</button>
        </div>
        <div id="tabpanel" class="panel" role="tabpanel" :aria-labelledby="'tab-' + tab">
          <ItemsPanel v-if="tab === 'itens'" ref="itemsRef" :items="state.items" @code="(id, v) => editor.setItem(id, { code: v })" @description="(id, v) => editor.setItem(id, { description: v })" @copies="copiesChange" @step="editor.stepCopies" @add="focusNew(editor.addItem())" @duplicate="(id) => focusNew(editor.duplicateItem(id))" @move="editor.moveItem" @remove="editor.removeItem" />
          <FormatPanel v-else-if="tab === 'formato'" :state="state" @field="field" />
          <PagePanel v-else :state="state" :layout="layout" @field="field" />
        </div>
      </section>

      <div v-if="!editor.loadError.value" class="stage">
        <LabelsPreview :state="state" :roomy="roomy" @layout="layout = $event" />
        <p v-if="roomy" class="summary" data-testid="summary">{{ layout.labelCount }} {{ layout.labelCount === 1 ? 'etiqueta' : 'etiquetas' }} · {{ layout.itemCount }} {{ layout.itemCount === 1 ? 'item' : 'itens' }}<template v-if="statusDetail"> · {{ statusDetail }}</template></p>
        <p v-if="layout.warning" class="warn" role="status" data-testid="layout-warning">{{ layout.warning }}</p>
      </div>
    </main>

    <template v-if="!showSide && !editor.loadError.value">
      <BottomSheet v-if="showSheet" v-model:snap="snap" :title="tabs.find((t) => t.id === tab)?.label ?? 'Editor'" :style="{ '--chrome': '180px', ...(snap === 'full' ? { maxHeight: '85dvh' } : {}) }" @close="sheetOpen = false">
        <ItemsPanel v-if="tab === 'itens'" ref="itemsRef" :items="state.items" @code="(id, v) => editor.setItem(id, { code: v })" @description="(id, v) => editor.setItem(id, { description: v })" @copies="copiesChange" @step="editor.stepCopies" @add="focusNew(editor.addItem())" @duplicate="(id) => focusNew(editor.duplicateItem(id))" @move="editor.moveItem" @remove="editor.removeItem" />
        <FormatPanel v-else-if="tab === 'formato'" :state="state" @field="field" />
        <PagePanel v-else :state="state" :layout="layout" @field="field" />
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
.side { width: 380px; flex: none; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); min-height: 0; }
.tabs { display: flex; border-bottom: 1px solid var(--border); }
.tabbtn { flex: 1; min-height: 48px; border: 0; border-bottom: 3px solid transparent; background: transparent; font-weight: 700; color: var(--muted); }
.tabbtn[aria-selected="true"] { color: var(--text); border-bottom-color: var(--app); }
.panel { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.summary { margin: 0; padding: 6px max(16px, var(--sa-r)) 6px max(16px, var(--sa-l)); font-size: 12.5px; color: var(--muted); background: var(--surface); border-top: 1px solid var(--border); }
.warn { margin: 0; padding: 8px max(16px, var(--sa-r)) 8px max(16px, var(--sa-l)); font-size: 13px; background: var(--panel); color: var(--warn); font-weight: 600; border-top: 1px solid var(--border); }
@media (max-width: 420px) { .bar .appicon { display: none; } .bar .status { white-space: normal; text-align: center; max-width: 104px; font-size: 11px; line-height: 1.2; } }
@media (max-width: 599px) { .t { display: none; } .doc { display: none; } .bar { gap: 6px; } }
</style>
