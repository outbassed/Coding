import { expect, test } from '@playwright/test';

const originals = [
  'labels', 'texts', 'calc', 'images', 'pdf', 'codes',
  'sheet', 'draw', 'split', 'home', 'tools', 'coding'
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

test('Catálogo usa os nove ícones clássicos e todos carregam', async ({ page }) => {
  await page.goto('/launcher/#/catalogo');
  const imgs = page.locator('[data-testid="app-icon"] img');
  await expect(imgs).toHaveCount(9);
  const sources = await imgs.evaluateAll((elements) => elements.map((el) => (el as HTMLImageElement).getAttribute('src')));
  for (const name of ['labels','texts','calc','images','pdf','codes','sheet','draw','split']) {
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
  await expect(page.locator('nav[aria-label="Navegação móvel"] img[src="/legacy-icons/tools.svg"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
