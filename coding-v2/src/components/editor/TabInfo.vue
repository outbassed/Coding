<script setup lang="ts">
import type { EditorTab } from '../../editors/model';
defineProps<{ tab: EditorTab }>();
</script>

<template>
  <div class="info">
    <p class="blurb">{{ tab.blurb }}</p>
    <section v-for="group in tab.groups" :key="group.label" class="group" :aria-label="group.label">
      <h3>{{ group.label }}</h3>
      <div class="cmds">
        <button v-for="command in group.commands" :key="command.id" type="button" class="cmd" disabled>{{ command.label }}</button>
      </div>
    </section>
    <p class="note"><strong>Previsto, ainda inativo.</strong> Estes comandos ficam ligados quando o motor real for integrado.</p>
  </div>
</template>

<style scoped>
.blurb { color: var(--muted); margin-bottom: 14px; }
.group { margin-bottom: 14px; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
.cmds { display: flex; flex-wrap: wrap; gap: 8px; }
.cmd { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px dashed var(--border); background: transparent; color: var(--muted); font-weight: 600; }
.note { margin: 6px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); font-size: 13px; color: var(--muted); }
.note strong { color: var(--text); }
</style>
