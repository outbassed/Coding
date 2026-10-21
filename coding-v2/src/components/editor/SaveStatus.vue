<script setup lang="ts">
import { computed } from 'vue';

/**
 * Estados planejados de salvamento. Nesta prévia só 'preview' é usado:
 * nenhum documento é gravado, então "Salvo" nunca pode aparecer.
 */
export type SaveState = 'idle' | 'preview' | 'saving' | 'saved' | 'pending' | 'error' | 'unavailable';
const props = defineProps<{ state: SaveState }>();
const labels: Record<SaveState, string> = {
  idle: 'Nenhuma gravação em andamento', preview: 'Prévia · nada é salvo', saving: 'Salvando…', saved: 'Salvo neste aparelho', pending: 'Alterações pendentes',
  error: 'Erro ao salvar', unavailable: 'Armazenamento indisponível'
};
const label = computed(() => labels[props.state]);
</script>

<template>
  <span class="save" :class="'s-' + state" role="status" data-testid="save-status">{{ label }}</span>
</template>

<style scoped>
.save { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; border: 1px dashed var(--border); background: var(--panel); color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
.s-error, .s-unavailable { color: var(--danger); }
.s-pending { color: var(--warn); }
.s-saved { color: var(--ok); }
</style>
