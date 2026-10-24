<script setup lang="ts">
import NavIcon from '../ui/NavIcon.vue';

export type SheetSnap = 'compact' | 'half' | 'full';
const props = defineProps<{ title: string; snap: SheetSnap }>();
const emit = defineEmits<{ 'update:snap': [snap: SheetSnap]; close: [] }>();
const order: SheetSnap[] = ['compact', 'half', 'full'];
const names: Record<SheetSnap, string> = { compact: 'pequena', half: 'média', full: 'grande' };

let pointerStartY: number | null = null;
function dragStart(event: PointerEvent): void {
  if (event.button !== 0) return;
  pointerStartY = event.clientY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}
function dragEnd(event: PointerEvent): void {
  if (pointerStartY === null) return;
  const delta = pointerStartY - event.clientY;
  pointerStartY = null;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  if (Math.abs(delta) < 38) return;
  const i = order.indexOf(props.snap);
  emit('update:snap', order[Math.max(0, Math.min(order.length - 1, i + (delta > 0 ? 1 : -1)))]!);
}
function dragKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const i = order.indexOf(props.snap);
  emit('update:snap', order[Math.max(0, Math.min(order.length - 1, i + (event.key === 'ArrowUp' ? 1 : -1)))]!);
}
function cycle(): void {
  const next = order[(order.indexOf(props.snap) + 1) % order.length];
  if (next) emit('update:snap', next);
}
</script>

<template>
  <section class="sheet" :class="'snap-' + snap" role="region" :aria-label="'Painel de ferramentas: ' + title" data-testid="bottom-sheet" @keydown.esc="emit('close')">
    <header class="head">
      <span class="grip" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="Arrastar para ajustar a altura da gaveta" :aria-valuenow="order.indexOf(snap)" aria-valuemin="0" aria-valuemax="2" :aria-valuetext="names[snap]" @pointerdown="dragStart" @pointerup="dragEnd" @pointercancel="dragEnd" @keydown="dragKey"></span>
      <h2>{{ title }}</h2>
      <button type="button" class="ib" :aria-label="'Alterar altura da gaveta (agora ' + names[snap] + ')'" @click="cycle"><NavIcon :name="snap === 'full' ? 'chevron-down' : 'chevron-up'" /></button>
      <button type="button" class="ib" aria-label="Fechar gaveta" @click="emit('close')"><NavIcon name="close" /></button>
    </header>
    <div class="content"><slot /></div>
  </section>
</template>

<style scoped>
/* Altura limitada para a prévia manter pelo menos 220px. --chrome = barras fixas da tela. */
.sheet { --h: 30dvh; flex: none; display: flex; flex-direction: column; height: var(--h); max-height: calc(100dvh - var(--chrome, 180px) - 220px); background: var(--surface); border-top: 1px solid var(--border); border-radius: 18px 18px 0 0; box-shadow: 0 -8px 24px rgb(0 0 0 / 10%); }
.snap-half { --h: 50dvh; }
.snap-full { --h: 85dvh; }
.head { position: relative; display: flex; align-items: center; gap: 4px; padding: 14px 8px 4px 16px; }
.grip { position: absolute; top: 0; left: 50%; width: 56px; height: 18px; transform: translateX(-50%); z-index: 1; border-radius: 12px; cursor: ns-resize; touch-action: none; }
.grip::after { content: ""; position: absolute; top: 6px; left: 10px; width: 36px; height: 4px; border-radius: 3px; background: var(--border); }
.grip:focus-visible { outline: 3px solid var(--accent); outline-offset: -1px; }
h2 { flex: 1; font-size: 16px; margin: 0; }
.ib { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.ib:hover { background: var(--panel); }
.content { flex: 1; overflow-y: auto; padding: 4px 16px calc(12px + var(--sa-b)); }
</style>
