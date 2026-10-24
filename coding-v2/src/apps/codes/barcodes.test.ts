import { describe, expect, it } from 'vitest';
import { code128, code39, ean13, ean8, gtinCheck, upca } from './barcodes';
import { qrMatrix } from './render';

/* Padrões conferidos módulo a módulo com a biblioteca ReportLab (implementação independente). */
const REF = {
  c128: '1101001000010100011000100010110001000100011010011011100100111001101100111001011001011100101100001001100011101011',
  c39: '100010111011101011101110100010101110101110100010101011100010111010111010001110101010111010001110101010001110111010001110101110101011100010101110100010111011101',
  ean13: '10101101110010111001100100110110111101001110101010100111010100001000100100100011101001001110101',
  ean8: '1010001011010111101111010110111010101001110111001010001001011100101'
};
describe('códigos de barras', () => {
  it('Code 128, Code 39, EAN-13 e EAN-8 iguais à referência', () => {
    expect(code128('ABC-123').modules.join('')).toBe(REF.c128);
    expect(code39('CODING 2').modules.join('')).toBe(REF.c39);
    expect(ean13('789123456789').modules.join('')).toBe(REF.ean13);
    expect(ean8('9638507').modules.join('')).toBe(REF.ean8);
  });
  it('dígito verificador e validações', () => {
    expect(gtinCheck('400638133393')).toBe(1);
    expect(ean13('789123456789').text).toBe('7891234567895');
    expect(() => ean13('7891234567890')).toThrow(/verificador/);
    expect(() => ean13('12ab')).toThrow(/números/);
    expect(upca('03600029145').text).toBe('036000291452');
    expect(() => code128('ação')).toThrow(/ASCII/);
    expect(() => code39('a*b')).toThrow();
  });
  it('QR code com acentos tem padrões de localização nos cantos', () => {
    const m = qrMatrix('https://exemplo.com.br/ação', 'M');
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r]![c]).toBe(true); expect(m[r + 6]![c + 6]).toBe(true); expect(m[r + 1]![c + 1]).toBe(false); expect(m[r + 3]![c + 3]).toBe(true);
    }
    expect(() => qrMatrix('x'.repeat(5000), 'H')).toThrow(/longo demais/);
  });
});
