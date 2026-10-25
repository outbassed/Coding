import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isPreviewTool, isToolId, tools, type ToolId } from '../shared/catalog';

export const APPS_KEY = 'coding-v2-apps';
const ready = new Set<ToolId>(tools.filter(isPreviewTool).map((tool) => tool.id));
const defaults = (): ToolId[] => tools.filter((tool) => tool.initiallyActive).map((tool) => tool.id);

/** Apps que já existiam quando a preferência v1 foi gravada: os demais são novos para aquela pessoa. */
const V1_KNOWN: readonly ToolId[] = ['labels', 'texts'];
/**
 * Aceita o formato do protótipo (lista simples), o v1 { v: 1, enabled } e o v2 { v: 2, enabled, known }.
 * Apps que a pessoa ainda não conhecia entram ativados; o que ela desativou de propósito continua desativado.
 */
export function parseEnabled(raw: string | null): ToolId[] {
  if (raw === null) return defaults();
  try {
    const value: unknown = JSON.parse(raw);
    const obj = (Array.isArray(value) ? null : value) as { v?: unknown; enabled?: unknown; known?: unknown } | null;
    const list = Array.isArray(value) ? value : obj?.enabled;
    if (Array.isArray(list)) {
      const chosen = [...new Set(list.filter(isToolId).filter((id) => ready.has(id)))];
      const known = obj?.v === 2 && Array.isArray(obj.known) ? new Set(obj.known.filter(isToolId)) : new Set<ToolId>(V1_KNOWN);
      const fresh = defaults().filter((id) => !known.has(id) && !chosen.includes(id));
      return [...chosen, ...fresh];
    }
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
    try { localStorage.setItem(APPS_KEY, JSON.stringify({ v: 2, enabled: enabled.value, known: tools.map((tool) => tool.id) })); } catch { /* sessão volátil */ }
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
      if (event.key === APPS_KEY || event.key === null) enabled.value = load();
    });
  }
  return { enabled, activeTools, isEnabled, toggle };
});
