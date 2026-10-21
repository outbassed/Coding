<script setup lang="ts">
import type { CodingTool } from '../../shared/catalog';
import { useActivation } from '../../composables/useActivation';

defineProps<{ tool: CodingTool; enabled: boolean }>();
const { request } = useActivation();
</script>

<template>
  <button
    v-if="tool.status === 'preview'"
    type="button"
    class="btn"
    :class="enabled ? 'btn-ghost' : 'btn-app'"
    :aria-label="(enabled ? 'Desativar ' : 'Ativar ') + tool.name + ' no Launcher'"
    @click="request(tool.id)"
  >{{ enabled ? 'Desativar' : 'Ativar' }}</button>
</template>
