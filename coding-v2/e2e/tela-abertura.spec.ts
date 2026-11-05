import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

/* Tela de abertura (/): aparece na hora, não depende do Vue, respeita tema e movimento reduzido e funciona sem JavaScript. */
const DARK = 'rgb(23, 28, 36)';
const LIGHT = 'rgb(243, 245, 249)';
/**
 * Entrega a tela de abertura sem o redirecionamento (script e `<noscript>` retirados) para podermos olhá-la com calma.
 * O redirecionamento em si é testado à parte, com o servidor real.
 */
async function staticSplash(page: Page): Promise<void> {
  await page.route((url) => url.pathname === '/', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<script>[^<]*location\.replace[^<]*<\/script>/, '').replace(/<noscript>[\s\S]*?<\/noscript>/, '');
    await route.fulfill({ response, body, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) } });
  });
}
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Tela de abertura', () => {
  test('mostra logo, nome, mensagem e indicador de carregamento enquanto o Launcher abre', async ({ page }) => {
    await staticSplash(page);
    await page.goto('/');
    const splash = page.getByTestId('splash');
    await expect(splash).toBeVisible();
    await expect(splash.getByRole('heading', { name: 'Coding Launcher' })).toBeVisible();
    await expect(splash).toContainText('Abrindo o Launcher...');
    await expect(splash.locator('img')).toBeVisible();
    await expect(splash.locator('.bar')).toBeVisible();
    await expect(page.getByTestId('splash-open')).toHaveAttribute('href', '/launcher/');
  });

  test('segue sozinha para o Launcher de verdade', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('não depende do Vue: o HTML já traz tudo e não carrega módulos', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('Abrindo o Launcher...');
    expect(html).toContain('Coding Launcher');
    expect(html).not.toMatch(/type="module"/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain('<noscript><meta http-equiv="refresh" content="0;url=/launcher/"></noscript>');
  });

  test('sem JavaScript: o navegador segue para o Launcher pelo meta refresh', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/launcher\//, { timeout: 15000 });
    await context.close();
  });

  test('sem JavaScript: a tela de abertura traz o link para abrir o Launcher', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<a class="open" href="\/launcher\/"[^>]*>Abrir o Coding Launcher<\/a>/);
  });

  test('temas: claro e escuro, sem flash branco no escuro', async ({ browser }) => {
    for (const [scheme, saved, expected] of [['light', null, LIGHT], ['dark', null, DARK], ['light', 'dark', DARK], ['dark', 'light', LIGHT]] as const) {
      const context = await browser.newContext({ colorScheme: scheme, baseURL: test.info().project.use.baseURL });
      if (saved) await context.addInitScript((value) => localStorage.setItem('coding-v2-theme', value), saved);
      const page = await context.newPage();
      await staticSplash(page);
      await page.goto('/');
      await expect(page.getByTestId('splash')).toBeVisible();
      expect(await bg(page), 'sistema ' + scheme + ', salvo ' + saved).toBe(expected);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(expected);
      await context.close();
    }
  });

  test('movimento reduzido: o indicador não anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await staticSplash(page);
    await page.goto('/');
    await expect(page.getByTestId('splash')).toBeVisible();
    await expect(page.locator('.bar i')).toHaveCSS('animation-name', 'none');
  });

  test('movimento normal: o indicador anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await staticSplash(page);
    await page.goto('/');
    await expect(page.locator('.bar i')).not.toHaveCSS('animation-name', 'none');
  });

  for (const [width, height] of [[320, 640], [390, 844], [1280, 800]] as const) {
    test(`sem rolagem horizontal e sem violações de acessibilidade em ${width}px`, async ({ browser }) => {
      for (const scheme of ['light', 'dark'] as const) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, baseURL: test.info().project.use.baseURL });
        const page = await context.newPage();
        await staticSplash(page);
        await page.goto('/');
        await expect(page.getByTestId('splash')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        const open = await page.getByTestId('splash-open').boundingBox();
        expect(open!.height).toBeGreaterThanOrEqual(44);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
        expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')), scheme).toEqual([]);
        await context.close();
      }
    });
  }

  test('URLs diretas dos aplicativos e do Launcher não passam pela tela de abertura', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await expect(page.getByTestId('splash')).toHaveCount(0);
    await expect(page).toHaveURL(/\/apps\/calculadora\/$/);
    await page.goto('/launcher/#/catalogo');
    await expect(page.getByTestId('splash')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/catalogo$/);
  });

  test('o endereço da raiz abre o Launcher no Início para quem chega pela primeira vez', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
  });
});
