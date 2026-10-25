import { describe, expect, it } from 'vitest';
import {
  MAX_TOTAL_CHARS, addFile, addFolder, blankCode, cleanPath, CodeError, entryPage, fromTriple, langOf, MAX_FILE_CHARS, MAX_FILES, normalizeCode, removeFile, removeFolder, renamePath,
  resolveRef, treeRows, type CodeState
} from './model';

const proj = (files: Record<string, string>, over: Record<string, unknown> = {}): CodeState =>
  normalizeCode({ files: Object.entries(files).map(([path, text]) => ({ path, text })), ...over });
const fails = (fn: () => unknown, msg?: RegExp): void => { expect(fn).toThrow(CodeError); if (msg) expect(fn).toThrow(msg); };

describe('Código · caminhos', () => {
  it('limpa e valida', () => {
    expect(cleanPath(' css\\tema.css ')).toBe('css/tema.css');
    expect(cleanPath('./a//b/c.js')).toBe('a/b/c.js');
    expect(cleanPath('/index.html')).toBe('index.html');
    for (const bad of ['', '..', 'a/../b', '../x.js', 'a:b.js', 'a*.css', 'nome<.html', '...', 'x/'.repeat(9) + 'y.js', 'a'.repeat(200)]) expect(cleanPath(bad), bad).toBeNull();
  });
  it('reconhece a linguagem pela extensão', () => {
    expect([langOf('a.html'), langOf('a.css'), langOf('a.js'), langOf('a.json'), langOf('a.svg'), langOf('a.txt'), langOf('LEIA')]).toEqual(['html', 'css', 'js', 'json', 'svg', 'text', 'text']);
  });
  it('resolveRef resolve relativo à pasta, bloqueia saída da raiz e links externos', () => {
    expect(resolveRef('index.html', 'css/a.css')).toBe('css/a.css');
    expect(resolveRef('pag/x.html', '../css/a.css')).toBe('css/a.css');
    expect(resolveRef('pag/x.html', './img/a%20b.png?v=1#x')).toBe('pag/img/a b.png');
    expect(resolveRef('x.html', '/raiz/a.js')).toBe('raiz/a.js');
    expect(resolveRef('x.html', '../fora.js')).toBeNull();
    for (const ext of ['https://x.com/a.js', '//cdn/x.js', 'data:text/plain,a', '#topo', 'mailto:a@b.c', '']) expect(resolveRef('x.html', ext), ext).toBeNull();
  });
});

describe('Código · normalização e formato antigo', () => {
  it('converte o formato de três arquivos sem perder nada', () => {
    const s = normalizeCode({ name: 'Velho', html: '<p>a</p>', css: 'p{}', js: 'x()', auto: false, tabSize: 4 });
    expect(s.files).toEqual([{ path: 'index.html', text: '<p>a</p>' }, { path: 'style.css', text: 'p{}' }, { path: 'script.js', text: 'x()' }]);
    expect(s).toMatchObject({ name: 'Velho', auto: false, tabSize: 4, active: 'index.html', entry: '' });
    expect(normalizeCode(s)).toEqual(s);
  });
  it('lixo vira projeto inicial e limites são respeitados', () => {
    expect(normalizeCode(null).files.map((f) => f.path)).toEqual(['index.html', 'style.css', 'script.js']);
    expect(normalizeCode({ files: 'x' }).files).toHaveLength(3);
    const big = normalizeCode({ files: [{ path: 'a.js', text: 'x'.repeat(MAX_FILE_CHARS + 5) }] });
    expect(big.files[0]!.text).toHaveLength(MAX_FILE_CHARS);
    expect(normalizeCode({ auto: 'não', tabSize: 8 })).toMatchObject({ auto: true, tabSize: 2 });
  });
  it('descarta caminhos inválidos, repetidos (sem diferenciar maiúsculas) e extensões desconhecidas', () => {
    const s = proj({ 'a.js': '1', 'A.JS': '2', '../x.js': '3', 'img.png': 'x', 'ok/b.css': '4' });
    expect(s.files.map((f) => f.path)).toEqual(['a.js', 'ok/b.css']);
  });
  it('limita o total de caracteres do projeto', () => {
    const n = normalizeCode({ files: Array.from({ length: 8 }, (_, i) => ({ path: 'f' + i + '.txt', text: 'x'.repeat(MAX_FILE_CHARS) })) });
    expect(n.files.reduce((a, f) => a + f.text.length, 0)).toBe(MAX_TOTAL_CHARS);
    expect(n.files).toHaveLength(5);
    fails(() => addFile(n, 'mais.txt', 'x'), /passaria/);
  });
  it('limita a quantidade de arquivos', () => {
    const many = normalizeCode({ files: Array.from({ length: MAX_FILES + 30 }, (_, i) => ({ path: 'f' + i + '.txt', text: '' })) });
    expect(many.files).toHaveLength(MAX_FILES);
  });
  it('abas, arquivo ativo e página inicial sempre apontam para arquivos que existem', () => {
    const s = proj({ 'index.html': '', 'b.html': '', 'c.js': '' }, { open: ['c.js', 'nada.js', 'c.js'], active: 'sumiu', entry: 'c.js' });
    expect(s.open).toEqual(['c.js', 'index.html']);
    expect(s.active).toBe('index.html');
    expect(s.entry).toBe('');
    expect(proj({ 'index.html': '', 'b.html': '' }, { entry: 'b.html' }).entry).toBe('b.html');
  });
  it('recursos binários exigem blobId e respeitam o tamanho máximo', () => {
    const s = normalizeCode({
      files: [{ path: 'index.html', text: '' }],
      assets: [{ path: 'a.png', blobId: 'x', size: 10, mime: 'image/png' }, { path: 'b.png', size: 10 }, { path: 'c.png', blobId: 'y', size: 9e9 }, { path: 'd.js', blobId: 'z', size: 1 }]
    });
    expect(s.assets.map((a) => a.path)).toEqual(['a.png']);
  });
  it('página inicial: escolhida > index.html > primeira página', () => {
    expect(entryPage(proj({ 'x.html': '', 'index.html': '' }))).toBe('index.html');
    expect(entryPage(proj({ 'x.html': '', 'y.html': '' }))).toBe('x.html');
    expect(entryPage(proj({ 'x.html': '', 'y.html': '' }, { entry: 'y.html' }))).toBe('y.html');
    expect(entryPage(proj({ 'a.js': '' }))).toBeNull();
  });
  it('fromTriple e blankCode estão no formato novo', () => {
    expect(blankCode().files).toHaveLength(3);
    expect(fromTriple({ name: 'X', html: 'h', css: '', js: '' }).files[0]!.text).toBe('h');
  });
});

describe('Código · operações em arquivos e pastas', () => {
  it('cria arquivo (abre numa aba) e pasta; recusa duplicados, conflitos e extensões erradas', () => {
    let s = blankCode();
    s = addFile(s, 'js/util.js', 'x');
    expect(s.active).toBe('js/util.js');
    expect(s.open).toContain('js/util.js');
    s = addFolder(s, 'img/icones');
    expect(s.folders).toEqual(['img/icones']);
    fails(() => addFile(s, 'JS/UTIL.JS'), /Já existe/);
    fails(() => addFile(s, 'style.css/x.css'), /é um arquivo/);
    fails(() => addFile(s, 'foto.png'), /extensão de texto/);
    fails(() => addFile(s, '../x.js'), /inválido/);
    fails(() => addFolder(s, 'js'), /Já existe/);
  });
  it('renomeia arquivo atualizando aba, ativo e página inicial', () => {
    let s = proj({ 'index.html': '', 'a.html': '' }, { entry: 'a.html', open: ['index.html', 'a.html'], active: 'a.html' });
    s = renamePath(s, 'a.html', 'paginas/sobre.html');
    expect(s.files.map((f) => f.path)).toEqual(['index.html', 'paginas/sobre.html']);
    expect([s.active, s.entry, s.open]).toEqual(['paginas/sobre.html', 'paginas/sobre.html', ['index.html', 'paginas/sobre.html']]);
    fails(() => renamePath(s, 'index.html', 'paginas/sobre.html'), /Já existe/);
    fails(() => renamePath(s, 'index.html', 'index.png'), /extensão/);
    expect(renamePath(s, 'index.html', 'INDEX.html').files[0]!.path).toBe('INDEX.html'); // só trocar maiúsculas vale
  });
  it('renomeia pasta levando tudo que está dentro', () => {
    let s = proj({ 'index.html': '', 'css/a.css': '', 'css/sub/b.css': '' }, { folders: ['css/vazia'], active: 'css/a.css' });
    s = renamePath(s, 'css', 'estilos');
    expect(s.files.map((f) => f.path).sort()).toEqual(['estilos/a.css', 'estilos/sub/b.css', 'index.html']);
    expect(s.folders).toEqual(['estilos/vazia']);
    expect(s.active).toBe('estilos/a.css');
    fails(() => renamePath(s, 'estilos', 'estilos/dentro'), /dentro dela/);
    fails(() => renamePath(s, 'estilos', 'index.html'), /Já existe/);
    fails(() => renamePath(s, 'nao-existe', 'x'), /não existe/);
  });
  it('exclui arquivo e pasta mantendo a edição coerente; nunca deixa o projeto sem arquivos de texto', () => {
    let s = proj({ 'index.html': '', 'js/a.js': '', 'js/b.js': '' }, { active: 'js/a.js', entry: '' });
    s = removeFile(s, 'js/a.js');
    expect(s.active).not.toBe('js/a.js');
    expect(s.files).toHaveLength(2);
    s = removeFolder(s, 'js');
    expect(s.files.map((f) => f.path)).toEqual(['index.html']);
    expect(s.active).toBe('index.html');
    fails(() => removeFile(s, 'index.html'), /pelo menos um/);
    fails(() => removeFile(s, 'x.js'), /não existe/);
    fails(() => removeFolder(s, ''), /não existe/);
    fails(() => removeFolder(s, 'fantasma'), /não existe/);
    fails(() => removeFolder(proj({ 'pasta/a.js': '' }), 'pasta'), /pelo menos um/);
  });
});

describe('Código · árvore de arquivos', () => {
  it('pastas primeiro, ordem natural, profundidade e recolhimento', () => {
    const s = proj({ 'index.html': '', 'z.js': '', 'css/b10.css': '', 'css/b2.css': '', 'css/sub/c.css': '' }, { folders: ['vazia'] });
    expect(treeRows(s).map((r) => '  '.repeat(r.depth) + r.name + (r.kind === 'dir' ? '/' : ''))).toEqual([
      'css/', '  sub/', '    c.css', '  b2.css', '  b10.css', 'vazia/', 'index.html', 'z.js'
    ]);
    expect(treeRows(s, new Set(['css'])).map((r) => r.path)).toEqual(['css', 'vazia', 'index.html', 'z.js']);
  });
});
