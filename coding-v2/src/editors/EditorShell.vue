<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { getTool, type ToolId } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useResizableSidebar } from '../composables/useResizableSidebar';
import { useVisualViewport } from '../composables/useVisualViewport';
import AppIcon from '../components/ui/AppIcon.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import BottomSheet, { type SheetSnap } from '../components/editor/BottomSheet.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';

export interface ShellDoc {
  state: Ref<{ name: string }>;
  status: Ref<SaveState>;
  error: Ref<string>;
  loadError: Ref<string>;
  note: Ref<string>;
  canUndo: Ref<boolean>;
  canRedo: Ref<boolean>;
  undo(): void; redo(): void; saveNow(): Promise<void>; saveAsCopy(): Promise<void>; reloadSaved(): Promise<void>;
}
export interface ShellTab { id: string; label: string }

/**
 * Padrão Etiquetas: desktop com ferramentas à esquerda e prévia à direita;
 * mobile com prévia acima, BottomSheet ajustável e abas fixas na parte inferior.
 * Só uma instância de cada painel é montada em qualquer breakpoint.
 */
const props = withDefaults(defineProps<{ app: ToolId; doc: ShellDoc; tabs: ShellTab[]; sideLabel?: string; history?: boolean }>(), { sideLabel: '', history: true });
const tab = defineModel<string>('tab', { required: true });
useSettingsStore();
const tool = getTool(props.app);
const wide = useMediaQuery('(min-width: 900px)', true);
const root = ref<HTMLElement | null>(null);
useVisualViewport(() => root.value);
const panelOpen = ref(true);
const desktopToolsOpen = ref(true);
const snap = ref<SheetSnap>('half');
const SIDE = '__side';
const allTabs = computed<ShellTab[]>(() => (!wide.value && props.sideLabel && !!props.sideLabel ? [...props.tabs, { id: SIDE, label: props.sideLabel }] : props.tabs));
const currentTitle = computed(() => allTabs.value.find((t) => t.id === tab.value)?.label ?? 'Ferramentas');
watch(wide, (isWide) => { if (isWide && tab.value === SIDE) tab.value = props.tabs[0]?.id ?? ''; panelOpen.value = true; });
document.title = tool.name + ' · Coding 2.0';

function pick(id: string): void {
  if (!wide.value && tab.value === id) { panelOpen.value = !panelOpen.value; return; }
  tab.value = id; panelOpen.value = true;
}
function onTabKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const list = wide.value ? props.tabs : allTabs.value;
  const index = list.findIndex((t) => t.id === tab.value);
  const next = list[(index + delta + list.length) % list.length];
  if (!next) return;
  tab.value = next.id; panelOpen.value = true;
  requestAnimationFrame(() => document.getElementById('es-tab-' + next.id)?.focus());
}
function focusStage(): void { document.getElementById('es-stage')?.focus(); }
const name = computed({
  get: () => props.doc.state.value.name,
  set: (value: string) => { props.doc.state.value.name = value.slice(0, 250); }
});

const { width: sideWidth, dragging: draggingSide, start: resizeStart, move: resizeMove, end: resizeEnd, keys: resizeKey, reset: resizeReset } = useResizableSidebar(props.app, 356);

</script>

<template>
  <div ref="root" class="es" :class="wide ? 'is-wide' : 'is-narrow'" :data-app="app" :data-layout="wide ? 'wide' : 'narrow'"
    :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark, '--es-sidebar-width': sideWidth + 'px' }">
    <a class="skip-link" href="#es-stage" @click.prevent="focusStage">Pular para o documento</a>
    <header class="es-head">
      <a class="es-back" :href="LAUNCHER_PATH + '#/documentos'" aria-label="Voltar à biblioteca"><NavIcon name="back" /><span class="es-back-t">Biblioteca</span></a>
      <AppIcon :id="app" size="sm" class="es-icon" />
      <div class="es-titles">
        <h1 class="es-app">{{ tool.name }}</h1>
        <label class="sr-only" for="es-name">Nome do documento</label>
        <input id="es-name" v-model="name" class="es-name" maxlength="250" autocomplete="off" data-testid="doc-name" />
      </div>
      <slot name="head" />
      <div v-if="history" class="es-undo" role="group" aria-label="Histórico">
        <button type="button" class="ib" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" :disabled="!doc.canUndo.value" data-testid="undo" @click="doc.undo()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>
        <button type="button" class="ib" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" :disabled="!doc.canRedo.value" data-testid="redo" @click="doc.redo()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
      </div>
      <SaveStatus :state="doc.status.value" class="es-status" />
    </header>

    <div v-if="doc.loadError.value || doc.status.value === 'conflict' || doc.status.value === 'error'" class="es-alerts" role="region" aria-label="Avisos">
      <p v-if="doc.loadError.value" class="es-problem" role="alert" data-testid="load-error">
        {{ doc.loadError.value }} <a :href="LAUNCHER_PATH + '#/documentos'">Voltar à biblioteca</a>
      </p>
      <section v-else-if="doc.status.value === 'conflict'" class="es-problem" role="alert" data-testid="conflict">
        <strong>Este documento mudou em outra janela.</strong> {{ doc.error.value }}
        <span class="es-actions">
          <button type="button" class="btn btn-primary" data-testid="conflict-copy" @click="doc.saveAsCopy()">Salvar como nova cópia</button>
          <button type="button" class="btn" data-testid="conflict-reload" @click="doc.reloadSaved()">Descartar e abrir a versão salva</button>
        </span>
      </section>
      <p v-else-if="doc.status.value === 'error'" class="es-problem" role="alert" data-testid="save-error">
        {{ doc.error.value }} Suas alterações continuam na tela.
        <button type="button" class="btn" @click="doc.saveNow()">Tentar salvar de novo</button>
      </p>
    </div>

    <div v-if="!doc.loadError.value" class="es-workspace" :class="{ 'es-without-sidebar': wide && !desktopToolsOpen }">
      <aside v-if="wide && desktopToolsOpen" class="es-tools" aria-label="Ferramentas" data-testid="editor-sidebar">
        <div class="es-tabs" role="tablist" aria-label="Categorias de ferramentas" data-testid="editor-tabs" @keydown="onTabKey">
          <button v-for="t in tabs" :id="'es-tab-' + t.id" :key="t.id" type="button" role="tab" class="es-tab"
            :aria-selected="tab === t.id" aria-controls="es-panel" :tabindex="tab === t.id ? 0 : -1" @click="pick(t.id)">{{ t.label }}</button>
        </div>
        <div id="es-panel" class="es-panel" role="tabpanel" :aria-labelledby="'es-tab-' + tab" data-testid="editor-panel">
          <slot name="panel" :tab="tab" />
        </div>
        <section v-if="$slots.side" class="es-side" :aria-label="sideLabel || 'Miniaturas e navegação'" data-testid="editor-side">
          <h2 class="es-side-title">{{ sideLabel || 'Navegação' }}</h2>
          <slot name="side" />
        </section>
        <button type="button" class="es-collapse" aria-label="Recolher ferramentas" title="Recolher painel de ferramentas" @click="desktopToolsOpen = false"><NavIcon name="panel" /> Recolher painel</button>
        <div class="es-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Ajustar largura do painel de ferramentas"
          :aria-valuenow="sideWidth" aria-valuemin="296" aria-valuemax="460" :class="{ active: draggingSide }"
          @pointerdown="resizeStart" @pointermove="resizeMove" @pointerup="resizeEnd" @pointercancel="resizeEnd" @dblclick="resizeReset" @keydown="resizeKey" title="Arraste para ajustar; dois cliques para restaurar" />
      </aside>
      <div class="es-canvas">
        <button v-if="wide && !desktopToolsOpen" class="es-reopen btn" type="button" data-testid="reopen-tools" @click="desktopToolsOpen = true">
          <NavIcon name="panel" /> Mostrar ferramentas
        </button>
        <main id="es-stage" class="es-stage" tabindex="0" aria-label="Área de trabalho e prévia" data-testid="editor-stage"><slot /></main>
        <footer v-if="$slots.footer" class="es-footer" aria-label="Controles da prévia"><slot name="footer" /></footer>
      </div>
      <template v-if="!wide">
        <BottomSheet v-if="panelOpen" v-model:snap="snap" class="es-mobile-sheet" :title="currentTitle"
          :style="{ '--chrome': '155px', ...(snap === 'full' ? { maxHeight: 'min(70dvh, calc(var(--vv-h, 100dvh) - 220px))' } : {}) }"
          @close="panelOpen = false">
          <section v-if="tab === SIDE && $slots.side" id="es-panel" role="tabpanel" :aria-labelledby="'es-tab-' + tab" data-testid="editor-panel">
            <slot name="side" />
          </section>
          <div v-else id="es-panel" role="tabpanel" :aria-labelledby="'es-tab-' + tab" data-testid="editor-panel">
            <slot name="panel" :tab="tab" />
          </div>
        </BottomSheet>
        <nav class="es-mobile-nav" aria-label="Ferramentas do editor">
          <div class="es-mobile-tabs" role="tablist" aria-label="Categorias de ferramentas" data-testid="editor-tabs" @keydown="onTabKey">
            <button v-for="t in allTabs" :id="'es-tab-' + t.id" :key="t.id" type="button" class="es-mobile-tab" role="tab"
              :aria-selected="tab === t.id" :aria-expanded="tab === t.id && panelOpen" :tabindex="tab === t.id ? 0 : -1"
              @click="pick(t.id)">{{ t.label }}</button>
          </div>
        </nav>
      </template>
    </div>
    <div class="sr-only" role="status" aria-live="polite" data-testid="editor-status">{{ doc.note.value }}</div>
  </div>
</template>

<style scoped>
.es { display: flex; flex-direction: column; height: 100dvh; background: var(--bg); color: var(--text); overflow: hidden; }
.es-head { flex: none; display: flex; align-items: center; gap: 8px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(12px, var(--sa-r)) 0 max(8px, var(--sa-l)); background: var(--surface); border-bottom: 3px solid var(--app); min-width: 0; }
.es-back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; justify-content: center; padding: 0 8px; border-radius: 12px; color: var(--accent); font-weight: 700; text-decoration: none; flex: none; }
.es-back:hover { background: var(--panel); }
.es-icon { flex: none; }
.es-titles { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.es-app { margin: 0; font-size: 16px; font-weight: 800; line-height: 1.2; color: var(--text); }
.es-name { min-width: 0; width: 100%; max-width: 420px; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 0 3px; margin-left: -3px; font-size: 12px; font-weight: 500; line-height: 1.4; color: var(--muted); text-overflow: ellipsis; }
.es-name:hover { border-color: var(--border); }
.es-name:focus { border-color: var(--accent); outline: 2px solid var(--accent); background: var(--panel); color: var(--text); }
.es-undo { display: inline-flex; flex: none; }
.es-status { flex: none; }
.es-alerts { flex: none; }
.es-problem { margin: 0; padding: 10px max(16px, var(--sa-r)) 10px max(16px, var(--sa-l)); border-bottom: 1px solid var(--danger); background: var(--panel); color: var(--danger); font-weight: 600; display: block; }
.es-problem a { color: var(--accent); text-decoration: underline; }
.es-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.es-workspace { flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: var(--es-sidebar-width, 356px) minmax(0,1fr); }
.es-workspace.es-without-sidebar { grid-template-columns: minmax(0,1fr); }
.es-tools { position: relative; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); }
.es-tabs { display: flex; gap: 0; flex: none; border-bottom: 1px solid var(--border); background: var(--surface); overflow-x: auto; scrollbar-width: thin; }
.es-tab { flex: none; min-height: 48px; padding: 0 12px; border: 0; border-bottom: 3px solid transparent; background: transparent; font-weight: 700; font-size: 12px; color: var(--muted); white-space: nowrap; }
.es-tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--app); }
.es-tab:hover:not([aria-selected="true"]) { background: var(--panel); }
.es-panel { flex: 1; min-height: 0; min-width: 0; overflow: auto; padding: 14px 14px 20px; background: var(--surface); }
.es-side { flex: 0 1 38%; min-height: 90px; overflow: auto; border-top: 1px solid var(--border); padding: 12px 14px; }
.es-side-title { margin: 0 0 8px; font-size: 13px; font-weight: 800; }
.es-collapse { flex: none; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; background: var(--surface); border: 0; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; font-weight: 700; }
.es-collapse:hover { background: var(--panel); color: var(--text); }
.es-resizer { position: absolute; top: 0; right: -5px; bottom: 0; width: 10px; cursor: col-resize; z-index: 5; touch-action: none; }
.es-resizer:hover, .es-resizer.active, .es-resizer:focus-visible { background: color-mix(in srgb, var(--app) 45%, transparent); outline: none; }
.es-canvas { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.es-stage { flex: 1; min-width: 0; min-height: 0; overflow: auto; position: relative; background: var(--bg); }
.es-stage:focus { outline: none; }
.es-stage:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
.es-reopen { position: absolute; z-index: 10; top: 8px; left: 8px; display: flex; align-items: center; gap: 6px; }
.es-footer { flex: none; min-width: 0; background: var(--surface); border-top: 1px solid var(--border); padding: 6px 12px; }
.is-narrow { position: fixed; inset-inline: 0; top: var(--vv-top, 0px); height: var(--vv-h, 100dvh); }
.is-narrow .es-workspace { display: flex; flex-direction: column; min-height: 0; }
.is-narrow .es-canvas { flex: 1; min-height: 0; }
.is-narrow .es-mobile-sheet { flex: none; width: 100%; border-radius: 18px 18px 0 0; }
.is-narrow .es-mobile-nav { flex: none; min-width: 0; background: var(--surface); border-top: 1px solid var(--border); }
.es-mobile-tabs { display: flex; gap: 8px; align-items: center; padding: 8px max(12px, var(--sa-r)) calc(8px + var(--sa-b)) max(12px, var(--sa-l)); overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: thin; }
.es-mobile-tab { flex: none; min-height: 44px; padding: 0 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); font-size: 12px; font-weight: 700; color: var(--text); scroll-snap-align: start; }
.es-mobile-tab[aria-selected="true"]:not([aria-expanded="false"]) { background: var(--app); border-color: var(--app); color: var(--ink); }
@media (max-width: 599px) { .es-back-t { display: none; } .es-head { gap: 4px; } .es-name { font-size: 11px; } }
@media (max-width: 420px) { .es-icon { display: none; } .es-status { white-space: normal; text-align: center; max-width: 96px; font-size: 11px; line-height: 1.2; } }
@media print { .es { display: block; height: auto; position: static; } .es-head, .es-alerts, .es-tools, .es-mobile-nav, .es-mobile-sheet, .es-footer, .es-reopen, .skip-link { display: none !important; } .es-workspace, .es-canvas, .es-stage { display: block !important; height: auto !important; overflow: visible !important; } }
</style>
