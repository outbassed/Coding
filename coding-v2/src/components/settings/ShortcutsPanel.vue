<script setup lang="ts">
import { tools } from '../../shared/catalog';
import { shortcutsOf } from '../../shared/contextMenu';
import AppIcon from '../ui/AppIcon.vue';

/** Mesma lista do menu “Atalhos de …” de cada aplicativo (clique direito, Shift+F10 ou ?). Nada é inventado aqui. */
const general = shortcutsOf('launcher');
const perApp = tools.map((t) => ({ tool: t, keys: shortcutsOf(t.id) }));
</script>

<template>
  <section class="card" aria-labelledby="atalhos-h" data-testid="shortcuts-panel">
    <h2 id="atalhos-h">Atalhos do teclado</h2>
    <p class="muted">Em qualquer tela, <kbd>?</kbd> mostra os atalhos daquele aplicativo e <kbd>Shift</kbd>+<kbd>F10</kbd> abre o menu de contexto. Abaixo estão os atalhos de cada aplicativo.</p>
    <h3>Launcher</h3>
    <dl class="keys">
      <div v-for="[description, key] in general" :key="description"><dt>{{ description }}</dt><dd><kbd>{{ key }}</kbd></dd></div>
    </dl>
    <details v-for="row in perApp" :key="row.tool.id" class="app" :data-testid="'shortcuts-' + row.tool.id">
      <summary><AppIcon :id="row.tool.id" size="sm" /><span>{{ row.tool.name }}</span></summary>
      <dl class="keys">
        <div v-for="[description, key] in row.keys" :key="description + key"><dt>{{ description }}</dt><dd><kbd>{{ key }}</kbd></dd></div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.card { max-width: 720px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
h3 { font-size: 14px; margin: 16px 0 6px; }
kbd { font: inherit; font-size: 12.5px; font-weight: 700; padding: 1px 7px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 7px; background: var(--panel); white-space: normal; }
.keys { margin: 0; display: grid; gap: 4px; }
.keys > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; padding: 6px 2px; border-bottom: 1px solid var(--border); }
.keys > div:last-child { border-bottom: 0; }
dt { min-width: 0; overflow-wrap: anywhere; }
dd { margin: 0; }
.app { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 4px; }
.app summary { display: flex; align-items: center; gap: 10px; min-height: 48px; cursor: pointer; font-weight: 700; }
</style>
