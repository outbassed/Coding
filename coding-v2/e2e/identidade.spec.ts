import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Identidade própria dos editores (lote 1): lado do painel e clima visual por app, sem perder controles nem acessibilidade. */
const LOT1 = [
  { url: '/apps/calculadora/', name: 'Calculadora', side: 'right', stage: 'device' },
  { url: '/apps/cores/', name: 'Estúdio de Cores', side: 'right', stage: 'checker' },
  { url: '/apps/zip/', name: 'Compactador ZIP', side: 'left', stage: 'dots' },
  { url: '/apps/comparador/', name: 'Comparador de Arquivos', side: 'left', stage: 'grid' }
] as const;

async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}

test.describe('Identidade dos editores · lote 1', () => {
  test('computador: o painel fica do lado combinado e a área de trabalho tem o seu clima', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const app of LOT1) {
      await page.goto(app.url);
      await expect(page.locator('.es')).toHaveAttribute('data-side', app.side);
      await expect(page.locator('.es')).toHaveAttribute('data-stage', app.stage);
      const stage = (await page.getByTestId('editor-stage').boundingBox())!;
      const side = (await page.getByTestId('editor-sidebar').boundingBox())!;
      if (app.side === 'right') expect(side.x, app.name).toBeGreaterThanOrEqual(stage.x + stage.width - 2);
      else expect(side.x + side.width, app.name).toBeLessThanOrEqual(stage.x + 2);
      expect(stage.width, app.name).toBeGreaterThan(side.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), app.name).toBeLessThanOrEqual(0);
    }
  });

  test('computador: recolher e reabrir o painel funciona dos dois lados, e a alça ajusta a largura', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const app of LOT1) {
      await page.goto(app.url);
      const sidebar = page.getByTestId('editor-sidebar');
      const before = (await sidebar.boundingBox())!.width;
      await page.getByRole('separator', { name: /Ajustar largura do painel de ferramentas/ }).focus();
      await page.keyboard.press(app.side === 'right' ? 'ArrowLeft' : 'ArrowRight');
      expect((await sidebar.boundingBox())!.width, app.name).toBeGreaterThan(before);
      await page.getByRole('button', { name: 'Recolher ferramentas' }).click();
      await expect(sidebar).toHaveCount(0);
      await page.getByTestId('reopen-tools').click();
      await expect(sidebar).toBeVisible();
    }
  });

  test('tablet e celular: prévia em cima, abas embaixo e sem rolagem horizontal', async ({ page }) => {
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const app of LOT1) {
        await page.goto(app.url);
        const stage = (await page.getByTestId('editor-stage').boundingBox())!;
        const tabs = (await page.getByTestId('editor-tabs').boundingBox())!;
        expect(tabs.y, app.name + ' @' + width).toBeGreaterThan(stage.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), app.name + ' @' + width).toBeLessThanOrEqual(0);
      }
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    test('acessibilidade (' + scheme + ') nos quatro editores', async ({ page }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      for (const app of LOT1) { await page.goto(app.url); await axeClean(page, app.name + ' ' + scheme); }
      await page.setViewportSize({ width: 390, height: 844 });
      for (const app of LOT1) { await page.goto(app.url); await axeClean(page, app.name + ' celular ' + scheme); }
    });
  }
});
