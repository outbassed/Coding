<script setup lang="ts">
import { computed } from 'vue';

/**
 * Estados planejados de salvamento. Nesta prévia só 'preview' é usado:
 * nenhum documento é gravado, então "Salvo" nunca pode aparecer.
 */
export type SaveState = 'idle' | 'preview' | 'saving' | 'saved' | 'pending' | 'error' | 'unavailable' | 'new' | 'conflict';
const props = defineProps<{ state: SaveState; compact?: boolean }>();
const labels: Record<SaveState, string> = {
  idle: 'Nenhuma gravação em andamento', preview: 'Prévia · nada é salvo', saving: 'Salvando…', saved: 'Salvo neste aparelho', pending: 'Alterações pendentes',
  error: 'Erro ao salvar', unavailable: 'Armazenamento indisponível', new: 'Novo · ainda não salvo', conflict: 'Conflito · não salvo'
};
const label = computed(() => labels[props.state]);
const shortLabels: Record<SaveState, string> = {
  idle: 'Pronto', preview: 'Prévia', saving: 'Salvando', saved: 'Salvo', pending: 'Pendente',
  error: 'Erro', unavailable: 'Offline', new: 'Novo', conflict: 'Conflito'
};
</script>

<template>
  <span class="save" :class="['s-' + state, { compact }]" :title="label" :aria-label="label" role="status" data-testid="save-status">{{ compact ? shortLabels[state] : label }}</span>
</template>

<style scoped>
.save { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; border: 1px dashed var(--border); background: var(--panel); color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
.save.compact { padding: 4px 7px; font-size: 11px; white-space: nowrap; }
.s-error, .s-unavailable, .s-conflict { color: var(--danger); }
.s-pending { color: var(--warn); }
.s-saved { color: var(--ok); }
</style>
