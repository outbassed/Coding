<script setup lang="ts">
defineProps<{ title: string; eyebrow?: string; lead?: string }>();
</script>

<template>
  <header class="ph">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <h1 id="page-title" tabindex="-1">{{ title }}</h1>
    <p v-if="lead" class="lead">{{ lead }}</p>
    <div v-if="$slots.default" class="extra"><slot /></div>
  </header>
</template>

<style scoped>
.ph { margin-bottom: 28px; }
.eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
h1 { font-size: clamp(28px, 3.2vw, 40px); line-height: 1.1; letter-spacing: -.035em; font-weight: 780; margin-bottom: 10px; }
.lead { color: var(--muted); max-width: 64ch; font-size: 16px; line-height: 1.6; margin-bottom: 0; }
.extra { margin-top: 18px; }
</style>
