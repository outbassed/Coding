import { describe, expect, it } from 'vitest';
import { INK, tools } from './catalog';
import { contrast } from '../test/color';

describe('catálogo', () => {
  it('tem nove ferramentas com ids únicos', () => {
    expect(tools).toHaveLength(9);
    expect(new Set(tools.map((tool) => tool.id)).size).toBe(9);
  });
  it('os nove apps existem no 2.0, abrem por endereço próprio e listam o que já funciona', () => {
    expect(tools.every((tool) => tool.status === 'preview' && tool.initiallyActive)).toBe(true);
    const paths = tools.map((tool) => tool.path);
    expect(paths.every((path) => typeof path === 'string' && /^\/apps\/[a-z-]+\/$/.test(path))).toBe(true);
    expect(new Set(paths).size).toBe(9);
    expect(tools.every((tool) => tool.ready.length >= 3)).toBe(true);
  });
  it('rotas da versão estável são únicas', () => {
    expect(new Set(tools.map((tool) => tool.legacyHash)).size).toBe(9);
  });
});

describe('contraste das cores das ferramentas (WCAG AA)', () => {
  for (const tool of tools) {
    it(tool.name + ': tinta escura sobre o preenchimento', () => {
      expect(contrast(tool.color, INK)).toBeGreaterThanOrEqual(4.5);
    });
    it(tool.name + ': texto no tema claro', () => {
      expect(contrast(tool.textLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tool.textLight, '#f3f5f9')).toBeGreaterThanOrEqual(4.5);
    });
    it(tool.name + ': texto no tema escuro', () => {
      expect(contrast(tool.textDark, '#171c24')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tool.textDark, '#0f1319')).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('cores de interface principais', () => {
    expect(contrast('#ffffff', '#2f5fd0')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#0a1530', '#83a8ff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#596579', '#f3f5f9')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#a8b2c1', '#282f3b')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', '#b12f2f')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#0f1319', '#ff8f8f')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#8a5000', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#17724a', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
  });
});
