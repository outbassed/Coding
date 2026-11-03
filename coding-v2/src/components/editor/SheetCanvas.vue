<script setup lang="ts">
defineProps<{ zoom: number; label: string }>();
</script>

<template>
  <div class="canvas" tabindex="0" role="region" :aria-label="label" data-testid="canvas">
    <div class="sheet" :style="{ '--zoom': zoom }" data-testid="sheet"><slot /></div>
  </div>
</template>

<style scoped>
.canvas { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 28px max(16px, var(--sa-r)) 28px max(16px, var(--sa-l)); background: var(--raised); }
/* Folha A4 (210 × 297). cqw faz o conteúdo escalar junto com a folha. */
.sheet { --base: 520px; width: calc(var(--base) * var(--zoom)); aspect-ratio: 210 / 297; margin: 0 auto; container-type: inline-size; background: #fff; color: #161b25; box-shadow: 0 10px 36px rgb(0 0 0 / 18%); }
@media (max-width: 599px) { .canvas { padding: 16px 12px; } .sheet { --base: min(340px, calc(100vw - 24px)); } }
@media (min-width: 1280px) { .sheet { --base: 600px; } }
@media (min-width: 1920px) { .sheet { --base: 720px; } }
</style>
