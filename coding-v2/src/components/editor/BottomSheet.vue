<script setup lang="ts">
import NavIcon from '../ui/NavIcon.vue';

export type SheetSnap = 'compact' | 'half' | 'full';
const props = defineProps<{ title: string; snap: SheetSnap }>();
const emit = defineEmits<{ 'update:snap': [snap: SheetSnap]; close: [] }>();
const order: SheetSnap[] = ['compact', 'half', 'full'];
const names: Record<SheetSnap, string> = { compact: 'pequena', half: 'média', full: 'grande' };

function cycle(): void {
  const next = order[(order.indexOf(props.snap) + 1) % order.length];
  if (next) emit('update:snap', next);
}
</script>

<template>
  <section class="sheet" :class="'snap-' + snap" role="region" :aria-label="title" data-testid="bottom-sheet" @keydown.esc="emit('close')">
    <header class="head">
      <span class="grip" aria-hidden="true"></span>
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
.grip { position: absolute; top: 6px; left: 50%; width: 36px; height: 4px; margin-left: -18px; border-radius: 2px; background: var(--border); }
h2 { flex: 1; font-size: 16px; margin: 0; }
.ib { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.ib:hover { background: var(--panel); }
.content { flex: 1; overflow-y: auto; padding: 4px 16px calc(12px + var(--sa-b)); }
</style>
