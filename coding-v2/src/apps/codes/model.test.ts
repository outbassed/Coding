import { describe, expect, it } from 'vitest';
import { normalizeCodes, normalizeStylePresets } from './model';

describe('QR / Barras: aparências salvas', () => {
  it('saneia nome, estilo e limite; documentos antigos continuam abrindo', () => {
    const list = normalizeStylePresets([
      { id: 'a', name: '  Grande  ', style: { module: 99, height: 5, fg: 'vermelho', bg: '#FFFFFF', showText: false, ecl: 'Z', margin: -3 } },
      { id: 'a', name: 'Outra', style: {} },
      { name: '   ', style: {} },
      'lixo'
    ]);
    expect(list.map((p) => p.name)).toEqual(['Grande', 'Outra']);
    expect(list[0]!.style).toEqual({ module: 20, height: 20, fg: '#000000', bg: '#FFFFFF', showText: false, ecl: 'M', margin: 0 });
    expect(new Set(list.map((p) => p.id)).size).toBe(2);
    expect(normalizeStylePresets(Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'E' + i })))).toHaveLength(12);
    expect(normalizeStylePresets(null)).toEqual([]);
    const old = normalizeCodes({ name: 'Antigo', items: [{ id: 'x', kind: 'qr', value: 'oi', caption: '', copies: 1 }], style: { module: 6 } });
    expect(old.stylePresets).toEqual([]);
    expect(old.style.module).toBe(6);
  });
});
