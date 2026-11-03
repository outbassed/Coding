<script setup lang="ts">
import { requestPrint } from './print';
/** Botão Imprimir padrão dos aplicativos: abre a janela nativa de impressão com o conteúdo do app (e só ele). */
withDefaults(defineProps<{ label?: string; strong?: boolean }>(), { label: 'Imprimir', strong: false });
</script>

<template>
  <button type="button" class="btn" :class="{ 'btn-app': strong }" data-testid="print-app" title="Ctrl+P" @click="requestPrint()">{{ label }}</button>
</template>
