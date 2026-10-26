<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { categories, type CategoryId } from '../../shared/catalog';
import NavIcon from './NavIcon.vue';

/** Lista suspensa de categorias (botão + listbox): teclado, Esc, clique fora e foco devolvido ao botão. */
const props = defineProps<{ modelValue: CategoryId | 'all'; menuId: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: CategoryId | 'all'] }>();

const options = [{ id: 'all' as const, label: 'Todas' }, ...categories];
const open = ref(false);
const active = ref(0);
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);
const selectedIndex = computed(() => Math.max(0, options.findIndex((o) => o.id === props.modelValue)));
const currentLabel = computed(() => options[selectedIndex.value]!.label);

const listStyle = ref<Record<string, string>>({});
/** No celular a lista ocupa a largura da tela (nunca passa da borda); no computador fica sob o botão. */
function place(): void {
  if (typeof window === 'undefined' || window.innerWidth >= 600 || !button.value) { listStyle.value = {}; return; }
  const rect = button.value.getBoundingClientRect();
  listStyle.value = { position: 'fixed', left: '12px', right: '12px', top: Math.round(rect.bottom + 6) + 'px', width: 'auto', maxWidth: 'none', minWidth: '0' };
}
async function openMenu(): Promise<void> {
  place();
  open.value = true; active.value = selectedIndex.value;
  await nextTick(); list.value?.focus();
}
function closeMenu(returnFocus = true): void { open.value = false; if (returnFocus) void nextTick(() => button.value?.focus()); }
function choose(index: number): void { emit('update:modelValue', options[index]!.id); closeMenu(); }
function onButtonKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); void openMenu(); }
}
function onListKey(event: KeyboardEvent): void {
  const last = options.length - 1;
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); active.value = Math.min(last, active.value + 1); break;
    case 'ArrowUp': event.preventDefault(); active.value = Math.max(0, active.value - 1); break;
    case 'Home': event.preventDefault(); active.value = 0; break;
    case 'End': event.preventDefault(); active.value = last; break;
    case 'Enter': case ' ': event.preventDefault(); choose(active.value); break;
    case 'Escape': event.preventDefault(); closeMenu(); break;
    case 'Tab': closeMenu(false); break;
  }
}
function onOutside(event: Event): void { if (open.value && root.value && !root.value.contains(event.target as Node)) closeMenu(false); }
watch(open, (isOpen) => {
  if (isOpen) { document.addEventListener('pointerdown', onOutside, true); document.addEventListener('focusin', onOutside, true); window.addEventListener('scroll', place, true); window.addEventListener('resize', place); }
  else { document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('focusin', onOutside, true); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); }
});
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('focusin', onOutside, true); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); });
</script>

<template>
  <div ref="root" class="cm">
    <button ref="button" type="button" class="cm-btn" :class="{ on: modelValue !== 'all' }" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="menuId" data-testid="category-button" @click="open ? closeMenu() : openMenu()" @keydown="onButtonKey">
      <span class="cm-l">Categoria:</span> <strong>{{ currentLabel }}</strong>
      <NavIcon name="chevron-down" class="cm-i" />
    </button>
    <ul v-show="open" :id="menuId" ref="list" class="cm-list" :style="listStyle" role="listbox" tabindex="-1" aria-label="Categorias" :aria-activedescendant="open ? menuId + '-' + active : undefined" data-testid="category-list" @keydown="onListKey">
      <li v-for="(option, i) in options" :id="menuId + '-' + i" :key="option.id" role="option" class="cm-opt" :class="{ act: i === active }" :aria-selected="option.id === modelValue" :data-category="option.id" @click="choose(i)" @mousemove="active = i">{{ option.label }}</li>
    </ul>
  </div>
</template>

<style scoped>
.cm { position: relative; flex: 0 0 auto; }
.cm-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-size: 14.5px; white-space: nowrap; }
.cm-btn.on { border-color: var(--accent); }
.cm-l { color: var(--muted); }
.cm-i { width: 18px; height: 18px; }
.cm-btn[aria-expanded="true"] .cm-i { transform: rotate(180deg); }
.cm-list { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; min-width: 100%; width: max-content; max-width: min(320px, 92vw); margin: 0; padding: 6px; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 12px 32px rgb(0 0 0 / .18); }
.cm-list:focus { outline: none; }
.cm-opt { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; font-weight: 600; cursor: pointer; }
.cm-opt.act { background: var(--panel); outline: 2px solid var(--accent); outline-offset: -2px; }
.cm-opt[aria-selected="true"] { font-weight: 800; }
.cm-opt[aria-selected="true"]::after { content: '✓'; margin-left: auto; padding-left: 14px; color: var(--accent); }
@media (max-width: 599px) { .cm-l { display: none; } }
@media (prefers-reduced-motion: no-preference) { .cm-i { transition: transform .15s; } }
</style>
