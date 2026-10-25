import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/* Código: projeto com vários arquivos e pastas, explorador, editor, busca, importação/exportação e quadro isolado — tudo de verdade. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const frame = (page: Page) => page.frameLocator('[data-testid="code-frame"]');
const consoleText = (page: Page) => page.getByTestId('console');
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const row = (page: Page, path: string) => page.locator('[data-testid="tree-row"][data-path="' + path + '"]');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function openFile(page: Page, path: string): Promise<void> {
  await tab(page, 'Explorador').click();
  await row(page, path).click();
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', path);
}
async function edit(page: Page, path: string, value: string): Promise<void> {
  await openFile(page, path);
  await page.getByTestId('code-editor').fill(value);
}
async function newItem(page: Page, kind: 'file' | 'folder', name: string): Promise<void> {
  await tab(page, 'Explorador').click();
  await page.getByTestId(kind === 'file' ? 'new-file' : 'new-folder').click();
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('name-confirm').click();
}

/** CRC-32 independente do app, para montar ZIPs de teste (método "armazenado"). */
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function craftZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), crc = crc32(e.data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(e.data.length, 18); l.writeUInt32LE(e.data.length, 22); l.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(e.data.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, name, e.data); centrals.push(c, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test.describe('Código', () => {
  test('mostra o modelo, o console e atualiza sozinho ao editar HTML, CSS e JS', async ({ page }) => {
    await page.goto('/apps/codigo/');
    await expect(frame(page).getByRole('heading', { name: 'Olá, mundo!' })).toBeVisible();
    await expect(consoleText(page)).toContainText('Olá do JavaScript!');
    await edit(page, 'index.html', '<h1>Título novo</h1><p id="p">texto</p>');
    await expect(frame(page).getByRole('heading', { name: 'Título novo' })).toBeVisible({ timeout: 8000 });
    // CSS e JS do projeto também chegam ao quadro (mesmo sem link/script no HTML)
    await edit(page, 'style.css', 'h1 { color: rgb(1, 2, 3); }');
    await edit(page, 'script.js', "document.getElementById('p').textContent = 'mudou pelo js'; console.warn('cuidado'); console.error('falhou');");
    await expect(frame(page).locator('#p')).toHaveText('mudou pelo js', { timeout: 8000 });
    await expect(frame(page).getByRole('heading', { name: 'Título novo' })).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(consoleText(page)).toContainText('cuidado');
    await expect(consoleText(page)).toContainText('falhou');
    await expect(page.locator('.l-error')).toBeVisible();
  });

  test('erros do usuário aparecem no console e “Executar” roda de novo', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await tab(page, 'Executar').click();
    await page.getByTestId('auto-run').uncheck();
    await edit(page, 'script.js', "console.log('rodada ' + (window.__n = (window.__n || 0) + 1)); throw new Error('boom');");
    await expect(consoleText(page)).not.toContainText('boom'); // sem execução automática, nada muda sozinho
    await tab(page, 'Executar').click();
    await page.getByTestId('run-code').click();
    await expect(consoleText(page)).toContainText('rodada 1');
    await expect(consoleText(page)).toContainText('boom');
  });

  test('isolamento: sem acesso ao armazenamento, à página-mãe e à rede', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    expect(await page.getByTestId('code-frame').getAttribute('sandbox')).toBe('allow-scripts');
    await edit(page, 'script.js', [
      "try { localStorage.getItem('x'); console.log('storage:aberto'); } catch (e) { console.log('storage:bloqueado'); }",
      "try { void parent.document.title; console.log('mae:aberta'); } catch (e) { console.log('mae:bloqueada'); }",
      "fetch('https://example.com/').then(function () { console.log('rede:aberta'); }).catch(function () { console.log('rede:bloqueada'); });"
    ].join('\n'));
    await expect(consoleText(page)).toContainText('storage:bloqueado', { timeout: 8000 });
    await expect(consoleText(page)).toContainText('mae:bloqueada');
    await expect(consoleText(page)).toContainText('rede:bloqueada');
    await expect(consoleText(page)).not.toContainText(':aberto');
    await expect(consoleText(page)).not.toContainText(':aberta');
  });

  test('modelo Contador funciona dentro do quadro e o projeto salva, reabre e lembra as abas', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=contador');
    await frame(page).getByRole('button', { name: '+1' }).click();
    await frame(page).getByRole('button', { name: '+1' }).click();
    await expect(frame(page).locator('#valor')).toHaveText('2');
    await expect(consoleText(page)).toContainText('valor: 2');
    await page.getByTestId('doc-name').fill('Meu contador');
    await edit(page, 'script.js', "console.log('versão salva');");
    await saved(page);
    await page.reload();
    await expect(page).toHaveURL(/\?doc=/);
    await expect(page.getByTestId('doc-name')).toHaveValue('Meu contador');
    await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', 'script.js'); // o arquivo aberto volta junto
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('versão salva');");
    await expect(consoleText(page)).toContainText('versão salva');
  });

  test('editor: Tab, fechamento automático, bloco no Enter, apagar par e Esc libera o foco', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await edit(page, 'script.js', '');
    const editor = page.getByTestId('code-editor');
    await editor.focus();
    await page.keyboard.press('Tab');
    await expect(editor).toHaveValue('  ');
    await page.keyboard.type('if (a) {');
    await expect(editor).toHaveValue('  if (a) {}');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b();');
    await expect(editor).toHaveValue('  if (a) {\n    b();\n  }');
    // aspas fecham sozinhas, e apagar a de abrir leva a de fechar junto
    await editor.fill('');
    await page.keyboard.type('"');
    await expect(editor).toHaveValue('""');
    await page.keyboard.press('Backspace');
    await expect(editor).toHaveValue('');
    // digitar o fechamento de um par já aberto só pula por cima dele
    await page.keyboard.type('f(x)');
    await expect(editor).toHaveValue('f(x)');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).not.toBe('code-editor');
  });

  test('realce de sintaxe e numeração de linhas acompanham o texto', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await edit(page, 'script.js', "// nota\nconst n = 42;\nconsole.log('oi');");
    await expect(page.getByTestId('gutter')).toHaveText('1 2 3');
    await expect(page.locator('.hl .t-c')).toContainText('// nota');
    await expect(page.locator('.hl .t-k').first()).toHaveText('const');
    await expect(page.locator('.hl .t-n')).toContainText('42');
    await expect(page.locator('.hl .t-s')).toContainText("'oi'");
    await expect(page.getByTestId('lang')).toContainText('JavaScript');
    await openFile(page, 'style.css');
    await expect(page.getByTestId('lang')).toContainText('CSS');
  });

  test('explorador: cria, renomeia, move, exclui e desfaz arquivos e pastas', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await newItem(page, 'file', 'js/util.js');
    await expect(row(page, 'js')).toBeVisible();
    await expect(row(page, 'js/util.js')).toBeVisible();
    await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', 'js/util.js');
    await expect(page.getByTestId('file-tab').filter({ hasText: 'util.js' })).toBeVisible();

    // nomes repetidos, inválidos e de tipo errado são recusados com explicação
    await page.getByTestId('new-file').click();
    await page.getByTestId('name-input').fill('js/util.js');
    await page.getByTestId('name-confirm').click();
    await expect(page.getByTestId('op-error')).toContainText('Já existe');
    await page.getByTestId('name-input').fill('../fora.js');
    await page.getByTestId('name-confirm').click();
    await expect(page.getByTestId('op-error')).toContainText('Nome inválido');
    await page.getByTestId('name-input').fill('foto.png');
    await page.getByTestId('name-confirm').click();
    await expect(page.getByTestId('op-error')).toContainText('extensão de texto');
    await page.getByTestId('name-cancel').click();
    await expect(page.getByTestId('op-form')).toHaveCount(0);

    // renomear um arquivo e depois a pasta inteira
    await row(page, 'js/util.js').click();
    await page.getByTestId('rename-item').click();
    await expect(page.getByTestId('name-input')).toHaveValue('js/util.js');
    await page.getByTestId('name-input').fill('js/ferramentas.js');
    await page.getByTestId('name-confirm').click();
    await expect(row(page, 'js/ferramentas.js')).toBeVisible();
    await expect(row(page, 'js/util.js')).toHaveCount(0);
    await row(page, 'js').click(); // clicar numa pasta a recolhe e a seleciona
    await expect(row(page, 'js/ferramentas.js')).toHaveCount(0);
    await page.getByTestId('rename-item').click();
    await page.getByTestId('name-input').fill('scripts');
    await page.getByTestId('name-confirm').click();
    await expect(row(page, 'scripts/ferramentas.js')).toBeVisible();

    // nova pasta vazia e novo arquivo dentro da pasta selecionada
    await newItem(page, 'folder', 'img');
    await expect(row(page, 'img')).toBeVisible();
    await row(page, 'img').click();
    await page.getByTestId('new-file').click();
    await expect(page.getByTestId('name-input')).toHaveValue('img/');
    await page.getByTestId('name-cancel').click();

    // excluir pede confirmação e Ctrl+Z desfaz
    await row(page, 'scripts/ferramentas.js').click();
    await page.getByTestId('delete-item').click();
    await expect(page.getByTestId('delete-text')).toContainText('ferramentas.js');
    await page.getByTestId('confirm-delete').click();
    await expect(row(page, 'scripts/ferramentas.js')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(row(page, 'scripts/ferramentas.js')).toBeVisible();
  });

  test('página inicial, várias páginas, links entre elas, JSON por fetch e imagem SVG', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=site');
    await expect(frame(page).getByRole('heading', { name: 'Meu site' })).toBeVisible();
    await expect(frame(page).locator('#saudacao')).toHaveText(/Estes dados vieram de um arquivo JSON/, { timeout: 8000 });
    await expect(frame(page).locator('#itens li')).toHaveCount(3);
    await expect(consoleText(page)).toContainText('Dados lidos de dados/itens.json');
    await expect(row(page, 'css/tema.css')).toBeVisible();
    await frame(page).getByRole('link', { name: 'Sobre' }).click();
    await expect(frame(page).getByRole('heading', { name: 'Sobre' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('page-select')).toHaveValue('sobre.html');
    // define outra página como inicial
    await tab(page, 'Explorador').click();
    await row(page, 'sobre.html').click();
    await page.getByTestId('set-entry').click();
    await expect(row(page, 'sobre.html')).toContainText('inicial');
    await expect(frame(page).getByRole('heading', { name: 'Sobre' })).toBeVisible();
  });

  test('localizar e substituir no projeto inteiro, com desfazer', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await tab(page, 'Buscar').click();
    await page.getByTestId('search-query').fill('Olá');
    await expect(page.getByTestId('search-count')).toContainText('2 ocorrências');
    await expect(page.getByTestId('search-hit')).toHaveCount(2);
    await page.getByTestId('search-hit').filter({ hasText: 'script.js' }).click();
    await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', 'script.js');
    await tab(page, 'Buscar').click();
    await page.getByTestId('search-case').check();
    await page.getByTestId('search-query').fill('olá');
    await expect(page.getByTestId('search-count')).toContainText('0 ocorrências');
    await page.getByTestId('search-case').uncheck();
    await page.getByTestId('search-query').fill('Olá');
    await page.getByTestId('replace-text').fill('Oi');
    await page.getByTestId('replace-all').click();
    await expect(page.getByTestId('search-info')).toContainText('2 substituições em 2 arquivos');
    await expect(frame(page).getByRole('heading', { name: 'Oi, mundo!' })).toBeVisible({ timeout: 8000 });
    await expect(consoleText(page)).toContainText('Oi do JavaScript!');
    await page.keyboard.press('Control+z');
    await expect(frame(page).getByRole('heading', { name: 'Olá, mundo!' })).toBeVisible({ timeout: 8000 });
  });

  test('Ctrl+F no editor abre a busca com o texto selecionado', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await edit(page, 'script.js', 'alfa beta gama');
    await page.getByTestId('code-editor').evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(5, 9); });
    await page.keyboard.press('Control+f');
    await expect(page.getByTestId('search-query')).toBeFocused();
    await expect(page.getByTestId('search-query')).toHaveValue('beta');
    await page.getByTestId('find-next').click();
    await expect(page.getByTestId('cursor')).toContainText('coluna 6');
  });

  test('importa arquivos, imagens e ZIP; recusa o que não serve e resolve nomes repetidos', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await tab(page, 'Explorador').click();
    await page.getByTestId('import-input').setInputFiles([
      { name: 'extra.js', mimeType: 'text/javascript', buffer: Buffer.from("console.log('extra carregado');\r\n") },
      { name: 'pixel.png', mimeType: 'image/png', buffer: PNG },
      { name: 'programa.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }
    ]);
    await expect(page.getByTestId('import-info')).toContainText('2 arquivos importados');
    await expect(page.getByTestId('import-info')).toContainText('1 ignorado');
    await expect(row(page, 'extra.js')).toBeVisible();
    await expect(row(page, 'pixel.png')).toBeVisible();
    await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', 'extra.js');
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('extra carregado');\n"); // CRLF virou LF
    await row(page, 'pixel.png').click();
    await expect(page.getByTestId('asset-preview')).toBeVisible();

    // nome repetido: por padrão guarda os dois; em “Substituir” troca o conteúdo
    await page.getByTestId('import-input').setInputFiles({ name: 'extra.js', mimeType: 'text/javascript', buffer: Buffer.from('// segunda versão\n') });
    await expect(row(page, 'extra (2).js')).toBeVisible();
    await page.getByTestId('conflict-mode').selectOption('replace');
    await page.getByTestId('import-input').setInputFiles({ name: 'extra.js', mimeType: 'text/javascript', buffer: Buffer.from('// terceira versão\n') });
    await expect(page.getByTestId('import-info')).toContainText('1 arquivo importado');
    await expect(row(page, 'extra (3).js')).toHaveCount(0);
    await expect(page.getByTestId('code-editor')).toHaveValue('// terceira versão\n');

    // a imagem importada aparece na página por nome
    await edit(page, 'index.html', '<!doctype html><img id="px" src="pixel.png" alt="ponto">');
    await expect(frame(page).locator('#px')).toHaveJSProperty('naturalWidth', 1, { timeout: 8000 });

    // ZIP de projeto: tira a pasta-raiz, ignora o que não é aceito
    await tab(page, 'Explorador').click();
    const zip = craftZip([
      { name: 'projeto/index.html', data: Buffer.from('<!doctype html><h1>Do ZIP</h1><script src="app.js"></script>') },
      { name: 'projeto/app.js', data: Buffer.from("console.log('zip ok');") },
      { name: 'projeto/estilos/a.css', data: Buffer.from('h1 { color: red; }') },
      { name: 'projeto/leia.exe', data: Buffer.from('MZ') }
    ]);
    await page.getByTestId('import-input').setInputFiles({ name: 'projeto.zip', mimeType: 'application/zip', buffer: zip });
    await expect(page.getByTestId('import-info')).toContainText('3 arquivos importados');
    await expect(row(page, 'estilos/a.css')).toBeVisible();
    await expect(row(page, 'projeto')).toHaveCount(0);
    await expect(frame(page).getByRole('heading', { name: 'Do ZIP' })).toBeVisible({ timeout: 8000 });
    await expect(consoleText(page)).toContainText('zip ok');
  });

  test('exporta o ZIP do projeto e o reimporta num projeto novo; baixa também a página única', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=site');
    await tab(page, 'Arquivo').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const bytes = readFileSync((await zip.path())!);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    const names = bytes.toString('latin1');
    for (const n of ['index.html', 'sobre.html', 'css/tema.css', 'js/app.js', 'dados/itens.json', 'img/logo.svg']) expect(names).toContain(n);
    const [html] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-html').click()]);
    expect(html.suggestedFilename()).toMatch(/\.html$/);
    const text = readFileSync((await html.path())!, 'utf8');
    expect(text).toContain('<style>');
    expect(text).toContain('Meu site');
    expect(text).not.toContain('Content-Security-Policy');

    await page.goto('/apps/codigo/?novo=1');
    await tab(page, 'Explorador').click();
    await page.getByTestId('conflict-mode').selectOption('replace');
    await page.getByTestId('import-input').setInputFiles({ name: 'site.zip', mimeType: 'application/zip', buffer: bytes });
    await expect(row(page, 'css/tema.css')).toBeVisible();
    await expect(row(page, 'dados/itens.json')).toBeVisible();
    await expect(frame(page).getByRole('heading', { name: 'Meu site' })).toBeVisible({ timeout: 8000 });
    await expect(frame(page).locator('#itens li')).toHaveCount(3);
  });

  test('o ZIP de um projeto com imagem leva a imagem junto', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=cartao');
    await tab(page, 'Explorador').click();
    await page.getByTestId('import-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(row(page, 'foto.png')).toBeVisible();
    await saved(page);
    await page.reload();
    await tab(page, 'Explorador').click();
    await expect(row(page, 'foto.png')).toBeVisible(); // os bytes ficam guardados com o projeto
    await tab(page, 'Arquivo').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
    const bytes = readFileSync((await zip.path())!);
    expect(bytes.toString('latin1')).toContain('foto.png');
    // a imagem sobrevive ao ZIP: reimportada num projeto novo, ela abre de verdade
    await page.goto('/apps/codigo/?novo=1');
    await tab(page, 'Explorador').click();
    await page.getByTestId('import-input').setInputFiles({ name: 'cartao.zip', mimeType: 'application/zip', buffer: bytes });
    await row(page, 'foto.png').click();
    await expect(page.getByTestId('asset-preview')).toHaveJSProperty('naturalWidth', 1, { timeout: 8000 });
  });

  test('abas de arquivo: abrir, fechar e navegar com as setas', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await openFile(page, 'script.js');
    await openFile(page, 'style.css');
    const tabs = page.getByTestId('file-tab');
    const before = await tabs.count();
    expect(before).toBeGreaterThanOrEqual(2);
    await tabs.filter({ hasText: 'style.css' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('code-editor')).not.toHaveAttribute('data-file', 'style.css');
    await page.getByTestId('close-tab').click();
    await expect(tabs).toHaveCount(before - 1);
    // fechar a aba não apaga o arquivo
    await tab(page, 'Explorador').click();
    await expect(row(page, 'style.css')).toBeVisible();
  });

  test('celular: alterna entre Código e Resultado e passa na verificação de acessibilidade', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/codigo/');
    await expect(page.getByTestId('code-editor')).toBeVisible();
    await expect(page.getByTestId('code-frame')).toBeHidden();
    await page.getByTestId('view-result').click();
    await expect(page.getByTestId('code-frame')).toBeVisible();
    await expect(frame(page).getByRole('heading', { name: 'Olá, mundo!' })).toBeVisible();
    await page.getByTestId('view-editor').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('celular: busca e explorador passam na verificação de acessibilidade', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/codigo/?modelo=site');
    await tab(page, 'Explorador').click();
    await row(page, 'css').click();
    await tab(page, 'Buscar').click();
    await page.getByTestId('search-query').fill('a');
    await expect(page.getByTestId('search-hit').first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
