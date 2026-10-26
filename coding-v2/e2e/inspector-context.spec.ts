import { test, expect } from '@playwright/test';

test.describe('Painéis de propriedades e menu contextual', () => {
  test('Planilhas: propriedades à direita, recolher e redimensionar com teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.goto('/apps/planilhas/?novo=1');
    const inspector = page.getByTestId('editor-inspector');
    await expect(inspector).toBeVisible();
    await expect(page.getByTestId('calc-properties')).toContainText('Seleção ativa');
    await page.locator('[data-cell="B2"]').click();
    await expect(page.getByTestId('calc-properties')).toContainText('B2');
    const resize = page.getByRole('separator', { name: 'Ajustar largura do painel de propriedades' });
    const old = Number(await resize.getAttribute('aria-valuenow'));
    await resize.focus();
    await page.keyboard.press('ArrowLeft');
    expect(Number(await resize.getAttribute('aria-valuenow'))).toBe(old + 16);
    await page.getByTestId('hide-properties').click();
    await expect(inspector).toHaveCount(0);
    await page.getByTestId('show-properties').click();
    await expect(inspector).toBeVisible();
    await page.reload();
    expect(Number(await resize.getAttribute('aria-valuenow'))).toBe(old + 16);
  });

  test('Planilhas: clique direito em cabeçalho oferece inserir coluna real', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.goto('/apps/planilhas/?novo=1');
    await expect(page.locator('[data-cell="A1"]')).toBeVisible();
    await page.locator('th[data-col="A"]').click({ button: 'right' });
    const menu = page.getByTestId('coding-context-menu');
    await expect(menu).toContainText('Copiar coluna A');
    await expect(menu).toContainText('Duplicar coluna');
    await menu.getByRole('menuitem', { name: 'Inserir coluna à direita' }).click();
    await expect(page.locator('th[data-col="K"]')).toBeVisible();
  });

  test('Etiquetas: propriedades à direita possuem controles reais', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.goto('/apps/etiquetas/?novo=1');
    const inspector = page.getByTestId('editor-inspector');
    await expect(inspector).toBeVisible();
    const input = inspector.getByRole('spinbutton', { name: 'Tamanho do código (pt)' });
    await input.fill('28');
    await input.blur();
    await expect(input).toHaveValue('28');
    await page.getByTestId('hide-properties').click();
    await expect(inspector).toHaveCount(0);
    await page.getByTestId('show-properties').click();
    await expect(inspector).toBeVisible();
  });

  test('Mobile: propriedades de Planilhas acessíveis na gaveta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/planilhas/?novo=1');
    await expect(page.getByTestId('editor-inspector')).toHaveCount(0);
    await page.getByTestId('editor-tabs').getByRole('tab', { name: 'Propriedades' }).click();
    await expect(page.getByTestId('calc-properties')).toBeVisible();
  });
});
