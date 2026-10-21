<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { formatDate } from '../../library/model';

export type RenameMode = 'edit' | 'conflict' | 'missing';
const props = defineProps<{
  open: boolean;
  mode: RenameMode;
  modelValue: string;
  currentLabel: string;
  currentRevision: number;
  currentUpdatedAt: number;
  error: string;
  busy: boolean;
  fallbackFocus?: () => HTMLElement | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  save: []; cancel: []; refresh: []; saveAsNew: [];
}>();
const label = computed(() => (props.mode === 'edit' ? 'Renomear cópia' : props.mode === 'conflict' ? 'Conflito de nome entre janelas' : 'Cópia não encontrada'));
// Ao passar de "editar" para "conflito"/"ausente" o botão focado some; o foco vai para o título da nova situação.
watch(() => props.mode, async (mode) => {
  if (mode === 'edit') return;
  await nextTick();
  document.querySelector<HTMLElement>('dialog[open] [data-conflict-heading]')?.focus();
});
const focusTarget = computed(() => (props.mode === 'edit' ? '[data-autofocus]' : '[data-conflict-heading]'));
</script>

<template>
  <ModalDialog :open="open" :label="label" :initial-focus="focusTarget" :fallback-focus="fallbackFocus" @close="emit('cancel')">
    <form v-if="mode === 'edit'" @submit.prevent="emit('save')">
      <h2>Renomear cópia</h2>
      <label for="rename-input" class="lbl">Novo nome da cópia</label>
      <input id="rename-input" data-autofocus :value="modelValue" class="field" maxlength="250" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      <p class="err" role="alert" data-testid="rename-error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :aria-busy="busy">Salvar nome</button>
      </div>
    </form>

    <div v-else-if="mode === 'conflict'" data-testid="conflict">
      <h2 tabindex="-1" data-conflict-heading>Esta cópia mudou em outra janela</h2>
      <p class="muted">Para não apagar o trabalho de ninguém, o seu nome <strong>não foi salvo</strong>. Escolha o que fazer:</p>
      <div class="compare">
        <div class="box"><span class="k">O nome que você digitou</span><span class="v" data-testid="conflict-mine">{{ modelValue }}</span></div>
        <div class="box"><span class="k">O nome na outra janela</span><span class="v" data-testid="conflict-theirs">{{ currentLabel }}</span><span class="s">Revisão {{ currentRevision }}, atualizada em {{ formatDate(currentUpdatedAt) }}</span></div>
      </div>
      <p class="err" role="alert" data-testid="rename-error">{{ error }}</p>
      <div class="stack">
        <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancelar e não sobrescrever</button>
        <button type="button" class="btn" @click="emit('refresh')">Atualizar e usar o nome da outra janela</button>
        <button type="button" class="btn btn-primary" :aria-busy="busy" @click="emit('saveAsNew')">Salvar o meu nome como nova cópia</button>
      </div>
    </div>

    <div v-else>
      <h2 tabindex="-1" data-conflict-heading>Esta cópia não existe mais</h2>
      <p class="muted">Outra janela excluiu esta cópia enquanto você a renomeava. O nome que você digitou não foi salvo.</p>
      <div class="actions"><button type="button" class="btn btn-primary" @click="emit('refresh')">Atualizar a lista</button></div>
    </div>
  </ModalDialog>
</template>

<style scoped>
h2 { font-size: 20px; margin-bottom: 10px; }
h2:focus { outline: none; }
.lbl { display: block; font-weight: 700; font-size: 13px; margin-bottom: 6px; }
.field { display: block; width: 100%; min-height: 48px; padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); }
.field:focus { border-color: var(--accent); outline: 3px solid var(--accent); outline-offset: 1px; }
.err { min-height: 1.4em; margin: 8px 0 0; color: var(--danger); font-weight: 600; font-size: 13.5px; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.compare { display: grid; gap: 10px; margin: 14px 0 6px; }
.box { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.k { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.v { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.s { font-size: 12.5px; color: var(--muted); }
.stack { display: grid; gap: 8px; margin-top: 12px; }
@media (max-width: 599px) { .actions .btn { flex: 1 1 100%; } }
</style>
