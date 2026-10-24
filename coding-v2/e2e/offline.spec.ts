import { test, expect } from '@playwright/test';

test.describe('Preview offline isolado', () => {
  test('só prepara após clique; Launcher, Planilhas e PDF abrem sem rede', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/launcher/#/ajustes');
    const prepare = page.getByTestId('prepare-offline');
    test.skip((await prepare.count()) === 0, 'Build sem VITE_CODING_PREVIEW_PWA=1: modo offline desativado corretamente.');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    await prepare.click();
    await expect(page.getByTestId('offline-status')).toContainText('preparados neste navegador', { timeout: 100_000 });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
    await page.context().setOffline(true);
    try {
      await page.goto('/launcher/#/catalogo');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo');
      await page.goto('/apps/planilhas/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Planilhas');
      await page.goto('/apps/pdf/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Editor PDF');
      // PDF depende de scripts grandes em /vendor/. Também devem estar pré-armazenados.
      await page.getByTestId('sample-pdf-stage').click();
      await expect(page.getByTestId('pdf-page')).toBeVisible({ timeout: 20_000 });
    } finally {
      await page.context().setOffline(false);
    }
  });
});
