<script setup lang="ts">
import type { DocTemplate } from './templates';

/** Aba "Arquivo" comum: exportações do app (slot) + novo documento a partir de modelos editáveis. */
defineProps<{ templates: readonly DocTemplate<unknown>[] }>();
const emit = defineEmits<{ new: [id: string] }>();
</script>

<template>
  <div class="file-tab">
    <section class="ed-group" aria-labelledby="ft-export"><h2 id="ft-export">Exportar e imprimir</h2><div class="ed-row"><slot /></div><slot name="after" /></section>
    <section class="ed-group" aria-labelledby="ft-new">
      <h2 id="ft-new">Novo a partir de um modelo</h2>
      <ul class="tpl" data-testid="templates">
        <li v-for="t in templates" :key="t.id">
          <button type="button" class="tpl-btn" :data-template="t.id" @click="emit('new', t.id)"><strong>{{ t.name }}</strong><span>{{ t.description }}</span></button>
        </li>
      </ul>
      <p class="ed-hint">O documento atual continua salvo na biblioteca.</p>
    </section>
  </div>
</template>

<style scoped>
.file-tab { display: grid; gap: 4px; }
.tpl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.tpl-btn { width: 100%; min-height: 56px; display: grid; gap: 2px; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); }
.tpl-btn:hover { border-color: var(--app, var(--accent)); }
.tpl-btn span { font-size: 12.5px; color: var(--muted); }
</style>
