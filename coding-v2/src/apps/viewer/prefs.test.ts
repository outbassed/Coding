import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, FONT_MAX, loadPrefs, parsePrefs, PREFS_KEY, savePrefs } from './prefs';

afterEach(() => { localStorage.clear(); });

describe('Visualizador · preferências', () => {
  it('sem nada salvo usa os padrões', () => {
    expect(parsePrefs(null)).toEqual({ ...DEFAULT_PREFS });
    expect(parsePrefs('texto')).toEqual({ ...DEFAULT_PREFS });
    expect(parsePrefs([1, 2])).toEqual({ ...DEFAULT_PREFS });
  });
  it('corrige valores inválidos sem perder os válidos', () => {
    const p = parsePrefs({ sortKey: 'x', fontSize: 999, rate: 1.1, volume: 5, slideSeconds: 12, backdrop: 'claro', wrap: 'sim', libraryView: 'lista' });
    expect(p.sortKey).toBe('ordem');
    expect(p.fontSize).toBe(FONT_MAX);
    expect(p.rate).toBe(1);
    expect(p.volume).toBe(1);
    expect(p.slideSeconds).toBe(10);
    expect(p.backdrop).toBe('claro');
    expect(p.wrap).toBe(DEFAULT_PREFS.wrap);
    expect(p.libraryView).toBe('lista');
  });
  it('salva e lê de volta', () => {
    savePrefs({ ...DEFAULT_PREFS, libraryView: 'lista', muted: true });
    const p = loadPrefs();
    expect(p.libraryView).toBe('lista');
    expect(p.muted).toBe(true);
  });
  it('conteúdo corrompido volta aos padrões', () => {
    localStorage.setItem(PREFS_KEY, '{quebrado');
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS });
  });
});
