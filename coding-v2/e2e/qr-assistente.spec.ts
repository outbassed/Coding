import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* QR / Barras: assistente de conteúdo, vários códigos de uma vez e aparências salvas. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function openAssist(page: Page): Promise<void> {
  await page.goto('/apps/qr/?modelo=em-branco');
  await page.getByTestId('assist').locator('summary').click();
}

test.describe('QR · assistente e aparências', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Wi-Fi: escapa os caracteres especiais e o QR é gerado', async ({ page }) => {
    await openAssist(page);
    await page.getByTestId('assist-kind').selectOption('wifi');
    await page.getByTestId('assist-ssid').fill('Minha;Rede');
    await page.getByTestId('assist-password').fill('abc"123456');
    await page.getByTestId('assist-apply').click();
    await expect(page.getByTestId('code-value')).toHaveValue('WIFI:T:WPA;S:Minha\\;Rede;P:abc\\"123456;;');
    await expect(page.getByTestId('code-caption')).toHaveValue('Rede: Minha;Rede');
    await expect(page.getByTestId('code-preview')).toBeVisible();
    await saved(page);
  });

  test('senha curta e telefone inválido mostram o motivo e não mudam o código', async ({ page }) => {
    await openAssist(page);
    await page.getByTestId('assist-kind').selectOption('wifi');
    await page.getByTestId('assist-ssid').fill('Casa');
    await page.getByTestId('assist-password').fill('curta');
    await page.getByTestId('assist-apply').click();
    await expect(page.getByTestId('assist-error')).toContainText('8 a 63');
    await expect(page.getByTestId('code-value')).toHaveValue('');
    await page.getByTestId('assist-kind').selectOption('phone');
    await page.getByTestId('assist-phone').fill('12');
    await page.getByTestId('assist-apply').click();
    await expect(page.getByTestId('assist-error')).toContainText('8 a 15 dígitos');
    await page.getByTestId('assist-phone').fill('(11) 91234-5678');
    await page.getByTestId('assist-apply').click();
    await expect(page.getByTestId('assist-error')).toHaveCount(0);
    await expect(page.getByTestId('code-value')).toHaveValue('tel:11912345678');
  });

  test('contato vira vCard e site ganha https', async ({ page }) => {
    await openAssist(page);
    await page.getByTestId('assist-kind').selectOption('vcard');
    await page.getByTestId('assist-vname').fill('Maria da Silva');
    await page.getByTestId('assist-apply').click();
    const value = await page.getByTestId('code-value').inputValue();
    expect(value).toContain('BEGIN:VCARD');
    expect(value).toContain('FN:Maria da Silva');
    await page.getByTestId('assist-kind').selectOption('url');
    await page.getByTestId('assist-url').fill('exemplo.com.br/loja');
    await page.getByTestId('assist-apply').click();
    await expect(page.getByTestId('code-value')).toHaveValue('https://exemplo.com.br/loja');
  });

  test('vários códigos de uma vez entram na lista e na folha', async ({ page }) => {
    await page.goto('/apps/qr/?modelo=em-branco');
    await page.getByTestId('batch').locator('summary').click();
    await page.getByTestId('batch-text').fill('https://a.example\n\nhttps://b.example\nhttps://c.example');
    await page.getByTestId('batch-add').click();
    await expect(page.getByTestId('code-select').locator('option')).toHaveCount(4); // o vazio do modelo + 3
    await expect(page.getByTestId('code-value')).toHaveValue('https://a.example');
    await expect(page.getByTestId('sheet').locator('.cell')).toHaveCount(3); // o código vazio fica de fora
  });

  test('aparências salvas: guardar, aplicar, atualizar, excluir e persistir', async ({ page }) => {
    await page.goto('/apps/qr/?modelo=em-branco');
    await tab(page, 'Aparência').click();
    await page.getByTestId('module-size').fill('8');
    await page.getByTestId('style-presets').locator('summary').click();
    await page.getByTestId('style-name').fill('Grande');
    await page.getByTestId('style-save').click();
    await expect(page.getByTestId('style-select')).toContainText('Grande');
    await page.getByTestId('module-size').fill('3');
    await page.getByTestId('style-select').selectOption({ label: 'Grande' });
    await page.getByTestId('style-apply').click();
    await expect(page.getByTestId('module-size')).toHaveValue('8');
    await saved(page);
    await page.reload();
    await tab(page, 'Aparência').click();
    await page.getByTestId('style-presets').locator('summary').click();
    await expect(page.getByTestId('style-select')).toContainText('Grande');
    await page.getByTestId('style-select').selectOption({ label: 'Grande' });
    await page.getByTestId('style-delete').click();
    await expect(page.getByTestId('style-select')).toHaveCount(0);
  });
});

test.describe('QR · assistente · celular', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });
  test('formulário de contato aberto: sem rolagem horizontal e sem violações de acessibilidade', async ({ page }) => {
    await openAssist(page);
    await page.getByTestId('assist-kind').selectOption('vcard');
    await expect(page.getByTestId('assist-vname')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});
