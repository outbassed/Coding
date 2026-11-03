<script setup lang="ts">
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <div class="empty" data-testid="empty-state">
    <h2>{{ title }}</h2>
    <p v-if="text" class="muted">{{ text }}</p>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty { border: 1px dashed var(--border); background: var(--surface); border-radius: 18px; padding: 36px 24px; }
h2 { font-size: 18px; margin-bottom: 6px; }
p { max-width: 58ch; margin-bottom: 0; }
.actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px; }
</style>
