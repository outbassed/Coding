import { test, expect } from '@playwright/test';
import { importFromLegacy, openCard, readCopiesDb, seedLegacy } from './helpers';

test.describe('Fase 3.2 · importação guiada sem alterar o legado', () => {
  test('examinar não cria banco antigo quando não existe e explica o vazio', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    await expect(page.getByText('Você ainda não tem cópias')).toBeVisible();
    await page.getByTestId('open-import').click();
    await expect(page.getByRole('dialog', { name: 'Importar do Coding antigo' })).toBeVisible();
    await expect(page.locator('[data-wizard-heading]')).toBeFocused();
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByTestId('wizard-none')).toBeVisible();
    await expect(page.getByText(/Nenhum documento encontrado nesta origem/)).toBeVisible();
    const after = await page.evaluate(async () => (await indexedDB.databases()).map((x) => x.name));
    expect(after).not.toContain('coding-db');
  });

  test('três passos: examinar, selecionar, confirmar; cópia com bytes; legado intacto', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    await seedLegacy(page);
    await page.getByTestId('open-import').click();
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByTestId('legacy-docs').locator('li')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Continuar/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Foto de teste' }).check();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await expect(page.getByRole('heading', { name: 'Confirmar a criação das cópias' })).toBeFocused();
    await expect(page.getByText('não serão alterados')).toBeVisible();
    // Voltar não grava nada.
    expect((await readCopiesDb(page)).labels).toEqual([]);
    await page.getByTestId('confirm-import').click();
    await expect(page.getByTestId('import-outcome')).toContainText('1 cópia(s) criada(s)');
    await page.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('library-status')).toContainText('1 cópia(s) criada(s)');

    const db = await readCopiesDb(page);
    expect(db.labels).toEqual(['Foto de teste']);
    expect(db.assets).toHaveLength(1);
    expect(Buffer.from(db.assets[0]!.bytes).toString()).toBe('PIXELS');

    const legacy = await page.evaluate(async () => {
      const handle = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-db'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const tx = handle.transaction(['docs', 'images'], 'readonly');
      const all = <T>(q: IDBRequest<T>) => new Promise<T>((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
      const docs = await all(tx.objectStore('docs').getAll()); const images = await all(tx.objectStore('images').getAll());
      handle.close();
      return { docs: docs.length, images: images.length, version: handle.version };
    });
    expect(legacy).toEqual({ docs: 2, images: 1, version: 1 });

    // O documento já copiado aparece indisponível, sem permitir duplicar.
    await page.getByTestId('open-import').click();
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByRole('checkbox', { name: 'Foto de teste' })).toBeDisabled();
    await expect(page.getByText('Indisponível: já existe uma cópia')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Caixas do estoque' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('open-import')).toBeFocused();
  });

  test('renomear persiste, exporta uma cópia com os bytes e devolve o foco', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    await seedLegacy(page);
    await importFromLegacy(page, ['Foto de teste']);
    await openCard(page, 'Foto de teste');
    await page.getByRole('button', { name: 'Renomear cópia de Foto de teste' }).click();
    await expect(page.getByRole('textbox', { name: 'Novo nome da cópia' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('library-status')).toContainText('Renomeação cancelada');

    await page.getByRole('button', { name: 'Renomear cópia de Foto de teste' }).click();
    await page.getByRole('textbox', { name: 'Novo nome da cópia' }).fill('Foto protegida');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByTestId('library-status')).toContainText('Nome salvo: Foto protegida');
    await expect(page.getByTestId('save-status')).toContainText('Salvo neste aparelho');
    await expect(page.getByRole('button', { name: 'Renomear cópia de Foto protegida' })).toBeFocused();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar cópia de Foto protegida' }).click()
    ]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toContain(Buffer.from('PIXELS').toString('base64'));
    expect(JSON.parse(text).entries).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId('v2-copies').getByText('Foto protegida')).toBeVisible();
  });
});
