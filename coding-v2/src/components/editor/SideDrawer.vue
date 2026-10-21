<script setup lang="ts">
import NavIcon from '../ui/NavIcon.vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <section class="drawer" :aria-label="title" data-testid="side-drawer" @keydown.esc="emit('close')">
    <header><h2>{{ title }}</h2><button type="button" class="ib" aria-label="Fechar painel" @click="emit('close')"><NavIcon name="close" /></button></header>
    <div class="content"><slot /></div>
  </section>
</template>

<style scoped>
.drawer { width: 300px; flex: none; display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border); min-height: 0; }
header { display: flex; align-items: center; padding: 8px 8px 0 16px; }
h2 { flex: 1; font-size: 16px; margin: 0; }
.ib { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.ib:hover { background: var(--panel); }
.content { flex: 1; overflow-y: auto; padding: 8px 16px 16px; }
@media (min-width: 1920px) { .drawer { width: 360px; } }
</style>
