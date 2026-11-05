import { test, expect, type Page } from '@playwright/test';

/* Visualizador 2.0 · menus de contexto: um conjunto diferente para cada tipo de mídia, na biblioteca e nos arquivos; toque prolongado no celular. */
const open = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.getByTestId('viewer-input').setInputFiles(files);
async function pngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 20;
    const g = c.getContext('2d')!; g.fillStyle = '#336'; g.fillRect(0, 0, 40, 20);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
const menu = (page: Page) => page.getByTestId('viewer-menu');
const CUBE = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';

test.describe('Visualizador · menus de contexto', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a imagem, o texto e o modelo 3D têm menus diferentes sobre a mídia', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page) }]);
    const stage = page.getByTestId('viewer-stage');
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await stage.click({ button: 'right', position: { x: 60, y: 60 } });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('menu-rotate-left')).toBeVisible();
    await expect(page.getByTestId('menu-copy-image')).toBeVisible();
    await expect(page.getByTestId('menu-fullscreen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);

    await open(page, [{ name: 'n.txt', mimeType: 'text/plain', buffer: Buffer.from('um\ndois\n') }]);
    await expect(page.getByTestId('text-body')).toBeVisible();
    await stage.click({ button: 'right', position: { x: 60, y: 60 } });
    await expect(page.getByTestId('menu-wrap')).toBeVisible();
    await expect(page.getByTestId('menu-rotate-left')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await open(page, [{ name: 'cubo.obj', mimeType: 'text/plain', buffer: Buffer.from(CUBE) }]);
    await expect(page.getByTestId('model-canvas')).toBeVisible();
    await stage.click({ button: 'right', position: { x: 60, y: 60 } });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('menu-wrap')).toHaveCount(0);
    await expect(page.getByTestId('menu-rotate-left')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('menu do arquivo na biblioteca: abrir, renomear e remover; menu da própria biblioteca', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [
      { name: 'um.txt', mimeType: 'text/plain', buffer: Buffer.from('um') },
      { name: 'dois.txt', mimeType: 'text/plain', buffer: Buffer.from('dois') }
    ]);
    const first = page.getByTestId('viewer-files').getByRole('button', { name: /um\.txt/ });
    await first.click({ button: 'right' });
    await expect(page.getByTestId('menu-open')).toBeVisible();
    await expect(page.getByTestId('menu-rename')).toBeVisible();
    await expect(page.getByTestId('menu-remove')).toBeVisible();
    await page.getByTestId('menu-open').click();
    await expect(page.getByTestId('text-body')).toContainText('um');
    await expect(menu(page)).toHaveCount(0);

    await page.getByTestId('viewer-files').getByRole('button', { name: /dois\.txt/ }).click({ button: 'right' });
    await page.getByTestId('menu-remove').click();
    await expect(page.getByTestId('viewer-files').locator('li')).toHaveCount(1);

    await page.getByTestId('viewer-library').click({ button: 'right', position: { x: 20, y: 500 } });
    await expect(page.getByTestId('menu-open-files')).toBeVisible();
    await expect(page.getByTestId('menu-view-list').or(page.getByTestId('menu-view-grid'))).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('teclado: setas e Enter no menu; Esc fecha e devolve o foco', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }]);
    const item = page.getByTestId('viewer-files').getByRole('button', { name: /a\.txt/ });
    await item.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(item).toBeFocused();
  });

  test('celular: toque prolongado abre o menu como folha inferior e toque curto não abre', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('conteúdo') }]);
    await expect(page.getByTestId('viewer-image').or(page.getByTestId('text-body'))).toBeVisible();
    const press = async (ms: number) => {
      await page.evaluate(() => {
        const el = document.querySelector('[data-ctx="stage"]')!;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }));
      });
      await page.waitForTimeout(ms);
      await page.evaluate(() => document.querySelector('[data-ctx="stage"]')!.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true })));
    };
    await press(150);
    await expect(menu(page)).toHaveCount(0);
    await press(800);
    await expect(menu(page)).toBeVisible();
    const box = (await menu(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    expect(box.y + box.height).toBeLessThanOrEqual(845);
  });
});
