<script setup lang="ts">
import { computed } from 'vue';
import NavIcon from '../ui/NavIcon.vue';
import { ZOOM_STEPS } from '../../editors/model';

const props = defineProps<{ modelValue: number }>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const index = computed(() => Math.max(0, ZOOM_STEPS.indexOf(props.modelValue)));
const percent = computed(() => Math.round(props.modelValue * 100) + '%');
function step(delta: number): void {
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index.value + delta))];
  if (next !== undefined) emit('update:modelValue', next);
}
</script>

<template>
  <div class="zoom" role="group" aria-label="Zoom da folha">
    <button type="button" class="z" aria-label="Diminuir zoom" :disabled="index === 0" @click="step(-1)"><NavIcon name="minus" /></button>
    <button type="button" class="val" aria-label="Voltar para 100%" @click="emit('update:modelValue', 1)"><span aria-live="polite">{{ percent }}</span></button>
    <button type="button" class="z" aria-label="Aumentar zoom" :disabled="index === ZOOM_STEPS.length - 1" @click="step(1)"><NavIcon name="plus" /></button>
  </div>
</template>

<style scoped>
.zoom { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
.z, .val { min-width: 44px; min-height: 44px; border: 0; background: transparent; display: grid; place-items: center; }
.val { min-width: 60px; font-weight: 700; font-size: 13px; }
.z:hover:not(:disabled), .val:hover { background: var(--panel); }
.z:disabled { opacity: .45; }
</style>
