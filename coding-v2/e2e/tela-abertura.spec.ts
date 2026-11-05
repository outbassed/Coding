import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

/* Tela de abertura (/): aparece na hora, não depende do Vue, respeita tema e movimento reduzido e funciona sem JavaScript. */
const DARK = 'rgb(23, 28, 36)';
const LIGHT = 'rgb(243, 245, 249)';
/** Responde "204 sem conteúdo" ao Launcher: o navegador continua na tela de abertura (para podermos olhá-la) e o pedido fica registrado. */
async function holdLauncher(page: Page): Promise<{ asked: Promise<unknown> }> {
  const asked = page.waitForRequest((r) => new URL(r.url()).pathname === '/launcher/', { timeout: 10000 });
  asked.catch(() => undefined); // só falha de verdade se o teste esperar por ele
  await page.route('**/launcher/**', (route) => route.fulfill({ status: 204 }));
  return { asked };
}
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Tela de abertura', () => {
  test('mostra logo, nome, mensagem e indicador de carregamento enquanto o Launcher abre', async ({ page }) => {
    const { asked } = await holdLauncher(page);
    await page.goto('/', { waitUntil: 'commit' });
    const splash = page.getByTestId('splash');
    await expect(splash).toBeVisible();
    await expect(splash.getByRole('heading', { name: 'Coding Launcher' })).toBeVisible();
    await expect(splash).toContainText('Abrindo o Launcher...');
    await expect(splash.locator('img')).toBeVisible();
    await expect(splash.locator('.bar')).toBeVisible();
    await expect(page.getByTestId('splash-open')).toHaveAttribute('href', '/launcher/');
    await asked; // e pede o Launcher sozinha, sem ninguém clicar
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

  test('sem JavaScript: a tela de abertura existe e o navegador segue para o Launcher', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    const { asked } = await holdLauncher(page);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByTestId('splash')).toBeVisible();
    await expect(page.getByTestId('splash-open')).toBeVisible(); // alternativa acessível
    await asked; // meta refresh em <noscript>
    await context.close();
  });

  test('temas: claro e escuro, sem flash branco no escuro', async ({ browser }) => {
    for (const [scheme, saved, expected] of [['light', null, LIGHT], ['dark', null, DARK], ['light', 'dark', DARK], ['dark', 'light', LIGHT]] as const) {
      const context = await browser.newContext({ colorScheme: scheme, baseURL: test.info().project.use.baseURL });
      if (saved) await context.addInitScript((value) => localStorage.setItem('coding-v2-theme', value), saved);
      const page = await context.newPage();
      await holdLauncher(page);
      await page.goto('/', { waitUntil: 'commit' });
      await expect(page.getByTestId('splash')).toBeVisible();
      expect(await bg(page), 'sistema ' + scheme + ', salvo ' + saved).toBe(expected);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(expected);
      await context.close();
    }
  });

  test('movimento reduzido: o indicador não anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await holdLauncher(page);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByTestId('splash')).toBeVisible();
    await expect(page.locator('.bar i')).toHaveCSS('animation-name', 'none');
  });

  test('movimento normal: o indicador anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await holdLauncher(page);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.bar i')).not.toHaveCSS('animation-name', 'none');
  });

  for (const [width, height] of [[320, 640], [390, 844], [1280, 800]] as const) {
    test(`sem rolagem horizontal e sem violações de acessibilidade em ${width}px`, async ({ browser }) => {
      for (const scheme of ['light', 'dark'] as const) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
        const page = await context.newPage();
        await holdLauncher(page);
        await page.goto('/', { waitUntil: 'commit' });
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
