import { describe, expect, it } from 'vitest';
import { forgetDocument, getStartup, loadLimitSettings, loadRecommended, loadTabs, restoreTarget, saveLimitSettings, saveTabs, setStartup, updateTabs, LIMITS_KEY, RECOMMENDED_KEY, TABS_PREFIX, type KV } from './prefs';
import { openTab, selectTab } from './tabs';

class Mem implements KV {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

describe('preferências · abas', () => {
  it('sem nada gravado: vazio; lixo gravado: vazio, sem lançar', () => {
    const kv = new Mem();
    expect(loadTabs('calc', kv)).toEqual({ v: 1, open: [], active: null });
    kv.setItem(TABS_PREFIX + 'calc', '{quebrado');
    expect(loadTabs('calc', kv).open).toEqual([]);
    expect(loadTabs('calc', null).open).toEqual([]);
  });
  it('cada app tem as suas abas (nunca se misturam)', () => {
    const kv = new Mem();
    updateTabs('calc', (s) => openTab(s, { id: 'a', title: 'Planilha A' }, 1), kv);
    updateTabs('texts', (s) => openTab(s, { id: 'b', title: 'Texto B' }, 2), kv);
    expect(loadTabs('calc', kv).open.map((t) => t.id)).toEqual(['a']);
    expect(loadTabs('texts', kv).open.map((t) => t.id)).toEqual(['b']);
  });
  it('C: o projeto ativo é restaurado depois de recarregar; "novo" e "Biblioteca" não restauram', () => {
    const kv = new Mem();
    for (let i = 1; i <= 4; i++) updateTabs('calc', (s) => openTab(s, { id: 'p' + i, title: 'P' + i }, i * 10), kv);
    updateTabs('calc', (s) => selectTab(s, 'p3', 500), kv);
    expect(restoreTarget('calc', kv)).toBe('p3');
    expect(restoreTarget('texts', kv)).toBeNull();
    setStartup('new', kv); expect(restoreTarget('calc', kv)).toBeNull();
    setStartup('library', kv); expect(restoreTarget('calc', kv)).toBeNull();
    setStartup('continue', kv); expect(restoreTarget('calc', kv)).toBe('p3');
    expect(getStartup(kv)).toBe('continue');
    kv.setItem('coding-v2-startup', 'lixo'); expect(getStartup(kv)).toBe('continue');
  });
  it('excluir um documento tira-o das abas de qualquer app', () => {
    const kv = new Mem();
    saveTabs('calc', openTab(openTab({ v: 1, open: [], active: null }, { id: 'x', title: 'X' }, 1), { id: 'y', title: 'Y' }, 2), kv);
    saveTabs('texts', openTab({ v: 1, open: [], active: null }, { id: 'x', title: 'X' }, 3), kv);
    forgetDocument('x', kv);
    expect(loadTabs('calc', kv).open.map((t) => t.id)).toEqual(['y']);
    expect(loadTabs('texts', kv).open).toEqual([]);
    forgetDocument('nao-existe', kv); // não quebra
  });
});

describe('preferências · limites', () => {
  it('padrão automático; grava e lê; corrompido volta ao padrão (cenário H persiste)', () => {
    const kv = new Mem();
    expect(loadLimitSettings(kv)).toEqual({ v: 1, mode: 'auto', tier: 64, overrides: {} });
    saveLimitSettings({ v: 1, mode: 'manual', tier: 256, overrides: { calc: 512 } }, kv);
    expect(loadLimitSettings(kv)).toEqual({ v: 1, mode: 'manual', tier: 256, overrides: { calc: 512 } });
    kv.setItem(LIMITS_KEY, 'xx');
    expect(loadLimitSettings(kv).mode).toBe('auto');
  });
  it('a sugestão guardada só vale se for 32, 64 ou 128', () => {
    const kv = new Mem();
    expect(loadRecommended(kv)).toBe(64);
    kv.setItem(RECOMMENDED_KEY, '128'); expect(loadRecommended(kv)).toBe(128);
    kv.setItem(RECOMMENDED_KEY, '32'); expect(loadRecommended(kv)).toBe(32);
    kv.setItem(RECOMMENDED_KEY, '1024'); expect(loadRecommended(kv)).toBe(64);
    kv.setItem(RECOMMENDED_KEY, 'abc'); expect(loadRecommended(kv)).toBe(64);
  });
});
