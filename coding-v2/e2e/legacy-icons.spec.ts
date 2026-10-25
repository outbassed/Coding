import { expect, test } from '@playwright/test';
import { APP_COUNT } from './helpers';

const originals = [
  'labels', 'texts', 'calc', 'images', 'pdf', 'codes',
  'sheet', 'draw', 'split', 'home', 'tools', 'coding', 'my-apps', 'catalog', 'documents'
];

test('Os SVGs restaurados são servidos pelo build sem alterar os desenhos originais', async ({ request }) => {
  for (const name of originals) {
    const response = await request.get('/legacy-icons/' + name + '.svg');
    expect(response.status(), name).toBe(200);
    const source = await response.text();
    expect(source).toContain('<svg');
    expect(source).toContain('<linearGradient');
    expect(source).toContain('viewBox=');
  }
});

test('Catálogo usa os oito ícones clássicos e todos carregam', async ({ page }) => {
  await page.goto('/launcher/#/catalogo');
  const imgs = page.locator('article.card [data-testid="app-icon"] img');
  await expect(imgs).toHaveCount(APP_COUNT);
  const sources = await imgs.evaluateAll((elements) => elements.map((el) => (el as HTMLImageElement).getAttribute('src')));
  for (const name of ['labels','texts','calc','images','pdf','codes','draw','split','calculator','colors','zip','compare','code']) {
    expect(sources).toContain('/legacy-icons/' + name + '.svg');
  }
  await expect.poll(() => imgs.evaluateAll((elements) => elements.every((el) => {
    const image = el as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }))).toBe(true);
});

test('Navegação e marca restauradas funcionam também no celular', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/launcher/#/inicio');
  const logo = page.locator('header.top img.mark');
  await expect(logo).toHaveAttribute('src', '/legacy-icons/coding.svg');
  await expect(page.locator('nav[aria-label="Navegação móvel"] img[src="/legacy-icons/home.svg"]')).toBeVisible();
  const nav = page.locator('nav[aria-label="Navegação móvel"]');
  for (const name of ['home', 'my-apps', 'catalog', 'documents', 'tools']) {
    const img = nav.locator('img[src="/legacy-icons/' + name + '.svg"]');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  }
  await expect(nav.locator('img')).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Cinco logos na navegação lateral, na ordem certa, ainda com texto acessível', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/launcher/#/inicio');
  const side = page.getByRole('navigation', { name: 'Navegação principal' });
  const srcs = await side.locator('img.legacy-nav-icon').evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute('src')));
  expect(srcs).toEqual(['/legacy-icons/home.svg', '/legacy-icons/my-apps.svg', '/legacy-icons/catalog.svg', '/legacy-icons/documents.svg', '/legacy-icons/tools.svg']);
  for (const label of ['Início', 'Meus apps', 'Catálogo', 'Documentos', 'Ajustes']) await expect(side.getByRole('link', { name: label })).toBeVisible();
  const sizes = await side.locator('img.legacy-nav-icon').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(new Set(sizes).size).toBe(1);
});

test('Os três logos novos mantêm o estilo clássico (quadrado arredondado, gradiente, desenho branco)', async ({ request }) => {
  for (const name of ['my-apps', 'catalog', 'documents']) {
    const source = await (await request.get('/legacy-icons/' + name + '.svg')).text();
    expect(source, name).toContain('viewBox="0 0 48 48"');
    expect(source, name).toMatch(/<rect width="48" height="48" rx="12" fill="url\(#g-/);
    expect(source, name).toContain('#fff');
    expect(source, name).not.toContain('<script');
  }
});
