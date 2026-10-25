import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Imagens: Ctrl+V, soltar arquivos e botão Colar de verdade — sem roubar o colar de campos de texto. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const layers = (page: Page) => page.getByTestId('layers').locator('li');

async function makePngBase64(page: Page, w = 320, h = 200): Promise<string> {
  return await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#2a7de1'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(20, 20, 120, 60);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h });
}
/** Dispara um evento de colar real (com DataTransfer) no alvo; devolve se o app tomou conta (preventDefault). */
async function firePaste(page: Page, payload: { b64?: string; text?: string }, selector?: string): Promise<boolean> {
  return await page.evaluate(({ b64, text, selector }) => {
    const dt = new DataTransfer();
    if (b64) { const u8 = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); dt.items.add(new File([u8], 'image.png', { type: 'image/png' })); }
    if (text) dt.setData('text/plain', text);
    const target = selector ? document.querySelector(selector)! : document.body;
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { b64: payload.b64 ?? '', text: payload.text ?? '', selector: selector ?? '' });
}

test.describe('Imagens · colar e soltar', () => {
  test('Ctrl+V com a página em foco cria camadas, a primeira define a tela, salva e reabre', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    await expect(layers(page)).toHaveCount(0);
    const b64 = await makePngBase64(page);
    expect(await firePaste(page, { b64 })).toBe(true);
    await expect(layers(page)).toHaveCount(1);
    await expect(page.getByText('320 × 200 px')).toBeVisible();
    await expect(layers(page).first()).toContainText('Imagem colada');
    expect(await firePaste(page, { b64 })).toBe(true);
    await expect(layers(page)).toHaveCount(2);
    await saved(page);
    await page.reload();
    await expect(layers(page)).toHaveCount(2);
    const canvasPixel = await page.getByTestId('image-canvas').evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(Math.floor(c.width * 0.9), Math.floor(c.height * 0.9), 1, 1).data; return [d[0], d[1], d[2]]; });
    expect(canvasPixel[2]).toBeGreaterThan(200); // azul da imagem colada, já renderizada após reabrir
  });

  test('não rouba o colar de campos de texto e ignora texto puro', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    await page.getByTestId('add-text').click();
    await expect(layers(page)).toHaveCount(1);
    const b64 = await makePngBase64(page);
    const name = page.getByLabel('Nome da camada');
    await name.focus();
    await name.evaluate((el: HTMLInputElement) => { el.setAttribute('data-alvo', '1'); });
    expect(await firePaste(page, { b64 }, '[data-alvo="1"]')).toBe(false);
    await expect(layers(page)).toHaveCount(1);
    // texto puro fora de campos: nada a fazer, e o navegador segue o caminho dele
    expect(await firePaste(page, { text: 'só texto' })).toBe(false);
    await expect(layers(page)).toHaveCount(1);
    // colar texto de verdade no campo continua funcionando
    await name.fill('');
    await name.pressSequentially('Meu texto');
    await expect(name).toHaveValue('Meu texto');
  });

  test('soltar arquivos de imagem na área adiciona camadas; outro tipo é recusado com aviso', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    const b64 = await makePngBase64(page, 64, 64);
    await page.getByTestId('image-viewport').evaluate((el, data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'foto.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, b64);
    await expect(layers(page)).toHaveCount(1);
    await expect(layers(page).first()).toContainText('foto');
    await page.getByTestId('image-viewport').evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['oi'], 'nota.txt', { type: 'text/plain' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.getByText('Solte arquivos de imagem').first()).toBeVisible();
    await expect(layers(page)).toHaveCount(1);
  });

  test('imagem colada em formato GIF é convertida para PNG e SVG é recusado', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    const gif = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    const ok = await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'pixel.gif', { type: 'image/gif' }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, gif);
    expect(ok).toBe(true);
    await expect(layers(page)).toHaveCount(1);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.svg', { type: 'image/svg+xml' }));
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.getByText('SVG não é aceito como camada').first()).toBeVisible();
    await expect(layers(page)).toHaveCount(1);
  });

  test('o botão “Colar imagem” responde com um aviso claro quando o navegador não libera a área de transferência', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    await page.getByTestId('paste-image').click();
    await expect(page.getByTestId('image-viewport').locator('xpath=ancestor::div[contains(@class,"img-stage")]')).toContainText(/área de transferência/);
    await expect(layers(page)).toHaveCount(0);
  });

  test('imagem colada é exportada em PNG com o tamanho da tela', async ({ page }) => {
    await page.goto('/apps/imagens/?modelo=quadrado');
    await firePaste(page, { b64: await makePngBase64(page, 200, 100) });
    await expect(layers(page)).toHaveCount(1);
    await page.getByTestId('editor-tabs').getByRole('tab', { name: 'Arquivo', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    const bytes = readFileSync((await download.path())!);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.readUInt32BE(16)).toBe(200);
    expect(bytes.readUInt32BE(20)).toBe(100);
  });
});
