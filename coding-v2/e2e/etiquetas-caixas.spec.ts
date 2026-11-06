import { test, expect } from '@playwright/test';

test.describe('Etiquetas · Identificação de Caixas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/apps/etiquetas/?novo=1');
    await page.getByTestId('mode-boxes').click();
  });

  test('Código permanece intacto; Caixas começa com Cariacica / Vila Velha e 1/2, 2/2', async ({ page }) => {
    await expect(page.getByTestId('box-nf')).toHaveValue('10000');
    await expect(page.getByTestId('box-show-time')).not.toBeChecked();
    await expect(page.getByTestId('box-preview')).not.toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    await expect(page.getByTestId('box-total')).toHaveValue('2');
    await expect(page.getByTestId('box-person')).toHaveValue('Seu Nome');
    await expect(page.getByTestId('box-preview')).toContainText('CARIACICA / VILA VELHA');
    await expect(page.getByTestId('box-preview')).toContainText('CAIXAS: 1/2');
    await expect(page.getByTestId('box-preview')).toContainText('CAIXAS: 2/2');
    await expect(page.getByTestId('box-preview').getByTestId('box-label')).toHaveCount(2);
    await page.getByTestId('mode-code').click();
    await expect(page.getByTestId('sheet')).toContainText('COD: 123');
    await page.getByTestId('mode-boxes').click();
    await expect(page.getByTestId('box-nf')).toHaveValue('10000');
  });

  test('NF só aceita números e 9 caixas geram duas folhas, com modo manual', async ({ page }) => {
    await page.getByTestId('box-nf').fill('A12-345B!');
    await expect(page.getByTestId('box-nf')).toHaveValue('12345');
    await page.getByTestId('box-total').fill('9');
    await expect(page.getByTestId('box-count')).toContainText('1/9 até 9/9');
    await expect(page.getByTestId('print-sheet')).toHaveCount(2);
    await expect(page.getByTestId('print-sheet').last()).toContainText('CAIXAS: 9/9');
    await page.getByTestId('box-show-time').check();
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    await page.getByTestId('box-date').fill('2026-11-06');
    await page.getByTestId('box-time').fill('18:45');
    await expect(page.getByTestId('box-preview')).toContainText('06/11/2026 18:45');
    await expect(page.getByTestId('print-sheet').first()).toContainText('06/11/2026 18:45');
  });

  test('lojas extras ficam no cadastro, a ordem é editável e a seleção acompanha o documento', async ({ page }) => {
    await page.getByText('Gerenciar lojas cadastradas').click();
    await page.getByRole('textbox', { name: 'Nova loja' }).fill('Loja de Teste');
    await page.getByRole('textbox', { name: 'Nome na etiqueta' }).first().fill('TESTE');
    await page.getByRole('button', { name: 'Adicionar loja' }).click();
    await expect(page.getByTestId('boxes-heading')).toContainText('TESTE');
    await page.getByRole('button', { name: 'Subir Loja de Teste' }).click();
    await expect(page.getByTestId('boxes-heading')).toContainText('CARIACICA / TESTE / VILA VELHA');
    await page.getByTestId('box-person').fill('Responsável');
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    await expect(page).toHaveURL(/\?doc=/);
    await page.reload();
    await expect(page.getByTestId('mode-boxes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('boxes-heading')).toContainText('TESTE');
    await expect(page.getByTestId('box-person')).toHaveValue('Responsável');
  });

  test('hora online é priorizada quando imprime e é aplicada a todas as caixas', async ({ page }) => {
    await page.getByTestId('box-total').fill('5');
    await page.getByTestId('box-show-time').check();
    await page.route('**/brand/icon.svg', async (route) => {
      if (route.request().method() === 'HEAD') {
        await route.fulfill({ status: 200, headers: { date: 'Fri, 06 Nov 2026 21:36:00 GMT' }, body: '' });
      } else await route.continue();
    });
    await page.evaluate(() => {
      window.print = () => { document.documentElement.setAttribute('data-print-called', 'true'); };
    });
    await page.getByRole('tab', { name: 'Exportar' }).click();
    await page.getByTestId('print').click();
    await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true');
    const labels = page.getByTestId('print-sheet').getByTestId('box-label');
    await expect(labels).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(labels.nth(i)).toContainText((i + 1) + '/5');
      await expect(labels.nth(i)).toContainText('06/11/2026 18:36');
    }
  });

  test('modelos, fonte, linha de corte e edição direta funcionam na mesma folha de impressão', async ({ page }) => {
    await expect(page.getByTestId('editor-inspector')).toBeVisible();
    await expect(page.getByTestId('hide-properties')).toHaveCount(0);
    await page.getByTestId('box-destination-size').fill('28');
    await page.getByTestId('box-destination-size').press('Tab');
    await expect(page.getByTestId('box-preview').locator('.box-destination').first()).toHaveCSS('font-size', '37.3333px');
    await page.getByTestId('box-cut-lines').uncheck();
    await expect(page.getByTestId('print-sheet').locator('.box-label').first()).toHaveCSS('border-top-style', 'solid');
    await page.getByTestId('box-edit-nf').first().click();
    await page.getByRole('textbox', { name: 'Editar NF' }).fill('120001');
    await page.getByRole('textbox', { name: 'Editar NF' }).press('Enter');
    await expect(page.getByTestId('box-nf')).toHaveValue('120001');
    await expect(page.getByTestId('print-sheet')).toContainText('NF: 120001');
    await page.getByRole('tab', { name: 'Modelos' }).click();
    await page.getByTestId('box-model-1').click();
    await expect(page.getByTestId('print-sheet')).toHaveCount(2);
    await expect(page.getByTestId('box-preview').getByTestId('box-label')).toHaveCount(1);
    await page.getByTestId('box-fit').click();
    await expect(page.getByTestId('box-zoom-label')).toHaveText('100%');
  });

  test('data e hora são opcionais e não aparecem na impressão quando desligadas', async ({ page }) => {
    await expect(page.getByTestId('box-show-time')).not.toBeChecked();
    await expect(page.getByTestId('print-sheet').first()).not.toContainText(/\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}/);
    await page.getByTestId('box-show-time').check();
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    await page.getByTestId('box-date').fill('2026-11-06');
    await page.getByTestId('box-time').fill('20:00');
    await expect(page.getByTestId('print-sheet').first()).toContainText('06/11/2026 20:00');
    await page.getByTestId('box-show-time').uncheck();
    await expect(page.getByTestId('print-sheet').first()).not.toContainText('06/11/2026 20:00');
  });

  test('modo automático offline usa horário local e exporta PDF', async ({ page }) => {
    await page.getByTestId('box-show-time').check();
    await page.route('**/brand/icon.svg', (route) => route.request().method() === 'HEAD' ? route.abort() : route.continue());
    await page.getByRole('tab', { name: 'Exportar' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('pdf').click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.getByTestId('print-sheet').first()).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });
});
