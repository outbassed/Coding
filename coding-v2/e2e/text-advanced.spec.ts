import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const EDITOR = '/apps/texto/';
/** PNG de verdade (320×160) para poder clicar e arrastar a imagem. */
async function makePng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 160;
    const g = c.getContext('2d')!; g.fillStyle = '#2a7de1'; g.fillRect(0, 0, 320, 160); g.fillStyle = '#fff'; g.fillRect(20, 20, 120, 60);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
const editor = (page: Page) => page.getByTestId('text-editor');
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });

async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}
async function noHorizontalScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
async function storedHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<Array<{ snapshot: { doc: { state: { html: string } } } }>>((resolve, reject) => { const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return rows[0]?.snapshot.doc.state.html ?? '';
  });
}
/** Escreve um texto e seleciona uma palavra, como a pessoa faria. */
async function typeAndSelect(page: Page, text: string, word: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await editor(page).evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const i = n.data.indexOf(w);
      if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); return; }
    }
  }, word);
}

test.describe('Texto avançado · computador', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('fonte, tamanho, cores e estilo aplicam-se à seleção e persistem', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'Começo palavra fim', 'palavra');
    await page.getByTestId('text-font').selectOption('Courier New');
    await page.getByTestId('text-size').selectOption('32');
    await page.getByTestId('text-color').fill('#cc0000');
    await page.getByTestId('text-highlight').fill('#ffee00');
    const span = editor(page).locator('span', { hasText: 'palavra' }).last();
    const css = await span.evaluate((el) => { const c = getComputedStyle(el); return { f: c.fontFamily, s: c.fontSize, c: c.color, b: c.backgroundColor }; });
    expect(css.f).toContain('Courier New');
    expect(css.s).toBe('32px');
    expect(css.c).toBe('rgb(204, 0, 0)');
    expect(css.b).toBe('rgb(255, 238, 0)');
    // o resto do texto não mudou
    expect(await editor(page).evaluate((el) => el.textContent)).toBe('Começo palavra fim');
    await saved(page);
    const html = await storedHtml(page);
    expect(html).toMatch(/Courier New/);
    expect(html).toMatch(/font-size: 32px/);
    expect(html).not.toMatch(/<font|size="7"/);
    await page.reload();
    const again = await editor(page).locator('span', { hasText: 'palavra' }).last().evaluate((el) => getComputedStyle(el).fontSize);
    expect(again).toBe('32px');
  });

  test('seleção continua depois de formatar várias vezes seguidas', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'um dois tres', 'dois');
    await page.getByRole('button', { name: 'Negrito' }).click();
    await page.getByRole('button', { name: 'Itálico' }).click();
    await page.getByRole('button', { name: 'Sublinhado' }).click();
    const sel = await page.evaluate(() => getSelection()!.toString());
    expect(sel).toBe('dois');
    await expect(page.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor(page).locator('b, strong').filter({ hasText: 'dois' })).toHaveCount(1);
    await expect(editor(page).locator('u')).toHaveCount(1);
  });

  test('estilos de parágrafo e alinhamento', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'Meu titulo', 'titulo');
    await page.getByTestId('text-block').selectOption('h2');
    await expect(editor(page).locator('h2')).toHaveText('Meu titulo');
    await page.getByRole('button', { name: 'Centralizar' }).click();
    expect(await editor(page).locator('h2').evaluate((el) => getComputedStyle(el).textAlign)).toBe('center');
    await page.getByRole('button', { name: 'Justificar' }).click();
    expect(await editor(page).locator('h2').evaluate((el) => getComputedStyle(el).textAlign)).toBe('justify');
    await page.getByTestId('text-block').selectOption('blockquote');
    await expect(editor(page).locator('blockquote')).toHaveCount(1);
    await expect(page.getByTestId('text-block')).toHaveValue('blockquote');
  });

  test('desfazer e refazer por botão e teclado, sem perder o cursor', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.getByTestId('text-undo')).toBeDisabled();
    await editor(page).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('primeira frase');
    await page.waitForTimeout(1000);
    await page.keyboard.type(' segunda frase');
    await expect(page.getByTestId('text-undo')).toBeEnabled();
    await page.getByTestId('text-undo').click();
    await expect(editor(page)).toHaveText('primeira frase');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('text-undo')).toBeDisabled();
    await expect(page.getByTestId('text-redo')).toBeEnabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(editor(page)).toHaveText('primeira frase');
    await page.getByTestId('text-redo').click();
    await expect(editor(page)).toHaveText('primeira frase segunda frase');
    await expect(page.getByTestId('text-redo')).toBeDisabled();
    // formatação também desfaz
    await typeAndSelect(page, 'abc def', 'def');
    await page.getByRole('button', { name: 'Negrito' }).click();
    await expect(editor(page).locator('b, strong')).toHaveCount(1);
    await page.getByTestId('text-undo').click();
    await expect(editor(page).locator('b, strong')).toHaveCount(0);
    await saved(page);
  });

  test('nome do documento mantém o desfazer nativo do campo', async ({ page }) => {
    await page.goto(EDITOR);
    const name = page.getByLabel('Nome do documento');
    await name.fill('Abc');
    await name.press('Control+z');
    await expect(editor(page)).toContainText('Carta de apresentação'); // não mexeu no corpo
  });

  test('imagem: selecionar, redimensionar por botões e por arraste, remover', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByLabel('Selecionar imagem para o texto').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: await makePng(page) });
    const img = editor(page).locator('img');
    await expect(img).toHaveCount(1);
    await expect(page.getByTestId('img-percent')).toHaveCount(0);
    await img.click();
    await expect(page.getByTestId('img-frame')).toBeVisible();
    await page.getByTestId('img-50').click();
    await expect(page.getByTestId('img-percent')).toHaveText('50%');
    expect(await img.evaluate((el) => (el as HTMLElement).style.width)).toBe('50%');
    await page.getByTestId('img-smaller').click();
    await expect(page.getByTestId('img-percent')).toHaveText('40%');
    // arraste do canto
    const handle = (await page.getByTestId('img-handle').boundingBox())!;
    const before = (await img.boundingBox())!.width;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + handle.height / 2, { steps: 6 });
    await page.mouse.up();
    const after = (await img.boundingBox())!.width;
    expect(after).toBeGreaterThan(before + 60);
    await saved(page);
    expect(await storedHtml(page)).toMatch(/<img[^>]*style="width: \d+%;"/);
    await page.reload();
    expect(await editor(page).locator('img').evaluate((el) => (el as HTMLElement).style.width)).toMatch(/%$/);
    // remover
    await editor(page).locator('img').click();
    await page.getByTestId('img-remove').click();
    await expect(editor(page).locator('img')).toHaveCount(0);
    await page.getByTestId('text-undo').click();
    await expect(editor(page).locator('img')).toHaveCount(1);
  });

  test('exportação e impressão continuam, agora com a formatação', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'texto formatado aqui', 'formatado');
    await page.getByTestId('text-color').fill('#0000cc');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar HTML' }).click()]);
    const fs = await import('node:fs/promises');
    const html = await fs.readFile((await dl.path())!, 'utf8');
    expect(html).toMatch(/color: rgb\(0, 0, 204\)/);
    expect(html).not.toMatch(/<script|onclick/);
    await page.addInitScript(() => { (window as unknown as { __p: number }).__p = 0; });
    await page.evaluate(() => { (window as unknown as { __p: number }).__p = 0; window.print = () => { (window as unknown as { __p: number }).__p += 1; }; });
    await page.getByRole('button', { name: 'Imprimir / PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { __p: number }).__p)).toBe(1);
  });

  test('a barra do computador passa no axe e a folha tem proporção A4', async ({ page }) => {
    await page.goto(EDITOR);
    await axeClean(page);
    const paper = (await page.locator('.paper').boundingBox())!;
    expect(Math.round(paper.width)).toBe(794);
    expect(paper.height).toBeGreaterThanOrEqual(1122);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500); // deixa as transições de cor terminarem antes de medir contraste
    await axeClean(page);
  });

  test('conflito de revisão continua protegendo o texto formatado', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'base inicial', 'inicial');
    await page.getByTestId('text-size').selectOption('24');
    await saved(page);
    const other = await page.context().newPage();
    try {
      await other.goto(page.url());
      await expect(other.getByTestId('text-editor')).toContainText('base inicial');
      await editor(page).click();
      await page.keyboard.type(' primeira aba');
      await saved(page);
      await other.getByTestId('text-editor').click();
      await other.keyboard.type(' outra aba');
      await expect(other.getByTestId('text-conflict')).toBeVisible({ timeout: 10000 });
    } finally { await other.close({ runBeforeUnload: false }); }
  });
});

test.describe('Texto avançado · celular', () => {
  for (const width of [320, 360, 390, 430]) {
    test.describe(width + ' px', () => {
      test.use({ viewport: { width, height: 800 }, hasTouch: true });

      test('página acima da gaveta de ferramentas com categorias fixas', async ({ page }) => {
        await page.goto(EDITOR);
        await noHorizontalScroll(page);
        const stage = (await page.locator('.stage').boundingBox())!;
        const panel = (await page.getByTestId('text-controls').boundingBox())!;
        const bottom = (await page.getByRole('tablist', {name:'Categorias de texto'}).boundingBox())!;
        expect(stage.y + stage.height).toBeLessThanOrEqual(panel.y + 2);
        expect(panel.y + panel.height).toBeLessThanOrEqual(bottom.y + 2);
        expect(bottom.y + bottom.height).toBeLessThanOrEqual(801);
        expect(await page.getByTestId('text-toolbar').evaluate(el => getComputedStyle(el).flexDirection)).toBe('column');
        await page.getByRole('tab',{name:'Imagem'}).click();
        await expect(page.getByTestId('text-controls')).toBeVisible();
        await page.getByRole('tab',{name:'Imagem'}).click();
        await expect(page.getByTestId('text-controls')).toBeHidden();
        await page.getByRole('tab',{name:'Formato'}).click();
        await expect(page.getByTestId('text-controls')).toBeVisible();
      });

      test('formatar pelo toque não perde a seleção e todos os controles funcionam', async ({ page }) => {
        page.setDefaultTimeout(6000);
        await page.goto(EDITOR);
        await typeAndSelect(page, 'um dois tres', 'dois');
        const bar = page.getByTestId('text-toolbar');
        await test.step('negrito', async () => {
          await bar.getByRole('button', { name: 'Negrito' }).tap();
          expect(await page.evaluate(() => getSelection()!.toString())).toBe('dois');
        });
        await test.step('tamanho', () => bar.getByTestId('text-size').selectOption('36'));
        await test.step('fonte', () => bar.getByTestId('text-font').selectOption('Verdana'));
        await test.step('cor', () => bar.getByTestId('text-color').fill('#007700'));
        await test.step('centralizar', () => bar.getByRole('button', { name: 'Centralizar' }).tap());
        await test.step('desfazer', () => bar.getByTestId('text-undo').tap());
        await test.step('refazer', () => bar.getByTestId('text-redo').tap());
        const css = await editor(page).locator('span', { hasText: 'dois' }).last().evaluate((el) => ({ s: getComputedStyle(el).fontSize, c: getComputedStyle(el).color, f: getComputedStyle(el).fontFamily }));
        expect(css.s).toBe('36px');
        expect(css.c).toBe('rgb(0, 119, 0)');
        expect(css.f).toContain('Verdana');
        await bar.getByRole('button', { name: 'Exportar HTML' }).scrollIntoViewIfNeeded();
        await expect(bar.getByRole('button', { name: 'Exportar HTML' })).toBeVisible();
        await expect(bar.getByRole('button', { name: 'Imprimir / PDF' })).toBeAttached();
        await noHorizontalScroll(page);
      });
    });
  }

  test.describe('teclado virtual', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('a área do editor acompanha a parte visível da tela', async ({ page }) => {
      await page.goto(EDITOR);
      const vv = await page.evaluate(() => ({ h: Math.round(window.visualViewport!.height), set: document.querySelector<HTMLElement>('.text-app')!.style.getPropertyValue('--vv-h') }));
      expect(vv.set).toBe(vv.h + 'px');
      const box = (await page.locator('.text-app').boundingBox())!;
      expect(Math.round(box.height)).toBe(vv.h);
      // simula o teclado: a janela visível encolhe e a barra continua visível, acima dela
      await page.setViewportSize({ width: 390, height: 500 });
      await expect.poll(async () => Math.round((await page.locator('.text-app').boundingBox())!.height)).toBe(500);
      const panel = (await page.getByTestId('text-controls').boundingBox())!;
      expect(panel.y + panel.height).toBeLessThanOrEqual(501);
      // digitar no fim de um texto longo mantém o cursor visível
      await editor(page).click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(Array.from({ length: 40 }, (_, i) => 'linha ' + i).join('\n'));
      const caret = await page.evaluate(() => {
        const r = getSelection()!.getRangeAt(0).getBoundingClientRect(); const s = document.querySelector('.stage')!.getBoundingClientRect();
        return r.bottom <= s.bottom + 1 && r.top >= s.top - 1;
      });
      expect(caret).toBe(true);
    });
  });

  test.describe('acessibilidade', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('barra móvel passa no axe nos dois temas', async ({ page }) => {
      await page.goto(EDITOR);
      await axeClean(page);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(500);
      await axeClean(page);
    });
  });
});
