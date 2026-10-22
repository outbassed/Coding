import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
async function overflow(page: Page): Promise<number> {
  const result = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const culprits = Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.getBoundingClientRect().right > limit + 0.5 && el.getBoundingClientRect().width > 0)
      .slice(0, 5).map((el) => el.tagName + '.' + String(el.className).slice(0, 40) + ' ' + Math.round(el.getBoundingClientRect().right));
    return { over: document.documentElement.scrollWidth - limit, culprits };
  });
  if (result.over > 0) console.log('OVERFLOW', result.culprits.join(' | '));
  return result.over;
}
/** Quantas colunas a maior grade de aplicativos da tela realmente desenha. */
async function columns(page: Page): Promise<{ cols: number; cards: number; maxRight: number }> {
  return page.evaluate(() => {
    let best = { cols: 0, cards: 0, maxRight: 0 };
    for (const grid of Array.from(document.querySelectorAll('[data-testid="app-grid"]'))) {
      const rects = Array.from(grid.querySelectorAll('article.card')).map((c) => c.getBoundingClientRect());
      const xs = new Set(rects.map((r) => Math.round(r.left)));
      if (rects.length > best.cards) best = { cols: xs.size, cards: rects.length, maxRight: Math.max(...rects.map((r) => r.right)) };
    }
    return best;
  });
}
const ROUTES = ['/', '/meus-apps', '/catalogo', '/documentos', '/ajustes', '/app/labels', '/app/texts', '/app/calc'];

test.describe('Launcher · celulares', () => {
  for (const width of [320, 360, 390, 430]) {
    test('largura ' + width + ': exatamente 3 colunas, sem rolagem horizontal e barra inferior inteira', async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ROUTES) {
        await page.goto('/launcher/#' + route);
        await expect(page.locator('#page-title')).toBeVisible();
        expect(await overflow(page), route + ' @' + width).toBeLessThanOrEqual(0);
      }
      await page.goto('/launcher/#/catalogo');
      const grid = await columns(page);
      expect(grid.cards).toBe(9);
      expect(grid.cols).toBe(3);
      expect(grid.maxRight).toBeLessThanOrEqual(width);
      const nav = page.getByRole('navigation', { name: 'Navegação móvel' });
      await expect(nav).toBeVisible();
      const box = (await nav.boundingBox())!;
      expect(Math.abs(box.y + box.height - 800)).toBeLessThanOrEqual(1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const items = await nav.locator('a.item').evaluateAll((els) => els.map((el) => {
        const label = el.querySelector('span')!;
        return { height: el.getBoundingClientRect().height, clipped: label.scrollWidth > label.clientWidth + 1 };
      }));
      expect(items).toHaveLength(5);
      for (const item of items) { expect(item.height).toBeGreaterThanOrEqual(44); expect(item.clipped).toBe(false); }
    });
  }
});

test.describe('Launcher · colunas por largura', () => {
  const cases: Array<[number, number]> = [[599, 3], [600, 4], [899, 4], [900, 5], [1279, 5], [1280, 6], [1699, 6], [1700, 7]];
  for (const [width, expected] of cases) {
    test(width + ' px → ' + expected + ' colunas', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/launcher/#/catalogo');
      await expect(page.getByTestId('app-grid').first()).toBeVisible();
      const grid = await columns(page);
      expect(grid.cols).toBe(Math.min(expected, grid.cards));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Launcher · detalhes no estilo loja', () => {
  test('faixa de informações usa dados reais, sem texto repetido, nos dois temas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/launcher/#/app/labels');
    const stats = page.getByTestId('detail-meta');
    await expect(stats).toContainText('Disponibilidade');
    await expect(stats).toContainText('Editor funcional');
    await expect(stats).toContainText('Categoria');
    await expect(stats).toContainText('Recursos prontos');
    // a descrição aparece uma única vez (no topo), não repetida em "Sobre este aplicativo"
    const lead = (await page.locator('.hero .lead').first().innerText()).trim();
    expect(await page.getByText(lead, { exact: false }).count()).toBe(1);
    await page.goto('/launcher/#/app/calc');
    await expect(page.getByTestId('detail-meta')).toContainText('Em breve');
    await expect(page.getByTestId('detail-meta')).not.toContainText('Recursos prontos');
    for (const route of ['/app/labels', '/app/calc', '/catalogo', '/']) {
      await page.goto('/launcher/#' + route);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForTimeout(500);
        await axeClean(page, route + ' ' + scheme);
      }
    }
  });

  test('modal do histórico é largo no computador e cabe inteiro no celular', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/app/labels');
    await page.getByTestId('open-history').click();
    const dialog = page.getByRole('dialog', { name: 'Histórico de Etiquetas' });
    expect((await dialog.boundingBox())!.width).toBeGreaterThan(640);
    await page.setViewportSize({ width: 320, height: 640 });
    const small = (await dialog.boundingBox())!;
    expect(small.x).toBeGreaterThanOrEqual(0);
    expect(small.x + small.width).toBeLessThanOrEqual(320);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
