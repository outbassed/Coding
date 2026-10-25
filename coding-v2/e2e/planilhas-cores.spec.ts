import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Planilhas: cor da fonte e preenchimento de verdade (modelo, tela, persistência e XLSX). */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const cell = (page: Page, name: string) => page.locator('[data-cell="' + name + '"]');
const RED = 'rgb(192, 0, 0)';
const GREEN = 'rgb(112, 173, 71)';
const YELLOW = 'rgb(255, 255, 0)';
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });

test.describe('Planilhas · cores', () => {
  test('célula, coluna inteira e linha inteira: aplicam, persistem após recarregar e sobrevivem ao XLSX', async ({ page }) => {
    await page.goto('/apps/planilhas/?novo=1');
    await expect(cell(page, 'A1')).toBeVisible();

    // célula com preenchimento personalizado: a fonte fica legível sozinha
    await cell(page, 'B2').click();
    await page.getByTestId('bg-custom').fill('#ffff00');
    await expect(cell(page, 'B2')).toHaveCSS('background-color', YELLOW);
    await expect(cell(page, 'B2')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(cell(page, 'B3')).not.toHaveCSS('background-color', YELLOW);

    // cor da fonte pela paleta
    await cell(page, 'B2').click();
    await page.getByTestId('fg-c00000').click();
    await expect(cell(page, 'B2')).toHaveCSS('color', RED);

    // coluna inteira pelo cabeçalho: vale para células vazias também
    await page.locator('th[data-col="D"]').click();
    await expect(page.getByTestId('cell-address')).toContainText('D1:D');
    await page.getByTestId('bg-70ad47').click();
    await expect(cell(page, 'D1')).toHaveCSS('background-color', GREEN);
    await expect(cell(page, 'D12')).toHaveCSS('background-color', GREEN);
    await expect(cell(page, 'E12')).not.toHaveCSS('background-color', GREEN);

    // linha inteira pelo cabeçalho da linha
    await page.locator('th[data-row="4"]').click();
    await page.getByTestId('fg-c00000').click();
    await expect(cell(page, 'A4')).toHaveCSS('color', RED);
    await expect(cell(page, 'L4')).toHaveCSS('color', RED);

    // atalho do teclado: Ctrl+Espaço seleciona a coluna da célula ativa
    await cell(page, 'F3').click();
    await page.keyboard.press('Control+Space');
    await expect(page.getByTestId('cell-address')).toContainText('F1:F');

    await saved(page);
    await page.reload();
    await expect(cell(page, 'B2')).toHaveCSS('background-color', YELLOW);
    await expect(cell(page, 'B2')).toHaveCSS('color', RED);
    await expect(cell(page, 'D12')).toHaveCSS('background-color', GREEN);
    await expect(cell(page, 'L4')).toHaveCSS('color', RED);

    // XLSX baixado e importado de volta como nova aba mantém as cores
    await tab(page, 'Arquivo').click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    const path = await xlsx.path();
    await page.getByTestId('import-input').setInputFiles(path!);
    await expect(page.getByTestId('file-message')).toContainText('1 aba(s) importada(s)');
    await expect(page.getByTestId('sheet-tabs').getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(cell(page, 'B2')).toHaveCSS('background-color', YELLOW);
    await expect(cell(page, 'B2')).toHaveCSS('color', RED);
    await expect(cell(page, 'D12')).toHaveCSS('background-color', GREEN);
    await expect(cell(page, 'A4')).toHaveCSS('color', RED);
  });

  test('“Sem cor” remove e “Limpar formatação” limpa a seleção; coluna colorida aceita exceção sem cor', async ({ page }) => {
    await page.goto('/apps/planilhas/?novo=1');
    await page.locator('th[data-col="C"]').click();
    await tab(page, 'Início').click();
    await page.getByTestId('bg-ed7d31').click();
    await expect(cell(page, 'C5')).toHaveCSS('background-color', 'rgb(237, 125, 49)');
    await cell(page, 'C5').click();
    await page.getByTestId('bg-none').click();
    await expect(cell(page, 'C5')).not.toHaveCSS('background-color', 'rgb(237, 125, 49)');
    await expect(cell(page, 'C6')).toHaveCSS('background-color', 'rgb(237, 125, 49)');
    await page.locator('th[data-col="C"]').click();
    await page.getByRole('button', { name: 'Limpar formatação' }).click();
    await expect(cell(page, 'C6')).not.toHaveCSS('background-color', 'rgb(237, 125, 49)');
  });

  test('o seletor “Selecionar” escolhe coluna, linha e tudo; Shift estende a seleção de colunas', async ({ page }) => {
    await page.goto('/apps/planilhas/?novo=1');
    await cell(page, 'B3').click();
    await page.getByTestId('select-column').click();
    await expect(page.getByTestId('cell-address')).toContainText('B1:B');
    await page.getByTestId('select-row').click();
    await expect(page.getByTestId('cell-address')).toHaveText(/^A3:/);
    await page.getByTestId('select-all').click();
    await expect(page.getByTestId('cell-address')).toContainText('A1:L');
    await page.locator('th[data-col="B"]').click();
    await page.locator('th[data-col="D"]').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('cell-address')).toContainText('B1:D');
  });

  test('sem violações de acessibilidade com o painel de cores aberto', async ({ page }) => {
    await page.goto('/apps/planilhas/?novo=1');
    await expect(page.getByTestId('bg-group')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});
