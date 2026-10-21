import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const EDITOR = '/apps/etiquetas/';
const LIBRARY = '/launcher/#/documentos';

const status = (page: Page) => page.getByTestId('save-status');
const sheet = (page: Page) => page.getByTestId('sheet');
async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}
async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0);
}
/** Lê as cópias gravadas no banco v2 (prova do que realmente foi salvo). */
async function readDocs(page: Page) {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes('coding-v2-documents')) return { exists: false, copies: [] as Array<{ id: string; revision: number; label: string; legacyId: string; source: string; doc: Record<string, unknown> }> };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<Array<{ id: string; revision: number; label: string; legacyId: string; source: string; snapshot: { doc: Record<string, unknown> } }>>((resolve, reject) => {
      const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close();
    return { exists: true, copies: rows.map((c) => ({ id: c.id, revision: c.revision, label: c.label, legacyId: c.legacyId, source: c.source, doc: c.snapshot.doc })) };
  });
}
const stateOf = (copy: { doc: Record<string, unknown> }) => copy.doc.state as { name: string; items: Array<{ code: string; description: string; copies: number }>; cols: number; orientation: string; prefix: string };

test.describe('Etiquetas · editar e pré-visualizar', () => {
  test('abre com o modelo inicial editável, sem gravar nada até haver alteração', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.getByRole('heading', { level: 1, name: 'Etiquetas' })).toBeVisible();
    await expect(sheet(page).getByText('COD: 123')).toBeVisible();
    await expect(sheet(page).getByText('Sua descrição aqui')).toBeVisible();
    await expect(status(page)).toHaveText('Novo · ainda não salvo');
    await expect(page.getByTestId('summary')).toContainText('3 etiquetas · 1 item');
    await page.waitForTimeout(1600);
    expect((await readDocs(page)).exists).toBe(false);
    expect((await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).includes('coding-db')).toBe(false);
  });

  test('a prévia acompanha a digitação; salva sozinho e só então diz "Salvo"', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByLabel('Código do item 1').fill('ABC-9');
    await page.getByLabel('Descrição do item 1').fill('Parafuso sextavado');
    await expect(sheet(page).getByText('COD: ABC-9')).toBeVisible();
    await expect(sheet(page).getByText('Parafuso sextavado')).toBeVisible();
    await expect(status(page)).toHaveText('Alterações pendentes');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await expect(page).toHaveURL(/\?doc=/);
    const db = await readDocs(page);
    expect(db.copies).toHaveLength(1);
    const copy = db.copies[0]!;
    expect(copy.doc.type).toBe('labels');
    expect(copy.legacyId).toMatch(/^v2-labels-/);
    expect(stateOf(copy).items[0]).toMatchObject({ code: 'ABC-9', description: 'Parafuso sextavado', copies: 3 });
    expect((await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).includes('coding-db')).toBe(false);
  });

  test('recarregar reabre o mesmo documento; revisão aumenta a cada gravação', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByLabel('Código do item 1').fill('R-1');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await page.reload();
    await expect(page.getByLabel('Código do item 1')).toHaveValue('R-1');
    await expect(sheet(page).getByText('COD: R-1')).toBeVisible();
    await expect(status(page)).toHaveText('Salvo neste aparelho');
    await page.getByLabel('Código do item 1').fill('R-2');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    const db = await readDocs(page);
    expect(db.copies).toHaveLength(1);
    expect(db.copies[0]!.revision).toBe(3);
    expect(stateOf(db.copies[0]!).items[0]!.code).toBe('R-2');
  });

  test('colunas, orientação, cópias e folhas refletem o documento', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Página' }).click();
    await page.getByRole('button', { name: '2 colunas' }).click();
    await expect(sheet(page).locator('.row').first().locator('.entry')).toHaveCount(2);
    await expect(page.getByTestId('rows-info')).toContainText('2 linhas');
    await page.getByRole('button', { name: 'Paisagem' }).click();
    await expect(page.getByTestId('paper-dims')).toContainText('297 × 210 mm');
    const box = await sheet(page).boundingBox();
    expect(Math.abs(box!.width / box!.height - 297 / 210)).toBeLessThan(0.01);
    await page.getByRole('tab', { name: 'Itens' }).click();
    await page.getByLabel('Cópias do item 1').fill('120');
    await page.getByRole('tab', { name: 'Formato' }).click();
    await page.locator('#code-size').fill('90');
    await expect(page.getByTestId('page-indicator')).toHaveText(/Folha 1 de (?!1$)\d+/);
    await expect(page.getByTestId('summary')).toContainText('120 etiquetas');
  });

  test('formato do texto: tamanho, negrito e alinhamento aplicam-se à folha', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Formato' }).click();
    await page.locator('#code-size').fill('60');
    await page.getByRole('button', { name: 'Negrito do código' }).click();
    await page.getByRole('button', { name: 'À esquerda (código)' }).click();
    const code = sheet(page).locator('.code').first();
    await expect(code).toHaveCSS('font-size', /^(80)(\.\d+)?px$/);
    await expect(code).toHaveCSS('font-weight', '400');
    await expect(code).toHaveCSS('text-align', 'left');
  });

  test('item grande demais avisa em português', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Formato' }).click();
    await page.locator('#desc-size').fill('96');
    await page.getByRole('tab', { name: 'Itens' }).click();
    await page.getByLabel('Descrição do item 1').fill(Array.from({ length: 80 }, (_, i) => 'Linha ' + i).join('\n'));
    await expect(page.getByTestId('layout-warning')).toContainText('maior que a área imprimível');
  });

  test('itens: adicionar, duplicar, mover e excluir', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('button', { name: 'Adicionar item' }).click();
    await expect(page.getByLabel('Código do item 2')).toBeFocused();
    await page.getByLabel('Código do item 2').fill('SEGUNDO');
    await page.getByRole('button', { name: 'Duplicar item 2' }).click();
    await expect(page.getByLabel('Código do item 3')).toHaveValue('SEGUNDO');
    await page.getByRole('button', { name: 'Subir item 3' }).click();
    await page.getByRole('button', { name: 'Excluir item 1' }).click();
    await expect(page.getByLabel('Código do item 2')).toHaveValue('SEGUNDO');
    await expect(page.getByLabel('Código do item 3')).toHaveCount(0);
  });

  test('desfazer e refazer por botão e por teclado', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.getByLabel('Código do item 1').fill('X1');
    await expect(sheet(page).getByText('COD: X1')).toBeVisible();
    await page.getByTestId('undo').click();
    await expect(sheet(page).getByText('COD: 123')).toBeVisible();
    await expect(status(page)).toHaveText('Novo · ainda não salvo');
    await page.getByTestId('redo').click();
    await expect(sheet(page).getByText('COD: X1')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(sheet(page).getByText('COD: 123')).toBeVisible();
    await page.keyboard.press('Control+Shift+z');
    await expect(sheet(page).getByText('COD: X1')).toBeVisible();
  });
});

test.describe('Etiquetas · biblioteca e documentos existentes', () => {
  test('documento criado no editor aparece na biblioteca e reabre pelo botão', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Página' }).click();
    await page.getByLabel('Nome do documento').fill('Prateleira A');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await page.goto(LIBRARY);
    const card = page.locator('[data-copy-card]', { hasText: 'Prateleira A' });
    await expect(card).toContainText('Etiquetas');
    await expect(card).toContainText('Criado na v2');
    await card.click();
    await page.getByRole('link', { name: /Abrir cópia de Prateleira A/ }).click();
    await expect(page).toHaveURL(/\/apps\/etiquetas\/\?doc=/);
    await expect(page.getByTestId('doc-title')).toHaveText('Prateleira A');
    await expect(status(page)).toHaveText('Salvo neste aparelho');
  });

  test('"Nova etiqueta" na biblioteca abre um documento novo', async ({ page }) => {
    await page.goto(LIBRARY);
    await page.getByTestId('new-labels').click();
    await expect(page).toHaveURL(/\/apps\/etiquetas\/$/);
    await expect(status(page)).toHaveText('Novo · ainda não salvo');
  });

  test('abre uma cópia de documento do Coding antigo (formato original) e salva sem trocar o id', async ({ page }) => {
    await page.goto(LIBRARY);
    const archive = Buffer.from(JSON.stringify({ schema: 'coding-v2-safe-backup', version: 1, entries: [{
      source: 'backup', images: [],
      doc: { id: 'antigo-77', type: 'labels', updatedAt: 5, state: { name: 'Estoque antigo', prefix: 'REF ', cols: 2, border: false, items: [{ id: 'q', code: 'A1', description: 'Parafuso', copies: 2 }, { id: 'w', code: 'B2', description: '', copies: 1 }] } }
    }] }));
    await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: archive });
    await page.locator('[data-copy-card]', { hasText: 'Estoque antigo' }).click();
    await page.getByRole('link', { name: /Abrir cópia de Estoque antigo/ }).click();
    await expect(sheet(page).getByText('REF A1').first()).toBeVisible();
    await expect(sheet(page).locator('.entry')).toHaveCount(3);
    await expect(sheet(page).locator('.row').first().locator('.entry')).toHaveCount(2);
    await page.getByLabel('Código do item 1').fill('A1-novo');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    const db = await readDocs(page);
    expect(db.copies).toHaveLength(1);
    expect(db.copies[0]!.legacyId).toBe('antigo-77');
    expect(db.copies[0]!.doc.id).toBe('antigo-77');
    expect(db.copies[0]!.revision).toBe(2);
    expect(stateOf(db.copies[0]!).items[0]!.code).toBe('A1-novo');
  });

  test('documento inexistente ou de outro tipo mostra erro claro e não cria nada', async ({ page }) => {
    await page.goto(EDITOR + '?doc=nao-existe');
    await expect(page.getByTestId('load-error')).toContainText('não existe mais');
    await expect(page.getByRole('link', { name: 'Voltar à biblioteca' }).first()).toBeVisible();
    await axeClean(page);
    await page.goto(LIBRARY);
    const archive = Buffer.from(JSON.stringify({ schema: 'coding-v2-safe-backup', version: 1, entries: [{ source: 'backup', images: [], doc: { id: 'txt-1', type: 'texts', state: { name: 'Meu texto' } } }] }));
    await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: archive });
    await page.locator('[data-copy-card]', { hasText: 'Meu texto' }).click();
    await expect(page.getByRole('link', { name: /Abrir cópia de Meu texto/ })).toHaveCount(0);
    const id = (await readDocs(page)).copies[0]!.id;
    await page.goto(EDITOR + '?doc=' + id);
    await expect(page.getByTestId('load-error')).toContainText('não é de Etiquetas');
  });
});

test.describe('Etiquetas · falhas e várias janelas', () => {
  test('falha ao gravar: mostra erro verdadeiro, mantém o texto e salva ao tentar de novo', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __failWrites: boolean };
      w.__failWrites = false;
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
        if (w.__failWrites && args[1] === 'readwrite') throw new DOMException('cheio', 'QuotaExceededError');
        return original.apply(this, args);
      } as typeof original;
    });
    await page.goto(EDITOR);
    await page.getByLabel('Código do item 1').fill('OK-1');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await page.evaluate(() => { (window as unknown as { __failWrites: boolean }).__failWrites = true; });
    await page.getByLabel('Código do item 1').fill('FALHA-2');
    await expect(status(page)).toHaveText('Erro ao salvar', { timeout: 8000 });
    await expect(page.getByTestId('save-error')).toContainText('armazenamento deste aparelho está cheio');
    await expect(page.getByLabel('Código do item 1')).toHaveValue('FALHA-2');
    expect(stateOf((await readDocs(page)).copies[0]!).items[0]!.code).toBe('OK-1');
    await page.evaluate(() => { (window as unknown as { __failWrites: boolean }).__failWrites = false; });
    await page.getByRole('button', { name: 'Tentar salvar de novo' }).click();
    await expect(status(page)).toHaveText('Salvo neste aparelho');
    expect(stateOf((await readDocs(page)).copies[0]!).items[0]!.code).toBe('FALHA-2');
  });

  test('duas abas editando o mesmo documento: a segunda a salvar recebe conflito e nada é sobrescrito', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const a = await context.newPage();
      await a.goto(EDITOR);
      await a.getByLabel('Código do item 1').fill('BASE');
      await expect(status(a)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
      const url = a.url();
      const b = await context.newPage();
      await b.goto(url);
      await expect(b.getByLabel('Código do item 1')).toHaveValue('BASE');
      await a.getByLabel('Código do item 1').fill('DA-ABA-A');
      await b.getByLabel('Código do item 1').fill('DA-ABA-B');
      await expect.poll(async () => (await a.getByTestId('conflict').count()) + (await b.getByTestId('conflict').count()), { timeout: 15000 }).toBe(1);
      const loser = (await a.getByTestId('conflict').count()) ? a : b;
      const winner = loser === a ? b : a;
      await expect(status(winner)).toHaveText('Salvo neste aparelho');
      await expect(status(loser)).toHaveText('Conflito · não salvo');
      const winnerText = loser === a ? 'DA-ABA-B' : 'DA-ABA-A';
      const loserText = loser === a ? 'DA-ABA-A' : 'DA-ABA-B';
      let db = await readDocs(a);
      expect(db.copies).toHaveLength(1);
      expect(stateOf(db.copies[0]!).items[0]!.code).toBe(winnerText);
      await axeClean(loser);
      await loser.getByTestId('conflict-copy').click();
      await expect(status(loser)).toHaveText('Salvo neste aparelho');
      db = await readDocs(a);
      expect(db.copies).toHaveLength(2);
      expect(db.copies.map((c) => stateOf(c).items[0]!.code).sort()).toEqual([winnerText, loserText].sort());
      await expect(loser).toHaveURL((u) => u.toString() !== url);
    } finally { await context.close(); }
  });

  test('aba limpa recebe a versão nova quando outra aba salva', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const a = await context.newPage();
      await a.goto(EDITOR);
      await a.getByLabel('Código do item 1').fill('V1');
      await expect(status(a)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
      const b = await context.newPage();
      await b.goto(a.url());
      await a.getByLabel('Código do item 1').fill('V2');
      await expect(status(a)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
      await expect(b.getByLabel('Código do item 1')).toHaveValue('V2');
      await expect(b.getByTestId('editor-status')).toContainText('outra janela salvou');
    } finally { await context.close(); }
  });
});

test.describe('Etiquetas · celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('prévia no alto, controles embaixo, edição funciona e cabe na tela', async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.getByTestId('tool-strip')).toBeVisible();
    const canvas = await page.getByTestId('canvas').boundingBox();
    const strip = await page.getByTestId('tool-strip').boundingBox();
    expect(canvas!.y).toBeLessThan(strip!.y);
    expect(canvas!.height).toBeGreaterThanOrEqual(219);
    await noHorizontalScroll(page);
    await page.getByLabel('Código do item 1').fill('CEL-1');
    await expect(sheet(page).getByText('COD: CEL-1')).toBeVisible();
    await page.getByTestId('tool-strip').getByRole('button', { name: 'Página' }).click();
    await page.getByRole('button', { name: '3 colunas' }).click();
    await expect(sheet(page).locator('.row').first().locator('.entry')).toHaveCount(3);
    await axeClean(page);
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 8000 });
  });

  test.describe('320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('sem rolagem horizontal e com alvos de toque de 44 px', async ({ page }) => {
      await page.goto(EDITOR);
      await noHorizontalScroll(page);
      for (const name of ['Desfazer', 'Refazer', 'Adicionar item', 'Menos uma cópia', 'Mais uma cópia']) {
        const box = await page.getByRole('button', { name, exact: false }).first().boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(43.5);
      }
      for (const tab of ['Formato', 'Página', 'Itens']) {
        await page.getByTestId('tool-strip').getByRole('button', { name: tab }).click();
        await noHorizontalScroll(page);
        await axeClean(page);
      }
    });
  });
});

test.describe('Etiquetas · acessibilidade no computador', () => {
  test('axe em cada seção do painel', async ({ page }) => {
    await page.goto(EDITOR);
    await axeClean(page);
    for (const tab of ['Formato', 'Página']) {
      await page.getByRole('tab', { name: tab }).click();
      await axeClean(page);
    }
  });
  test('teclado: setas trocam de seção e Ctrl+S salva já', async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole('tab', { name: 'Itens' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Formato' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Formato' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.getByLabel('Código do item 1').fill('K-1');
    await page.keyboard.press('Control+s');
    await expect(status(page)).toHaveText('Salvo neste aparelho', { timeout: 4000 });
  });
});
