import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { APPS_KEY, parseEnabled, useAppsStore } from './apps';

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

describe('parseEnabled', () => {
  it('sem dados: todos os apps', () => { expect(parseEnabled(null)).toEqual(['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']); });
  it('aceita a lista simples do protótipo e ativa os apps que ainda não existiam', () => { expect(parseEnabled('["texts"]')).toEqual(['texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']); });
  it('aceita o formato v1: o que foi desativado continua desativado; os novos entram', () => { expect(parseEnabled('{"v":1,"enabled":["labels"]}')).toEqual(['labels', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']); });
  it('formato v2 respeita tudo o que a pessoa já conhecia', () => {
    expect(parseEnabled(JSON.stringify({ v: 2, enabled: ['texts'], known: ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator'] }))).toEqual(['texts']);
    expect(parseEnabled(JSON.stringify({ v: 2, enabled: ['texts'], known: ['labels', 'texts', 'calc'] }))).toEqual(['texts', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']);
  });
  it('descarta ids desconhecidos e repetidos', () => {
    expect(parseEnabled(JSON.stringify({ v: 2, enabled: ['labels', 'calc', 'xyz', 'labels', 3], known: ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator'] }))).toEqual(['labels', 'calc']);
  });
  it('conteúdo inválido volta ao padrão', () => { expect(parseEnabled('{quebrado')).toEqual(['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']); });
});

describe('useAppsStore', () => {
  it('começa com todos os apps', () => { expect(useAppsStore().enabled).toEqual(['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator']); });
  it('desativa, reativa e persiste de forma versionada', () => {
    const store = useAppsStore();
    expect(store.toggle('labels')).toBe(true);
    expect(store.isEnabled('labels')).toBe(false);
    expect(JSON.parse(localStorage.getItem(APPS_KEY) ?? '{}')).toEqual({ v: 2, enabled: ['texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator'], known: ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator'] });
    store.toggle('labels');
    expect(store.enabled.at(-1)).toBe('labels');
  });
  it('não ativa id desconhecido', () => {
    const store = useAppsStore();
    expect(store.toggle('nada' as never)).toBe(false);
  });
  it('lê a preferência salva', () => {
    localStorage.setItem(APPS_KEY, JSON.stringify({ v: 2, enabled: ['texts'], known: ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator'] }));
    expect(useAppsStore().activeTools.map((tool) => tool.id)).toEqual(['texts']);
  });
});
