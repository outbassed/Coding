import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { tools, type ToolId } from '../shared/catalog';

type Theme = 'auto' | 'light' | 'dark';
const KEY = 'coding-v2-apps';
const THEME_KEY = 'coding-v2-theme';
const ready = new Set<ToolId>(tools.filter((tool) => tool.shellReady).map((tool) => tool.id));

function loadEnabled(): ToolId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (Array.isArray(value)) {
        return [...new Set(value.filter((id): id is ToolId => typeof id === 'string' && ready.has(id as ToolId)))];
      }
    }
  } catch { /* Sem permissão de armazenamento: usar preferências temporárias. */ }
  return tools.filter((tool) => tool.initiallyActive).map((tool) => tool.id);
}

function loadTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'auto' || value === 'light' || value === 'dark') return value;
  } catch { /* Sem armazenamento */ }
  return 'auto';
}

export const useLauncherStore = defineStore('launcher', () => {
  const enabled = ref<ToolId[]>(loadEnabled());
  const theme = ref<Theme>(loadTheme());
  const activeTools = computed(() => tools.filter((tool) => enabled.value.includes(tool.id)));
  function isEnabled(id: ToolId): boolean { return enabled.value.includes(id); }
  function toggle(id: ToolId): void {
    if (!ready.has(id)) return; // Ferramentas sem motor não se tornam falsamente instaladas.
    enabled.value = isEnabled(id) ? enabled.value.filter((item) => item !== id) : [...enabled.value, id];
  }
  watch(enabled, (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* sessão volátil */ } }, { deep: true });
  watch(theme, (choice) => {
    if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
    try { localStorage.setItem(THEME_KEY, choice); } catch { /* sessão volátil */ }
  }, { immediate: true });
  return { enabled, theme, activeTools, isEnabled, toggle };
});
