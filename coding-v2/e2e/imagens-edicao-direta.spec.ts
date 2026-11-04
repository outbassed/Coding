import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Imagens · edição direta no canvas (DIR-02): texto no lugar, alças nas bordas e recorte arrastando (EDICAO-DIRETA.md). */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const EDITOR = '/apps/imagens/?modelo=quadrado';

async function addText(page: Page): Promise<void> {
  await page.getByTestId('add-text').click();
  await expect(page.getByTestId('selection-frame')).toBeVisible();
}
async function center(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function makePngBase64(page: Page, w = 320, h = 200): Promise<string> {
  return await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#2a7de1'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(20, 20, 120, 60);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h });
}
async function pasteImage(page: Page): Promise<void> {
  const b64 = await makePngBase64(page);
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, b64);
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(1);
  await page.getByTestId('layers').locator('.pick').first().click();
}
async function panelText(page: Page): Promise<string> {
  await page.getByRole('tab', { name: 'Texto e forma' }).click();
  return await page.getByTestId('layer-text').inputValue();
}

test.describe('Imagens · edição direta de texto', () => {
  test('dois cliques editam o texto no lugar, o painel acompanha e Esc cancela', async ({ page }) => {
    await page.goto(EDITOR);
    await addText(page);
    const c = await center(page, 'selection-frame');
    await page.getByTestId('image-canvas').dblclick({ position: { x: c.x - (await page.getByTestId('image-canvas').boundingBox())!.x, y: c.y - (await page.getByTestId('image-canvas').boundingBox())!.y } });
    const field = page.getByRole('textbox', { name: /Texto da camada/ });
    await expect(field).toBeFocused();
    // a sobreposição ocupa o mesmo lugar do quadro de seleção
    const fb = (await page.getByTestId('text-edit').boundingBox())!;
    const sb = (await page.getByTestId('selection-frame').boundingBox())!;
    expect(Math.abs(fb.x - sb.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(fb.y - sb.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(fb.width - sb.width)).toBeLessThanOrEqual(3);
    await page.keyboard.type('Olá direto');
    await page.keyboard.press('Control+Enter');
    await expect(field).toHaveCount(0);
    expect(await panelText(page)).toBe('Olá direto');
    // Esc cancela e devolve o texto anterior
    await page.getByTestId('edit-text').click();
    await expect(page.getByRole('textbox', { name: /Texto da camada/ })).toBeFocused();
    await page.keyboard.type(' extra');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-edit')).toHaveCount(0);
    expect(await panelText(page)).toBe('Olá direto');
    await saved(page);
  });

  test('desfazer pelo app volta tudo de uma vez e o painel segue o campo', async ({ page }) => {
    await page.goto(EDITOR);
    await addText(page);
    const before = await panelText(page);
    await page.getByTestId('edit-text').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Novo texto');
    await page.getByTestId('finish-edit').click();
    expect(await panelText(page)).toBe('Novo texto');
    await page.keyboard.press('Control+Z');
    expect(await panelText(page)).toBe(before);
  });

  test('Enter na área da imagem abre a edição do texto selecionado', async ({ page }) => {
    await page.goto(EDITOR);
    await addText(page);
    await page.getByTestId('image-viewport').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: /Texto da camada/ })).toBeFocused();
  });
});

test.describe('Imagens · alças e recorte no canvas', () => {
  test('a alça do meio da borda direita muda só a largura', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByTestId('add-rect').click();
    await page.getByRole('tab', { name: 'Ajustar' }).click();
    const w0 = Number(await page.getByTestId('layer-w').inputValue());
    const h0 = Number(await page.getByTestId('layer-h').inputValue());
    const handle = page.locator('[data-handle="1,0"]');
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await page.getByTestId('layer-w').inputValue())).toBeGreaterThan(w0);
    expect(Number(await page.getByTestId('layer-h').inputValue())).toBe(h0);
  });

  test('Recortar permite arrastar a borda e o campo de recorte acompanha', async ({ page }) => {
    await page.goto(EDITOR);
    await pasteImage(page);
    await page.getByTestId('crop-start').click();
    await expect(page.getByTestId('crop-done')).toBeVisible();
    await page.getByRole('tab', { name: 'Ajustar' }).click();
    const left0 = Number(await page.getByTestId('crop-left').inputValue());
    const handle = page.locator('[data-handle="-1,0"]');
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await page.getByTestId('crop-left').inputValue())).toBeGreaterThan(left0);
    await page.keyboard.press('Escape');
    await page.getByTestId('image-viewport').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('crop-start')).toBeVisible();
  });

  test('sem violações de acessibilidade durante a edição', async ({ page }) => {
    await page.goto(EDITOR);
    await addText(page);
    await page.getByTestId('edit-text').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});

test.describe('Imagens · edição direta no celular (toque)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Editar texto recolhe a gaveta, o campo recebe o foco e Concluir edição encerra', async ({ page }) => {
    await page.goto(EDITOR);
    await addText(page);
    const edit = page.getByTestId('edit-text');
    expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await edit.tap();
    await expect(page.getByRole('textbox', { name: /Texto da camada/ })).toBeFocused();
    await expect(page.getByTestId('layer-text')).toHaveCount(0);
    await page.keyboard.type('TOQUE');
    const finish = page.getByTestId('finish-edit');
    await finish.tap();
    await expect(page.getByTestId('text-edit')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await panelText(page)).toBe('TOQUE');
  });
});
