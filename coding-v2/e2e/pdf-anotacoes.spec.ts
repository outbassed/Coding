import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Editor PDF: elipse, linha, desenho livre, imagem — e o PDF baixado, desenhado de novo, tem cada coisa no lugar certo. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const bytesOf = async (d: Download): Promise<Buffer> => readFileSync((await d.path())!);

async function newBlank(page: Page): Promise<void> {
  await page.goto('/apps/pdf/');
  await page.getByTestId('create-blank-stage').click();
  await page.getByTestId('blank-create').click();
  await expect(page.getByTestId('page-number')).toHaveText('1 / 1');
  await tab(page, 'Anotar').click();
}
async function exportPdf(page: Page): Promise<Buffer> {
  await tab(page, 'Arquivo').click();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
  const bytes = await bytesOf(pdf);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await tab(page, 'Anotar').click();
  return bytes;
}
/** Desenha a primeira página do PDF baixado (escala 1 = 1 ponto por pixel) e devolve uma função que procura pixels de uma cor. */
async function raster(page: Page, bytes: Buffer): Promise<{ w: number; h: number }> {
  if (!(await page.evaluate(() => !!(window as unknown as { pdfjsLib?: unknown }).pdfjsLib))) {
    await page.addScriptTag({ url: '/vendor/pdf.min.js' });
  }
  return page.evaluate(async (b64) => {
    const lib = (window as unknown as { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string }; getDocument(o: unknown): { promise: Promise<{ getPage(n: number): Promise<{ getViewport(o: unknown): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }> }> } } }).pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const doc = await lib.getDocument({ data: u8 }).promise;
    const pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const c = document.createElement('canvas'); c.id = '__export'; c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    c.style.display = 'none'; document.body.append(c);
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return { w: c.width, h: c.height };
  }, bytes.toString('base64'));
}
type Rgb = [number, number, number];
/** Há algum pixel na janela [x0..x1] × [y0..y1] (em pontos) próximo da cor dada? */
const hasColor = (page: Page, box: [number, number, number, number], color: Rgb, tol = 40): Promise<boolean> =>
  page.evaluate(({ box, color, tol }) => {
    const c = document.getElementById('__export') as HTMLCanvasElement;
    const [x0, y0, x1, y1] = box.map(Math.round) as [number, number, number, number];
    const d = c.getContext('2d')!.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - color[0]) <= tol && Math.abs(d[i + 1]! - color[1]) <= tol && Math.abs(d[i + 2]! - color[2]) <= tol) return true;
    return false;
  }, { box, color, tol });
async function pngFile(page: Page, w: number, h: number, fill: string): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h, fill }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = fill; g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h, fill });
  return Buffer.from(b64, 'base64');
}
const RED: Rgb = [192, 57, 43];

test.describe('Editor PDF · anotações', () => {
  // a página A4 ocupa ~1260 px de altura; a janela alta evita que o mouse do teste saia da tela ao desenhar e arrastar
  test.use({ viewport: { width: 1280, height: 1700 } });
  test('retângulo, elipse e linha aparecem na tela, se movem e vão para o PDF no lugar certo', async ({ page }) => {
    await newBlank(page);
    await page.getByTestId('add-rect').click();
    await page.getByTestId('add-ellipse').click();
    await page.getByTestId('add-line').click();
    await expect(page.getByTestId('ann-rect')).toBeVisible();
    await expect(page.getByTestId('ann-ellipse')).toBeVisible();
    await expect(page.getByTestId('ann-line')).toBeVisible();
    await expect(page.getByTestId('ann-stroke')).toBeVisible(); // a linha está selecionada: mostra a espessura
    await page.getByTestId('ann-stroke').fill('6');
    await page.getByTestId('ann-flip').click();
    await saved(page);
    await page.reload();
    await tab(page, 'Anotar').click();
    await expect(page.getByTestId('ann-ellipse')).toBeVisible();
    await expect(page.getByTestId('ann-line')).toBeVisible();

    const bytes = await exportPdf(page);
    const size = await raster(page, bytes);
    expect(size).toEqual({ w: 595, h: 842 });
    // retângulo: x 0,1–0,5 e y 0,1–0,18 da página; a borda de cima fica em y ≈ 84 pt
    expect(await hasColor(page, [150, 82, 160, 87], RED)).toBe(true);
    expect(await hasColor(page, [150, 300, 160, 305], RED)).toBe(false); // longe de qualquer forma
    // elipse: x 0,1–0,4, y 0,16–0,31 (empilhada 0,06 abaixo do retângulo); o topo passa pelo meio da largura
    const ellTop = 0.16 * 842, ellMidX = 0.25 * 595;
    expect(await hasColor(page, [ellMidX - 4, ellTop - 4, ellMidX + 4, ellTop + 4], RED)).toBe(true);
    // a elipse não pinta o canto da própria caixa
    expect(await hasColor(page, [0.1 * 595 + 4, ellTop + 4, 0.1 * 595 + 10, ellTop + 10], RED)).toBe(false);
  });

  test('desenho livre: traço aparece, vira anotação editável e sai no PDF', async ({ page }) => {
    await newBlank(page);
    await page.getByTestId('ink-toggle').click();
    await page.getByTestId('pen-color').fill('#0000ff');
    await page.getByTestId('pen-width').fill('6');
    const box = (await page.getByTestId('pdf-page').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('ann-ink')).toHaveCount(1);
    // um segundo traço é outra anotação
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('ann-ink')).toHaveCount(2);
    await page.getByTestId('ink-toggle').click(); // sai do modo de desenho
    await expect(page.getByTestId('ink-pad')).toHaveCount(0);
    await page.getByTestId('ann-ink').nth(1).click(); // seleciona o segundo traço
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('ann-ink')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('ann-ink')).toHaveCount(2);
    await page.getByTestId('ann-ink').nth(1).click();
    await page.getByTestId('ann-delete').click();
    await expect(page.getByTestId('ann-ink')).toHaveCount(1);
    await saved(page);

    const bytes = await exportPdf(page);
    await raster(page, bytes);
    const y = 0.5 * 842;
    expect(await hasColor(page, [0.3 * 595, y - 4, 0.3 * 595 + 8, y + 4], [0, 0, 255], 60)).toBe(true);
    expect(await hasColor(page, [0.3 * 595, 0.7 * 842 - 6, 0.3 * 595 + 8, 0.7 * 842 + 6], [0, 0, 255], 60)).toBe(false); // o traço excluído não saiu
  });

  test('imagem escolhida: aparece centralizada, mantém a proporção, salva, reabre e entra no PDF', async ({ page }) => {
    await newBlank(page);
    const png = await pngFile(page, 200, 100, '#e8538f');
    await page.getByTestId('ann-image-input').setInputFiles({ name: 'rosa.png', mimeType: 'image/png', buffer: png });
    const ann = page.getByTestId('ann-image');
    await expect(ann).toBeVisible();
    await expect(ann.locator('img')).toHaveJSProperty('naturalWidth', 200);
    const page0 = (await page.getByTestId('pdf-page').boundingBox())!;
    const a0 = (await ann.boundingBox())!;
    expect(Math.abs(a0.x + a0.width / 2 - (page0.x + page0.width / 2))).toBeLessThan(3); // centralizada
    expect(a0.width / a0.height).toBeCloseTo(2, 1); // 200 × 100
    // o canto muda o tamanho sem deformar
    const grip = ann.locator('.grip');
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 40, g.y + g.height / 2 + 5, { steps: 5 });
    await page.mouse.up();
    const a1 = (await ann.boundingBox())!;
    expect(a1.width).toBeGreaterThan(a0.width);
    expect(a1.width / a1.height).toBeCloseTo(2, 1);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('ann-image').locator('img')).toHaveJSProperty('naturalWidth', 200); // os bytes ficaram guardados

    const bytes = await exportPdf(page);
    expect(bytes.toString('latin1')).toContain('/Subtype /Image');
    await raster(page, bytes);
    expect(await hasColor(page, [595 / 2 - 6, 842 / 2 - 6, 595 / 2 + 6, 842 / 2 + 6], [232, 83, 143], 14)).toBe(true);
  });

  test('Ctrl+V cola uma imagem; texto colado em campos continua sendo texto', async ({ page }) => {
    await newBlank(page);
    const png = await pngFile(page, 60, 60, '#2a7de1');
    await page.evaluate(async (b64) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const file = new File([u8], 'image.png', { type: 'image/png' });
      const data = new DataTransfer(); data.items.add(file);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, png.toString('base64'));
    await expect(page.getByTestId('ann-image')).toBeVisible();
    await expect(page.getByTestId('pdf-message')).toContainText('imagem-colada.png');
    // colar dentro do campo de texto da anotação não cria imagem
    await page.getByTestId('add-note-text').click();
    await page.getByTestId('note-text').fill('');
    await page.getByTestId('note-text').focus();
    await page.evaluate(async (b64) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const data = new DataTransfer(); data.items.add(new File([u8], 'image.png', { type: 'image/png' }));
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, png.toString('base64'));
    await expect(page.getByTestId('ann-image')).toHaveCount(1);
  });

  test('arquivo que não é imagem ou está quebrado é recusado com explicação', async ({ page }) => {
    await newBlank(page);
    await page.getByTestId('ann-image-input').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
    await expect(page.getByTestId('pdf-message')).toContainText('não é uma imagem');
    await page.getByTestId('ann-image-input').setInputFiles({ name: 'quebrada.png', mimeType: 'image/png', buffer: Buffer.from('isto não é um PNG') });
    await expect(page.getByTestId('pdf-message')).toContainText('Não foi possível abrir');
    await expect(page.getByTestId('ann-image')).toHaveCount(0);
  });

  test('página girada: a anotação continua no mesmo lugar visto na tela', async ({ page }) => {
    await newBlank(page);
    await tab(page, 'Páginas').click();
    await page.getByTestId('rotate-page').click();
    await tab(page, 'Anotar').click();
    await page.getByTestId('add-rect').click();
    const bytes = await exportPdf(page);
    const size = await raster(page, bytes);
    expect(size).toEqual({ w: 842, h: 595 }); // girada: paisagem
    // na tela o retângulo está em x 0,1–0,5 e y 0,1–0,18 da página girada
    expect(await hasColor(page, [0.2 * 842, 0.1 * 595 - 3, 0.2 * 842 + 10, 0.1 * 595 + 3], RED)).toBe(true);
    expect(await hasColor(page, [0.7 * 842, 0.1 * 595 - 3, 0.7 * 842 + 10, 0.1 * 595 + 3], RED)).toBe(false);
  });
});
