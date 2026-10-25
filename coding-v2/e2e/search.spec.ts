import { test, expect, type Page } from '@playwright/test';

const catalogBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar no catálogo' });
const myBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar nos meus apps' });

test.describe('Busca por tela do Launcher', () => {
  test('digitar "planilhas" sem clicar de novo mantém o foco e não troca de tela (Catálogo)', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    await catalogBox(page).click();
    await page.keyboard.type('planilhas', { delay: 40 });
    await expect(catalogBox(page)).toHaveValue('planilhas');
    await expect(catalogBox(page)).toBeFocused();
    await expect(page).toHaveURL(/#\/catalogo$/);
    await expect(page.locator('article.card')).toHaveCount(1);
    await expect(page.locator('article.card h3')).toHaveText('Planilhas');
    // Esc limpa e o foco continua no campo
    await page.keyboard.press('Escape');
    await expect(catalogBox(page)).toHaveValue('');
    await expect(catalogBox(page)).toBeFocused();
    await expect(page.locator('article.card')).toHaveCount(8);
  });

  test('Meus apps tem busca própria e não mistura com o Catálogo', async ({ page }) => {
    await page.goto('/launcher/#/meus-apps');
    await myBox(page).click();
    await page.keyboard.type('planilhas', { delay: 40 });
    await expect(myBox(page)).toBeFocused();
    await expect(page.locator('article.card')).toHaveCount(1);
    await page.goto('/launcher/#/catalogo');
    await expect(catalogBox(page)).toHaveValue('');
    await expect(page.locator('article.card')).toHaveCount(8);
    await catalogBox(page).fill('sorteio');
    await page.goto('/launcher/#/meus-apps');
    await expect(myBox(page)).toHaveValue('planilhas');
    await expect(page.locator('article.card')).toHaveCount(1);
    await page.goto('/launcher/#/catalogo');
    await expect(catalogBox(page)).toHaveValue('sorteio');
    await expect(page.locator('article.card')).toHaveCount(1);
  });

  test('voltar e avançar do navegador preservam o texto de cada tela', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    await catalogBox(page).fill('qr');
    await page.locator('nav a:visible', { hasText: 'Meus apps' }).first().click();
    await expect(page).toHaveURL(/#\/meus-apps$/);
    await myBox(page).fill('texto');
    await page.goBack();
    await expect(page).toHaveURL(/#\/catalogo$/);
    await expect(catalogBox(page)).toHaveValue('qr');
    await page.goForward();
    await expect(myBox(page)).toHaveValue('texto');
  });

  test('Documentos e Ajustes não têm busca no topo; a busca local de Documentos continua', async ({ page }) => {
    for (const route of ['/launcher/', '/launcher/#/ajustes']) {
      await page.goto(route);
      await expect(page.getByRole('searchbox')).toHaveCount(0);
      await expect(page.getByRole('searchbox', { name: 'Buscar aplicativos' })).toHaveCount(0);
    }
    await page.goto('/launcher/#/documentos');
    await expect(page.getByRole('searchbox', { name: 'Buscar aplicativos' })).toHaveCount(0);
    await expect(page.getByTestId('copy-count')).toBeVisible();
  });

  test('a busca fica só nesta aba e nada encontrado mostra aviso com limpar', async ({ page, context }) => {
    await page.goto('/launcher/#/catalogo');
    await catalogBox(page).fill('zzzz');
    await expect(page.getByText('Nada encontrado.')).toBeVisible();
    const other = await context.newPage();
    await other.goto('/launcher/#/catalogo');
    await expect(catalogBox(other)).toHaveValue('');
    await page.reload();
    await expect(catalogBox(page)).toHaveValue('zzzz');
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).first().click();
    await expect(page.locator('article.card')).toHaveCount(8);
  });

  test('celular: digitar mantém o foco e a busca ignora acentos e maiúsculas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/launcher/#/catalogo');
    await catalogBox(page).click();
    await page.keyboard.type('PLANILHAS', { delay: 30 });
    await expect(catalogBox(page)).toBeFocused();
    await expect(page.locator('article.card')).toHaveCount(1);
    await catalogBox(page).fill('etiqueta');
    await expect(page.locator('article.card')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Lista suspensa de categorias', () => {
  test('teclado, Esc, clique fora e seleção visível', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    const button = page.getByTestId('category-button');
    const list = page.getByTestId('category-list');
    await expect(list).toBeHidden();
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toContainText('Escrita');
    await expect(page.locator('article.card')).toHaveCount(1);
    await button.click();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await page.locator('h1').click();
    await expect(list).toBeHidden();
    await button.click();
    await page.getByRole('option', { name: 'Todas' }).click();
    await expect(page.locator('article.card')).toHaveCount(8);
  });

  test('filtros combinam em E e persistem ao sair e voltar', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    await page.getByTestId('category-button').click();
    await page.getByRole('option', { name: 'Planilhas e contas' }).click();
    await expect(page.locator('article.card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Ativados', exact: true }).click();
    await catalogBox(page).fill('racha');
    await expect(page.locator('article.card')).toHaveCount(1);
    await page.locator('nav a:visible', { hasText: 'Ajustes' }).first().click();
    await page.locator('nav a:visible', { hasText: 'Catálogo' }).first().click();
    await expect(page.getByTestId('category-button')).toContainText('Planilhas e contas');
    await expect(catalogBox(page)).toHaveValue('racha');
    await expect(page.getByRole('button', { name: 'Ativados', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('clear-filters').click();
    await expect(page.locator('article.card')).toHaveCount(8);
  });

  test('funciona no celular', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto('/launcher/#/catalogo');
    await page.getByTestId('category-button').click();
    const box = (await page.getByTestId('category-list').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await page.getByRole('option', { name: 'Imagens e PDF' }).tap().catch(() => page.getByRole('option', { name: 'Imagens e PDF' }).click());
    await expect(page.locator('article.card')).toHaveCount(2);
  });
});
