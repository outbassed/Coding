import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/* Pintar: desenho em camadas de verdade — pixels lidos do canvas, desfazer, balde, camadas, salvar/reabrir e exportar. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
/** Dá tempo de o PNG da camada ser gravado e do salvamento automático acontecer. */
async function settle(page: Page): Promise<void> { await page.waitForTimeout(1600); await saved(page); }
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const canvas = (page: Page) => page.getByTestId('paint-canvas');
const layerRows = (page: Page) => page.getByTestId('paint-layers').locator('li');

/** Cor [r,g,b,a] do pixel em (fx, fy) — frações da tela — no que está desenhado na tela agora. */
async function pixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return await canvas(page).evaluate((c: HTMLCanvasElement, [x, y]) => {
    const d = c.getContext('2d')!.getImageData(Math.min(c.width - 1, Math.floor(c.width * x!)), Math.min(c.height - 1, Math.floor(c.height * y!)), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]!];
  }, [fx, fy]);
}
const isRed = (p: number[]) => p[0]! > 200 && p[1]! < 60 && p[2]! < 80;
const isWhite = (p: number[]) => p[0]! > 245 && p[1]! > 245 && p[2]! > 245;
const isGreen = (p: number[]) => p[1]! > 180 && p[0]! < 60 && p[2]! < 150;
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2), { steps: 6 });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}
async function click(page: Page, at: [number, number]): Promise<void> {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
}
const pickColor = (page: Page, hex: string) => page.getByTestId('sw-' + hex.slice(1)).click();
const RED = '#e63946', GREEN = '#06d6a0';

test.describe('Pintar', () => {
  test('pincel desenha, desfazer e refazer funcionam (botões e teclado)', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    await expect(canvas(page)).toBeVisible();
    await expect.poll(async () => isWhite(await pixel(page, 0.5, 0.5))).toBe(true);
    await pickColor(page, RED);
    await page.getByTestId('brush-size').fill('60');
    await drag(page, [0.2, 0.5], [0.8, 0.5]);
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
    expect(isWhite(await pixel(page, 0.5, 0.9))).toBe(true);
    await page.getByTestId('undo-paint').click();
    await expect.poll(async () => isWhite(await pixel(page, 0.5, 0.5))).toBe(true);
    await page.getByTestId('redo-paint').click();
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => isWhite(await pixel(page, 0.5, 0.5))).toBe(true);
    await page.keyboard.press('Control+y');
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
  });

  test('borracha apaga só a camada ativa e o balde respeita a região', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    await pickColor(page, RED);
    await page.getByTestId('tool-rect').click();
    await page.getByTestId('shape-filled').check();
    await drag(page, [0.25, 0.25], [0.75, 0.75]);
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
    expect(isWhite(await pixel(page, 0.1, 0.1))).toBe(true);
    // balde dentro do retângulo muda só o retângulo
    await page.getByTestId('tool-bucket').click();
    await pickColor(page, GREEN);
    await click(page, [0.5, 0.5]);
    await expect.poll(async () => isGreen(await pixel(page, 0.5, 0.5))).toBe(true);
    expect(isWhite(await pixel(page, 0.1, 0.1))).toBe(true);
    // balde fora: preenche o resto
    await click(page, [0.05, 0.05]);
    await expect.poll(async () => isGreen(await pixel(page, 0.05, 0.05))).toBe(true);
    // borracha apaga o verde
    await page.getByTestId('tool-eraser').click();
    await page.getByTestId('brush-size').fill('120');
    await drag(page, [0.3, 0.5], [0.7, 0.5]);
    await expect.poll(async () => (await pixel(page, 0.5, 0.5))[3]! < 255 || isWhite(await pixel(page, 0.5, 0.5))).toBe(true);
  });

  test('camadas: criar, ocultar, opacidade, duplicar, mesclar e excluir com desfazer', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    await tab(page, 'Camadas').click();
    await expect(layerRows(page)).toHaveCount(1);
    await page.getByTestId('add-layer').click();
    await expect(layerRows(page)).toHaveCount(2);
    await tab(page, 'Ferramentas').click();
    await pickColor(page, RED);
    await page.getByTestId('brush-size').fill('80');
    await drag(page, [0.2, 0.5], [0.8, 0.5]);
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
    await tab(page, 'Camadas').click();
    // ocultar a camada nova
    const top = layerRows(page).first();
    await top.getByRole('button', { name: /^Ocultar/ }).click();
    await expect.poll(async () => isWhite(await pixel(page, 0.5, 0.5))).toBe(true);
    await top.getByRole('button', { name: /^Mostrar/ }).click();
    await expect.poll(async () => isRed(await pixel(page, 0.5, 0.5))).toBe(true);
    // opacidade 50%
    await page.getByTestId('layer-opacity').fill('0.5');
    await expect.poll(async () => { const p = await pixel(page, 0.5, 0.5); return p[0]! > 200 && p[1]! > 100 && p[1]! < 190; }).toBe(true);
    // duplicar
    await top.getByRole('button', { name: /^Duplicar/ }).click();
    await expect(layerRows(page)).toHaveCount(3);
    // mesclar a cópia com a de baixo
    await page.getByTestId('merge-down').click();
    await expect(layerRows(page)).toHaveCount(2);
    // excluir e desfazer
    await layerRows(page).first().getByRole('button', { name: /^Excluir/ }).click();
    await expect(layerRows(page)).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(layerRows(page)).toHaveCount(2);
  });

  test('salva, reabre com os pixels e mantém as camadas', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    await pickColor(page, RED);
    await page.getByTestId('brush-size').fill('80');
    await drag(page, [0.2, 0.5], [0.8, 0.5]);
    await tab(page, 'Camadas').click();
    await page.getByTestId('add-layer').click();
    await tab(page, 'Ferramentas').click();
    await pickColor(page, GREEN);
    await drag(page, [0.5, 0.1], [0.5, 0.9]);
    await expect.poll(async () => isGreen(await pixel(page, 0.5, 0.2))).toBe(true);
    await settle(page);
    await page.reload();
    await tab(page, 'Camadas').click();
    await expect(layerRows(page)).toHaveCount(2);
    await expect.poll(async () => isRed(await pixel(page, 0.3, 0.5))).toBe(true);
    await expect.poll(async () => isGreen(await pixel(page, 0.5, 0.2))).toBe(true);
  });

  test('tela: muda o tamanho, desfaz, fundo transparente e limites', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=branco');
    await expect(page.getByTestId('paint-dims')).toContainText('1280 × 720');
    await tab(page, 'Tela').click();
    await page.getByTestId('canvas-w').fill('400');
    await page.getByTestId('canvas-h').fill('300');
    await page.getByTestId('apply-size').click();
    await expect(page.getByTestId('paint-dims')).toContainText('400 × 300');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('paint-dims')).toContainText('1280 × 720');
    // valores fora do limite são ajustados
    await page.getByTestId('canvas-w').fill('99999');
    await page.getByTestId('canvas-h').fill('2');
    await page.getByTestId('apply-size').click();
    await expect(page.getByTestId('paint-dims')).toContainText('4096 × 16');
    await page.getByTestId('bg-transparent').check();
    await expect(page.locator('.board.checker')).toBeVisible();
  });

  test('importa imagem como camada (arquivo e Ctrl+V) e recusa o que não é imagem', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 100;
      const g = c.getContext('2d')!; g.fillStyle = '#0000ff'; g.fillRect(0, 0, 200, 100);
      return c.toDataURL('image/png').split(',')[1]!;
    });
    await tab(page, 'Tela').click();
    await page.getByTestId('import-input').setInputFiles({ name: 'azul.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await tab(page, 'Camadas').click();
    await expect(layerRows(page)).toHaveCount(2);
    await expect.poll(async () => { const p = await pixel(page, 0.5, 0.5); return p[2]! > 200 && p[0]! < 60; }).toBe(true);
    const prevented = await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }, b64);
    expect(prevented).toBe(true);
    await expect(layerRows(page)).toHaveCount(3);
    await tab(page, 'Tela').click();
    await page.getByTestId('import-input').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
    await expect(page.getByTestId('paint-dims')).toContainText('não é uma imagem aceita');
    await tab(page, 'Camadas').click();
    await expect(layerRows(page)).toHaveCount(3);
  });

  test('exporta PNG, JPG e WebP com o tamanho certo', async ({ page }) => {
    await page.goto('/apps/pintar/?modelo=quadrado');
    await pickColor(page, RED);
    await page.getByTestId('brush-size').fill('80');
    await drag(page, [0.2, 0.5], [0.8, 0.5]);
    await tab(page, 'Arquivo').click();
    const png = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    expect(png[0].suggestedFilename()).toMatch(/\.png$/);
    const pngBytes = readFileSync((await png[0].path())!);
    expect(pngBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(pngBytes.readUInt32BE(16)).toBe(1080);
    expect(pngBytes.readUInt32BE(20)).toBe(1080);
    const jpg = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-jpg').click()]);
    expect(jpg[0].suggestedFilename()).toMatch(/\.jpg$/);
    expect(readFileSync((await jpg[0].path())!).subarray(0, 3).toString('hex')).toBe('ffd8ff');
    const webp = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-webp').click()]);
    const w = readFileSync((await webp[0].path())!);
    expect(w.subarray(0, 4).toString()).toBe('RIFF');
    expect(w.subarray(8, 12).toString()).toBe('WEBP');
  });

  test('sem violações de acessibilidade e sem rolagem horizontal no celular', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/pintar/?modelo=branco');
    await expect(canvas(page)).toBeVisible();
    await tab(page, 'Camadas').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
