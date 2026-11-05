import { test, expect, type Page } from '@playwright/test';
import { tools } from '../src/shared/catalog';

/* Voltar à tela de origem: o link "Início" do aplicativo leva de volta à tela do Launcher de onde ele foi aberto. */
const BACK = 'a[href^="/launcher/"]';
const openFrom = async (page: Page, route: string, name: string) => {
  await page.goto('/launcher/#' + route);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.getByRole('link', { name: 'Abrir o editor de ' + name }).first().click();
};
const back = (page: Page) => page.locator(BACK).first();

test.describe('Voltar à origem', () => {
  for (const [route, label, hash] of [
    ['/meus-apps', 'Meus apps', '#/meus-apps'],
    ['/catalogo', 'Catálogo', '#/catalogo']
  ] as const) {
    test('aberto por ' + label + ': voltar leva para ' + label, async ({ page }) => {
      await openFrom(page, route, 'Calculadora');
      await expect(page).toHaveURL(/\/apps\/calculadora\//);
      await expect(back(page)).toHaveAttribute('title', 'Voltar para ' + label);
      await back(page).click();
      await expect(page).toHaveURL(new RegExp('/launcher/' + hash.replace(/[#/]/g, (c) => '\\' + c) + '$'));
    });
  }

  test('aberto pelos Detalhes: voltar leva aos Detalhes daquele aplicativo', async ({ page }) => {
    await page.goto('/launcher/#/app/zip');
    await page.getByTestId('open-editor').click();
    await expect(page).toHaveURL(/\/apps\/zip\//);
    await expect(back(page)).toHaveAttribute('title', 'Voltar para Detalhes de Compactador ZIP');
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/app\/zip$/);
  });

  test('aberto pelo Início: voltar leva ao Início (sem rótulo diferente)', async ({ page }) => {
    await page.goto('/launcher/#/');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.getByRole('link', { name: /^Abrir o editor de / }).first().click();
    await expect(page).toHaveURL(/\/apps\//);
    await expect(back(page)).not.toHaveAttribute('title', /Voltar para/); // Início é o destino normal do botão
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
  });

  test('acesso direto ao app não inventa origem: voltar leva ao Início', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await expect(back(page)).not.toHaveAttribute('title', /Voltar para/);
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
  });

  test('histórico real: o botão Voltar do navegador continua funcionando e a origem não cria ciclo', async ({ page }) => {
    await openFrom(page, '/catalogo', 'Calculadora');
    await page.goBack(); // histórico nativo: volta ao Catálogo
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/apps\/calculadora\/$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
    await page.goBack(); // o app de novo (uma entrada, não um ciclo)
    await expect(page).toHaveURL(/\/apps\/calculadora\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
  });

  test('recarregar o aplicativo mantém a origem', async ({ page }) => {
    await openFrom(page, '/meus-apps', 'Calculadora');
    await page.reload();
    await expect(back(page)).toHaveAttribute('title', 'Voltar para Meus apps');
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/meus-apps$/);
  });

  test('cada abertura atualiza a origem (Catálogo e depois Meus apps)', async ({ page }) => {
    await openFrom(page, '/catalogo', 'Calculadora');
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
    await page.goto('/launcher/#/meus-apps');
    await page.getByRole('link', { name: 'Abrir o editor de Estúdio de Cores' }).first().click();
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/meus-apps$/);
  });

  test('de um app para outro (Visualizador → Código) a origem do Launcher continua valendo', async ({ page }) => {
    await openFrom(page, '/catalogo', 'Visualizador');
    await page.getByTestId('viewer-input').setInputFiles({ name: 'a.js', mimeType: 'text/javascript', buffer: Buffer.from('console.log(1)\n') });
    await page.getByTestId('open-in-code').click();
    await expect(page).toHaveURL(/\/apps\/codigo\/\?doc=/);
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
  });

  test('sessão vencida (mais de 20 min): a origem antiga não é reaproveitada', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await context.clock.install({ time: new Date('2026-11-05T12:00:00-03:00') });
    const page = await context.newPage();
    await openFrom(page, '/catalogo', 'Calculadora');
    await expect(back(page)).toHaveAttribute('title', 'Voltar para Catálogo');
    await context.clock.fastForward(21 * 60_000);
    await back(page).click();
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });

  test('o link mantém o endereço original; a troca só acontece no clique simples', async ({ page }) => {
    await openFrom(page, '/catalogo', 'Calculadora');
    const href = await back(page).getAttribute('href');
    expect(href).toBe('/launcher/#/'); // o endereço original continua no link; a troca só acontece no clique simples
  });

  test('os 16 aplicativos voltam à origem', async ({ page }) => {
    const apps = tools.filter((t) => t.path);
    expect(apps).toHaveLength(16);
    const failures: string[] = [];
    for (const tool of apps) {
      await page.goto('/launcher/#/catalogo');
      await expect(page.locator('h1').first()).toBeVisible();
      await page.evaluate((path) => location.assign(path), tool.path!); // navegação real a partir do Launcher
      await page.waitForURL('**' + tool.path);
      const link = back(page);
      try {
        await expect(link).toHaveAttribute('title', 'Voltar para Catálogo', { timeout: 8000 });
        await link.click();
        await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
      } catch { failures.push(tool.id); }
    }
    expect(failures, 'aplicativos cujo voltar não foi à origem').toEqual([]);
  });
});
