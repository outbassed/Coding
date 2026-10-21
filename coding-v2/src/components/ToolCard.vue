<script setup lang="ts">
import type { CodingTool } from '../shared/catalog';
import ToolIcon from './ToolIcon.vue';
defineProps<{ tool: CodingTool; enabled: boolean }>();
defineEmits<{ toggle: [id: CodingTool['id']] }>();
</script>
<template>
  <article class="app-card">
    <div class="app-card-header">
      <span class="app-icon" :style="{ '--app-color': tool.color }"><ToolIcon :id="tool.id" /></span>
      <span class="status" :class="tool.shellReady ? enabled ? 'status-on' : '' : 'status-soon'">
        {{ tool.shellReady ? enabled ? 'Ativado' : 'Disponível' : 'Em migração' }}
      </span>
    </div>
    <h3>{{ tool.name }}</h3>
    <p class="muted">{{ tool.description }}</p>
    <div class="card-actions">
      <template v-if="tool.shellReady">
        <a v-if="enabled && tool.path" :href="tool.path" class="btn btn-primary">Ver prévia</a>
        <button type="button" class="btn btn-outline" @click="$emit('toggle', tool.id)">{{ enabled ? 'Desativar' : 'Ativar' }}</button>
      </template>
      <span v-else class="muted tiny">Ainda sem módulo na versão 2.0</span>
    </div>
  </article>
</template>
