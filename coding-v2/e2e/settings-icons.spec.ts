import { test, expect } from '@playwright/test';
import { APP_COUNT } from './helpers';

/* Regressão: no Ajustes, os logos por app nunca podem passar de 40 px nem ser cortados ou estourar a largura. */
for (const width of [1280, 768, 390, 320]) {
  test('Ajustes: contagem por app com ícones contidos @' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/launcher/#/ajustes');
    const items = page.getByTestId('doc-counts').locator('li');
    await expect(items).toHaveCount(APP_COUNT);
    for (let i = 0; i < APP_COUNT; i++) {
      const li = items.nth(i);
      const icon = (await li.getByTestId('app-icon').boundingBox())!;
      const box = (await li.boundingBox())!;
      expect(icon.width).toBeLessThanOrEqual(33);
      expect(icon.height).toBeLessThanOrEqual(33);
      expect(Math.abs(icon.width - icon.height)).toBeLessThanOrEqual(1);
      expect(icon.x).toBeGreaterThanOrEqual(box.x);
      expect(icon.x + icon.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(icon.y).toBeGreaterThanOrEqual(box.y);
      expect(icon.y + icon.height).toBeLessThanOrEqual(box.y + box.height + 1);
      const img = li.locator('img');
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
