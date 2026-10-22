import { beforeEach, describe, expect, it } from 'vitest';
import { initialTextState, normalizedTextState, sanitizeTextHtml } from './model';

describe('Texto: HTML confiável e modelo inicial', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('inicia com um documento editável real', () => {
    const state = initialTextState();
    expect(state.name).toBe('Carta de apresentação');
    expect(state.html).toContain('<h1>');
  });
  it('retira scripts, handlers, links e endereços remotos de imagens', () => {
    const dirty = '<h1 onclick="alert(1)">Teste</h1><script>alert(1)</script><p><a href="javascript:alert(1)">link</a><img src="https://x.test/leak.png"></p>';
    const html = sanitizeTextHtml(dirty);
    expect(html).toContain('Teste');
    expect(html).toContain('link');
    expect(html).not.toMatch(/<script|on[a-z]+=|javascript:|https:/i);
  });
  it('mantém formatação comum e imagem PNG data-url', () => {
    const html = sanitizeTextHtml('<h2 style="text-align: center">Título</h2><ul><li><b>Item</b></li></ul><img src="data:image/png;base64,AAEC" alt="Foto">');
    expect(html).toContain('<h2 style="text-align: center;">');
    expect(html).toContain('<ul><li><b>Item</b></li></ul>');
    expect(html).toContain('data:image/png;base64,AAEC');
  });
  it('recusa documentos gigantes e normaliza nomes', () => {
    expect(() => sanitizeTextHtml('a'.repeat(3_000_001))).toThrow('limite');
    expect(normalizedTextState({ name: '', html: '<p>OK</p>' }).name).toBe('Documento sem título');
  });
});
