import { test, expect } from '@playwright/test';

const SCHEMA = 'coding-v2-safe-backup';
const snapshot = (id: string, name: string) => ({
  source: 'backup',
  doc: { id, type: 'images', state: { name } },
  images: [{
    id: id + '-asset', docId: id, mime: 'image/webp',
    blob: {
      $codingV2BinaryType: 'blob', mime: 'image/webp',
      base64: Buffer.from([3, 17, 68, 255, 0]).toString('base64')
    }
  }]
});
const archive = Buffer.from(JSON.stringify({
  schema: SCHEMA, version: 1, entries: [snapshot('pacote-teste', 'Meu documento pacote')]
}));

async function importFile(page: import('@playwright/test').Page, bytes: Buffer, filename: string, mime: string) {
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: filename, mimeType: mime, buffer: bytes
  });
}
async function downloadBytes(download: import('@playwright/test').Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  return Buffer.concat(parts);
}

test('.codingpack exporta, verifica, restaura imagens e rejeita arquivo adulterado', async ({ page, browser }) => {
  await page.goto('/launcher/#/documentos');
  await importFile(page, archive, 'backup.json', 'application/json');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-codingpack').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.codingpack$/);
  const bytes = await downloadBytes(download);
  expect(bytes.subarray(0, 14).toString()).toBe('CODING-PACK-1\n');
  const size = bytes.readUInt32LE(14);
  expect(size).toBeGreaterThan(0);
  const header = JSON.parse(bytes.subarray(18, 18 + size).toString('utf8'));
  expect(header.format).toBe('coding-binary-backup');
  expect(header.assets).toHaveLength(1);

  const ctx = await browser.newContext();
  try {
    const other = await ctx.newPage();
    await other.goto('/launcher/#/documentos');
    await importFile(other, bytes, 'meu-backup.codingpack', 'application/octet-stream');
    await expect(other.getByTestId('v2-copies').getByText('Meu documento pacote')).toBeVisible();
    const images = await other.evaluate(async () => {
      const open = indexedDB.open('coding-v2-documents');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        const results = await new Promise<Array<{ image: { blob: Blob } }>>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return Promise.all(results.map(async (item) => [...new Uint8Array(await item.image.blob.arrayBuffer())]));
      } finally { db.close(); }
    });
    expect(images).toEqual([[3, 17, 68, 255, 0]]);

    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 1] ^= 0xff;
    await importFile(other, tampered, 'adulterado.codingpack', 'application/octet-stream');
    await expect(other.getByTestId('library-error')).toContainText('SHA-256');
    await expect(other.getByTestId('v2-copies').locator('li')).toHaveCount(1);
    await importFile(other, bytes, 'duplicado.codingpack', 'application/octet-stream');
    await expect(other.getByTestId('library-error')).toContainText(/Já existe uma cópia/);
    await expect(other.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  } finally { await ctx.close(); }
});
