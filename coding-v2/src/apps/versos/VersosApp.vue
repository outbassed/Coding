<script setup lang="ts">
import { nextTick, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import { useDocument } from '../../editors/useDocument';
import { createVersos } from './controller';
import { versosKind, versosTemplates } from './kind';
import { usedImageIds } from './model';
import PanelFile from './PanelFile.vue';
import PanelScene from './PanelScene.vue';
import PanelStyles from './PanelStyles.vue';
import PanelTexts from './PanelTexts.vue';
import PlayerBar from './PlayerBar.vue';
import SceneList from './SceneList.vue';
import StageView from './StageView.vue';
import TextProps from './TextProps.vue';

/**
 * Versos: composição tipográfica para imagens (letras de música, frases, citações, títulos).
 * Não é editor de vídeo: cada cena é uma imagem independente, a troca de cena é manual e a música (opcional) é só referência.
 */
const doc = useDocument({
  kind: versosKind, templates: versosTemplates, path: '/apps/versos/', withImages: true,
  imagesFor: (state, images) => { const used = usedImageIds(state); return images.filter((i) => used.has(i.id)); }
});
const v = createVersos(doc);
const tab = ref('cena');
const tabs = [{ id: 'cena', label: 'Cena' }, { id: 'textos', label: 'Textos' }, { id: 'estilos', label: 'Estilos' }, { id: 'arquivo', label: 'Arquivo' }];
const fileInput = ref<HTMLInputElement | null>(null);

/** Abre uma aba pelo botão (no celular reabre a gaveta se estiver recolhida), sem alternar se já estiver aberta. */
function openTab(id: string): void {
  const el = document.getElementById('es-tab-' + id);
  if (!el) { tab.value = id; return; }
  const selected = el.getAttribute('aria-selected') === 'true';
  if (!selected || el.getAttribute('aria-expanded') === 'false') el.click();
}
function focusContent(): void {
  const find = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>('[data-testid="text-content"]');
  const el = find();
  if (el) { el.focus(); el.select(); return; }
  openTab('__inspector'); // celular: Propriedades fica numa aba da gaveta
  void nextTick(() => requestAnimationFrame(() => { const e = find(); e?.focus(); e?.select(); }));
}
async function onImportBackground(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await v.importBackground(file);
}
</script>

<template>
  <EditorShell v-model:tab="tab" app="versos" :doc="doc" :tabs="tabs" side-label="Cenas" :start-open="false" :chrome="330">
    <template #head>
      <div class="vs-head" role="group" aria-label="Arquivo">
        <button type="button" class="btn vs-hb vs-wide-only" title="Salvar agora (Ctrl+S)" data-testid="save-now" @click="doc.saveNow()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/></svg>
          <span class="vs-hl">Salvar</span>
        </button>
        <button type="button" class="btn vs-hb vs-wide-only" title="Importar imagem de fundo para esta cena" data-testid="import-bg" @click="fileInput?.click()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>
          <span class="vs-hl">Importar</span>
        </button>
        <input ref="fileInput" type="file" class="sr-only" accept="image/*" aria-label="Importar imagem de fundo" data-testid="header-bg-input" @change="onImportBackground" />
        <button type="button" class="btn btn-app vs-hb" title="Exportar imagens (PNG ou ZIP)" data-testid="open-export" @click="openTab('arquivo')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14"/></svg>
          <span class="vs-hl">Exportar</span>
        </button>
      </div>
    </template>

    <template #panel="{ tab: current }">
      <PanelScene v-if="current === 'cena'" :v="v" />
      <PanelTexts v-else-if="current === 'textos'" :v="v" />
      <PanelStyles v-else-if="current === 'estilos'" :v="v" />
      <PanelFile v-else :v="v" @new="doc.newFrom" />
    </template>

    <template #side><SceneList :v="v" /></template>
    <template #inspector><TextProps :v="v" /></template>

    <StageView :v="v" @edit="focusContent" />
    <p v-if="doc.loading.value" class="vs-loading" role="status" data-testid="versos-loading">Abrindo o projeto…</p>

    <template #footer>
      <div class="vf">
        <div class="vf-nav" role="group" aria-label="Navegar entre cenas">
          <button type="button" class="ib" :disabled="v.sceneIndex === 0" aria-label="Cena anterior" title="Cena anterior (Page Up)" data-testid="scene-prev" @click="v.gotoScene(-1)">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
          </button>
          <span class="vf-pos" role="status" data-testid="scene-position">Cena {{ v.sceneIndex + 1 }} de {{ v.sceneCount }}</span>
          <button type="button" class="ib" :disabled="v.sceneIndex >= v.sceneCount - 1" aria-label="Próxima cena" title="Próxima cena (Page Down)" data-testid="scene-next" @click="v.gotoScene(1)">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          </button>
          <button type="button" class="btn vf-add" data-testid="footer-add-scene" @click="v.addScene()">+ Cena</button>
        </div>
        <PlayerBar @announce="doc.say" />
      </div>
    </template>
  </EditorShell>
</template>

<style scoped>
.vs-head { display: inline-flex; gap: 6px; flex: none; }
.vs-hb { min-height: 40px; padding: 4px 10px; font-size: 13px; }
/* celular: o cabeçalho é estreito; só Exportar fica, e Salvar/Importar continuam em Arquivo e Cena (e o projeto salva sozinho) */
@media (max-width: 899px) { .vs-hl, .vs-wide-only { display: none; } .vs-hb { min-width: 44px; min-height: 44px; padding: 0; } }
.vs-loading { position: absolute; inset: auto 0 12px 0; margin: 0 auto; width: fit-content; padding: 6px 14px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); font-weight: 700; font-size: 13px; box-shadow: var(--shadow); }
.vf { display: grid; gap: 6px; min-width: 0; }
.vf-nav { display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; }
.vf-pos { min-width: 112px; text-align: center; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.vf-add { min-height: 40px; padding: 4px 12px; font-size: 13px; margin-left: 6px; }
@media (max-width: 899px) {
  .vf { gap: 4px; }
  .vf-nav { flex-wrap: nowrap; gap: 4px; justify-content: space-between; }
  .vf-nav > .ib { flex: none; width: 36px; min-width: 36px; height: 36px; min-height: 36px; padding: 0; }
  .vf-pos { flex: 1; min-width: 0; font-size: 12px; }
  .vf-add { flex: none; min-height: 36px; margin-left: 0; padding: 4px 10px; font-size: 12px; }
}

</style>
