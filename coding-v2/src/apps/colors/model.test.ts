import { describe, expect, it } from 'vitest';
import { addColors, emptyColors, hexOf, importFromText, MAX_SWATCHES, moveSwatch, normalizeColors, paletteCss, paletteJson, paletteSvg, paletteText, removeSwatch, renameSwatch, schemeHexes, slug } from './model';
import { colorsKind, colorsTemplates } from './kind';

describe('estúdio de cores · documento', () => {
  it('normaliza dados corrompidos sem lançar', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { palette: 'a', base: 5 }, { palette: [null, 3, { hex: 'zzz' }] }]) {
      const s = normalizeColors(raw);
      expect(s.base).toMatch(/^#[0-9A-F]{6}$/);
      expect(Array.isArray(s.palette)).toBe(true);
    }
  });
  it('só guarda cores válidas, em #RRGGBB maiúsculo, com ids únicos e limite', () => {
    const s = normalizeColors({
      palette: [{ id: 'a', hex: '#f80', name: ' Laranja ' }, { id: 'a', hex: 'rgb(0,0,255)' }, { hex: 'branco' }, { hex: '#00ff0080', name: 'x'.repeat(100) }]
    });
    expect(s.palette.map((p) => p.hex)).toEqual(['#FF8800', '#0000FF', '#00FF00']);
    expect(new Set(s.palette.map((p) => p.id)).size).toBe(3);
    expect(s.palette[0]?.name).toBe('Laranja');
    expect(s.palette[2]?.name).toHaveLength(40);
    const many = normalizeColors({ palette: Array.from({ length: 200 }, (_, i) => ({ hex: '#' + (i + 1).toString(16).padStart(6, '0') })) });
    expect(many.palette).toHaveLength(MAX_SWATCHES);
  });
  it('vai e volta pelo JSON', () => {
    const s = addColors(emptyColors('Teste'), ['#112233', '#445566'], ['a', 'b']).state;
    expect(normalizeColors(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('hexOf descarta transparência e recusa o que não é cor', () => {
    expect(hexOf('#ff000080')).toBe('#FF0000');
    expect(hexOf('azul')).toBeNull();
    expect(hexOf(5)).toBeNull();
  });
  it('modelos são válidos', () => {
    expect(colorsKind.type).toBe('colors');
    expect(colorsKind.prefix).toBe('v2-colors-');
    for (const t of colorsTemplates) {
      const s = t.create();
      expect(normalizeColors(s)).toEqual(s);
      expect(colorsKind.label(s).length).toBeGreaterThan(0);
    }
    expect(colorsTemplates.find((t) => t.id === 'marca')!.create().palette).toHaveLength(6);
  });
});

describe('estúdio de cores · paleta', () => {
  it('adiciona sem repetir e avisa quando enche', () => {
    const a = addColors(emptyColors(), ['#ff0000', '#FF0000', 'x', '#00f']);
    expect(a.added).toBe(2);
    expect(a.skipped).toBe(2);
    expect(a.state.palette.map((p) => p.hex)).toEqual(['#FF0000', '#0000FF']);
    let s = emptyColors();
    for (let i = 0; i < MAX_SWATCHES; i++) s = addColors(s, ['#' + (i + 1).toString(16).padStart(6, '0')]).state;
    const over = addColors(s, ['#ABCDEF']);
    expect(over.full).toBe(true);
    expect(over.added).toBe(0);
    expect(over.state.palette).toHaveLength(MAX_SWATCHES);
  });
  it('remove, move e renomeia', () => {
    let s = addColors(emptyColors(), ['#111111', '#222222', '#333333']).state;
    const [a, b, c] = s.palette.map((p) => p.id) as [string, string, string];
    s = moveSwatch(s, c, -1);
    expect(s.palette.map((p) => p.hex)).toEqual(['#111111', '#333333', '#222222']);
    expect(moveSwatch(s, a, -1)).toBe(s);
    expect(moveSwatch(s, b, 1)).toBe(s);
    expect(moveSwatch(s, c, 1).palette.map((p) => p.hex)).toEqual(['#111111', '#222222', '#333333']);
    s = renameSwatch(s, a, '  Fundo  ');
    expect(s.palette[0]?.name).toBe('Fundo');
    s = removeSwatch(s, a);
    expect(s.palette).toHaveLength(2);
  });
  it('importa de um texto livre', () => {
    const r = importFromText(emptyColors(), 'Cores: #ff0000, rgb(0, 128, 0) e hsl(240 100% 50%); de novo #FF0000');
    expect(r.state.palette.map((p) => p.hex)).toEqual(['#FF0000', '#008000', '#0000FF']);
    expect(importFromText(emptyColors(), 'sem cores').added).toBe(0);
  });
  it('harmonias em hex', () => {
    expect(schemeHexes('#3366cc', 'complementary')).toEqual(['#3366CC', '#CC9933']);
    expect(schemeHexes('lixo', 'triadic')).toEqual([]);
  });
});

describe('estúdio de cores · exportação', () => {
  const s = addColors(emptyColors('Minha marca'), ['#2F5FD0', '#F28B30', '#141922'], ['Primária', 'Laranja & cia', '']).state;
  it('CSS com variáveis de nomes seguros e únicos', () => {
    const css = paletteCss(s);
    expect(css).toContain(':root {');
    expect(css).toContain('--primaria: #2F5FD0;');
    expect(css).toContain('--laranja-cia: #F28B30;');
    expect(css).toContain('--cor-3: #141922;');
    const dup = addColors(emptyColors('x'), ['#111111', '#222222'], ['Azul', 'azul']).state;
    expect(paletteCss(dup)).toContain('--azul: #111111;');
    expect(paletteCss(dup)).toContain('--azul-2: #222222;');
    expect(paletteCss({ ...emptyColors('a */ b'), palette: [] })).not.toContain('*/ b */');
  });
  it('JSON com rgb e hsl', () => {
    const json = JSON.parse(paletteJson(s)) as { name: string; colors: { name: string | null; hex: string; rgb: number[]; hsl: number[] }[] };
    expect(json.name).toBe('Minha marca');
    expect(json.colors).toHaveLength(3);
    expect(json.colors[0]).toEqual({ name: 'Primária', hex: '#2F5FD0', rgb: [47, 95, 208], hsl: [222, 63, 50] });
    expect(json.colors[2]?.name).toBeNull();
  });
  it('texto simples', () => {
    expect(paletteText(s)).toBe('Minha marca\n\nPrimária #2F5FD0\nLaranja & cia #F28B30\n#141922\n');
  });
  it('SVG escapa o texto e traz todas as cores', () => {
    const svg = paletteSvg(s);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Laranja &amp; cia');
    expect(svg).not.toContain('Laranja & cia');
    expect(svg.match(/<rect /g)).toHaveLength(4); // fundo + 3 cores
    const evil = addColors(emptyColors('<script>'), ['#111111'], ['"><script>alert(1)</script>']).state;
    const out = paletteSvg(evil);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
  it('slug', () => {
    expect(slug('Áçúcar & Café!')).toBe('acucar-cafe');
    expect(slug('!!!')).toBe('');
  });
});
