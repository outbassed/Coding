import { expect, type Page } from '@playwright/test';

/** Quantidade de aplicativos do catálogo (cartões no Catálogo e no Início). */
export const APP_COUNT = 15;

export const SCHEMA = 'coding-v2-safe-backup';
export function backupDoc(id: string, name: string, opts: { type?: string; image?: boolean; updatedAt?: number } = {}) {
  return {
    source: 'backup', doc: { id, type: opts.type ?? 'images', updatedAt: opts.updatedAt, state: { name } },
    images: opts.image ? [{
      id: id + '-image', docId: id, mime: 'image/webp',
      blob: { $codingV2BinaryType: 'blob', mime: 'image/webp', base64: Buffer.from([0, 1, 2, 250, 255]).toString('base64') }
    }] : []
  };
}
export const backupFile = (...entries: ReturnType<typeof backupDoc>[]) =>
  Buffer.from(JSON.stringify({ schema: SCHEMA, version: 1, entries }));

export async function uploadBackup(page: Page, data: Buffer): Promise<void> {
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: data });
}

export async function seedLegacy(page: Page): Promise<void> {
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

/** Lê o banco das cópias v2 diretamente, para provar o que realmente foi gravado. */
export async function readCopiesDb(page: Page): Promise<{ labels: string[]; revisions: number[]; assets: { copyId: string; bytes: number[] }[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('coding-v2-documents'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const all = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const copies = (await all(tx.objectStore('copies').getAll())) as { label: string; revision: number }[];
    const assets = (await all(tx.objectStore('assets').getAll())) as { copyId: string; image: { blob: Blob } }[];
    const out = [];
    for (const asset of assets) out.push({ copyId: asset.copyId, bytes: [...new Uint8Array(await asset.image.blob.arrayBuffer())] });
    db.close();
    return { labels: copies.map((c) => c.label).sort(), revisions: copies.map((c) => c.revision), assets: out };
  });
}

/** Fluxo completo do assistente: examinar, selecionar pelos nomes e confirmar. */
export async function importFromLegacy(page: Page, names: string[]): Promise<void> {
  await page.getByTestId('open-import').click();
  await page.getByRole('button', { name: 'Examinar documentos anteriores' }).click();
  for (const name of names) await page.getByRole('checkbox', { name: name }).check();
  await page.getByRole('button', { name: /^Continuar/ }).click();
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('wizard-result')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
}

export async function openCard(page: Page, name: string): Promise<void> {
  await page.locator('[data-copy-card]', { hasText: name }).click();
}
