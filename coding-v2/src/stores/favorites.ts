import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isToolId, type ToolId } from '../shared/catalog';

export const FAVORITES_KEY = 'coding-v2-favorites';

export function parseFavorites(raw: string | null): ToolId[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter(isToolId))] : [];
  } catch { return []; }
}
function load(): ToolId[] { try { return parseFavorites(localStorage.getItem(FAVORITES_KEY)); } catch { return []; } }

/** Apps favoritos: preferência local do aparelho (não é instalação nem ativação). */
export const useFavoritesStore = defineStore('favorites', () => {
  const ids = ref<ToolId[]>(load());
  const isFavorite = (id: ToolId): boolean => ids.value.includes(id);
  function toggle(id: ToolId): boolean {
    ids.value = isFavorite(id) ? ids.value.filter((item) => item !== id) : [...ids.value, id];
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids.value)); } catch { /* sessão volátil */ }
    return isFavorite(id);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => { if (event.key === FAVORITES_KEY) ids.value = load(); });
  }
  return { ids, isFavorite, toggle };
});
