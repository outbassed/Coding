import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { APPS_KEY, parseEnabled, useAppsStore } from './apps';

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

describe('parseEnabled', () => {
  it('sem dados: Etiquetas e Texto', () => { expect(parseEnabled(null)).toEqual(['labels', 'texts']); });
  it('aceita a lista simples do protótipo', () => { expect(parseEnabled('["texts"]')).toEqual(['texts']); });
  it('aceita o formato versionado', () => { expect(parseEnabled('{"v":1,"enabled":["labels"]}')).toEqual(['labels']); });
  it('descarta ids desconhecidos, planejados e repetidos', () => {
    expect(parseEnabled('["labels","calc","xyz","labels",3]')).toEqual(['labels']);
  });
  it('conteúdo inválido volta ao padrão', () => { expect(parseEnabled('{quebrado')).toEqual(['labels', 'texts']); });
});

describe('useAppsStore', () => {
  it('começa com dois apps', () => { expect(useAppsStore().enabled).toEqual(['labels', 'texts']); });
  it('desativa, reativa e persiste de forma versionada', () => {
    const store = useAppsStore();
    expect(store.toggle('labels')).toBe(true);
    expect(store.isEnabled('labels')).toBe(false);
    expect(JSON.parse(localStorage.getItem(APPS_KEY) ?? '{}')).toEqual({ v: 1, enabled: ['texts'] });
    store.toggle('labels');
    expect(store.enabled).toEqual(['texts', 'labels']);
  });
  it('não ativa app sem casca', () => {
    const store = useAppsStore();
    expect(store.toggle('images')).toBe(false);
    expect(store.isEnabled('images')).toBe(false);
  });
  it('lê a preferência salva', () => {
    localStorage.setItem(APPS_KEY, JSON.stringify({ v: 1, enabled: ['texts'] }));
    expect(useAppsStore().activeTools.map((tool) => tool.id)).toEqual(['texts']);
  });
});
