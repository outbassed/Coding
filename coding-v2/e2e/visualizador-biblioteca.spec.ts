import { test, expect, type Page } from '@playwright/test';

/* Visualizador 2.0 · biblioteca: miniaturas, busca, filtros, ordem, seleção em lote e recuperação ao desfazer remoções. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const open = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.getByTestId('viewer-input').setInputFiles(files);
async function pngBuffer(page: Page, w = 48, h = 24, color = '#e8538f'): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h, color }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h, color });
  return Buffer.from(b64, 'base64');
}
const rows = (page: Page) => page.getByTestId('viewer-files').locator('li');

test.describe('Visualizador · biblioteca', () => {
  test('miniaturas reais, busca sem acento, filtro por tipo e ordenação', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const png = await pngBuffer(page);
    await open(page, [
      { name: 'Ação.png', mimeType: 'image/png', buffer: png },
      { name: 'beta.png', mimeType: 'image/png', buffer: png },
      { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('um\ndois\n') }
    ]);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('viewer-library').locator('img').first()).toBeVisible(); // miniatura de imagem
    await page.getByTestId('viewer-filter').fill('acao');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('viewer-filter-count')).toHaveText('1 de 3');
    await page.getByTestId('viewer-filter').fill('zzz');
    await expect(page.getByTestId('library-nomatch')).toBeVisible();
    await page.getByTestId('clear-filters').click();
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId('kind-text').click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('kind-text').click(); // desliga o filtro
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId('library-view').click(); // alterna grade/lista sem perder arquivos
    await expect(rows(page)).toHaveCount(3);
  });

  test('seleção em lote remove vários e o botão Desfazer traz tudo de volta', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const png = await pngBuffer(page);
    await open(page, [
      { name: 'a.png', mimeType: 'image/png', buffer: png },
      { name: 'b.png', mimeType: 'image/png', buffer: png },
      { name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('c') }
    ]);
    await page.getByTestId('select-mode').click();
    await page.getByTestId('select-all').click();
    await page.getByTestId('batch-remove').click();
    await expect(page.getByTestId('viewer-empty')).toBeVisible();
    await page.getByTestId('toast-undo').click();
    await expect(rows(page)).toHaveCount(3);
  });

  test('desfazer uma remoção recupera o arquivo binário, mesmo depois de salvar', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const png = await pngBuffer(page, 40, 20);
    await open(page, [
      { name: 'foto.png', mimeType: 'image/png', buffer: png },
      { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('texto vivo') }
    ]);
    await page.getByTestId('viewer-files').getByRole('button', { name: /foto\.png/ }).click();
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await page.getByTestId('remove-file').click();
    await expect(rows(page)).toHaveCount(1);
    await saved(page); // o projeto foi gravado SEM a imagem…
    await page.getByTestId('undo').click(); // …e ainda assim ela volta inteira
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('viewer-files').getByRole('button', { name: /foto\.png/ }).click();
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await expect(page.getByTestId('viewer-meta')).toContainText('40 × 20 px');
    await expect(page.getByTestId('viewer-error')).toHaveCount(0);
    await saved(page);
    await page.reload(); // e fica gravada de novo
    await page.getByTestId('viewer-files').getByRole('button', { name: /foto\.png/ }).click();
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await expect(page.getByTestId('viewer-meta')).toContainText('40 × 20 px');
  });

  test('refazer a remoção e desfazer de novo funciona; trocar de arquivo não vira passo de desfazer', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [
      { name: 'um.txt', mimeType: 'text/plain', buffer: Buffer.from('um') },
      { name: 'dois.txt', mimeType: 'text/plain', buffer: Buffer.from('dois') }
    ]);
    await page.getByTestId('viewer-files').getByRole('button', { name: /um\.txt/ }).click();
    await page.getByTestId('viewer-files').getByRole('button', { name: /dois\.txt/ }).click();
    await page.getByTestId('remove-file').click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('undo').click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('redo').click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('undo').click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('viewer-files').getByRole('button', { name: /dois\.txt/ }).click();
    await expect(page.getByTestId('text-body')).toContainText('dois');
  });

  test('renomear pelas propriedades e arquivos grandes: 31 arquivos continuam navegáveis', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const files = Array.from({ length: 31 }, (_, i) => ({ name: 'doc-' + String(i + 1).padStart(2, '0') + '.txt', mimeType: 'text/plain', buffer: Buffer.from('conteúdo ' + (i + 1)) }));
    await open(page, files);
    await expect(page.getByTestId('viewer-filter-count')).toHaveText('31');
    await page.getByTestId('viewer-filter').fill('doc-31');
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('viewer-files').getByRole('button', { name: /doc-31/ }).click();
    await page.getByTestId('viewer-rename').fill('final.txt');
    await page.getByTestId('viewer-rename-apply').click();
    await expect(page.getByTestId('viewer-name')).toHaveText('final.txt');
    await page.getByTestId('viewer-filter').fill('final');
    await expect(rows(page)).toHaveCount(1);
  });
});
