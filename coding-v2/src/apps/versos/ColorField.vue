<script setup lang="ts">
import { ref, watch } from 'vue';
import { normColor } from './model';

/** Seletor de cor + campo hexadecimal (aceita #rgb e #rrggbb; valor inválido volta ao atual). */
const props = defineProps<{ modelValue: string; label: string; testid?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const hex = ref(props.modelValue);
const invalid = ref(false);
watch(() => props.modelValue, (v) => { hex.value = v; invalid.value = false; });

function commit(): void {
  const raw = hex.value.trim();
  const n = normColor(raw.startsWith('#') ? raw : '#' + raw, '');
  if (!n) { invalid.value = true; return; }
  invalid.value = false; hex.value = n;
  if (n !== props.modelValue) emit('update:modelValue', n);
}
</script>

<template>
  <div class="cf ed-field">
    <span class="ed-label">{{ label }}</span>
    <span class="cf-row">
      <input type="color" class="cf-pick" :value="modelValue" :aria-label="label + ' (seletor de cor)'" :data-testid="testid ? testid + '-picker' : undefined" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      <input v-model="hex" type="text" class="inp cf-hex" maxlength="7" spellcheck="false" autocomplete="off" :aria-label="label + ' em hexadecimal'" :aria-invalid="invalid" :data-testid="testid || undefined" @change="commit" @keydown.enter="commit" />
    </span>
    <span v-if="invalid" class="ed-error" role="alert">Use o formato #rrggbb.</span>
  </div>
</template>

<style scoped>
.cf { min-width: 0; }
.cf-row { display: flex; align-items: center; gap: 8px; }
.cf-pick { flex: none; width: 44px; height: 40px; padding: 2px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); cursor: pointer; }
.cf-hex { flex: 1 1 6em; width: 6em; min-height: 40px; padding: 4px 8px; font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
