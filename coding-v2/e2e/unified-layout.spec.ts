import { expect, test } from '@playwright/test';

const shared = [
  '/apps/planilhas/', '/apps/imagens/', '/apps/pdf/', '/apps/qr/',
  '/apps/sorteio/', '/apps/racha-conta/'
];

test.describe('Padrão visual do Etiquetas · sete editores', () => {
  for (const width of [320, 390, 600, 1280]) {
    test('largura ' + width + ': prévia e ferramentas preservam sua posição', async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 844 });
      for (const url of shared) {
        await page.goto(url);
        const stage = (await page.getByTestId('editor-stage').boundingBox())!;
        if (width >= 900) {
          const sidebar = page.getByTestId('editor-sidebar');
          await expect(sidebar).toBeVisible();
          const side = (await sidebar.boundingBox())!;
          expect(side.x + side.width, url).toBeLessThanOrEqual(stage.x + 2);
          expect(stage.width, url).toBeGreaterThan(side.width);
        } else {
          const sheet = page.getByTestId('bottom-sheet');
          const tabs = page.getByTestId('editor-tabs');
          await expect(sheet).toBeVisible();
          const sb = (await sheet.boundingBox())!;
          const tb = (await tabs.boundingBox())!;
          expect(stage.y + stage.height, url).toBeLessThanOrEqual(sb.y + 3);
          expect(sb.y + sb.height, url).toBeLessThanOrEqual(tb.y + 3);
          expect(tb.y + tb.height, url).toBeLessThanOrEqual(844 + 1);
          const active = tabs.getByRole('tab', { selected: true });
          await active.click();
          await expect(sheet).toBeHidden();
          await active.click();
          await expect(sheet).toBeVisible();
        }
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(horizontalOverflow, url).toBeLessThanOrEqual(0);
      }
    });
  }

  test('PC: largura da sidebar e recolhimento são controles reais', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/imagens/');
    const sidebar = page.getByTestId('editor-sidebar');
    const before = (await sidebar.boundingBox())!.width;
    const splitter = page.getByRole('separator', { name: /Ajustar largura do painel/ });
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    const after = (await sidebar.boundingBox())!.width;
    expect(after).toBeGreaterThan(before);
    await page.getByRole('button', { name: 'Recolher ferramentas' }).click();
    await expect(sidebar).toHaveCount(0);
    await page.getByTestId('reopen-tools').click();
    await expect(sidebar).toBeVisible();
  });

  test('Celular: altura da gaveta aumenta após arrastar a alça', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/qr/');
    const sheet = page.getByTestId('bottom-sheet');
    const before = (await sheet.boundingBox())!.height;
    const grip = page.getByRole('separator', { name: 'Arrastar para ajustar a altura da gaveta' });
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 82, { steps: 5 });
    await page.mouse.up();
    const after = (await sheet.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 10);
  });
});

test('Texto e Etiquetas: PC usa ferramentas à esquerda e celular mantém preview acima', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const url of ['/apps/texto/', '/apps/etiquetas/']) {
      await page.goto(url);
      if (width >= 900) {
        const tools = page.locator(url.includes('texto') ? '.text-controls' : '.side');
        const stage = page.locator(url.includes('texto') ? '.stage' : '.stage');
        const t = (await tools.boundingBox())!, s = (await stage.boundingBox())!;
        expect(t.x + t.width, url).toBeLessThanOrEqual(s.x + 2);
      } else {
        const stage = page.locator('.stage');
        const sheet = url.includes('texto') ? page.getByTestId('text-controls') : page.getByTestId('bottom-sheet');
        const s = (await stage.boundingBox())!, p = (await sheet.boundingBox())!;
        expect(s.y + s.height, url).toBeLessThanOrEqual(p.y + 3);
      }
    }
  }
});
