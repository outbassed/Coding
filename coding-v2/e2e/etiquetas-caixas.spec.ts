import { test, expect } from '@playwright/test';

test.describe('Etiquetas · Identificação de Caixas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/apps/etiquetas/?novo=1');
    await page.getByTestId('mode-boxes').click();
  });

  test('Código permanece intacto; Caixas começa com Cariacica / Vila Velha e 1/2, 2/2', async ({ page }) => {
    await expect(page.getByTestId('box-nf')).toHaveValue('10000');
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

  test('modo automático offline usa horário local e exporta PDF', async ({ page }) => {
    await page.route('**/brand/icon.svg', (route) => route.request().method() === 'HEAD' ? route.abort() : route.continue());
    await page.getByRole('tab', { name: 'Exportar' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('pdf').click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.getByTestId('print-sheet').first()).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    await expect(page.getByTestId('editor-status')).toContainText('dispositivo');
  });
});
