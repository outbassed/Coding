import { describe, expect, it } from 'vitest';
import { INK, tools } from './catalog';
import { contrast } from '../test/color';

describe('catálogo', () => {
  it('tem ferramentas com ids únicos', () => {
    expect(tools).toHaveLength(16);
    expect(new Set(tools.map((tool) => tool.id)).size).toBe(tools.length);
  });
  it('os 16 apps têm página própria e listam o que já funciona', () => {
    expect(tools.every((tool) => tool.status === 'preview')).toBe(true);
    const paths = tools.map((tool) => tool.path);
    expect(paths.every((path) => typeof path === 'string' && /^\/apps\/[a-z-]+\/$/.test(path))).toBe(true);
    expect(new Set(paths).size).toBe(tools.length);
    expect(tools.every((tool) => tool.ready.length >= 3)).toBe(true);
  });
  it('rotas de documentos anteriores são únicas; apps mais novos não têm rota antiga', () => {
    const hashes = tools.map((tool) => tool.legacyHash).filter((hash): hash is string => hash !== null);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(hashes).toHaveLength(8);
    for (const id of ['calculator', 'colors', 'zip', 'compare', 'code', 'viewer', 'paint', 'versos']) expect(tools.find((tool) => tool.id === id)?.legacyHash).toBeNull();
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
