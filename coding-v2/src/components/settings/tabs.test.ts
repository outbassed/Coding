import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, neighborTab, parseTab, settingsTabs } from './tabs';

describe('abas de Ajustes', () => {
  it('têm as sete categorias na ordem aprovada', () => {
    expect(settingsTabs.map((t) => t.label)).toEqual(['Geral', 'Aparência', 'Projetos', 'Offline', 'Atalhos', 'Avançado', 'Sobre']);
  });
  it('valor desconhecido volta à aba padrão', () => {
    expect(parseTab('offline')).toBe('offline');
    expect(parseTab(['sobre', 'x'])).toBe('sobre');
    for (const bad of [undefined, null, '', 'nada', 42]) expect(parseTab(bad)).toBe(DEFAULT_TAB);
  });
  it('setas andam em círculo e Home/End vão às pontas', () => {
    expect(neighborTab('geral', 'ArrowDown')).toBe('aparencia');
    expect(neighborTab('geral', 'ArrowUp')).toBe('sobre');
    expect(neighborTab('sobre', 'ArrowRight')).toBe('geral');
    expect(neighborTab('offline', 'Home')).toBe('geral');
    expect(neighborTab('offline', 'End')).toBe('sobre');
    expect(neighborTab('offline', 'a')).toBeNull();
  });
});
