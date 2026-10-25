import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/* Código: editor HTML/CSS/JS, quadro isolado, console, ZIP e página única — tudo de verdade. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const frame = (page: Page) => page.frameLocator('[data-testid="code-frame"]');
const consoleText = (page: Page) => page.getByTestId('console');
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function setFile(page: Page, file: 'html' | 'css' | 'js', value: string): Promise<void> {
  await page.locator('[data-testid="code-editor"]').waitFor();
  await page.locator('#code-file-' + file).click();
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', file);
  await page.getByTestId('code-editor').fill(value);
}

test.describe('Código', () => {
  test('mostra o modelo, o console e atualiza sozinho ao editar o HTML', async ({ page }) => {
    await page.goto('/apps/codigo/');
    await expect(frame(page).getByRole('heading', { name: 'Olá, mundo!' })).toBeVisible();
    await expect(consoleText(page)).toContainText('Olá do JavaScript!');
    await setFile(page, 'html', '<h1>Título novo</h1><p id="p">texto</p>');
    await expect(frame(page).getByRole('heading', { name: 'Título novo' })).toBeVisible({ timeout: 8000 });
    // CSS e JS também chegam ao quadro (mesmo sem link/script no HTML)
    await setFile(page, 'css', 'h1 { color: rgb(1, 2, 3); }');
    await setFile(page, 'js', "document.getElementById('p').textContent = 'mudou pelo js'; console.warn('cuidado'); console.error('falhou');");
    await expect(frame(page).locator('#p')).toHaveText('mudou pelo js', { timeout: 8000 });
    await expect(frame(page).getByRole('heading', { name: 'Título novo' })).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(consoleText(page)).toContainText('cuidado');
    await expect(consoleText(page)).toContainText('falhou');
    await expect(page.locator('.l-error')).toBeVisible();
  });

  test('erros do usuário aparecem no console e “Executar” roda de novo', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await page.getByTestId('auto-run').uncheck();
    await setFile(page, 'js', "console.log('rodada ' + (window.__n = (window.__n || 0) + 1)); throw new Error('boom');");
    await expect(consoleText(page)).not.toContainText('boom'); // sem execução automática, nada muda sozinho
    await tab(page, 'Executar').click();
    await page.getByTestId('run-code').click();
    await expect(consoleText(page)).toContainText('rodada 1');
    await expect(consoleText(page)).toContainText('boom');
  });

  test('isolamento: sem acesso ao armazenamento, à página-mãe e à rede', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    const sandbox = await page.getByTestId('code-frame').getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts');
    await setFile(page, 'js', [
      "try { localStorage.getItem('x'); console.log('storage:aberto'); } catch (e) { console.log('storage:bloqueado'); }",
      "try { void parent.document.title; console.log('mae:aberta'); } catch (e) { console.log('mae:bloqueada'); }",
      "fetch(location.href).then(function () { console.log('rede:aberta'); }).catch(function () { console.log('rede:bloqueada'); });"
    ].join('\n'));
    await expect(consoleText(page)).toContainText('storage:bloqueado', { timeout: 8000 });
    await expect(consoleText(page)).toContainText('mae:bloqueada');
    await expect(consoleText(page)).toContainText('rede:bloqueada');
    await expect(consoleText(page)).not.toContainText(':aberto');
    await expect(consoleText(page)).not.toContainText(':aberta');
  });

  test('modelo Contador funciona dentro do quadro e o projeto salva e reabre', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=contador');
    await frame(page).getByRole('button', { name: '+1' }).click();
    await frame(page).getByRole('button', { name: '+1' }).click();
    await expect(frame(page).locator('#valor')).toHaveText('2');
    await expect(consoleText(page)).toContainText('valor: 2');
    await page.getByTestId('doc-title').fill('Meu contador');
    await setFile(page, 'js', "console.log('versão salva');");
    await saved(page);
    await page.reload();
    await expect(page).toHaveURL(/\?doc=/);
    await expect(page.getByTestId('doc-title')).toHaveValue('Meu contador');
    await page.locator('#code-file-js').click();
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('versão salva');");
    await expect(consoleText(page)).toContainText('versão salva');
  });

  test('Tab insere espaços, recuo automático no Enter e Esc libera o foco', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=ola');
    await setFile(page, 'js', '');
    const editor = page.getByTestId('code-editor');
    await editor.focus();
    await page.keyboard.press('Tab');
    await expect(editor).toHaveValue('  ');
    await page.keyboard.type('if (a) {');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b();');
    await expect(editor).toHaveValue('  if (a) {\n  b();');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).not.toBe('code-editor');
  });

  test('baixa o ZIP do projeto e a página única', async ({ page }) => {
    await page.goto('/apps/codigo/?modelo=cartao');
    await tab(page, 'Arquivo').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const bytes = readFileSync((await zip.path())!);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    const names = bytes.toString('latin1');
    for (const n of ['index.html', 'style.css', 'script.js']) expect(names).toContain(n);
    const [html] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-html').click()]);
    expect(html.suggestedFilename()).toMatch(/\.html$/);
    const text = readFileSync((await html.path())!, 'utf8');
    expect(text).toContain('<style>');
    expect(text).toContain('Maria Souza');
    expect(text).not.toContain('Content-Security-Policy');
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
});
