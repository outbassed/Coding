<script setup lang="ts">
import { computed, ref } from 'vue';
import { getTool } from './shared/catalog';
import { editorTabs, type EditorToolId } from './editors/model';
import { useSettingsStore } from './stores/settings';
import { useMediaQuery } from './composables/useMediaQuery';
import EditorTopBar from './components/editor/EditorTopBar.vue';
import CommandRibbon from './components/editor/CommandRibbon.vue';
import ToolStrip from './components/editor/ToolStrip.vue';
import BottomSheet, { type SheetSnap } from './components/editor/BottomSheet.vue';
import SideDrawer from './components/editor/SideDrawer.vue';
import SheetCanvas from './components/editor/SheetCanvas.vue';
import ZoomControl from './components/editor/ZoomControl.vue';
import LabelsSheet from './components/editor/LabelsSheet.vue';
import TextSheet from './components/editor/TextSheet.vue';
import SaveStatus from './components/editor/SaveStatus.vue';
import TabInfo from './components/editor/TabInfo.vue';

const props = defineProps<{ appId: EditorToolId }>();
useSettingsStore(); // aplica o tema compartilhado

const tool = computed(() => getTool(props.appId));
const tabs = computed(() => editorTabs[props.appId]);
const wide = useMediaQuery('(min-width: 900px)');
const roomy = useMediaQuery('(min-width: 600px)');

const tabId = ref<string>(editorTabs[props.appId][0]?.id ?? '');
const current = computed(() => tabs.value.find((tab) => tab.id === tabId.value) ?? tabs.value[0]);
const panelOpen = ref(true);
const sheetOpen = ref(false);
const snap = ref<SheetSnap>('half');
const zoom = ref(1);

const showSide = computed(() => roomy.value && wide.value && panelOpen.value);
const showSheet = computed(() => (roomy.value ? !wide.value && panelOpen.value : sheetOpen.value));
const sheetTitle = computed(() => (current.value ? current.value.label : 'Ferramentas'));

function pickFromStrip(id: string): void {
  if (sheetOpen.value && tabId.value === id) { sheetOpen.value = false; return; }
  tabId.value = id;
  sheetOpen.value = true;
}
function togglePanel(): void { panelOpen.value = !panelOpen.value; }
function focusSheet(): void { document.querySelector<HTMLElement>('[data-testid="canvas"]')?.focus(); }
</script>

<template>
  <div class="ed" :style="{ '--app': tool.color, '--app-cx-l': tool.textLight, '--app-cx-d': tool.textDark }" :data-app="appId" :data-layout="roomy ? (wide ? 'wide' : 'tablet') : 'phone'">
    <a class="skip-link" href="#folha" @click.prevent="focusSheet">Pular para a folha</a>
    <EditorTopBar :tool="tool" />
    <CommandRibbon v-if="roomy" v-model="tabId" :tabs="tabs" :panel-open="panelOpen" :show-panel-toggle="true" @toggle-panel="togglePanel" />
    <main class="main" id="folha">
      <div class="col">
        <p class="banner" role="note"><strong class="app-text">Prévia ilustrativa.</strong> Nada aqui edita nem salva documentos; o motor real ainda não foi integrado.</p>
        <div class="stage">
          <SheetCanvas :zoom="zoom" :label="'Folha A4 de exemplo de ' + tool.name">
            <LabelsSheet v-if="appId === 'labels'" />
            <TextSheet v-else />
          </SheetCanvas>
          <div v-if="!roomy" class="float"><ZoomControl v-model="zoom" /></div>
        </div>
      </div>
      <SideDrawer v-if="showSide && current" :title="'Propriedades · ' + current.label" @close="panelOpen = false"><TabInfo :tab="current" /></SideDrawer>
    </main>

    <BottomSheet v-if="showSheet && current" v-model:snap="snap" :title="sheetTitle" :style="{ '--chrome': roomy ? '260px' : '190px' }" @close="roomy ? (panelOpen = false) : (sheetOpen = false)"><TabInfo :tab="current" /></BottomSheet>
    <ToolStrip v-if="!roomy" :tabs="tabs" :active="sheetOpen ? tabId : null" @select="pickFromStrip" />

    <footer v-if="roomy" class="foot">
      <span>Página 1 de 1 · A4</span>
      <SaveStatus state="preview" />
      <ZoomControl v-model="zoom" />
    </footer>
  </div>
</template>

<style scoped>
.ed { height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.banner { margin: 0; padding: 8px max(16px, var(--sa-r)) 8px max(16px, var(--sa-l)); font-size: 13px; color: var(--muted); background: var(--panel); border-bottom: 1px solid var(--border); }
.main { flex: 1; min-height: 0; display: flex; }
.col { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.stage { flex: 1; min-width: 0; min-height: 220px; display: flex; position: relative; }
.float { position: absolute; right: 12px; bottom: 12px; }
.foot { display: flex; align-items: center; gap: 16px; justify-content: space-between; padding: 6px max(16px, var(--sa-r)) calc(6px + var(--sa-b)) max(16px, var(--sa-l)); background: var(--surface); border-top: 1px solid var(--border); font-size: 13px; color: var(--muted); }
@media (max-width: 599px) { .banner { font-size: 12px; padding-block: 6px; } }
</style>
