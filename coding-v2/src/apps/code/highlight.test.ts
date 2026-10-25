import { describe, expect, it } from 'vitest';
import { highlight, plainOf } from './highlight';
import type { CodeLang } from './model';

const SAMPLES: Record<CodeLang, string[]> = {
  js: [
    "const a = 'texto \\' com aspas'; // comentário\n/* bloco\nmultilinha */ let b = `modelo ${a}` + 0x1F + 1.5e3;\nfunction f(x) { return x ?? null; }\n",
    "var s = 'sem fim\nvar t = \"outro sem fim", '/* sem fim', '', '<div>&amp;</div>',
    'a < b && c > d'
  ],
  css: [
    '@media (min-width: 600px) { .a:hover, a::after { color: #fff; margin: -1.5rem 0 !important; background: url("x.png"); } }\n/* c */',
    'a{', '}}', "content: '\\''", 'x::before{color:red}'
  ],
  json: ['{"a": [1, -2.5e3, true, false, null], "b": "x\\"y", "c": {"d": "e"}}', '{"aberta": "sem fim', '[1,2'],
  html: [
    '<!doctype html>\n<!-- c -->\n<html lang="pt-BR"><head><style>a { color: red }</style></head><body class=x data-n=\'1\' hidden>\n<script>const x = "<b>"; // </b>\n</script><p>a &amp; b < c</p><img src="a.png"/></body></html>',
    '<div', '<div class="aberta', '<!-- sem fim', '<script>sem fim', '<a href="x">y</a', '< 3 && 4 >', '<script type="application/json">{"a":1}</script>'
  ],
  svg: ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1" fill="none"/></svg>'],
  text: ['texto <com> símbolos & outros\nlinha 2']
};

describe('Código · realce de sintaxe', () => {
  it('mantém exatamente o mesmo texto, em todas as linguagens e até com código incompleto', () => {
    for (const [lang, list] of Object.entries(SAMPLES) as [CodeLang, string[]][]) {
      for (const text of list) expect(plainOf(highlight(lang, text)), lang + ': ' + text).toBe(text);
    }
  });
  it('nunca deixa HTML do usuário solto: tudo que é < e & sai escapado', () => {
    for (const lang of ['js', 'css', 'json', 'html', 'svg', 'text'] as CodeLang[]) {
      const out = highlight(lang, '<img src=x onerror=alert(1)> & <script>alert(2)</script>');
      expect(out.replace(/<\/?span[^>]*>/g, '')).not.toMatch(/<(?!\/?span)/);
    }
  });
  it('marca palavras-chave, textos, números e comentários', () => {
    expect(highlight('js', "const a = 'x'; // c")).toBe('<span class="t-k">const</span> a = <span class="t-s">\'x\'</span>; <span class="t-c">// c</span>');
    expect(highlight('js', 'let n = 42')).toContain('<span class="t-n">42</span>');
    expect(highlight('css', 'a { color: #fff; }')).toContain('<span class="t-p">color</span>:');
    expect(highlight('css', 'a:hover { }')).not.toContain('t-p'); // seletor, não propriedade
    expect(highlight('html', '<p class="a">x</p>')).toContain('<span class="t-t">&lt;p</span>');
    expect(highlight('html', '<p class="a">')).toContain('<span class="t-p">class</span>=<span class="t-s">"a"</span>');
    expect(highlight('json', '{"k": 1}')).toContain('<span class="t-p">"k"</span>:');
  });
  it('realça CSS e JavaScript dentro de <style> e <script>', () => {
    const out = highlight('html', '<style>a { color: red }</style><script>const x = 1</script>');
    expect(out).toContain('<span class="t-p">color</span>');
    expect(out).toContain('<span class="t-k">const</span>');
  });
  it('aguenta arquivos grandes sem demorar', () => {
    const big = "const a = 'x'; // c\n".repeat(20000);
    const t0 = Date.now();
    expect(plainOf(highlight('js', big))).toBe(big);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
