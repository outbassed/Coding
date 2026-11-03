import { test, expect } from '@playwright/test';

/**
 * Real browser regression for the Fase 3.1 base64 stack overflow.
 * Exercise the real UI, upload a legacy v1 binary archive and export a v2
 * copy. No app engines and no changes to "coding-db" are involved.
 */
test('Fase 3.3: navegador importa e exporta imagens de 3, 10 e 32 MiB', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const sizeMiB of [3, 10, 32]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto('/launcher/#/documentos');
      const size = sizeMiB * 1024 * 1024;
      const data = Buffer.alloc(size, 0);
      data[0] = 17;
      data[size - 1] = 237;
      const archive = Buffer.from(JSON.stringify({
        schema: 'coding-v2-safe-backup', version: 1,
        entries: [{
          source: 'backup',
          doc: { id: 'large-' + sizeMiB, type: 'images', state: { name: 'Arquivo ' + sizeMiB + ' MiB' } },
          images: [{
            id: 'photo', docId: 'large-' + sizeMiB,
            blob: { $codingV2BinaryType: 'blob', mime: 'image/jpeg', base64: data.toString('base64') }
          }]
        }]
      }));
      await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
        name: 'large-v1.json', mimeType: 'application/json', buffer: archive
      });
      await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1, { timeout: 60_000 });
      await page.locator('[data-copy-card]').click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 90_000 }),
        page.getByRole('button', { name: 'Exportar cópia de Arquivo ' + sizeMiB + ' MiB' }).click()
      ]);
      const stream = await download.createReadStream();
      const pieces: Buffer[] = [];
      for await (const chunk of stream) pieces.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const exported = JSON.parse(Buffer.concat(pieces).toString('utf8')) as { version: number; entries: unknown[] };
      expect(exported.version).toBe(2);
      expect(exported.entries).toHaveLength(1);
      // The encoder verifies its own backup before download. Check it contains
      // the full-length binary base64, not a truncated placeholder.
      expect(JSON.stringify(exported).length).toBeGreaterThan(size);
      const state = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('coding-v2-documents');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const transaction = db.transaction('assets', 'readonly');
        const assets = await new Promise<Array<{ image: { blob: Blob } }>>((resolve, reject) => {
          const req = transaction.objectStore('assets').getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        const blob = assets[0].image.blob;
        const first = new Uint8Array(await blob.slice(0, 1).arrayBuffer())[0];
        const last = new Uint8Array(await blob.slice(blob.size - 1).arrayBuffer())[0];
        return { size: blob.size, first, last };
      });
      expect(state).toEqual({ size, first: 17, last: 237 });
    } finally {
      await context.close();
    }
  }
});

test('Fase 3.3: preserva banco v1 e blobs embutidos durante upgrade e renomeação', async ({ page }) => {
  await page.goto('/apps/etiquetas/');
  await page.evaluate(async () => {
    const request = indexedDB.open('coding-v2-documents', 1);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('copies', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('copies', 'readwrite');
        tx.objectStore('copies').add({
          id: 'copy-v1', legacyId: 'legacy-v1', source: 'backup',
          label: 'Cópia antiga', revision: 1,
          createdAt: 1700000000000, updatedAt: 1700000000000,
          snapshot: {
            source: 'backup',
            doc: { id: 'legacy-v1', type: 'images', state: { name: 'Cópia antiga' } },
            images: [{
              id: 'image-v1', docId: 'legacy-v1',
              blob: new Blob([new Uint8Array([15, 40, 60, 255])], { type: 'image/png' })
            }]
          }
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.goto('/launcher/#/documentos');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await page.locator('[data-copy-card]', { hasText: 'Cópia antiga' }).click();
  await page.getByRole('button', { name: 'Renomear cópia de Cópia antiga' }).click();
  await page.getByRole('textbox', { name: 'Novo nome da cópia' }).fill('Cópia preservada');
  await page.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.getByTestId('v2-copies')).toContainText('Cópia preservada');
  const migrated = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('coding-v2-documents', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const one = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const [copy, assets] = await Promise.all([
      one(tx.objectStore('copies').get('copy-v1')),
      one(tx.objectStore('assets').getAll())
    ]);
    const record = copy as { revision: number; snapshot: { images: unknown[] } };
    const bin = new Uint8Array(await (assets[0] as { image: { blob: Blob } }).image.blob.arrayBuffer());
    db.close();
    return { version: db.version, revision: record.revision, embedded: record.snapshot.images.length, assets: assets.length, bytes: [...bin] };
  });
  expect(migrated).toEqual({ version: 2, revision: 2, embedded: 0, assets: 1, bytes: [15, 40, 60, 255] });
});
