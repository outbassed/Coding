import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
const status = (page: Page) => page.getByTestId('compare-status');
async function paste(page: Page, a: string, b: string): Promise<void> {
  await tab(page, 'Arquivos').click();
  await page.getByTestId('side-a-text').fill(a);
  await page.getByTestId('side-b-text').fill(b);
}
const file = (page: Page, side: 'a' | 'b', name: string, data: Buffer) =>
  page.getByTestId('side-' + side + '-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: data });
async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await d.createReadStream()) chunks.push(chunk as Buffer);
  return { name: d.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}
const BIN_A = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
const BIN_B = Buffer.from(BIN_A); BIN_B[7] = 0xff;

test.describe('Comparador de Arquivos', () => {
  test('textos colados: conta as diferenças, destaca a palavra e mostra os números das linhas', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(status(page)).toHaveAttribute('data-state', 'vazio');
    await paste(page, 'um\ndois\ntres\nquatro', 'um\ndois\ntrês\nquatro\ncinco');
    await expect(status(page)).toHaveAttribute('data-state', 'diferentes');
    await expect(page.getByTestId('stat-changed')).toHaveText('1');
    await expect(page.getByTestId('stat-added')).toHaveText('1');
    await expect(page.getByTestId('stat-removed')).toHaveText('0');
    await expect(page.getByTestId('stat-same')).toHaveText('3');
    await expect(page.getByTestId('stat-similarity')).toHaveText('66%');
    const chg = page.locator('[data-testid="diff-view"] [data-kind="chg"]');
    await expect(chg).toHaveCount(1);
    await expect(chg.locator('mark').first()).toHaveText('tres');
    await expect(chg.locator('mark').last()).toHaveText('três');
    await expect(page.locator('[data-testid="diff-view"] [data-kind="add"]')).toContainText('cinco');
  });

  test('opções: ignorar maiúsculas, espaços e linhas em branco deixam os textos iguais', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await paste(page, 'Olá  Mundo\n\n\nFim', 'olá mundo\nfim');
    await expect(status(page)).toHaveAttribute('data-state', 'diferentes');
    await tab(page, 'Opções').click();
    await page.getByTestId('opt-case').check();
    await page.getByTestId('opt-space').check();
    await page.getByTestId('opt-blank').check();
    await expect(status(page)).toHaveAttribute('data-state', 'iguais-no-conteudo');
    await page.getByTestId('opt-case').uncheck();
    await expect(status(page)).toHaveAttribute('data-state', 'diferentes');
  });

  test('arquivos de texto: CRLF e LF não são diferença, mas o SHA-256 mostra que os bytes mudam', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await file(page, 'a', 'unix.txt', Buffer.from('a\nb\nc\n'));
    await file(page, 'b', 'windows.txt', Buffer.from('a\r\nb\r\nc\r\n'));
    await expect(page.getByTestId('side-a-name')).toHaveValue('unix.txt');
    await expect(status(page)).toHaveAttribute('data-state', 'iguais-no-conteudo');
    await expect(page.getByTestId('eol-note')).toContainText('CRLF');
    await expect(page.getByTestId('hash-verdict')).toContainText('diferentes');
    await expect(page.getByTestId('hash-a')).toHaveText(/^[0-9a-f]{64}$/);
    await file(page, 'b', 'unix2.txt', Buffer.from('a\nb\nc\n'));
    await expect(status(page)).toHaveAttribute('data-state', 'identicos');
    await expect(page.getByTestId('hash-verdict')).toContainText('idênticos byte a byte');
    await expect(page.getByTestId('hash-a')).toHaveText(await page.getByTestId('hash-b').innerText());
  });

  test('binários: primeira diferença em hexadecimal; iguais são reconhecidos', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await file(page, 'a', 'a.png', BIN_A);
    await file(page, 'b', 'b.png', BIN_B);
    await expect(page.getByTestId('side-a-binary')).toBeVisible();
    await expect(status(page)).toHaveAttribute('data-state', 'diferentes');
    await expect(page.getByTestId('binary-summary')).toContainText('byte 7');
    await expect(page.getByTestId('binary-summary')).toContainText('1 byte diferente');
    await expect(page.getByTestId('hex-view').locator('mark')).toHaveCount(2);
    await expect(page.getByTestId('hex-view')).toContainText('ff');
    await file(page, 'b', 'copia.png', BIN_A);
    await expect(status(page)).toHaveAttribute('data-state', 'identicos');
    await expect(page.getByTestId('binary-result')).toContainText('Nenhuma diferença');
  });

  test('navega entre as diferenças e resume linhas iguais com "só as diferenças"', async ({ page }) => {
    await page.goto('/apps/comparador/');
    const base = Array.from({ length: 40 }, (_, i) => 'linha ' + (i + 1));
    const other = base.slice(); other[4] = 'linha cinco'; other[30] = 'linha trinta e um';
    await paste(page, base.join('\n'), other.join('\n'));
    await expect(page.getByTestId('diff-position')).toHaveText('– de 2');
    await page.getByTestId('next-diff').click();
    await expect(page.getByTestId('diff-position')).toHaveText('1 de 2');
    await page.getByTestId('next-diff').click();
    await expect(page.getByTestId('diff-position')).toHaveText('2 de 2');
    await page.getByTestId('next-diff').click();
    await expect(page.getByTestId('diff-position')).toHaveText('1 de 2');
    await page.getByTestId('prev-diff').click();
    await expect(page.getByTestId('diff-position')).toHaveText('2 de 2');
    await tab(page, 'Opções').click();
    await page.getByTestId('only-diffs').check();
    await expect(page.locator('[data-testid="diff-view"] .skip')).toHaveCount(3);
    await expect(page.locator('[data-testid="diff-view"]')).not.toContainText('linha 15');
    await expect(page.locator('[data-testid="diff-view"]')).toContainText('linha 3');
  });

  test('visão unificada e exportação .diff idêntica ao formato do diff -u', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await file(page, 'a', 'a.txt', Buffer.from('um\ndois\ntres\n'));
    await file(page, 'b', 'b.txt', Buffer.from('um\n2\ntres\nquatro\n'));
    await tab(page, 'Opções').click();
    await page.getByTestId('view-unified').check();
    await expect(page.locator('[data-testid="diff-view"] [data-kind="del"]')).toContainText('dois');
    await expect(page.locator('[data-testid="diff-view"] [data-kind="add"]').first()).toContainText('2');
    await tab(page, 'Arquivo').click();
    const out = await download(page, () => page.getByTestId('export-diff').click());
    expect(out.name).toBe('Comparação de arquivos.diff');
    expect(out.text).toBe('--- a.txt\n+++ b.txt\n@@ -1,3 +1,4 @@\n um\n-dois\n+2\n tres\n+quatro\n');
    const report = await download(page, () => page.getByTestId('export-report').click());
    expect(report.text).toContain('SHA-256 A: ');
    expect(report.text).toContain('Há diferenças.');
  });

  test('tudo fica salvo: textos, opções e arquivo binário voltam depois de recarregar', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await paste(page, 'alfa\nbeta', 'alfa\nBETA');
    await tab(page, 'Opções').click();
    await page.getByTestId('opt-case').check();
    await expect(status(page)).toHaveAttribute('data-state', 'iguais-no-conteudo');
    await saved(page);
    await page.reload();
    await expect(status(page)).toHaveAttribute('data-state', 'iguais-no-conteudo');
    await tab(page, 'Arquivos').click();
    await expect(page.getByTestId('side-b-text')).toHaveValue('alfa\nBETA');
    await file(page, 'a', 'a.bin', BIN_A);
    await file(page, 'b', 'b.bin', BIN_B);
    await expect(page.getByTestId('binary-summary')).toContainText('byte 7');
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('binary-summary')).toContainText('byte 7');
    await expect(page.getByTestId('hash-a')).toHaveText(/^[0-9a-f]{64}$/);
  });

  test('trocar A e B inverte o resultado; limpar um lado volta ao estado vazio', async ({ page }) => {
    await page.goto('/apps/comparador/');
    await paste(page, 'a', 'a\nb');
    await expect(page.getByTestId('stat-added')).toHaveText('1');
    await page.getByTestId('swap-sides').click();
    await expect(page.getByTestId('stat-removed')).toHaveText('1');
    await expect(page.getByTestId('stat-added')).toHaveText('0');
    await page.getByTestId('clear-a').click();
    await page.getByTestId('clear-b').click();
    await expect(status(page)).toHaveAttribute('data-state', 'vazio');
  });

  test('modelo "Duas versões de um texto" abre pronto', async ({ page }) => {
    await page.goto('/apps/comparador/?modelo=versoes');
    await expect(page.getByTestId('stat-changed')).toHaveText('2');
    await expect(page.getByTestId('stat-added')).toHaveText('1');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test('acessível no tema ' + scheme + ' (texto e binário, todas as abas)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/apps/comparador/?modelo=versoes');
      await expect(page.getByTestId('diff-view')).toBeVisible();
      for (const name of ['Arquivos', 'Opções', 'Arquivo']) { await tab(page, name).click(); await axeClean(page, name + ' ' + scheme); }
      await tab(page, 'Opções').click();
      await page.getByTestId('view-unified').check();
      await axeClean(page, 'unificada ' + scheme);
      await tab(page, 'Arquivos').click();
      await file(page, 'a', 'a.bin', BIN_A);
      await file(page, 'b', 'b.bin', BIN_B);
      await expect(page.getByTestId('hex-view')).toBeVisible();
      await axeClean(page, 'binário ' + scheme);
    });
  }

  test('celular 320 px: sem rolagem horizontal na página', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/apps/comparador/?modelo=versoes');
    await expect(page.getByTestId('diff-view')).toBeVisible();
    // Se estourar, o erro aponta quais elementos passam da largura da tela.
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth ? [] : Array.from(document.querySelectorAll('body *')).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && el.getBoundingClientRect().width > 0).slice(0, 6).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().right)));
    expect(await wide()).toEqual([]);
    // A aba Arquivos já vem aberta; clicar nela de novo recolheria a gaveta no celular.
    await expect(page.getByTestId('side-a-file')).toBeVisible();
    expect(await wide()).toEqual([]);
  });
});
