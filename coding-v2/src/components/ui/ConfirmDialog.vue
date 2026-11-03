<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);

watch(() => props.open, async (isOpen) => {
  const el = dialog.value;
  if (!el) return;
  if (isOpen) {
    if (typeof el.showModal === 'function') { if (!el.open) el.showModal(); } else el.setAttribute('open', '');
    await nextTick();
    cancelButton.value?.focus();
  } else if (typeof el.close === 'function') { if (el.open) el.close(); } else el.removeAttribute('open');
});
</script>

<template>
  <dialog ref="dialog" class="dlg" aria-labelledby="dlg-title" @cancel.prevent="emit('cancel')" @click.self="emit('cancel')">
    <div class="box">
      <h2 id="dlg-title">{{ title }}</h2>
      <div class="body"><slot /></div>
      <div class="actions">
        <button ref="cancelButton" type="button" class="btn btn-ghost" @click="emit('cancel')">{{ cancelLabel ?? 'Cancelar' }}</button>
        <button type="button" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.dlg { border: 1px solid var(--border); border-radius: 20px; padding: 0; background: var(--surface); color: var(--text); width: min(440px, calc(100vw - 32px)); box-shadow: 0 24px 60px rgb(0 0 0 / 35%); }
.dlg::backdrop { background: rgb(8 12 20 / 60%); }
.box { padding: 24px; }
h2 { font-size: 20px; margin-bottom: 8px; }
.body { color: var(--muted); line-height: 1.6; }
.body :deep(p) { margin-bottom: 0; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 22px; }
@media (max-width: 599px) { .actions .btn { flex: 1 1 100%; } }
</style>
