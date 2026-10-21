<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  label: string;
  variant?: 'center' | 'sheet';
  backdropClose?: boolean;
  /** Seletor do elemento que recebe o foco ao abrir. */
  initialFocus?: string;
  /** Para onde devolver o foco ao fechar, quando o elemento original já não existir. */
  fallbackFocus?: () => HTMLElement | null;
}>(), { variant: 'center', backdropClose: false, initialFocus: '[data-autofocus]', fallbackFocus: undefined });
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let origin: HTMLElement | null = null;

watch(() => props.open, async (isOpen) => {
  const el = dialog.value;
  if (!el) return;
  if (isOpen) {
    origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof el.showModal === 'function') { if (!el.open) el.showModal(); } else el.setAttribute('open', '');
    await nextTick();
    const target = el.querySelector<HTMLElement>(props.initialFocus) ?? el.querySelector<HTMLElement>('button, [href], input, select, textarea');
    target?.focus();
  } else {
    if (typeof el.close === 'function') { if (el.open) el.close(); } else el.removeAttribute('open');
    await nextTick();
    const usable = origin && origin !== document.body && origin.isConnected && !origin.closest('dialog:not([open])');
    const back = usable ? origin : (props.fallbackFocus?.() ?? null);
    back?.focus();
    origin = null;
  }
}, { flush: 'post' });
</script>

<template>
  <dialog ref="dialog" class="modal" :class="'v-' + variant" :aria-label="label" @cancel.prevent="emit('close')" @click.self="backdropClose && emit('close')">
    <div v-if="open" class="inner"><slot /></div>
  </dialog>
</template>

<style scoped>
.modal { border: 1px solid var(--border); border-radius: 20px; padding: 0; background: var(--surface); color: var(--text); width: min(520px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); box-shadow: 0 24px 60px rgb(0 0 0 / 35%); overflow: auto; }
.modal::backdrop { background: rgb(8 12 20 / 60%); }
.inner { padding: 20px 22px 22px; }
/* No celular a janela de renomear fica no alto da tela, longe do teclado virtual. */
@media (max-width: 599px) {
  .v-center { margin: calc(8px + env(safe-area-inset-top, 0px)) auto auto; width: calc(100vw - 16px); }
  .v-sheet { margin: auto auto 0; width: 100vw; max-width: 100vw; border-radius: 20px 20px 0 0; border-bottom: 0; max-height: 85dvh; }
  .inner { padding: 16px 16px calc(18px + env(safe-area-inset-bottom, 0px)); }
}
@media (min-width: 600px) and (max-width: 899px) {
  .v-sheet { margin: auto auto 0; width: min(640px, 100vw); border-radius: 20px 20px 0 0; border-bottom: 0; max-height: 85dvh; }
}
@media (min-width: 900px) { .v-sheet { width: min(520px, calc(100vw - 24px)); } }
@media (prefers-reduced-motion: no-preference) {
  .v-sheet[open] { animation: rise .18s ease-out; }
  /* Só transform: animar a opacidade deixaria o contraste do texto abaixo do mínimo durante a entrada. */
  @keyframes rise { from { transform: translateY(24px); } to { transform: none; } }
}
</style>
