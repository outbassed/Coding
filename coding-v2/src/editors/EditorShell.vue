<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { getTool, type ToolId } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import { useSettingsStore } from '../stores/settings';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useVisualViewport } from '../composables/useVisualViewport';
import AppIcon from '../components/ui/AppIcon.vue';
import NavIcon from '../components/ui/NavIcon.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';

/** O que a casca precisa do controlador de documento (useDocument). */
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
 * Casca única dos editores 2.0.
 * Computador: barra de comandos no topo (abas como no Word/Docs), documento no centro, painel lateral opcional.
 * Celular: prévia em cima, painel da ferramenta e abas de categoria embaixo (como no CapCut), acima do teclado virtual.
 * O mesmo conteúdo de painel existe uma única vez no DOM; só muda de lugar.
 */
const props = withDefaults(defineProps<{ app: ToolId; doc: ShellDoc; tabs: ShellTab[]; sideLabel?: string; history?: boolean }>(), { sideLabel: '', history: true });
const tab = defineModel<string>('tab', { required: true });
useSettingsStore();
const tool = getTool(props.app);
const wide = useMediaQuery('(min-width: 900px)', true);
const root = ref<HTMLElement | null>(null);
useVisualViewport(() => root.value);
const panelOpen = ref(true);
const SIDE = '__side';
const allTabs = computed<ShellTab[]>(() => (!wide.value && props.sideLabel ? [...props.tabs, { id: SIDE, label: props.sideLabel }] : props.tabs));
watch(wide, (isWide) => { if (isWide && tab.value === SIDE) tab.value = props.tabs[0]?.id ?? ''; panelOpen.value = true; });
const showSide = computed(() => wide.value || (panelOpen.value && tab.value === SIDE));
const showPanel = computed(() => panelOpen.value && tab.value !== SIDE);
document.title = tool.name + ' · Coding 2.0';

function pick(id: string): void {
  if (!wide.value && tab.value === id) { panelOpen.value = !panelOpen.value; return; }
  tab.value = id; panelOpen.value = true;
}
function onTabKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const list = allTabs.value;
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
</script>

<template>
  <div ref="root" class="es" :class="wide ? 'is-wide' : 'is-narrow'" :data-app="app" :data-layout="wide ? 'wide' : 'narrow'"
    :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }">
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

    <template v-if="!doc.loadError.value">
      <section class="es-tools" aria-label="Ferramentas">
        <div class="es-tabs" role="tablist" aria-label="Categorias de ferramentas" data-testid="editor-tabs" @keydown="onTabKey">
          <button v-for="t in allTabs" :id="'es-tab-' + t.id" :key="t.id" type="button" role="tab" class="es-tab"
            :aria-selected="tab === t.id" :aria-expanded="!wide ? (tab === t.id && panelOpen) : undefined" aria-controls="es-panel"
            :tabindex="tab === t.id ? 0 : -1" @click="pick(t.id)">{{ t.label }}</button>
        </div>
        <div v-show="showPanel" id="es-panel" class="es-panel" role="tabpanel" :aria-labelledby="'es-tab-' + tab" data-testid="editor-panel">
          <slot name="panel" :tab="tab" />
        </div>
      </section>
      <main id="es-stage" class="es-stage" tabindex="0" aria-label="Documento" data-testid="editor-stage"><slot /></main>
      <aside v-if="$slots.side" v-show="showSide" class="es-side" :aria-label="sideLabel || 'Painel'" data-testid="editor-side"><slot name="side" /></aside>
    </template>
    <div class="sr-only" role="status" aria-live="polite" data-testid="editor-status">{{ doc.note.value }}</div>
  </div>
</template>

<style scoped>
.es { display: grid; height: 100dvh; background: var(--bg); color: var(--text); overflow: hidden;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  grid-template-areas: "head head" "alerts alerts" "tools tools" "stage side"; }
.es-tools { grid-area: tools; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.es-head { grid-area: head; display: flex; align-items: center; gap: 8px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(12px, var(--sa-r)) 0 max(8px, var(--sa-l)); background: var(--surface); border-bottom: 3px solid var(--app); min-width: 0; }
.es-back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; justify-content: center; padding: 0 8px; border-radius: 12px; color: var(--accent); font-weight: 700; text-decoration: none; flex: none; }
.es-back:hover { background: var(--panel); }
.es-icon { flex: none; }
.es-titles { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.15; }
.es-app { margin: 0; font-size: 12px; font-weight: 800; color: var(--muted); }
.es-name { min-width: 0; width: 100%; max-width: 420px; border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 2px 6px; margin-left: -6px; font-size: 16px; font-weight: 750; color: var(--text); }
.es-name:hover { border-color: var(--border); }
.es-name:focus { border-color: var(--accent); outline: 2px solid var(--accent); background: var(--panel); }
.es-undo { display: inline-flex; flex: none; }
.es-status { flex: none; }
.es-alerts { grid-area: alerts; }
.es-problem { margin: 0; padding: 10px max(16px, var(--sa-r)) 10px max(16px, var(--sa-l)); border-bottom: 1px solid var(--danger); background: var(--panel); color: var(--danger); font-weight: 600; display: block; }
.es-problem a { color: var(--accent); text-decoration: underline; }
.es-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.es-tabs { display: flex; gap: 2px; padding: 0 max(12px, var(--sa-r)) 0 max(12px, var(--sa-l)); background: var(--surface); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: thin; }
.es-tab { flex: none; min-height: 44px; padding: 0 16px; border: 0; border-bottom: 3px solid transparent; background: transparent; font-weight: 700; color: var(--muted); white-space: nowrap; }
.es-tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--app); }
.es-panel { background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px max(16px, var(--sa-r)) 12px max(16px, var(--sa-l)); max-height: 38vh; overflow: auto; min-width: 0; }
.es-stage { grid-area: stage; min-width: 0; min-height: 0; overflow: auto; position: relative; }
.es-stage:focus { outline: none; }
.es-stage:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
.es-side { grid-area: side; width: 320px; min-height: 0; overflow: auto; background: var(--surface); border-left: 1px solid var(--border); padding: 12px 14px 20px; box-sizing: border-box; }
@media (min-width: 1280px) { .es-side { width: 360px; } }
/* Celular / tablet estreito: prévia em cima; painel e abas embaixo; cabe acima do teclado virtual. */
.is-narrow { position: fixed; inset-inline: 0; top: var(--vv-top, 0px); height: var(--vv-h, 100dvh);
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  grid-template-areas: "head" "alerts" "stage" "side" "tools"; }
.is-narrow .es-tools { flex-direction: column-reverse; }
.is-narrow .es-panel { border-bottom: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; max-height: calc(var(--vv-h, 100dvh) * .42); box-shadow: 0 -6px 18px rgb(0 0 0 / 8%); }
.is-narrow .es-side { width: auto; border-left: 0; border-top: 1px solid var(--border); max-height: calc(var(--vv-h, 100dvh) * .42); }
.is-narrow .es-tabs { gap: 8px; padding: 8px max(12px, var(--sa-r)) calc(8px + var(--sa-b)) max(12px, var(--sa-l)); border-bottom: 0; border-top: 1px solid var(--border); scroll-snap-type: x proximity; }
.is-narrow .es-tab { min-height: 44px; padding: 0 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); scroll-snap-align: start; color: var(--text); }
.is-narrow .es-tab[aria-selected="true"] { background: var(--app); border-color: var(--app); color: var(--ink); }
@media (max-width: 599px) { .es-back-t, .es-app { display: none; } .es-head { gap: 4px; } }
@media (max-width: 420px) { .es-icon { display: none; } .es-status { white-space: normal; text-align: center; max-width: 96px; font-size: 11px; line-height: 1.2; } }
@media print { .es { display: block; height: auto; position: static; } .es-head, .es-alerts, .es-tools, .es-side, .skip-link { display: none !important; } .es-stage { overflow: visible; } }
</style>
