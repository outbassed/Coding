import { describe, expect, it } from 'vitest';
import { defaultIdentity, identityOf } from './identity';
import { tools } from '../shared/catalog';

describe('identidade dos editores', () => {
  it('aplicativos sem identidade própria seguem o padrão do Etiquetas', () => {
    expect(identityOf('texts')).toEqual(defaultIdentity);
    expect(defaultIdentity.side).toBe('left');
  });

  it('os quatro apps do lote 1 têm identidade própria e diferente entre si', () => {
    const lot = (['calculator', 'colors', 'zip', 'compare'] as const).map(identityOf);
    for (const id of lot) expect(id).not.toEqual(defaultIdentity);
    expect(new Set(lot.map((i) => i.stage)).size).toBe(4);
  });

  it('larguras do painel ficam dentro dos limites da alça (296–460)', () => {
    for (const tool of tools) {
      const { sidebar } = identityOf(tool.id);
      expect(sidebar).toBeGreaterThanOrEqual(296);
      expect(sidebar).toBeLessThanOrEqual(460);
    }
  });
});
