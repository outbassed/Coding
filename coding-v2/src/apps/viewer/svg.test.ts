import { describe, expect, it } from 'vitest';
import { sanitizeSvg, SvgError } from './svg';

const wrap = (inner: string, attrs = ''): string => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" ' + attrs + '>' + inner + '</svg>';

describe('SVG · saneamento', () => {
  it('mantém desenho comum', () => {
    const out = sanitizeSvg(wrap('<rect x="1" y="1" width="8" height="8" fill="#f00"/><circle cx="5" cy="5" r="2"/><text x="1" y="9">oi</text>'));
    expect(out).toContain('<rect');
    expect(out).toContain('fill="#f00"');
    expect(out).toContain('<circle');
    expect(out).toContain('>oi<');
  });
  it('remove script, foreignObject e elementos desconhecidos', () => {
    const out = sanitizeSvg(wrap('<script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="https://x.com"><rect width="1" height="1"/></a><iframe src="x"/><rect id="ok" width="1" height="1"/>'));
    expect(out).not.toMatch(/script|foreignObject|iframe|<a[ >]|alert/i);
    expect(out).toContain('id="ok"');
  });
  it('remove atributos de evento e URLs perigosas', () => {
    const out = sanitizeSvg(wrap('<rect onclick="alert(1)" onload="x()" width="1" height="1"/><use href="https://evil.com/a.svg#x"/><use xlink:href="javascript:alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"/><image href="http://evil.com/p.png"/><use href="#ok"/>', 'onload="boom()"'));
    expect(out).not.toMatch(/onclick|onload|evil\.com|javascript:/i);
    expect(out).toContain('href="#ok"');
  });
  it('mantém imagens embutidas (data:image) e bloqueia o resto', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeSvg(wrap('<image href="' + png + '" width="1" height="1"/>'))).toContain(png);
    expect(sanitizeSvg(wrap('<image href="data:text/html;base64,PHNjcmlwdD4=" width="1" height="1"/>'))).not.toContain('data:text/html');
  });
  it('CSS: remove @import, url externo e javascript:', () => {
    expect(sanitizeSvg(wrap('<style>@import url(https://evil.com/x.css); rect{fill:red}</style><rect width="1" height="1"/>'))).not.toMatch(/evil|<style/);
    expect(sanitizeSvg(wrap('<rect style="fill:url(https://evil.com/x)" width="1" height="1"/>'))).not.toContain('evil');
    expect(sanitizeSvg(wrap('<rect fill="url(#g)" width="1" height="1"/>'))).toContain('url(#g)');
    expect(sanitizeSvg(wrap('<style>rect{fill:blue}</style><rect width="1" height="1"/>'))).toContain('<style>');
  });
  it('recusa XML quebrado, outra raiz e arquivos enormes', () => {
    expect(() => sanitizeSvg('<svg><g></svg>')).toThrow(SvgError);
    expect(() => sanitizeSvg('<html><body>oi</body></html>')).toThrow(SvgError);
    expect(() => sanitizeSvg('nada de xml')).toThrow(SvgError);
    expect(() => sanitizeSvg('x'.repeat(9 * 1024 * 1024))).toThrow(/grande demais/);
  });
});
