import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Texto: bloco maior que A4 continua no PDF nas páginas seguintes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/apps/texto/?modelo=em-branco');
  await expect(page.getByTestId('text-editor')).toBeVisible();
  await page.getByTestId('text-editor').evaluate((host) => {
    // Um ÚNICO parágrafo longo com muitas quebras, não vários blocos curtos.
    host.innerHTML = '<p>' + Array.from({ length: 150 }, (_, i) =>
      'Linha ' + (i + 1) + ': conteúdo extenso com acentos: ação, café e informação.').join('<br>') + '</p>';
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 70_000 }),
    page.getByTestId('export-pdf').click()
  ]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(page.getByTestId('text-announcement')).toContainText('Blocos longos foram divididos automaticamente', { timeout: 5_000 });
  await expect(page.getByTestId('text-announcement')).toContainText(/PDF gerado com [3-9] folhas A4/);
});
