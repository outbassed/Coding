<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/**
 * Campo numérico com controle deslizante opcional. Com `live` (padrão) aplica enquanto digita, mas só valores válidos;
 * ao sair do campo corrige para o limite. Com `clamp=false` não corrige: entrega o valor como foi digitado para quem
 * valida mostrar a mensagem (o campo volta ao valor atual).
 */
const props = withDefaults(defineProps<{
  modelValue: number; label: string; min: number; max: number; step?: number; slider?: boolean; unit?: string;
  live?: boolean; clamp?: boolean; testid?: string; display?: (n: number) => string;
}>(), { step: 1, slider: false, unit: '', live: true, clamp: true, testid: '' });
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const round = (n: number): number => Math.round(n * 10000) / 10000;
const text = ref(String(round(props.modelValue)));
watch(() => props.modelValue, (v) => { if (Number(text.value) !== v) text.value = String(round(v)); });

function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  text.value = raw;
  if (!props.live) return;
  const n = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(n) && n >= props.min && n <= props.max) emit('update:modelValue', round(n));
}
function commit(): void {
  const n = Number(text.value);
  if (text.value.trim() === '' || !Number.isFinite(n)) { text.value = String(round(props.modelValue)); return; }
  if (props.clamp) {
    const c = round(Math.min(props.max, Math.max(props.min, n)));
    text.value = String(c);
    if (c !== props.modelValue) emit('update:modelValue', c);
    return;
  }
  emit('update:modelValue', Math.round(n));
  void nextTick(() => { text.value = String(round(props.modelValue)); });
}
function onSlide(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  text.value = String(round(n));
  emit('update:modelValue', round(n));
}
</script>

<template>
  <label class="nf ed-field">
    <span class="ed-label">{{ label }}<template v-if="unit"> ({{ unit }})</template></span>
    <span class="nf-row">
      <input v-if="slider" type="range" class="nf-range" :min="min" :max="max" :step="step" :value="modelValue" :aria-label="label + ' (controle deslizante)'" :data-testid="testid ? testid + '-range' : undefined" @input="onSlide" />
      <input type="number" inputmode="decimal" class="inp nf-num" :min="min" :max="max" :step="step" :value="text" :data-testid="testid || undefined" @input="onInput" @change="commit" @keydown.enter="commit" />
    </span>
  </label>
</template>

<style scoped>
.nf { min-width: 0; }
.nf-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nf-range { flex: 1 1 80px; min-width: 60px; min-height: 44px; accent-color: var(--accent); }
.nf-num { flex: 0 0 5.4em; width: 5.4em; min-height: 40px; padding: 4px 8px; font-size: 14px; }
</style>
