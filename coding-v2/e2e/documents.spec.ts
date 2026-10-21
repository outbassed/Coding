import { test, expect } from '@playwright/test';

async function seedLegacy(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const open = indexedDB.open('coding-db', 1);
    await new Promise<void>((resolve, reject) => {
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('docs', { keyPath: 'id' });
        db.createObjectStore('meta');
        db.createObjectStore('images', { keyPath: 'id' }).createIndex('docId', 'docId');
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['docs', 'images'], 'readwrite');
        tx.objectStore('docs').put({ id: 'legado-1', type: 'images', updatedAt: 123, state: { name: 'Foto de teste' } });
        tx.objectStore('docs').put({ id: 'legado-2', type: 'labels', updatedAt: 124, state: { name: 'Caixas do estoque' } });
        tx.objectStore('images').put({ id: 'imagem-1', docId: 'legado-1', blob: new Blob(['PIXELS'], { type: 'image/webp' }), mime: 'image/webp', name: 'original' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

test.describe('Fase 3 · ponte sem alterar legado', () => {
  test('consultar não cria banco antigo quando não existe', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    const before = await page.evaluate(async () => (await indexedDB.databases()).map((x) => x.name));
    expect(before).not.toContain('coding-db');
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByText(/Nenhum documento encontrado nesta origem/)).toBeVisible();
    const after = await page.evaluate(async () => (await indexedDB.databases()).map((x) => x.name));
    expect(after).not.toContain('coding-db');
  });

  test('lê registros + Blob, exporta backup e cria cópia sem alterar o original', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    await seedLegacy(page);
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByTestId('legacy-docs').locator('article')).toHaveCount(2);
    await expect(page.getByText('Foto de teste')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar backup dos documentos listados' }).click()
    ]);
    const stream = await download.createReadStream();
    const buffers: Buffer[] = [];
    for await (const chunk of stream) buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(buffers).toString('utf8');
    const archive = JSON.parse(text) as { schema: string; entries: Array<{ images: Array<{ blob: { base64: string } }> }> };
    expect(archive.schema).toBe('coding-v2-safe-backup');
    expect(archive.entries).toHaveLength(2);
    expect(archive.entries.some((x) => x.images.some((image) => image.blob?.base64 === btoa('PIXELS')))).toBe(true);

    await page.getByRole('button', { name: 'Criar cópia de Foto de teste' }).click();
    await expect(page.getByTestId('v2-copies').locator('article')).toHaveCount(1);
    await expect(page.getByText('Cópia independente criada na v2.')).toBeVisible();
    const legacy = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-db'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const tx = db.transaction(['docs', 'images'], 'readonly');
      const doc = await new Promise<unknown>((resolve, reject) => { const r = tx.objectStore('docs').get('legado-1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const images = await new Promise<unknown[]>((resolve, reject) => { const r = tx.objectStore('images').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      db.close();
      return { doc, count: images.length };
    });
    expect(legacy.doc).toMatchObject({ id: 'legado-1', state: { name: 'Foto de teste' } });
    expect(legacy.count).toBe(1);

    await page.reload();
    await expect(page.getByTestId('v2-copies').locator('article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Renomear cópia de Foto de teste' }).click();
    await page.getByRole('textbox', { name: 'Novo nome da cópia' }).fill('Foto protegida');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByText('Nome da cópia salvo após confirmação do banco.')).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('Salvo neste aparelho');
    await page.reload();
    await expect(page.getByTestId('v2-copies').getByText('Foto protegida')).toBeVisible();
  });

  test('não sobrescreve revisão concorrente: acusa conflito', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    await seedLegacy(page);
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await page.getByRole('button', { name: 'Criar cópia de Foto de teste' }).click();
    await page.getByRole('button', { name: 'Renomear cópia de Foto de teste' }).click();
    await page.getByRole('textbox', { name: 'Novo nome da cópia' }).fill('Nome da primeira janela');

    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('coding-v2-documents');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('copies', 'readwrite');
        const store = tx.objectStore('copies');
        const get = store.getAll();
        get.onsuccess = () => {
          const record = get.result[0] as { revision: number; label: string };
          record.revision += 1;
          record.label = 'Alterado fora desta janela';
          store.put(record);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    });
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('alert')).toContainText('Conflito de versão');
    await page.getByRole('button', { name: 'Atualizar biblioteca' }).click();
    // Never drop unfinished form input just because another tab changed the record.
    await expect(page.getByRole('textbox', { name: 'Novo nome da cópia' })).toHaveValue('Nome da primeira janela');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('v2-copies').getByText('Alterado fora desta janela')).toBeVisible();
  });
});
