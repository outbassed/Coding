<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore, type Motion, type Theme } from '../../stores/settings';
import { readView, writeView, type ViewMode } from '../../library/view';

const emit = defineEmits<{ announce: [text: string] }>();
const settings = useSettingsStore();
const themes: { id: Theme; label: string }[] = [{ id: 'auto', label: 'Automático' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Escuro' }];
const motions: { id: Motion; label: string }[] = [{ id: 'system', label: 'Seguir o aparelho' }, { id: 'reduce', label: 'Reduzir sempre' }];
const view = ref<ViewMode>(readView());
function setView(mode: ViewMode): void { view.value = mode; writeView(mode); emit('announce', 'Biblioteca abrirá em ' + (mode === 'grid' ? 'grade' : 'lista') + '.'); }
</script>

<template>
  <section class="card" aria-labelledby="tema">
    <h2 id="tema">Aparência</h2>
    <p class="muted">Automático segue o tema do seu aparelho.</p>
    <div class="opts" role="group" aria-label="Tema">
      <button v-for="item in themes" :key="item.id" type="button" class="opt" :aria-pressed="settings.theme === item.id" @click="settings.setTheme(item.id)">{{ item.label }}</button>
    </div>
    <h3>Animações</h3>
    <div class="opts" role="group" aria-label="Movimento">
      <button v-for="item in motions" :key="item.id" type="button" class="opt" :aria-pressed="settings.motion === item.id" data-testid="motion-option" @click="settings.setMotion(item.id); emit('announce', 'Animações: ' + item.label + '.')">{{ item.label }}</button>
    </div>
    <h3>Biblioteca</h3>
    <div class="opts" role="group" aria-label="Exibição padrão da biblioteca">
      <button type="button" class="opt" :aria-pressed="view === 'grid'" @click="setView('grid')">Grade</button>
      <button type="button" class="opt" :aria-pressed="view === 'list'" @click="setView('list')">Lista</button>
    </div>
  </section>
</template>

<style scoped>
.card { max-width: 720px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
h3 { font-size: 14px; margin: 16px 0 8px; }
.opts { display: flex; flex-wrap: wrap; gap: 8px; }
.opt { min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-weight: 650; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 -3px var(--accent); }
</style>
