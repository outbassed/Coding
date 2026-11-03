import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { FAVORITES_KEY, parseFavorites, useFavoritesStore } from './favorites';

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
describe('favoritos', () => {
  it('ignora lixo e repetidos', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('{ruim')).toEqual([]);
    expect(parseFavorites('["texts","xyz","texts",3]')).toEqual(['texts']);
  });
  it('alterna e persiste', () => {
    const f = useFavoritesStore();
    expect(f.toggle('calc')).toBe(true);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual(['calc']);
    expect(f.toggle('calc')).toBe(false);
    expect(f.isFavorite('calc')).toBe(false);
  });
});
