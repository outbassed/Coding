import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES, cssFont, effectiveFace, ensureFonts, findFamily, registerFontProvider, resolveFont, supportedWeights, supportsItalic, supportsWeight, __resetFontsForTests } from './fonts';

describe('versos · fontes', () => {
  it('catálogo: só fontes livres, com licença e arquivos', () => {
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(10);
    for (const f of FONT_FAMILIES) {
      expect(f.license).toBe('OFL-1.1');
      expect(f.files.normal).toMatch(/^\/fonts\/versos\/[a-z-]+\/[a-z-]+-regular\.woff$/);
      expect(f.licenseFile).toMatch(/OFL\.txt$/);
    }
    expect(FONT_FAMILIES.some((f) => /arial/i.test(f.label))).toBe(false);
    expect(FONT_FAMILIES.some((f) => f.id === 'arimo')).toBe(true);
  });
  it('encontra por id ou por nome, sem diferenciar maiúsculas', () => {
    expect(findFamily({ id: 'lora', label: 'qualquer' })?.id).toBe('lora');
    expect(findFamily({ id: 'x', label: 'PLAYFAIR display' })?.id).toBe('playfair-display');
    expect(findFamily({ id: 'nada', label: 'Nada' })).toBeNull();
  });
  it('fonte ausente: substituta visual (Arimo) e o nome original continua sendo tentado primeiro', () => {
    const ref = { id: 'fonte-rara', label: 'Fonte Rara' };
    const r = resolveFont(ref);
    expect(r.substituted).toBe(true);
    expect(r.def).toBeNull();
    expect(r.css.startsWith('"Fonte Rara"')).toBe(true);
    expect(r.css).toContain('Arimo');
    expect(ref).toEqual({ id: 'fonte-rara', label: 'Fonte Rara' });
  });
  it('fonte incluída resolve para a própria família com Arimo como reserva', () => {
    const r = resolveFont({ id: 'caveat', label: 'Caveat' });
    expect(r.substituted).toBe(false);
    expect(r.css).toContain('"vs-caveat"');
    expect(r.css).toContain('Arimo');
  });
  it('pesos e itálico suportados', () => {
    expect(supportsWeight(findFamily({ id: 'anton', label: 'Anton' }))).toBe(false);
    expect(supportsWeight(findFamily({ id: 'montserrat', label: '' }))).toBe(true);
    expect(supportedWeights(findFamily({ id: 'cormorant-garamond', label: '' }))).toEqual([300, 400, 500, 600, 700]);
    expect(supportsItalic(findFamily({ id: 'oswald', label: '' }))).toBe(false);
    expect(effectiveFace({ id: 'anton', label: 'Anton' }, 700, true)).toEqual({ weight: 400, italic: false });
    expect(effectiveFace({ id: 'lora', label: 'Lora' }, 900, true)).toEqual({ weight: 700, italic: true });
    expect(effectiveFace({ id: 'sistema', label: 'Sistema' }, 700, true)).toEqual({ weight: 700, italic: true });
  });
  it('cssFont monta a string do canvas', () => {
    expect(cssFont({ id: 'lora', label: 'Lora' }, 40, 500, true)).toMatch(/^italic 500 40px "vs-lora", /);
  });
  it('provedor externo (futuro Coding Fontes) entra no catálogo e pode ser removido', () => {
    __resetFontsForTests();
    const off = registerFontProvider({ id: 'teste', label: 'Teste', families: () => [{ ...FONT_FAMILIES[0]!, id: 'externa', label: 'Externa' }] });
    expect(findFamily({ id: 'externa', label: '' })?.label).toBe('Externa');
    off();
    expect(findFamily({ id: 'externa', label: '' })).toBeNull();
  });
  it('ensureFonts sem DOM não trava e informa as ausentes', async () => {
    const r = await ensureFonts([{ id: 'fonte-rara', label: 'Fonte Rara' }, { id: 'fonte-rara', label: 'Fonte Rara' }]);
    expect(r.missing).toEqual(['Fonte Rara']);
  });
});
