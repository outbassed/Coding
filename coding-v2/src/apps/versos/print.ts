import { ref } from 'vue';

/** O que o Imprimir do Versos leva: a cena aberta (padrão, também no Ctrl+P) ou todas as cenas do projeto. */
export const printScope = ref<'current' | 'all'>('current');
