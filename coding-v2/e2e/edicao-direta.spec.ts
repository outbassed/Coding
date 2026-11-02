import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/*
 * DIR-04: edição direta na folha do Etiquetas (contrato em EDICAO-DIRETA.md).
 * O modelo inicial tem 1 item: código "123", descrição "Sua descrição aqui", 3 cópias, prefixo "COD: ".
 */
const EDITOR = '/apps/etiquetas/';
const sheet = (page: Page) => page.getByTestId('sheet');
const codes = (page: Page) => sheet(page).getByRole('textbox', { name: /^Código na etiqueta/ });
const descs = (page: Page) => sheet(page).getByRole('textbox', { name: /^Descrição na etiqueta/ });
const panelCode = (page: Page, n = 1) => page.getByLabel('Código do item ' + n, { exact: true });
const panelDesc = (page: Page, n = 1) => page.getByLabel('Descrição do item ' + n, { exact: true });
const focusedKey = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-edit-key') ?? '');
async function readSavedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<Array<{ snapshot: { doc: { state: { items: Array<{ code: string; description: string }> } } } }>>((resolve, reject) => {
      const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close();
    return rows.map((c) => c.snapshot.doc.state.items);
  });
}

test.describe('Etiquetas · edição direta na folha (computador)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('clicar no código de qualquer cópia edita ali e sincroniza painel e todas as cópias; o documento salvo é o mesmo do painel', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(codes(page)).toHaveCount(3);
    await codes(page).nth(1).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('ABC-9');
    await expect(panelCode(page)).toHaveValue('ABC-9');
    for (let i = 0; i < 3; i++) await expect(codes(page).nth(i)).toHaveText('ABC-9');
    await expect(sheet(page).locator('.code').first()).toHaveText('COD: ABC-9');
    await expect(page.locator('[data-item][data-active="sim"]')).toHaveCount(1);
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    expect(await readSavedState(page)).toEqual([[expect.objectContaining({ code: 'ABC-9', description: 'Sua descrição aqui' })]]);
  });

  test('a descrição aceita várias linhas: Enter quebra, Ctrl+Enter confirma', async ({ page }) => {
    await page.goto(EDITOR);
    await descs(page).first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('linha 2');
    await expect(panelDesc(page)).toHaveValue('Sua descrição aqui\nlinha 2');
    await expect(descs(page).nth(2)).toHaveText('Sua descrição aqui\nlinha 2');
    expect(await focusedKey(page)).toMatch(/\|desc$/);
    await page.keyboard.press('Control+Enter');
    expect(await focusedKey(page)).toBe('');
    await expect(panelDesc(page)).toHaveValue('Sua descrição aqui\nlinha 2');
  });

  test('uma quebra no fim não vira linha extra no modelo', async ({ page }) => {
    await page.goto(EDITOR);
    await descs(page).first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await expect(panelDesc(page)).toHaveValue('Sua descrição aqui');
    await page.keyboard.press('Control+Enter');
    await expect(descs(page).first()).toHaveText('Sua descrição aqui');
  });

  test('Enter confirma o código; Esc cancela e devolve o valor de quando o campo foi aberto', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await page.keyboard.press('Enter');
    expect(await focusedKey(page)).toBe('');
    await expect(panelCode(page)).toHaveValue('123X');
    await codes(page).nth(2).click();
    await page.keyboard.press('End');
    await page.keyboard.type('YY');
    await expect(panelCode(page)).toHaveValue('123XYY');
    await page.keyboard.press('Escape');
    expect(await focusedKey(page)).toBe('');
    await expect(panelCode(page)).toHaveValue('123X');
    for (let i = 0; i < 3; i++) await expect(codes(page).nth(i)).toHaveText('123X');
  });

  test('desfazer e refazer do app valem para a edição na folha e atualizam o campo', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('NOVO');
    await expect(panelCode(page)).toHaveValue('NOVO');
    await page.keyboard.press('Control+Z');
    await expect(panelCode(page)).toHaveValue('123');
    await expect(codes(page).first()).toHaveText('123');
    await page.keyboard.press('Control+Shift+Z');
    await expect(panelCode(page)).toHaveValue('NOVO');
    await expect(codes(page).first()).toHaveText('NOVO');
    await page.getByTestId('undo').click();
    await expect(codes(page).first()).toHaveText('123');
  });

  test('o painel continua mandando na folha (sincronia nos dois sentidos)', async ({ page }) => {
    await page.goto(EDITOR);
    await panelCode(page).fill('DO-PAINEL');
    for (let i = 0; i < 3; i++) await expect(codes(page).nth(i)).toHaveText('DO-PAINEL');
    await codes(page).nth(0).click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(panelCode(page)).toHaveValue('DO-PAINEL!');
  });

  test('só a primeira cópia entra na ordem do Tab; todas aceitam clique', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(sheet(page).locator('[role="textbox"][tabindex="0"]')).toHaveCount(2);
    await expect(sheet(page).locator('[role="textbox"][tabindex="-1"]')).toHaveCount(4);
    await expect(codes(page).nth(2)).toHaveAttribute('aria-label', 'Código na etiqueta (item 1, cópia 3 de 3)');
  });

  test('o limite do modelo vale na folha: o código para em 160 caracteres', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('x'.repeat(200));
    await expect(panelCode(page)).toHaveValue('x'.repeat(160));
    await expect(codes(page).first()).toHaveText('x'.repeat(160));
  });

  test('o texto colado entra como texto simples e, no código, sem quebras de linha', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('Control+A');
    await codes(page).first().evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'AB\nCD');
      data.setData('text/html', '<b>NEGRITO</b>');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(panelCode(page)).toHaveValue('AB CD');
    await expect(codes(page).first().locator('b')).toHaveCount(0);
  });

  test('respeita o zoom: com a folha ampliada, o clique e o cursor caem no lugar certo', async ({ page }) => {
    await page.goto(EDITOR);
    const before = (await sheet(page).boundingBox())!.width;
    await page.getByRole('button', { name: 'Aumentar zoom' }).click();
    await page.getByRole('button', { name: 'Aumentar zoom' }).click();
    expect((await sheet(page).boundingBox())!.width).toBeGreaterThan(before * 1.2);
    await codes(page).nth(2).click();
    await page.keyboard.press('End');
    await page.keyboard.type('Z');
    await expect(panelCode(page)).toHaveValue('123Z');
    await page.getByRole('button', { name: 'Diminuir zoom' }).click();
    await page.getByRole('button', { name: 'Diminuir zoom' }).click();
    await page.getByRole('button', { name: 'Diminuir zoom' }).click();
    await descs(page).nth(1).click();
    await page.keyboard.press('Home');
    await page.keyboard.type('>');
    await expect(panelDesc(page)).toHaveValue('>Sua descrição aqui');
  });

  test('a impressão e o PDF usam a etiqueta somente leitura, sem rastros da edição', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('IMP-1');
    await page.keyboard.press('Enter');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.ed')).toBeHidden();
    const root = page.getByTestId('print-root');
    await expect(root.locator('[contenteditable]')).toHaveCount(0);
    await expect(root.locator('[role="textbox"]')).toHaveCount(0);
    await expect(root.locator('.code').first()).toHaveText('COD: IMP-1');
    await expect(root.locator('.entry')).toHaveCount(3);
    await page.emulateMedia({ media: 'screen' });
  });

  test('digitar na última etiqueta da folha 1 não faz o campo perder o foco quando ela passa para a folha 2', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Formato' }).click();
    await page.locator('#desc-size').fill('48');
    await page.getByRole('tab', { name: 'Itens' }).click();
    await panelDesc(page).fill('Palavra');
    const copies = page.getByLabel('Cópias do item 1', { exact: true });
    await copies.fill('14');
    await copies.blur();
    await expect(page.getByTestId('page-indicator')).toHaveText(/Folha 1 de [2-9]/);
    const onFirst = await sheet(page).locator('.entry').count();
    expect(onFirst).toBeGreaterThan(1);
    const last = descs(page).nth(onFirst - 1);
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await page.keyboard.press('End');
    const words = Array.from({ length: 12 }, () => 'palavra').join(' ');
    await page.keyboard.type(' ' + words, { delay: 15 });
    await expect(panelDesc(page)).toHaveValue('Palavra ' + words);
    expect(await focusedKey(page), 'o foco continua em um campo de descrição').toMatch(/\|desc$/);
    expect(await sheet(page).locator('.entry').count(), 'a etiqueta de fato passou para a folha seguinte').toBeLessThan(onFirst);
    await page.keyboard.type('!');
    await expect(panelDesc(page)).toHaveValue('Palavra ' + words + '!');
  });

  test('apagar todo o texto do código não faz a etiqueta sumir enquanto se edita; Esc traz o valor de volta', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await expect(panelCode(page)).toHaveValue('');
    await expect(codes(page)).toHaveCount(3);
    expect(await focusedKey(page)).toMatch(/\|code$/);
    await page.keyboard.press('Escape');
    await expect(panelCode(page)).toHaveValue('123');
    await expect(codes(page).first()).toHaveText('123');
  });

  test('acessibilidade (axe) com o campo em edição', async ({ page }) => {
    await page.goto(EDITOR);
    await codes(page).first().click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});

test.describe('Etiquetas · edição direta no celular (toque)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tocar no código edita na folha, recolhe o painel e "Concluir edição" encerra', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(codes(page).first()).toBeVisible();
    await codes(page).first().tap();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('TOQUE');
    await expect(sheet(page).locator('.code').first()).toHaveText('COD: TOQUE');
    const finish = page.getByTestId('finish-edit');
    await expect(finish).toBeVisible();
    await expect(page.getByLabel('Código do item 1', { exact: true })).toHaveCount(0);
    const size = await finish.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    await finish.tap();
    await expect(finish).toHaveCount(0);
    expect(await focusedKey(page)).toBe('');
    await expect(sheet(page).locator('.code').first()).toHaveText('COD: TOQUE');
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
