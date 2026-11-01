<script setup lang="ts">
import { nextTick } from 'vue';

/**
 * Abas em forma de botões segmentados para os editores de layout livre (`EditorShell layout="free"`).
 * Mesma semântica das abas da casca (tablist/tab, setas, Home/End) e mesmo `data-testid="editor-tabs"`; o app
 * renderiza o painel (role="tabpanel", aria-labelledby = `<prefix>-tab-<id>`) onde fizer sentido para o seu layout.
 */
const props = withDefaults(defineProps<{ tabs: readonly { id: string; label: string }[]; label: string; prefix?: string; panelId?: string; testid?: string; fill?: boolean }>(), { prefix: 'seg', panelId: undefined, testid: 'editor-tabs', fill: false });
const model = defineModel<string>({ required: true });

function onKey(event: KeyboardEvent): void {
  const list = props.tabs;
  const index = list.findIndex((t) => t.id === model.value);
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % list.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = list.length - 1;
  else return;
  event.preventDefault();
  const target = list[next];
  if (!target) return;
  model.value = target.id;
  void nextTick(() => document.getElementById(props.prefix + '-tab-' + target.id)?.focus());
}
</script>

<template>
  <div class="seg-tabs" :class="{ fill }" role="tablist" :aria-label="label" :data-testid="testid" @keydown="onKey">
    <button v-for="t in tabs" :id="prefix + '-tab-' + t.id" :key="t.id" type="button" role="tab" class="seg-tab" :aria-selected="model === t.id"
      :aria-controls="panelId" :tabindex="model === t.id ? 0 : -1" @click="model = t.id">{{ t.label }}</button>
  </div>
</template>

<style scoped>
.seg-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 14px; background: var(--panel); border: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; max-width: 100%; }
.seg-tabs.fill .seg-tab { flex: 1 1 0; min-width: 44px; padding: 0 clamp(1px, 1.2vw, 14px); font-size: clamp(11px, 3.1vw, 13.5px); letter-spacing: -0.01em; }
.seg-tab { flex: 0 0 auto; min-height: 44px; padding: 0 clamp(9px, 2.6vw, 14px); border: 0; border-radius: 11px; background: transparent; color: var(--muted); font-weight: 700; font-size: 13.5px; white-space: nowrap; }
.seg-tab:hover:not([aria-selected="true"]) { background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); }
.seg-tab[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px #0002, inset 0 -3px 0 var(--app, var(--accent)); }
.seg-tab:focus-visible { outline: 3px solid var(--accent); outline-offset: 1px; }
</style>
