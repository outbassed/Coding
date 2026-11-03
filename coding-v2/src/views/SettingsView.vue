<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import OfflineManager from '../components/ui/OfflineManager.vue';
import GeneralPanel from '../components/settings/GeneralPanel.vue';
import AppearancePanel from '../components/settings/AppearancePanel.vue';
import ProjectsPanel from '../components/settings/ProjectsPanel.vue';
import ShortcutsPanel from '../components/settings/ShortcutsPanel.vue';
import AdvancedPanel from '../components/settings/AdvancedPanel.vue';
import AboutPanel from '../components/settings/AboutPanel.vue';
import { neighborTab, parseTab, settingsTabs, type SettingsTab } from '../components/settings/tabs';

/**
 * Ajustes em abas: no computador, categorias à esquerda e só a categoria atual à direita; no celular, um seletor
 * compacto. A aba vai na barra de endereço (`?aba=`), então recarregar ou compartilhar o link volta à mesma categoria.
 */
const route = useRoute();
const router = useRouter();
const tab = computed<SettingsTab>(() => parseTab(route.query.aba));
const status = ref('');
function announce(text: string): void { status.value = ''; requestAnimationFrame(() => { status.value = text; }); }

function select(next: SettingsTab, focusTab = false): void {
  if (next !== tab.value) void router.replace({ name: 'settings', query: { ...route.query, aba: next } });
  if (focusTab) void nextTick(() => document.getElementById('settings-tab-' + next)?.focus());
}
function onKey(event: KeyboardEvent): void {
  const next = neighborTab(tab.value, event.key);
  if (next) { event.preventDefault(); select(next, true); }
}
function onPick(event: Event): void { select(parseTab((event.target as HTMLSelectElement).value)); }
const current = computed(() => settingsTabs.find((t) => t.id === tab.value)!);
</script>

<template>
  <PageHeader compact eyebrow="Preferências" title="Ajustes" logo="/legacy-icons/tools.svg" />
  <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>

  <div class="settings">
    <div class="side">
      <div role="tablist" aria-orientation="vertical" aria-label="Categorias de ajustes" class="tabs" data-testid="settings-tabs" @keydown="onKey">
        <button v-for="t in settingsTabs" :id="'settings-tab-' + t.id" :key="t.id" type="button" role="tab" class="tab" :aria-selected="tab === t.id" :aria-controls="'settings-panel'" :tabindex="tab === t.id ? 0 : -1" :data-testid="'settings-tab-' + t.id" @click="select(t.id)">{{ t.label }}</button>
      </div>
      <label class="picker">
        <span class="sr-only">Categoria de ajustes</span>
        <select :value="tab" aria-label="Categoria de ajustes" data-testid="settings-picker" @change="onPick">
          <option v-for="t in settingsTabs" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
    </div>

    <div id="settings-panel" class="panel" role="tabpanel" :aria-labelledby="'settings-tab-' + tab" :data-tab="tab" data-testid="settings-panel" tabindex="0">
      <h2 class="sr-only">{{ current.label }}</h2>
      <GeneralPanel v-if="tab === 'geral'" />
      <AppearancePanel v-else-if="tab === 'aparencia'" @announce="announce" />
      <ProjectsPanel v-else-if="tab === 'projetos'" @announce="announce" />
      <OfflineManager v-else-if="tab === 'offline'" @announce="announce" />
      <ShortcutsPanel v-else-if="tab === 'atalhos'" />
      <AdvancedPanel v-else-if="tab === 'avancado'" @announce="announce" />
      <AboutPanel v-else />
    </div>
  </div>
</template>

<style scoped>
.settings { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.side { min-width: 0; }
.tabs { display: none; }
.picker { display: block; }
.picker select { width: 100%; min-height: 48px; padding: 0 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font-size: 16px; font-weight: 700; }
.panel { min-width: 0; }
.panel:focus-visible { outline-offset: 4px; }
@media (min-width: 760px) {
  .settings { grid-template-columns: 200px minmax(0, 1fr); gap: 24px; }
  .side { position: sticky; top: calc(76px + var(--sa-t)); }
  .picker { display: none; }
  .tabs { display: grid; gap: 4px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
  .tab { min-height: 44px; padding: 0 14px; text-align: left; border: 0; border-radius: 11px; background: transparent; color: var(--muted); font-weight: 700; }
  .tab:hover { background: var(--panel); color: var(--text); }
  .tab[aria-selected="true"] { color: var(--text); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); box-shadow: inset 3px 0 var(--accent); }
}
</style>
