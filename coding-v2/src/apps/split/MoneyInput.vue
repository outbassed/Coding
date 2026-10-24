<script setup lang="ts">
import { ref, watch } from 'vue';
import { moneyInput, parseMoney } from './money';

/** Campo de valor em reais (ou porcentagem com 2 casas). O modelo é sempre inteiro (centavos ou centésimos de %). */
const props = withDefaults(defineProps<{ modelValue: number; label: string; id: string; suffix?: string; allowZero?: boolean }>(), { suffix: '', allowZero: true });
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const textValue = ref(moneyInput(props.modelValue));
const invalid = ref(false);
watch(() => props.modelValue, (v) => { if (parseMoney(textValue.value) !== v) textValue.value = moneyInput(v); });
function onInput(): void {
  const v = parseMoney(textValue.value);
  invalid.value = v === null || v < 0 || (!props.allowZero && v === 0);
  if (!invalid.value && v !== null) emit('update:modelValue', v);
}
function onBlur(): void { if (!invalid.value) textValue.value = moneyInput(props.modelValue); }
</script>

<template>
  <span class="money">
    <label class="sr-only" :for="id">{{ label }}</label>
    <input :id="id" v-model="textValue" class="inp" inputmode="decimal" autocomplete="off" :aria-invalid="invalid ? 'true' : undefined" @input="onInput" @blur="onBlur" />
    <span v-if="suffix" class="suffix" aria-hidden="true">{{ suffix }}</span>
  </span>
</template>

<style scoped>
.money { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.money .inp { width: 8.5em; text-align: right; }
.suffix { color: var(--muted); font-weight: 700; }
</style>
