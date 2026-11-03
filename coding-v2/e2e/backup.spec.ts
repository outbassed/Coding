import { test, expect } from '@playwright/test';

const SCHEMA = 'coding-v2-safe-backup';
function oldDoc(id: string, name: string, withImage = false) {
  return {
    source: 'backup', doc: { id, type: 'images', state: { name } },
    images: withImage ? [{
      id: id + '-image', docId: id, mime: 'image/webp',
      blob: { $codingV2BinaryType: 'blob', mime: 'image/webp', base64: Buffer.from([0, 1, 2, 250, 255]).toString('base64') }
    }] : []
  };
}
const oldArchive = (...entries: ReturnType<typeof oldDoc>[]) =>
  Buffer.from(JSON.stringify({ schema: SCHEMA, version: 1, entries }));
async function upload(page: import('@playwright/test').Page, data: Buffer) {
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: data
  });
}

test('importa backup v1 com blob, guarda imagens separadas e não duplica silenciosamente', async ({ page }) => {
  await page.goto('/launcher/#/documentos');
  const file = oldArchive(oldDoc('antigo-1', 'Meu backup', true));
  await upload(page, file);
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('v2-copies').getByText('Meu backup')).toBeVisible();
  const state = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('coding-v2-documents');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const fetch = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [copies, assets] = await Promise.all([
      fetch(tx.objectStore('copies').getAll()), fetch(tx.objectStore('assets').getAll())
    ]);
    db.close();
    const blob = (assets[0] as { image: { blob: Blob } }).image.blob;
    return {
      count: assets.length,
      embedded: (copies[0] as { snapshot: { images: unknown[] } }).snapshot.images.length,
      mime: blob.type,
      bytes: [...new Uint8Array(await blob.arrayBuffer())]
    };
  });
  expect(state).toEqual({ count: 1, embedded: 0, mime: 'image/webp', bytes: [0, 1, 2, 250, 255] });

  await upload(page, file);
  await expect(page.getByTestId('library-error')).toContainText(/Já existe uma cópia/);
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
});

test('importação de lote é atômica: uma duplicata no fim não grava a primeira entrada', async ({ page }) => {
  await page.goto('/launcher/#/documentos');
  await upload(page, oldArchive(oldDoc('persistente', 'Persistente')));
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await upload(page, oldArchive(oldDoc('nova-nao-deve-gravar', 'Não pode entrar'), oldDoc('persistente', 'Duplicado')));
  await expect(page.getByTestId('library-error')).toContainText(/Já existe uma cópia/);
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await expect(page.getByText('Não pode entrar')).toHaveCount(0);
});

test('exportação v2 restaura nome, revisão e dados binários numa origem limpa', async ({ page, browser }) => {
  await page.goto('/launcher/#/documentos');
  await upload(page, oldArchive(oldDoc('original', 'Nome de fábrica', true)));
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await page.locator('[data-copy-card]', { hasText: 'Nome de fábrica' }).click();
  await page.getByRole('button', { name: 'Renomear cópia de Nome de fábrica' }).click();
  await page.getByRole('textbox', { name: 'Novo nome da cópia' }).fill('Nome personalizado');
  await page.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.getByTestId('v2-copies').getByText('Nome personalizado')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar backup das cópias' }).click()
  ]);
  const stream = await download.createReadStream();
  const data: Buffer[] = [];
  for await (const chunk of stream) data.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const exported = Buffer.concat(data);
  expect(JSON.parse(exported.toString('utf8')).version).toBe(2);
  const clean = await browser.newContext();
  try {
    const other = await clean.newPage();
    await other.goto('/launcher/#/documentos');
    await upload(other, exported);
    await expect(other.getByTestId('v2-copies').getByText('Nome personalizado')).toBeVisible();
    await other.locator('[data-copy-card]', { hasText: 'Nome personalizado' }).click();
    await expect(other.getByTestId('details-panel')).toContainText(/Revisão\s*2/);

    const damaged = Buffer.from(exported.toString('utf8').replace('Nome personalizado', 'Nome adulterado'));
    await upload(other, damaged);
    await expect(other.getByTestId('library-error')).toContainText('SHA-256');
    await expect(other.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  } finally { await clean.close(); }
});
