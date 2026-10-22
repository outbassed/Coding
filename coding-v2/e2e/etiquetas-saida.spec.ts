import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const EDITOR = '/apps/etiquetas/';
const LIST = ['190847 ; ARVORE NATAL CANADA 240CM ; 4', '250311 ; PISCA PISCA 100 LEDS ; 2', 'SEM-DESCRICAO'].join('\n');

async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}
async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0);
}
async function openExport(page: Page, mobile = false): Promise<void> {
  if (mobile) await page.getByTestId('tool-strip').getByRole('button', { name: 'Exportar' }).click();
  else await page.getByRole('tab', { name: 'Exportar' }).click();
}
/** Deixa o documento com várias folhas (muitas cópias de uma etiqueta grande). */
async function makeManySheets(page: Page): Promise<number> {
  await page.getByLabel('Cópias do item 1').fill('120');
  await page.getByRole('tab', { name: 'Formato' }).click();
  await page.locator('#code-size').fill('90');
  await expect(page.getByTestId('page-indicator')).toHaveText(/Folha 1 de (?!1$)\d+/);
  const text = (await page.getByTestId('page-indicator').textContent()) ?? '';
  return Number(/de (\d+)/.exec(text)![1]);
}
const pdfPageCount = (raw: string): number => (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
const mediaBox = (raw: string): number[] => {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
  return m ? m.slice(1).map(Number) : [];
};

test.describe('Etiquetas · colar lista', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('mostra a pré-visualização e só muda o documento ao confirmar; desfaz de uma vez', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByTestId('open-bulk').click();
    const dialog = page.getByTestId('bulk-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('bulk-empty')).toBeVisible();
    await expect(page.getByTestId('bulk-append')).toBeDisabled();
    await page.locator('#bulk-text').fill(LIST + '\n\nX;y;9999');
    await expect(page.getByTestId('bulk-summary')).toContainText('4 itens');
    await expect(page.getByTestId('bulk-summary')).toContainText('507 etiquetas');
    await expect(page.getByTestId('bulk-row')).toHaveCount(4);
    await expect(page.getByTestId('bulk-row').nth(3)).toContainText('cópias limitadas a 500');
    // nada mudou ainda
    await page.getByTestId('bulk-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-item]')).toHaveCount(1);
    await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');

    await page.getByTestId('open-bulk').click();
    await page.locator('#bulk-text').fill(LIST);
    await axeClean(page);
    await page.getByTestId('bulk-append').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-item]')).toHaveCount(4); // o item inicial '123' tem conteúdo e foi mantido
    await expect(page.getByLabel('Código do item 2')).toHaveValue('190847');
    await expect(page.getByLabel('Cópias do item 2')).toHaveValue('4');
    await expect(page.getByTestId('summary')).toContainText('10 etiquetas');
    await expect(page.getByTestId('sheet').getByText('COD: 190847').first()).toBeVisible();
    await page.getByTestId('undo').click();
    await expect(page.locator('[data-item]')).toHaveCount(1);
    await page.getByTestId('redo').click();
    await expect(page.locator('[data-item]')).toHaveCount(4);
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
  });

  test('substituir pede confirmação e troca a lista inteira', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByTestId('open-bulk').click();
    await page.locator('#bulk-text').fill('NOVO1\tdesc\t2\nNOVO2\t\t1');
    await page.getByTestId('bulk-replace').click();
    await expect(page.getByTestId('bulk-confirm')).toBeVisible();
    await expect(page.getByTestId('bulk-dialog')).toBeVisible();
    await expect(page.locator('[data-item]')).toHaveCount(1);
    await page.getByTestId('bulk-replace').click();
    await expect(page.getByTestId('bulk-dialog')).toBeHidden();
    await expect(page.locator('[data-item]')).toHaveCount(2);
    await expect(page.getByLabel('Código do item 1')).toHaveValue('NOVO1');
    await expect(page.getByLabel('Descrição do item 1')).toHaveValue('desc');
  });

  test('Esc fecha sem alterar e devolve o foco ao botão', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByTestId('open-bulk').click();
    await page.locator('#bulk-text').fill('Z');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bulk-dialog')).toBeHidden();
    await expect(page.getByTestId('open-bulk')).toBeFocused();
    await expect(page.locator('[data-item]')).toHaveCount(1);
  });
});

test.describe('Etiquetas · imprimir', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('abre a impressão do navegador; Ctrl+P faz o mesmo; sem conteúdo fica bloqueado', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints += 1; }; });
    await page.goto(EDITOR);
    await openExport(page);
    await expect(page.getByTestId('export-info')).toContainText('1 folha · A4 retrato');
    await page.getByTestId('print').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+p');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(2);
    // sem nenhum conteúdo
    await page.getByRole('tab', { name: 'Itens' }).click();
    await page.getByLabel('Código do item 1').fill('');
    await page.getByLabel('Descrição do item 1').fill('');
    await openExport(page);
    await expect(page.getByTestId('print')).toBeDisabled();
    await expect(page.getByTestId('pdf')).toBeDisabled();
    await expect(page.getByTestId('export-blocked')).toBeVisible();
    await page.keyboard.press('Control+p');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(2);
  });

  test('em modo de impressão só as folhas aparecem, no tamanho A4 e na mesma quantidade da prévia', async ({ page }) => {
    await page.goto(EDITOR);
    const sheets = await makeManySheets(page);
    expect(sheets).toBeGreaterThan(1);
    await page.emulateMedia({ media: 'print' });
    const info = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="print-sheet"]'));
      const rects = els.map((e) => e.getBoundingClientRect());
      const ed = document.querySelector<HTMLElement>('.ed');
      return {
        count: els.length,
        widthMm: rects[0]!.width * 25.4 / 96, heightMm: rects[0]!.height * 25.4 / 96,
        stacked: rects.every((r, i) => i === 0 || r.top >= rects[i - 1]!.bottom - 0.5),
        appHidden: ed ? getComputedStyle(ed).display === 'none' : true,
        breaks: els.slice(0, -1).every((e) => getComputedStyle(e).breakAfter === 'page'),
        onScreen: rects[0]!.left >= 0
      };
    });
    expect(info.count).toBe(sheets);
    expect(info.widthMm).toBeCloseTo(210, 0);
    expect(info.heightMm).toBeCloseTo(297, 0);
    expect(info.stacked).toBe(true);
    expect(info.appHidden).toBe(true);
    expect(info.breaks).toBe(true);
    expect(info.onScreen).toBe(true);
  });

  for (const orientation of ['Retrato', 'Paisagem'] as const) {
    test('PDF do navegador (' + orientation + ') tem uma página por folha e o tamanho certo', async ({ page }) => {
      await page.goto(EDITOR);
      const retrato = orientation === 'Retrato';
      const sheets = await makeManySheets(page);
      await page.getByRole('tab', { name: 'Página' }).click();
      await page.getByRole('button', { name: orientation }).click();
      const text = (await page.getByTestId('page-indicator').textContent()) ?? '';
      const expected = Number(/de (\d+)/.exec(text)![1]);
      expect(expected).toBeGreaterThanOrEqual(retrato ? sheets : 1);
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const raw = pdf.toString('latin1');
      expect(raw.startsWith('%PDF')).toBe(true);
      expect(pdfPageCount(raw)).toBe(expected);
      const [, , w, h] = mediaBox(raw);
      expect(Math.round(w!)).toBe(retrato ? 595 : 842);
      expect(Math.round(h!)).toBe(retrato ? 842 : 595);
    });
  }
});

test.describe('Etiquetas · baixar PDF', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Abre a imagem de uma folha do PDF no navegador e diz quantos pixels escuros ela tem. */
  async function darkPixels(page: Page, raw: Buffer): Promise<{ w: number; h: number; dark: number }> {
    const start = raw.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const end = raw.indexOf(Buffer.from('\nendstream', 'latin1'), start);
    const jpeg = raw.subarray(start, end).toString('base64');
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i]! + data[i + 1]! + data[i + 2]!) / 3 < 100) dark += 1;
      return { w: img.width, h: img.height, dark };
    }, jpeg);
  }

  test('gera um PDF de verdade, com todas as folhas e conteúdo desenhado', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByLabel('Código do item 1').fill('PDF-TESTE');
    await page.getByLabel('Descrição do item 1').fill('Parafuso sextavado');
    const sheets = await makeManySheets(page);
    await page.getByRole('tab', { name: 'Página' }).click();
    await page.locator('#doc-name').fill('Meu Teste');
    await openExport(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdf').click()]);
    expect(download.suggestedFilename()).toBe('Meu-Teste.pdf');
    const path = await download.path();
    const raw = await readFile(path);
    const text = raw.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdfPageCount(text)).toBe(sheets);
    expect(mediaBox(text)).toEqual([0, 0, 595.28, 841.89]);
    await expect(page.getByTestId('export-message')).toHaveText('PDF gerado com ' + sheets + ' folhas.');
    const img = await darkPixels(page, raw);
    expect([img.w, img.h]).toEqual([1240, 1754]);
    expect(img.dark).toBeGreaterThan(5000); // texto grande desenhado; folha em branco teria 0
    // o documento continua editável e nada foi alterado pela exportação
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
  });

  test('paisagem gera páginas 297 × 210 mm', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Página' }).click();
    await page.getByRole('button', { name: 'Paisagem' }).click();
    await openExport(page);
    await expect(page.getByTestId('export-info')).toContainText('A4 paisagem');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdf').click()]);
    const raw = await readFile((await download.path())!);
    const text = raw.toString('latin1');
    expect(mediaBox(text)).toEqual([0, 0, 841.89, 595.28]);
    const img = await darkPixels(page, raw);
    expect([img.w, img.h]).toEqual([1754, 1240]);
    expect(img.dark).toBeGreaterThan(1000);
  });

  test('falha na renderização mostra erro claro e o caminho alternativo', async ({ page }) => {
    await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(null); }; });
    await page.goto(EDITOR);
    await openExport(page);
    await page.getByTestId('pdf').click();
    await expect(page.getByTestId('export-error')).toContainText('Salvar como PDF');
    await expect(page.getByTestId('pdf')).toBeEnabled();
  });

  test('a aba Exportar passa no axe', async ({ page }) => {
    await page.goto(EDITOR);
    await openExport(page);
    await axeClean(page);
  });
});

test.describe('Etiquetas · saída no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Exportar e Colar lista cabem na tela, com alvos de toque e acessibilidade', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.getByTestId('tool-strip').getByRole('button', { name: 'Exportar' })).toBeVisible();
    await page.getByTestId('tool-strip').getByRole('button', { name: 'Exportar' }).click();
    for (const id of ['print', 'pdf']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
    await noHorizontalScroll(page);
    await axeClean(page);
    await page.getByTestId('tool-strip').getByRole('button', { name: 'Itens' }).click();
    await page.getByTestId('open-bulk').click();
    await page.locator('#bulk-text').fill(LIST);
    await expect(page.getByTestId('bulk-row')).toHaveCount(3);
    await noHorizontalScroll(page);
    const dlg = await page.getByTestId('bulk-dialog').boundingBox();
    expect(dlg!.x).toBeGreaterThanOrEqual(0);
    expect(dlg!.x + dlg!.width).toBeLessThanOrEqual(390.5);
    for (const id of ['bulk-cancel', 'bulk-replace', 'bulk-append']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await axeClean(page);
    await page.getByTestId('bulk-append').click();
    await expect(page.getByLabel('Código do item 2')).toHaveValue('190847');
  });

  test.describe('320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('sem rolagem horizontal na aba Exportar e no diálogo', async ({ page }) => {
      await page.goto(EDITOR);
      await page.getByTestId('tool-strip').getByRole('button', { name: 'Exportar' }).click();
      await noHorizontalScroll(page);
      await axeClean(page);
      await page.getByTestId('tool-strip').getByRole('button', { name: 'Itens' }).click();
      await page.getByTestId('open-bulk').click();
      await page.locator('#bulk-text').fill(LIST);
      await noHorizontalScroll(page);
      await axeClean(page);
    });
  });
});
