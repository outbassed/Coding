import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isPreviewTool, isToolId, tools, type ToolId } from '../shared/catalog';

export const APPS_KEY = 'coding-v2-apps';
const ready = new Set<ToolId>(tools.filter(isPreviewTool).map((tool) => tool.id));
const defaults = (): ToolId[] => tools.filter((tool) => tool.initiallyActive).map((tool) => tool.id);

/** Aceita o formato do protótipo (lista simples) e o formato versionado { v: 1, enabled }. */
export function parseEnabled(raw: string | null): ToolId[] {
  if (raw === null) return defaults();
  try {
    const value: unknown = JSON.parse(raw);
    const list = Array.isArray(value) ? value : (value as { enabled?: unknown } | null)?.enabled;
    if (Array.isArray(list)) return [...new Set(list.filter(isToolId).filter((id) => ready.has(id)))];
  } catch { /* conteúdo inválido: volta ao padrão */ }
  return defaults();
}

function load(): ToolId[] {
  try { return parseEnabled(localStorage.getItem(APPS_KEY)); } catch { return defaults(); }
}

export const useAppsStore = defineStore('apps', () => {
  const enabled = ref<ToolId[]>(load());
  const activeTools = computed(() => tools.filter((tool) => enabled.value.includes(tool.id)));

  function isEnabled(id: ToolId): boolean { return enabled.value.includes(id); }
  function persist(): void {
    try { localStorage.setItem(APPS_KEY, JSON.stringify({ v: 1, enabled: enabled.value })); } catch { /* sessão volátil */ }
  }
  /** Devolve true se algo mudou. Apps sem casca não podem ser "ativados". */
  function toggle(id: ToolId): boolean {
    if (!ready.has(id)) return false;
    enabled.value = isEnabled(id) ? enabled.value.filter((item) => item !== id) : [...enabled.value, id];
    persist();
    return true;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === APPS_KEY) enabled.value = load();
    });
  }
  return { enabled, activeTools, isEnabled, toggle };
});
