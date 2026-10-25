<script setup lang="ts">
defineProps<{ title: string; eyebrow?: string; lead?: string; logo?: string; compact?: boolean }>();
</script>

<template>
  <header class="ph" :class="{ compact }">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <h1 id="page-title" tabindex="-1"><img v-if="logo" :src="logo" alt="" width="40" height="40" class="logo" draggable="false" />{{ title }}</h1>
    <p v-if="lead" class="lead">{{ lead }}</p>
    <div v-if="$slots.default" class="extra"><slot /></div>
  </header>
</template>

<style scoped>
.ph { margin-bottom: 28px; }
.eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
h1 { font-size: clamp(28px, 3.2vw, 40px); line-height: 1.1; letter-spacing: -.035em; font-weight: 780; margin-bottom: 10px; }
.logo { display: inline-block; width: 40px; height: 40px; margin-right: 12px; vertical-align: -9px; border-radius: 10px; }
.lead { color: var(--muted); max-width: 64ch; font-size: 16px; line-height: 1.6; margin-bottom: 0; }
.extra { margin-top: 18px; }
.compact { margin-bottom: 14px; }
.compact h1 { font-size: clamp(22px, 2.4vw, 28px); margin-bottom: 4px; }
.compact .logo { width: 30px; height: 30px; margin-right: 10px; vertical-align: -6px; }
.compact .extra { margin-top: 12px; }
</style>
