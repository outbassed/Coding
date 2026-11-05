import { test, expect, type Page } from '@playwright/test';

/* Visualizador 2.0 · layout: painéis no computador, gavetas no celular, sem rolagem horizontal, botões inteiros e modo limpo. */
const open = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.getByTestId('viewer-input').setInputFiles(files);
async function pngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 40;
    const g = c.getContext('2d')!; g.fillStyle = '#e8538f'; g.fillRect(0, 0, 80, 40);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
const WIDTHS: [number, number][] = [[320, 640], [390, 844], [768, 1024], [1024, 768], [1280, 800]];

/** Controles visíveis que saem da tela sem estarem numa área com rolagem própria. */
function escapedControls(): string[] {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>('button, [role="button"], select, input').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
    if (el.closest('[aria-hidden="true"], [hidden], .sr-only')) return;
    for (let p: Element | null = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) return;
    }
    if (r.left < -1 || r.right > innerWidth + 1) out.push((el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
  });
  return out;
}

test.describe('Visualizador · layout', () => {
  for (const [width, height] of WIDTHS) {
    test(`${width}×${height}: sem rolagem horizontal e controles dentro da tela`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/apps/visualizador/');
      for (const file of [
        { name: 'n.txt', mimeType: 'text/plain', buffer: Buffer.from('linha 1\nlinha 2\n') },
        { name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page) }
      ]) {
        await open(page, [file]);
        await expect(page.getByTestId('viewer-name')).toHaveText(file.name);
        await expect(page.getByTestId(file.name.endsWith('.png') ? 'viewer-image' : 'text-body')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        expect(await page.evaluate(escapedControls)).toEqual([]);
      }
    });
  }

  test('computador: biblioteca e propriedades ficam fixas ao lado da mídia e podem ser recolhidas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page) }]);
    await expect(page.getByTestId('viewer-library')).toBeVisible();
    await expect(page.getByTestId('viewer-props')).toBeVisible();
    await page.getByTestId('toggle-properties').click();
    await expect(page.getByTestId('viewer-props')).toBeHidden();
    await page.getByTestId('toggle-library').click();
    await expect(page.getByTestId('viewer-library')).toBeHidden();
    await expect(page.getByTestId('viewer-image')).toBeVisible();
  });

  test('celular: biblioteca e propriedades são gavetas que fecham ao escolher', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/visualizador/');
    await open(page, [
      { name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page) },
      { name: 'n.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') }
    ]);
    await expect(page.getByTestId('viewer-library')).toBeHidden();
    await page.getByTestId('toggle-library').click();
    await expect(page.getByTestId('viewer-library')).toBeVisible();
    await page.getByTestId('viewer-files').getByRole('button', { name: /a\.png/ }).click();
    await expect(page.getByTestId('viewer-library')).toBeHidden();
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await page.getByTestId('top-more').click(); // no celular, as ações secundárias ficam no menu "Mais"
    await page.getByTestId('menu-properties').click();
    await expect(page.getByTestId('viewer-props')).toBeVisible();
    await page.getByTestId('hide-properties').click();
    await expect(page.getByTestId('viewer-props')).toBeHidden();
  });

  test('modo limpo esconde os painéis e a tecla C volta', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page) }]);
    await page.getByTestId('clean-mode').click();
    await expect(page.getByTestId('viewer-library')).toBeHidden();
    await expect(page.getByTestId('viewer-bar')).toBeHidden();
    await expect(page.getByTestId('exit-clean')).toBeVisible();
    await page.getByTestId('exit-clean').click();
    await expect(page.getByTestId('viewer-bar')).toBeVisible();
  });
});
