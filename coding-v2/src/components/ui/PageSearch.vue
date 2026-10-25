<script setup lang="ts">
/** Campo de busca local de uma tela. Nunca navega: só atualiza o valor recebido; o campo não é remontado ao digitar. */
const props = withDefaults(defineProps<{ modelValue: string; label: string; placeholder?: string; inputId: string }>(), { placeholder: 'Buscar…' });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.modelValue) { event.preventDefault(); emit('update:modelValue', ''); }
}
</script>

<template>
  <div class="psearch" role="search">
    <svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
    <input :id="inputId" :value="modelValue" type="search" :aria-label="label" :placeholder="placeholder" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="80" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" @keydown="onKey" />
  </div>
</template>

<style scoped>
.psearch { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 0; height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--muted); }
.psearch:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.ico { flex: none; }
input { flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; outline: none; color: var(--text); font-size: 16px; }
</style>
