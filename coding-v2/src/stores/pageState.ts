import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { categories, type CategoryId } from '../shared/catalog';

/**
 * Busca e filtros do Launcher, um valor independente por tela. Ficam em sessionStorage: valem só para esta aba
 * (não vazam para outras abas) e sobrevivem à troca de tela e ao recarregamento.
 */
export const PAGE_STATE_KEY = 'coding-v2-page-state';
export type CatalogState = 'all' | 'on' | 'off' | 'soon';
const STATES: readonly CatalogState[] = ['all', 'on', 'off', 'soon'];
const MAX = 80;

export type MyAppsSort = 'catalog' | 'name' | 'favorites';
const SORTS: readonly MyAppsSort[] = ['catalog', 'name', 'favorites'];
interface Saved { mySort: MyAppsSort; myApps: string; catalog: string; category: CategoryId | 'all'; state: CatalogState }
const blank = (): Saved => ({ mySort: 'catalog', myApps: '', catalog: '', category: 'all', state: 'all' });

export function parseSaved(raw: string | null): Saved {
  const result = blank();
  if (!raw) return result;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (SORTS.includes(v.mySort as MyAppsSort)) result.mySort = v.mySort as MyAppsSort;
    if (typeof v.myApps === 'string') result.myApps = v.myApps.slice(0, MAX);
    if (typeof v.catalog === 'string') result.catalog = v.catalog.slice(0, MAX);
    if (v.category === 'all' || categories.some((c) => c.id === v.category)) result.category = v.category as CategoryId | 'all';
    if (STATES.includes(v.state as CatalogState)) result.state = v.state as CatalogState;
  } catch { /* conteúdo inválido: começa vazio */ }
  return result;
}
function read(): Saved { try { return parseSaved(sessionStorage.getItem(PAGE_STATE_KEY)); } catch { return blank(); } }

export const usePageStateStore = defineStore('page-state', () => {
  const initial = read();
  const myAppsQuery = ref(initial.myApps);
  const catalogQuery = ref(initial.catalog);
  const mySort = ref<MyAppsSort>(initial.mySort);
  const category = ref<CategoryId | 'all'>(initial.category);
  const state = ref<CatalogState>(initial.state);
  watch([myAppsQuery, catalogQuery, category, state, mySort], () => {
    try { sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify({ mySort: mySort.value, myApps: myAppsQuery.value, catalog: catalogQuery.value, category: category.value, state: state.value })); } catch { /* armazenamento indisponível */ }
  });
  function resetCatalog(): void { catalogQuery.value = ''; category.value = 'all'; state.value = 'all'; }
  return { mySort, myAppsQuery, catalogQuery, category, state, resetCatalog };
});

/** Comparação sem acento e sem diferença entre maiúsculas e minúsculas. */
export const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
export function matchesQuery(query: string, ...fields: string[]): boolean {
  const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fold(fields.join(' '));
  return terms.every((term) => haystack.includes(term));
}
