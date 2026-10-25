<script setup lang="ts">
/* Barra superior do Launcher: só a marca. A busca é local em cada tela (Meus apps, Catálogo, Documentos). */
</script>

<template>
  <header class="top">
    <RouterLink :to="{ name: 'home' }" class="brand" aria-label="Coding Launcher 2.0, ir para o início">
      <img class="mark" src="/legacy-icons/coding.svg" alt="" width="34" height="34" aria-hidden="true" draggable="false" />
      <span class="name"><strong>Coding</strong> Launcher <sup>2.0</sup></span>
    </RouterLink>
    <span class="beta">Prévia técnica</span>
  </header>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(24px, var(--sa-r)) 0 max(24px, var(--sa-l)); background: var(--surface); border-bottom: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; white-space: nowrap; font-size: 17px; letter-spacing: -.02em; min-height: 44px; }
.mark { display: block; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 8px; object-fit: cover; }
.name sup { color: var(--muted); font-size: 11px; }
.beta { border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
@media (max-width: 599px) {
  .top { gap: 10px; padding-inline: max(12px, var(--sa-l)) max(12px, var(--sa-r)); min-height: calc(52px + var(--sa-t)); }
}
</style>
