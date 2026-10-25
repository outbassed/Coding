import { describe, expect, it } from 'vitest';
import { bestText, colorsInText, contrastRatio, cssCmyk, cssHsl, cssRgb, extractPalette, hslToRgb, hsvToRgb, parseColor, rgb, rgbToCmyk, rgbToHsl, rgbToHsv, scheme, suggestForeground, toHex, wcag } from './color';

const hex = (s: string) => { const c = parseColor(s); if (!c) throw new Error('inválida ' + s); return c; };

describe('estúdio de cores · leitura', () => {
  it('hex em todos os formatos', () => {
    expect(toHex(hex('#fff'))).toBe('#FFFFFF');
    expect(toHex(hex('ff8800'))).toBe('#FF8800');
    expect(toHex(hex('#f80'))).toBe('#FF8800');
    expect(hex('#ff880080').a).toBeCloseTo(0.502, 2);
    expect(hex('#f808').a).toBeCloseTo(0.533, 2);
  });
  it('rgb(), hsl() e trio solto', () => {
    expect(toHex(hex('rgb(255, 136, 0)'))).toBe('#FF8800');
    expect(toHex(hex('rgb(255 136 0)'))).toBe('#FF8800');
    expect(toHex(hex('rgb(100%, 50%, 0%)'))).toBe('#FF8000');
    expect(toHex(hex('rgba(0,0,0,.5)'))).toBe('#000000');
    expect(hex('rgba(0,0,0,.5)').a).toBe(0.5);
    expect(toHex(hex('hsl(0, 100%, 50%)'))).toBe('#FF0000');
    expect(toHex(hex('hsl(120 100% 25%)'))).toBe('#008000');
    expect(toHex(hex('12, 34, 56'))).toBe('#0C2238');
  });
  it('valores fora da faixa são limitados e entradas ruins viram nulo', () => {
    expect(toHex(hex('rgb(300, -5, 0)'))).toBe('#FF0000');
    for (const bad of ['', '   ', '#12', '#12345', '#gggggg', 'vermelho', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(1,2,3,4,5)', 'x'.repeat(100), '#'.repeat(10), 'rgb(' + '9'.repeat(55) + ')']) expect(parseColor(bad), bad).toBeNull();
    expect(parseColor(42 as never)).toBeNull();
    expect(parseColor(null as never)).toBeNull();
  });
});

describe('estúdio de cores · conversões', () => {
  it('RGB ↔ HSL', () => {
    expect(rgbToHsl(rgb(255, 0, 0))).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(rgb(0, 255, 0))).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(rgb(128, 128, 128))).toEqual({ h: 0, s: 0, l: 50.2 });
    expect(rgbToHsl(rgb(0, 0, 0))).toEqual({ h: 0, s: 0, l: 0 });
    expect(toHex(hslToRgb({ h: 210, s: 50, l: 40 }))).toBe('#336699');
    expect(toHex(hslToRgb({ h: -150, s: 50, l: 40 }))).toBe('#336699');
  });
  it('ida e volta mantém a cor (todas as 4096 cores de passo 17)', () => {
    for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
      const c = rgb(r, g, b);
      expect(toHex(hslToRgb(rgbToHsl(c))), toHex(c)).toBe(toHex(c));
      expect(toHex(hsvToRgb(rgbToHsv(c))), toHex(c)).toBe(toHex(c));
    }
  });
  it('HSV e CMYK', () => {
    expect(rgbToHsv(rgb(255, 128, 0))).toEqual({ h: 30.1, s: 100, v: 100 });
    expect(rgbToCmyk(rgb(255, 0, 0))).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(rgbToCmyk(rgb(0, 0, 0))).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk(rgb(255, 255, 255))).toEqual({ c: 0, m: 0, y: 0, k: 0 });
  });
  it('textos CSS', () => {
    expect(cssRgb(rgb(1, 2, 3))).toBe('rgb(1, 2, 3)');
    expect(cssHsl(rgb(255, 0, 0))).toBe('hsl(0, 100%, 50%)');
    expect(cssCmyk(rgb(255, 0, 0))).toBe('cmyk(0%, 100%, 100%, 0%)');
    expect(toHex({ ...rgb(255, 0, 0), a: 0.5 }, true)).toBe('#FF000080');
    expect(toHex({ ...rgb(255, 0, 0), a: 0.5 })).toBe('#FF0000');
  });
});

describe('estúdio de cores · contraste WCAG', () => {
  it('valores de referência', () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb(255, 255, 255), rgb(255, 255, 255))).toBeCloseTo(1, 5);
    expect(contrastRatio(hex('#767676'), rgb(255, 255, 255))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex('#777777'), rgb(255, 255, 255))).toBeCloseTo(4.48, 2);
  });
  it('critérios AA e AAA sem arredondar para cima', () => {
    const ok = wcag(hex('#767676'), rgb(255, 255, 255));
    expect(ok).toMatchObject({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true, ui: true });
    const edge = wcag(hex('#777777'), rgb(255, 255, 255));
    expect(edge.aaNormal).toBe(false);
    expect(edge.ratio).toBe(4.47);
    expect(wcag(rgb(0, 0, 0), rgb(255, 255, 255)).aaaNormal).toBe(true);
  });
  it('melhor cor de texto', () => {
    expect(toHex(bestText(hex('#ffffff')))).toBe('#000000');
    expect(toHex(bestText(hex('#000000')))).toBe('#FFFFFF');
    expect(toHex(bestText(hex('#1a3a8f')))).toBe('#FFFFFF');
    expect(toHex(bestText(hex('#ffd34d')))).toBe('#000000');
  });
  it('sugere um texto acessível mantendo o matiz', () => {
    const bg = rgb(255, 255, 255);
    const fix = suggestForeground(hex('#8fb3ff'), bg, 4.5);
    expect(fix).not.toBeNull();
    expect(contrastRatio(fix!, bg)).toBeGreaterThanOrEqual(4.5);
    expect(rgbToHsl(fix!).h).toBeGreaterThan(200);
    expect(suggestForeground(hex('#000000'), bg)).toEqual(hex('#000000'));
    const dark = suggestForeground(hex('#334466'), rgb(10, 10, 10), 7);
    expect(dark && contrastRatio(dark, rgb(10, 10, 10))).toBeGreaterThanOrEqual(7);
  });
});

describe('estúdio de cores · harmonias', () => {
  const base = hex('#3366CC');
  it('complementar, tríade e tétrade giram o matiz', () => {
    expect(scheme(base, 'complementary').map((c) => toHex(c))).toEqual(['#3366CC', '#CC9933']);
    const triad = scheme(base, 'triadic').map((c) => rgbToHsl(c).h);
    expect(triad.map((h) => Math.round(h))).toEqual([220, 340, 100]);
    expect(scheme(base, 'tetradic')).toHaveLength(4);
    expect(scheme(base, 'analogous')).toHaveLength(3);
    expect(scheme(base, 'split')).toHaveLength(3);
  });
  it('monocromática e escala mantêm matiz e variam a luminosidade', () => {
    const mono = scheme(base, 'monochrome');
    expect(mono).toHaveLength(5);
    const ls = mono.map((c) => rgbToHsl(c).l);
    expect([...ls].sort((a, b) => a - b)).toEqual(ls);
    const scale = scheme(base, 'scale');
    expect(scale).toHaveLength(9);
    expect(rgbToHsl(scale[0]!).l).toBeGreaterThan(rgbToHsl(scale[8]!).l);
  });
});

describe('estúdio de cores · cores de uma imagem', () => {
  function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): number[] {
    const out: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(...paint(x, y));
    return out;
  }
  it('acha as cores dominantes, a mais presente primeiro', () => {
    const data = image(40, 10, (x) => (x < 30 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const p = extractPalette(data, 2).map((c) => toHex(c));
    expect(p).toEqual(['#FF0000', '#0000FF']);
  });
  it('ignora pixels transparentes e aceita imagens vazias', () => {
    expect(extractPalette(image(5, 5, () => [10, 20, 30, 0]), 3)).toEqual([]);
    expect(extractPalette([], 3)).toEqual([]);
    const half = image(10, 10, (x) => (x < 5 ? [0, 255, 0, 255] : [1, 2, 3, 0]));
    expect(extractPalette(half, 4).map((c) => toHex(c))).toEqual(['#00FF00']);
  });
  it('respeita a quantidade pedida e é determinístico', () => {
    const data = image(64, 64, (x, y) => [x * 4, y * 4, (x * y) % 256, 255]);
    const a = extractPalette(data, 6), b = extractPalette(data, 6);
    expect(a).toHaveLength(6);
    expect(a).toEqual(b);
    expect(extractPalette(data, 100).length).toBeLessThanOrEqual(16);
  });
});

describe('estúdio de cores · cores em texto livre', () => {
  it('acha hex, rgb() e hsl() sem repetir', () => {
    const found = colorsInText('Marca: #3366cc e #36C, fundo rgb(255, 255, 255); texto hsl(0 0% 0%) #3366CC').map((c) => toHex(c));
    expect(found).toEqual(['#3366CC', '#FFFFFF', '#000000']);
  });
  it('respeita o limite e ignora lixo', () => {
    expect(colorsInText('nada aqui')).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => '#' + i.toString(16).padStart(6, '0')).join(' ');
    expect(colorsInText(many, 64)).toHaveLength(64);
  });
});
