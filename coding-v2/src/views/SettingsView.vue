<script setup lang="ts">
import { useSettingsStore, type Theme } from '../stores/settings';
import PageHeader from '../components/ui/PageHeader.vue';

const settings = useSettingsStore();
const themes: { id: Theme; label: string }[] = [{ id: 'auto', label: 'Automático' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Escuro' }];
</script>

<template>
  <PageHeader eyebrow="Preferências" title="Ajustes" logo="/legacy-icons/tools.svg" />
  <section class="card" aria-labelledby="tema">
    <h2 id="tema">Aparência</h2>
    <p class="muted">Automático segue o tema do seu aparelho.</p>
    <div class="opts" role="group" aria-label="Tema">
      <button v-for="item in themes" :key="item.id" type="button" class="opt" :aria-pressed="settings.theme === item.id" @click="settings.setTheme(item.id)">{{ item.label }}</button>
    </div>
  </section>
  <section class="card" aria-labelledby="dados">
    <h2 id="dados">Dados</h2>
    <p class="muted">As preferências desta prévia (apps ativados e tema) ficam guardadas só neste navegador, separadas do banco do Coding atual. Nenhum documento foi migrado.</p>
  </section>
</template>

<style scoped>
.card { max-width: 640px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.opts { display: flex; flex-wrap: wrap; gap: 8px; }
.opt { min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-weight: 650; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 -3px var(--accent); }
</style>
