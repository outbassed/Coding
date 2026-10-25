import { describe, expect, it } from 'vitest';
import { buildPreviewDoc, buildStandalone, CSP, exportFiles, parseConsoleMessage, SANDBOX } from './build';
import { blankCode, normalizeCode, MAX_FILE_CHARS, type CodeState } from './model';
import { codeTemplates } from './kind';

const state = (over: Partial<CodeState> = {}): CodeState => ({ ...blankCode(), ...over });

describe('Código · montagem do documento', () => {
  it('a política sem rede vem antes de qualquer conteúdo do usuário, mesmo com <head> dentro de comentário', () => {
    const doc = buildPreviewDoc(state({ html: '<!-- <head> --><p>oi</p>' }));
    expect(doc.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<p>oi</p>'));
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).not.toMatch(/connect-src|http/);
  });
  it('o quadro nunca recebe allow-same-origin', () => {
    expect(SANDBOX).toBe('allow-scripts');
    expect(SANDBOX).not.toContain('same-origin');
  });
  it('style.css e script.js referenciados são embutidos no lugar da referência', () => {
    const doc = buildPreviewDoc(state({ css: 'p{color:red}', js: 'console.log(1)' }));
    expect(doc).toContain('<style>p{color:red}</style>');
    expect(doc).toContain('<script>console.log(1)</script>');
    expect(doc).not.toContain('href="style.css"');
    expect(doc).not.toContain('src="script.js"');
  });
  it('sem referências, CSS entra antes e JS depois do HTML', () => {
    const doc = buildStandalone(state({ html: '<h1>x</h1>', css: 'h1{margin:0}', js: 'var a=1' }));
    expect(doc).toBe('<!doctype html><style>h1{margin:0}</style><h1>x</h1><script>var a=1</script>');
  });
  it('defer vai para o fim do documento (script embutido ignoraria o defer)', () => {
    const html = '<head><script src="script.js" defer></script></head><body><p id="a"></p></body>';
    const doc = buildStandalone(state({ html, js: 'x()' }));
    expect(doc.endsWith('<script>x()</script>')).toBe(true);
    expect(doc.indexOf('<script>')).toBeGreaterThan(doc.indexOf('</body>'));
  });
  it('type=module é mantido', () => {
    expect(buildStandalone(state({ html: '<script type="module" src="./script.js"></script>', js: 'export {}' }))).toContain('<script type="module">export {}</script>');
  });
  it('</script> e </style> dentro do código não fecham a tag antes da hora', () => {
    const doc = buildStandalone(state({ html: '', css: 'a::after{content:"</style>"}', js: 'var s="</script><b>"' }));
    expect(doc).not.toMatch(/<\/style>"/);
    expect(doc).toContain('<\\/script><b>');
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
  });
  it('símbolos de substituição do JavaScript ($&, $1) no código do usuário ficam intactos', () => {
    const doc = buildStandalone(state({ js: "var a = '$&' + '$1' + `$$`" }));
    expect(doc).toContain("var a = '$&' + '$1' + `$$`");
  });
  it('a captura do console só existe na visualização', () => {
    expect(buildPreviewDoc(state())).toContain('postMessage');
    expect(buildStandalone(state())).not.toContain('postMessage');
    expect(buildStandalone(state())).not.toContain('Content-Security-Policy');
  });
});

describe('Código · exportação', () => {
  it('index.html sempre liga style.css e script.js', () => {
    const files = exportFiles(state({ html: '<head></head><body><h1>x</h1></body>', css: 'h1{}', js: 'a()' }));
    expect(files.map((f) => f.name)).toEqual(['index.html', 'style.css', 'script.js']);
    expect(files[0]!.text).toContain('<link rel="stylesheet" href="style.css">\n</head>');
    expect(files[0]!.text).toContain('<script src="script.js"></script>\n</body>');
    expect(files[0]!.text.startsWith('<!doctype html>')).toBe(true);
    expect(files[1]!.text).toBe('h1{}');
  });
  it('não duplica referências que já existem nem acrescenta as de arquivos vazios', () => {
    const files = exportFiles(state());
    expect(files[0]!.text.match(/style\.css/g)).toHaveLength(1);
    expect(files[0]!.text.match(/script\.js/g)).toHaveLength(1);
    const bare = exportFiles(state({ html: '<p>x</p>', css: '', js: '' }));
    expect(bare[0]!.text).toBe('<!doctype html>\n<p>x</p>');
  });
  it('todos os modelos montam e exportam', () => {
    for (const t of codeTemplates) {
      const s = t.create();
      expect(buildPreviewDoc(s).length).toBeGreaterThan(50);
      expect(exportFiles(s)).toHaveLength(3);
      expect(normalizeCode(s)).toEqual(s);
    }
  });
});

describe('Código · modelo e mensagens', () => {
  it('normaliza lixo, limita o tamanho e valida opções', () => {
    expect(normalizeCode(null).name).toBe('Projeto de código');
    const n = normalizeCode({ name: 5, html: 'x'.repeat(MAX_FILE_CHARS + 10), css: 3, js: null, auto: 'não', tabSize: 8 });
    expect(n.html).toHaveLength(MAX_FILE_CHARS);
    expect(n.css).toBe('');
    expect(n.auto).toBe(true);
    expect(n.tabSize).toBe(2);
    expect(normalizeCode({ auto: false, tabSize: 4 })).toMatchObject({ auto: false, tabSize: 4 });
  });
  it('só aceita mensagens do console no formato esperado', () => {
    expect(parseConsoleMessage({ source: 'coding-code-console', level: 'warn', text: 'a' })).toEqual({ level: 'warn', text: 'a' });
    expect(parseConsoleMessage({ source: 'coding-code-console', level: 'x', text: 'a' })).toEqual({ level: 'log', text: 'a' });
    expect(parseConsoleMessage({ source: 'outro', level: 'log', text: 'a' })).toBeNull();
    expect(parseConsoleMessage({ source: 'coding-code-console', text: 5 })).toBeNull();
    expect(parseConsoleMessage('texto')).toBeNull();
    expect(parseConsoleMessage(null)).toBeNull();
    expect(parseConsoleMessage({ source: 'coding-code-console', level: 'log', text: 'z'.repeat(5000) })!.text).toHaveLength(2000);
  });
});
