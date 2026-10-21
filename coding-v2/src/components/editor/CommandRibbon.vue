<script setup lang="ts">
import { computed } from 'vue';
import type { EditorTab } from '../../editors/model';
import NavIcon from '../ui/NavIcon.vue';

const props = defineProps<{ tabs: EditorTab[]; modelValue: string; panelOpen: boolean; showPanelToggle: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [id: string]; togglePanel: [] }>();
const current = computed(() => props.tabs.find((tab) => tab.id === props.modelValue) ?? props.tabs[0]);

function onKey(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const index = props.tabs.findIndex((tab) => tab.id === props.modelValue);
  const next = props.tabs[(index + delta + props.tabs.length) % props.tabs.length];
  if (!next) return;
  emit('update:modelValue', next.id);
  requestAnimationFrame(() => document.getElementById('rtab-' + next.id)?.focus());
}
</script>

<template>
  <section class="ribbon" aria-label="Comandos">
    <div class="row">
      <div class="tabs" role="tablist" aria-label="Grupos de comandos" @keydown="onKey">
        <button v-for="tab in tabs" :id="'rtab-' + tab.id" :key="tab.id" type="button" role="tab" class="tab" :aria-selected="tab.id === modelValue" :aria-controls="'rpanel'" :tabindex="tab.id === modelValue ? 0 : -1" @click="emit('update:modelValue', tab.id)">{{ tab.label }}</button>
      </div>
      <button v-if="showPanelToggle" type="button" class="toggle" :aria-expanded="panelOpen" @click="emit('togglePanel')"><NavIcon name="panel" />Propriedades</button>
    </div>
    <div v-if="current" id="rpanel" class="panel" role="tabpanel" :aria-labelledby="'rtab-' + current.id">
      <div v-for="group in current.groups" :key="group.label" class="group">
        <div class="cmds">
          <button v-for="command in group.commands" :key="command.id" type="button" class="cmd" disabled :title="'Previsto: ' + command.label">{{ command.label }}</button>
        </div>
        <span class="glabel">{{ group.label }}</span>
      </div>
      <p class="hint">Comandos previstos · inativos na prévia</p>
    </div>
  </section>
</template>

<style scoped>
.ribbon { background: var(--surface); border-bottom: 1px solid var(--border); }
.row { display: flex; align-items: center; gap: 8px; padding: 0 max(16px, var(--sa-r)) 0 max(12px, var(--sa-l)); }
.tabs { display: flex; gap: 2px; overflow-x: auto; flex: 1; }
.tab { min-height: 44px; padding: 0 16px; border: 0; background: transparent; color: var(--muted); font-weight: 700; border-bottom: 3px solid transparent; white-space: nowrap; }
.tab:hover { color: var(--text); }
.tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--app); }
.toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: transparent; font-weight: 650; }
.toggle[aria-expanded="true"] { background: var(--panel); border-color: var(--app); }
.panel { display: flex; align-items: stretch; gap: 8px; padding: 8px max(16px, var(--sa-r)) 10px max(12px, var(--sa-l)); background: var(--panel); border-top: 1px solid var(--border); overflow-x: auto; }
.group { display: flex; flex-direction: column; gap: 4px; padding-right: 12px; margin-right: 4px; border-right: 1px solid var(--border); }
.cmds { display: flex; gap: 6px; flex-wrap: nowrap; }
.cmd { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px dashed var(--border); background: transparent; color: var(--muted); font-weight: 600; white-space: nowrap; }
.glabel { font-size: 11px; color: var(--muted); text-align: center; }
.hint { margin: 0 0 0 auto; align-self: center; font-size: 12px; color: var(--muted); white-space: nowrap; }
</style>
