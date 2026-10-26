import { describe, expect, it } from 'vitest';
import { buildPreview, buildPreviewDoc, buildStandalone, CSP, exportFiles, pageRefs, parseConsoleMessage, parseNavMessage, SANDBOX, usedAssets } from './build';
import { blankCode, fromTriple, normalizeCode, type CodeState } from './model';
import { codeTemplates } from './kind';

/** Projeto com os arquivos dados (caminho → texto). */
const proj = (files: Record<string, string>, over: Partial<CodeState> = {}): CodeState =>
  normalizeCode({ files: Object.entries(files).map(([path, text]) => ({ path, text })), ...over });
const triple = (html: string, css = '', js = ''): CodeState => fromTriple({ name: 'T', html, css, js });

describe('Código · montagem do documento', () => {
  it('a política sem rede vem antes de qualquer conteúdo do usuário, mesmo com <head> dentro de comentário', () => {
    const doc = buildPreviewDoc(triple('<!-- <head> --><p>oi</p>'));
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
    const s = blankCode();
    s.files[1]!.text = 'p{color:red}'; s.files[2]!.text = 'console.log(1)';
    const doc = buildPreviewDoc(s);
    expect(doc).toContain('<style>p{color:red}</style>');
    expect(doc).toContain('<script>console.log(1)</script>');
    expect(doc).not.toContain('href="style.css"');
    expect(doc).not.toContain('src="script.js"');
  });
  it('sem referências, CSS entra antes e JS depois do HTML (conveniência de style.css e script.js da raiz)', () => {
    expect(buildStandalone(triple('<h1>x</h1>', 'h1{margin:0}', 'var a=1'))).toBe('<!doctype html><style>h1{margin:0}</style><h1>x</h1><script>var a=1</script>');
  });
  it('a conveniência vale só para a página inicial e só para a raiz', () => {
    const s = proj({ 'index.html': '<p>a</p>', 'style.css': 'p{}', 'sobre.html': '<p>b</p>', 'css/x.css': 'q{}' });
    expect(buildStandalone(s, { page: 'sobre.html' })).toBe('<!doctype html><p>b</p>');
    expect(buildStandalone(s)).toContain('<style>p{}</style>');
  });
  it('defer vai para o fim do documento (script embutido ignoraria o defer)', () => {
    const doc = buildStandalone(triple('<head><script src="script.js" defer></script></head><body><p id="a"></p></body>', '', 'x()'));
    expect(doc.endsWith('<script>x()</script>')).toBe(true);
    expect(doc.indexOf('<script>')).toBeGreaterThan(doc.indexOf('</body>'));
  });
  it('type=module é mantido', () => {
    expect(buildStandalone(triple('<script type="module" src="./script.js"></script>', '', 'export {}'))).toContain('<script type="module">export {}</script>');
  });
  it('</script> e </style> dentro do código não fecham a tag antes da hora', () => {
    const doc = buildStandalone(triple('', 'a::after{content:"</style>"}', 'var s="</script><b>"'));
    expect(doc).not.toMatch(/<\/style>"/);
    expect(doc).toContain('<\\/script><b>');
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
  });
  it('símbolos de substituição do JavaScript ($&, $1) no código do usuário ficam intactos', () => {
    expect(buildStandalone(triple('', '', "var a = '$&' + '$1' + `$$`"))).toContain("var a = '$&' + '$1' + `$$`");
  });
  it('a captura do console só existe na visualização', () => {
    expect(buildPreviewDoc(blankCode())).toContain('postMessage');
    expect(buildStandalone(blankCode())).not.toContain('postMessage');
    expect(buildStandalone(blankCode())).not.toContain('Content-Security-Policy');
  });
});

describe('Código · vários arquivos e pastas', () => {
  const site = proj({
    'index.html': '<!doctype html><link rel="stylesheet" href="css/tema.css"><body><img src="img/logo.svg" alt=""><img src="img/foto.png" alt=""><a href="sobre.html">Sobre</a><script src="js/app.js"></script></body>',
    'css/tema.css': '@import "base.css"; body{background:url(../img/fundo.svg)}',
    'css/base.css': 'html{margin:0}',
    'js/app.js': "fetch('dados/info.json').then(r => r.json()).then(console.log)",
    'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'img/fundo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    'dados/info.json': '{"ok":true}',
    'sobre.html': '<h1>Sobre</h1>'
  }, { assets: [{ path: 'img/foto.png', blobId: 'b1', mime: 'image/png', size: 4 }] });
  const ctx = { assetUrl: (p: string) => (p === 'img/foto.png' ? 'data:image/png;base64,AAAA' : undefined) };

  it('resolve CSS, @import, JS, imagens (texto e binárias) a partir de pastas', () => {
    const { doc, warnings } = buildPreview(site, ctx);
    expect(warnings).toEqual([]);
    expect(doc).toContain('html{margin:0}');
    expect(doc).toContain('body{background:url("data:image/svg+xml;base64,');
    expect(doc).toContain("fetch('dados/info.json')");
    expect(doc).toContain('src="data:image/svg+xml;base64,');
    expect(doc).toContain('src="data:image/png;base64,AAAA"');
    expect(doc).not.toContain('href="css/tema.css"');
    expect(doc).toContain('href="sobre.html"'); // links entre páginas ficam e são tratados pelo quadro
  });
  it('arquivos de texto do projeto ficam disponíveis para fetch (menos a própria página)', () => {
    const { doc } = buildPreview(site, ctx);
    expect(doc).toContain('"dados/info.json":{"t":"{\\"ok\\":true}"');
    expect(doc).not.toContain('"index.html":{"t"');
  });
  it('arquivo ligado que não existe vira aviso, sem quebrar a página', () => {
    const s = proj({ 'index.html': '<link rel="stylesheet" href="nada.css"><script src="x/nada.js"></script><img src="i.png"><p>ok</p>' });
    const r = buildPreview(s);
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings.join(' ')).toContain('nada.css');
    expect(r.doc).toContain('<p>ok</p>');
  });
  it('@import circular não trava', () => {
    const s = proj({ 'index.html': '<link rel="stylesheet" href="a.css">', 'a.css': '@import "b.css"; a{}', 'b.css': '@import "a.css"; b{}' });
    const r = buildPreview(s);
    expect(r.warnings.join(' ')).toContain('circular');
    expect(r.doc).toContain('b{}');
  });
  it('mostra a página pedida e cai no index.html quando o pedido não existe', () => {
    expect(buildPreview(site, { ...ctx, page: 'sobre.html' }).page).toBe('sobre.html');
    expect(buildPreview(site, { ...ctx, page: 'inexistente.html' }).page).toBe('index.html');
    expect(buildPreview(proj({ 'pagina.html': '<p>só</p>' })).page).toBe('pagina.html');
  });
  it('projeto sem página HTML explica o que fazer', () => {
    const r = buildPreview(proj({ 'dados.json': '{}' }));
    expect(r.page).toBeNull();
    expect(r.doc).toContain('nenhuma página HTML');
  });
  it('mensagem de navegação só vale para páginas HTML que existem', () => {
    expect(parseNavMessage({ source: 'coding-code-console', nav: 'sobre.html' }, site)).toBe('sobre.html');
    expect(parseNavMessage({ source: 'coding-code-console', nav: 'js/app.js' }, site)).toBeNull();
    expect(parseNavMessage({ source: 'coding-code-console', nav: 'sumiu.html' }, site)).toBeNull();
    expect(parseNavMessage({ source: 'outro', nav: 'sobre.html' }, site)).toBeNull();
    expect(parseNavMessage('x', site)).toBeNull();
  });
  it('usedAssets lista só recursos cujo nome aparece no código', () => {
    expect(usedAssets(site)).toEqual(['img/foto.png']);
    expect(usedAssets({ ...site, files: [{ path: 'index.html', text: '<p>nada</p>' }] })).toEqual([]);
  });
  it('pageRefs resolve referências a partir da pasta da página', () => {
    const refs = pageRefs('<link rel="stylesheet" href="../css/a.css"><script src="./b.js"></script>', 'pag/x.html');
    expect([...refs].sort()).toEqual(['b.js'.replace('b.js', 'pag/b.js'), 'css/a.css'].sort());
  });
});

describe('Código · exportação', () => {
  it('index.html sempre liga style.css e script.js', () => {
    const files = exportFiles(triple('<head></head><body><h1>x</h1></body>', 'h1{}', 'a()'));
    expect(files.map((f) => f.name)).toEqual(['index.html', 'style.css', 'script.js']);
    expect(files[0]!.text).toContain('<link rel="stylesheet" href="style.css">\n</head>');
    expect(files[0]!.text).toContain('<script src="script.js"></script>\n</body>');
    expect(files[0]!.text.startsWith('<!doctype html>')).toBe(true);
    expect(files[1]!.text).toBe('h1{}');
  });
  it('não duplica referências que já existem nem acrescenta as de arquivos vazios', () => {
    const files = exportFiles(blankCode());
    expect(files[0]!.text.match(/style\.css/g)).toHaveLength(1);
    expect(files[0]!.text.match(/script\.js/g)).toHaveLength(1);
    expect(exportFiles(triple('<p>x</p>'))[0]!.text).toBe('<p>x</p>');
  });
  it('mantém os caminhos das pastas', () => {
    expect(exportFiles(proj({ 'index.html': '<p/>', 'js/a.js': '1' })).map((f) => f.name)).toEqual(['index.html', 'js/a.js']);
  });
  it('todos os modelos montam, exportam e normalizam sem mudar', () => {
    for (const t of codeTemplates) {
      const s = t.create();
      expect(buildPreviewDoc(s).length).toBeGreaterThan(50);
      expect(exportFiles(s).length).toBeGreaterThanOrEqual(3);
      expect(normalizeCode(s)).toEqual(s);
      expect(buildPreview(s).warnings).toEqual([]);
    }
  });
});

describe('Código · mensagens do console', () => {
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
