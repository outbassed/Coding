import { beforeEach, describe, expect, it } from 'vitest';
import { cleanColor, cleanFont, cleanHref, linkFromInput, cleanPercent, cleanSize, initialTextState, normalizedTextState, sanitizeTextHtml } from './model';

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

  it('guarda fonte, tamanho, cores e largura de imagem, só dentro da lista segura', () => {
    const html = sanitizeTextHtml('<p style="font-size:99px;color:red;font-family:evil">a</p><p><span style="font-family: &quot;Times New Roman&quot;, serif; font-size: 18px; color: rgb(192, 57, 43); background-color: rgb(255, 224, 102)">b</span></p><img src="data:image/png;base64,AAEC" style="width: 40%; position:fixed">');
    expect(html).not.toMatch(/evil|99px|position|red/);
    expect(html).toContain('font-family: &quot;Times New Roman&quot;');
    expect(html).toContain('font-size: 18px');
    expect(html).toContain('color: rgb(192, 57, 43)');
    expect(html).toContain('background-color: rgb(255, 224, 102)');
    expect(html).toMatch(/<img[^>]*style="width: 40%;"/);
  });
  it('rejeita cores e tamanhos perigosos ou fora da faixa', () => {
    expect(cleanColor('url(javascript:alert(1))')).toBeNull();
    expect(cleanColor('expression(1)')).toBeNull();
    expect(cleanColor('rgb(300, 0, 0)')).toBeNull();
    expect(cleanColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cleanColor('#abc')).toBe('#aabbcc');
    expect(cleanColor('rgb(255, 0, 10)')).toBe('#ff000a');
    expect(cleanSize('7px')).toBeNull();
    expect(cleanSize('97px')).toBeNull();
    expect(cleanSize('12pt')).toBe(16);
    expect(cleanPercent('4%')).toBeNull();
    expect(cleanPercent('101%')).toBeNull();
    expect(cleanPercent('300px')).toBeNull();
    expect(cleanFont('"Comic Sans", Arial')).toBeNull();
    expect(cleanFont("'Courier New', monospace")).toBe('Courier New');
  });
  it('documentos antigos continuam iguais depois da limpeza (idempotente)', () => {
    const old = '<h1>Carta</h1><p style="text-align: center;">Olá <b>mundo</b></p><ul><li>um</li></ul>';
    const once = sanitizeTextHtml(old);
    expect(sanitizeTextHtml(once)).toBe(once);
    expect(once).toContain('<h1>Carta</h1>');
  });

  it('links: só http, https e mailto; guarda rel seguro e remove esquemas perigosos', () => {
    const html = sanitizeTextHtml('<p><a href="https://exemplo.com/a?b=1" onclick="x()" style="color:red">ok</a> <a href="javascript:alert(1)">ruim</a> <a href="data:text/html,x">dados</a> <a href="mailto:oi@exemplo.com">mail</a> <a href="  ">vazio</a></p>');
    expect(html).toContain('<a href="https://exemplo.com/a?b=1" rel="noopener noreferrer" target="_blank">ok</a>');
    expect(html).toContain('<a href="mailto:oi@exemplo.com"');
    expect(html).toContain('ruim');
    expect(html).toContain('dados');
    expect(html).not.toMatch(/javascript:|data:text|onclick|style=/i);
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });
  it('links: normaliza o que a pessoa digita', () => {
    expect(linkFromInput('exemplo.com')).toBe('https://exemplo.com/');
    expect(linkFromInput('www.exemplo.com/pagina')).toBe('https://www.exemplo.com/pagina');
    expect(linkFromInput('exemplo.com:8080/x')).toBe('https://exemplo.com:8080/x');
    expect(linkFromInput('nome@site.com')).toBe('mailto:nome@site.com');
    expect(linkFromInput('http://a.b')).toBe('http://a.b/');
    expect(linkFromInput('javascript:alert(1)')).toBeNull();
    expect(linkFromInput('')).toBeNull();
    expect(linkFromInput('dois espaços.com')).toBeNull();
    expect(cleanHref('ftp://x.com')).toBeNull();
    expect(cleanHref('https://')).toBeNull();
  });
});
