import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';

const EDITOR = '/apps/texto/';
const editor = (page: Page) => page.getByTestId('text-editor');
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });

async function storedHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<Array<{ snapshot: { doc: { state: { html: string } } } }>>((resolve, reject) => { const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return rows[0]?.snapshot.doc.state.html ?? '';
  });
}
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
async function addLink(page: Page, url: string): Promise<void> {
  await page.getByTestId('text-link').click();
  await page.getByTestId('text-link-url').fill(url);
  await page.getByTestId('text-link-apply').click();
}

test.describe('Texto · links e estrutura', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('link na seleção: aplica, salva com rel seguro, não navega ao clicar e permite remover', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'Visite nosso site hoje', 'site');
    await addLink(page, 'exemplo.com/pagina');
    const link = editor(page).locator('a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText('site');
    await expect(link).toHaveAttribute('href', 'https://exemplo.com/pagina');
    await expect(page.getByTestId('text-link-form')).toHaveCount(0);
    await saved(page);
    const html = await storedHtml(page);
    expect(html).toContain('href="https://exemplo.com/pagina"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    // clique simples só posiciona o cursor
    await link.click();
    expect(page.url()).toContain('/apps/texto/');
    await expect(page.getByTestId('text-announcement')).toContainText('Link: https://exemplo.com/pagina');
    await expect(page.getByTestId('text-unlink')).toBeVisible();
    // recarregar mantém o link
    await page.reload();
    await expect(editor(page).locator('a')).toHaveCount(1);
    // remover mantém o texto
    await editor(page).locator('a').click();
    await page.getByTestId('text-unlink').click();
    await expect(editor(page).locator('a')).toHaveCount(0);
    expect(await editor(page).evaluate((el) => el.textContent)).toBe('Visite nosso site hoje');
    await saved(page);
    expect(await storedHtml(page)).not.toContain('<a ');
  });

  test('endereços perigosos ou inválidos são recusados com aviso', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'Clique aqui agora', 'aqui');
    await addLink(page, 'javascript:alert(1)');
    await expect(page.getByTestId('text-link-error')).toContainText('Endereço inválido');
    await expect(editor(page).locator('a')).toHaveCount(0);
    await page.getByTestId('text-link-url').fill('nome@exemplo.com');
    await page.getByTestId('text-link-apply').click();
    await expect(editor(page).locator('a')).toHaveAttribute('href', 'mailto:nome@exemplo.com');
  });

  test('Ctrl+K abre o campo; Esc cancela e devolve o foco ao texto', async ({ page }) => {
    await page.goto(EDITOR);
    await editor(page).click();
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('text-link-url')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-link-form')).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
  });

  test('sem seleção, insere o próprio endereço como link', async ({ page }) => {
    await page.goto(EDITOR);
    await editor(page).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Contato: ');
    await addLink(page, 'https://exemplo.com');
    await expect(editor(page).locator('a')).toHaveText('https://exemplo.com');
  });

  test('DOCX leva o link como hiperlink de verdade', async ({ page }) => {
    await page.goto(EDITOR);
    await typeAndSelect(page, 'Veja o relatório completo', 'relatório');
    await addLink(page, 'https://exemplo.com/relatorio?a=1&b=2');
    await saved(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    const path = await download.path();
    const doc = execFileSync('unzip', ['-p', path, 'word/document.xml']).toString('utf8');
    const rels = execFileSync('unzip', ['-p', path, 'word/_rels/document.xml.rels']).toString('utf8');
    expect(doc).toContain('<w:hyperlink');
    expect(doc).toContain('relatório');
    expect(rels).toContain('Target="https://exemplo.com/relatorio?a=1&amp;b=2"');
    expect(rels).toContain('TargetMode="External"');
  });

  test('estrutura lista os títulos, acompanha edições e leva o cursor ao título', async ({ page }) => {
    await page.goto(EDITOR);
    const outline = page.getByTestId('text-outline');
    await expect(outline.getByTestId('outline-item').first()).toContainText('Carta de apresentação'); // modelo inicial tem um Título 1
    await editor(page).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Introdução');
    await page.getByTestId('text-block').selectOption('h1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Texto solto');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Detalhes');
    await page.getByTestId('text-block').selectOption('h2');
    await expect(outline.getByTestId('outline-item')).toHaveCount(2);
    await expect(outline.getByTestId('outline-item').nth(0)).toHaveText('Introdução');
    await expect(outline.getByTestId('outline-item').nth(0)).toHaveAttribute('data-level', '1');
    await expect(outline.getByTestId('outline-item').nth(1)).toHaveText('Detalhes');
    await expect(outline.getByTestId('outline-item').nth(1)).toHaveAttribute('data-level', '2');
    // clique no item leva o cursor ao título
    await outline.getByTestId('outline-item').nth(0).click();
    const where = await page.evaluate(() => { const n = getSelection()!.anchorNode; const el = n instanceof Element ? n : n!.parentElement!; return el.closest('h1,h2,h3')?.textContent; });
    expect(where).toBe('Introdução');
    // desfazer atualiza a estrutura
    await page.getByTestId('text-undo').click();
    await expect(outline.getByTestId('outline-item')).toHaveCount(1);
  });

  test('sem títulos mostra a orientação', async ({ page }) => {
    await page.goto(EDITOR);
    await editor(page).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('apenas texto');
    await expect(page.getByTestId('text-outline')).toContainText('Use “Título 1”');
    await expect(page.getByTestId('text-outline').getByTestId('outline-item')).toHaveCount(0);
  });

  test('sem violações de acessibilidade com o campo de link aberto', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByTestId('text-link').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});

test.describe('Texto · links e estrutura · celular', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test('estrutura e link no painel do celular, sem rolagem horizontal', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Estrutura' }).click();
    await expect(page.getByTestId('text-outline').getByTestId('outline-item').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Inserir' }).click();
    await page.getByTestId('text-link').click();
    await expect(page.getByTestId('text-link-url')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});
