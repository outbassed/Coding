<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import VIcon from './VIcon.vue';
import type { MenuGroup, MenuItem } from './types';

/**
 * Menu de contexto do Visualizador. Os itens vêm prontos de quem o abriu (cada formato e cada região mostram o seu),
 * com ícones SVG, marcas de seleção e atalhos. Navegação por teclado completa; no celular vira uma folha na parte de baixo.
 */
const props = defineProps<{ groups: MenuGroup[]; x: number; y: number; title?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const root = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });
const sheet = ref(false);
const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

const flat = computed<MenuItem[]>(() => props.groups.flatMap((g) => g.items));
const enabled = (): HTMLElement[] => Array.from(root.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);

function place(): void {
  const el = root.value;
  if (!el) return;
  sheet.value = window.matchMedia('(max-width: 599px)').matches;
  if (sheet.value) return;
  const m = 8, w = el.offsetWidth, h = el.offsetHeight;
  const vw = window.visualViewport?.width ?? window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight;
  pos.value = { left: Math.max(m, Math.min(props.x, vw - w - m)), top: Math.max(m, Math.min(props.y, vh - h - m)) };
}
function close(restore = true): void {
  emit('close');
  if (restore) void nextTick(() => opener?.isConnected && opener.focus?.());
}
function run(item: MenuItem): void {
  if (item.disabled) return;
  close(false);
  queueMicrotask(item.run);
}
function onKey(e: KeyboardEvent): void {
  const items = enabled();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const go = (i: number): void => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
  switch (e.key) {
    case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
    case 'Tab': e.preventDefault(); close(); break;
    case 'ArrowDown': go(at + 1); break;
    case 'ArrowUp': go(at < 0 ? -1 : at - 1); break;
    case 'Home': go(0); break;
    case 'End': go(items.length - 1); break;
    default: {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ch = e.key.toLowerCase();
        const next = [...items.slice(at + 1), ...items.slice(0, at + 1)].find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(ch));
        if (next) { e.preventDefault(); next.focus(); }
      }
    }
  }
}
function outside(e: Event): void { if (root.value && !root.value.contains(e.target as Node)) close(false); }
function dismiss(): void { close(false); }
function onScroll(e: Event): void { if (!root.value?.contains(e.target as Node)) close(false); }

onMounted(async () => {
  await nextTick();
  place();
  enabled()[0]?.focus();
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', dismiss);
  window.addEventListener('blur', dismiss);
  document.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('resize', dismiss);
  window.removeEventListener('blur', dismiss);
  document.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <div v-if="sheet" class="vm-scrim" aria-hidden="true"></div>
  <div ref="root" class="vm" :class="{ sheet }" role="menu" :aria-label="title || 'Menu de contexto'" data-testid="viewer-menu" :style="sheet ? undefined : { left: pos.left + 'px', top: pos.top + 'px' }"
    @keydown="onKey" @contextmenu.prevent>
    <p v-if="title" class="vm-title">{{ title }}</p>
    <template v-for="(g, gi) in groups" :key="gi">
      <hr v-if="gi > 0" class="vm-sep" />
      <p v-if="g.title" class="vm-group" role="presentation">{{ g.title }}</p>
      <button v-for="item in g.items" :key="item.id" type="button" class="vm-item" :class="{ danger: item.danger }"
        :role="item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'" :aria-checked="item.checked !== undefined ? item.checked : undefined"
        :aria-disabled="item.disabled ? 'true' : undefined" :tabindex="-1" :data-testid="'menu-' + item.id" @click="run(item)">
        <span class="vm-ic" aria-hidden="true"><VIcon v-if="item.icon" :name="item.icon" :size="18" /></span>
        <span class="vm-label">{{ item.label }}</span>
        <span v-if="item.checked" class="vm-check" aria-hidden="true"><VIcon name="check" :size="16" /></span>
        <kbd v-else-if="item.shortcut" class="vm-kbd">{{ item.shortcut }}</kbd>
      </button>
    </template>
    <p v-if="!flat.length" class="vm-empty">Nenhuma ação disponível.</p>
  </div>
</template>

<style scoped>
.vm { position: fixed; z-index: 60; min-width: 230px; max-width: min(340px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto; padding: 6px;
  background: #1b2230; color: var(--st-fg); border: 1px solid var(--st-line); border-radius: 14px; box-shadow: 0 18px 50px rgb(0 0 0 / 55%); }
.vm-title { margin: 0; padding: 6px 10px 4px; font-size: 12.5px; font-weight: 800; color: var(--st-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vm-group { margin: 4px 0 0; padding: 6px 10px 2px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--st-mut); }
.vm-sep { border: 0; border-top: 1px solid var(--st-line); margin: 4px 2px; }
.vm-item { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent; color: inherit; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.vm-item:hover:not([aria-disabled="true"]), .vm-item:focus-visible { background: var(--st-hover); outline: none; }
.vm-item:focus-visible { box-shadow: inset 0 0 0 2px var(--app); }
.vm-item[aria-disabled="true"] { opacity: .42; cursor: default; }
.vm-item.danger { color: var(--st-bad); }
.vm-ic { flex: none; width: 20px; display: grid; place-items: center; color: var(--st-mut); }
.danger .vm-ic { color: inherit; }
.vm-label { flex: 1 1 auto; min-width: 0; }
.vm-kbd { flex: none; font: 600 11.5px ui-monospace, Menlo, monospace; color: var(--st-mut); }
.vm-check { flex: none; display: grid; color: var(--app); }
.vm-empty { margin: 0; padding: 12px; color: var(--st-mut); font-size: 13px; }
.vm-scrim { position: fixed; inset: 0; z-index: 59; background: rgb(0 0 0 / 40%); }
.vm.sheet { left: 8px; right: 8px; bottom: calc(8px + var(--sa-b)); top: auto; max-width: none; max-height: 72dvh; border-radius: 18px; }
.vm.sheet .vm-kbd { display: none; }
</style>
