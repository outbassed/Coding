import { test, expect, type Download, type Page } from '@playwright/test';

const SCHEMA = 'coding-v2-safe-backup';
const doc = (id: string, name: string, type: string, withImage: boolean) => ({
  source: 'backup',
  doc: { id, type, state: { name } },
  images: withImage ? [{ id: id + '-img', docId: id, mime: 'image/webp', blob: { $codingV2BinaryType: 'blob', mime: 'image/webp', base64: Buffer.from([9, 8, 7, 250, 0, 1]).toString('base64') } }] : []
});
const archive = Buffer.from(JSON.stringify({ schema: SCHEMA, version: 1, entries: [doc('z1', 'Foto do ZIP', 'images', true), doc('z2', 'Texto do ZIP', 'texts', false), doc('z3', 'Etiquetas do ZIP', 'labels', false)] }));

async function importFile(page: Page, bytes: Buffer, filename: string, mime: string): Promise<void> {
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: filename, mimeType: mime, buffer: bytes });
}
async function bytesOf(download: Download): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of await download.createReadStream()) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  return Buffer.concat(parts);
}

test('backup em ZIP: baixa, abre como ZIP de verdade, restaura em outro navegador e recusa arquivo adulterado', async ({ page, browser }) => {
  await page.goto('/launcher/#/documentos');
  await importFile(page, archive, 'backup.json', 'application/json');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(3);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-zip').click()]);
  expect(download.suggestedFilename()).toMatch(/^coding-v2-backup-todos-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = await bytesOf(download);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.includes(Buffer.from('manifesto.json'))).toBe(true);
  expect(zip.includes(Buffer.from('LEIAME.txt'))).toBe(true);

  const ctx = await browser.newContext();
  try {
    const other = await ctx.newPage();
    await other.goto('/launcher/#/documentos');
    await importFile(other, zip, 'meu-backup.zip', 'application/zip');
    await expect(other.getByTestId('v2-copies').locator('li')).toHaveCount(3);
    await expect(other.getByTestId('v2-copies').getByText('Foto do ZIP')).toBeVisible();
    const images = await other.evaluate(async () => {
      const open = indexedDB.open('coding-v2-documents');
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      try {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        const rows = await new Promise<Array<{ image: { blob: Blob } }>>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        return Promise.all(rows.map(async (r) => [...new Uint8Array(await r.image.blob.arrayBuffer())]));
      } finally { db.close(); }
    });
    expect(images).toEqual([[9, 8, 7, 250, 0, 1]]);

    // Importar de novo não duplica nem sobrescreve: ids existentes são recusados, tudo ou nada.
    await importFile(other, zip, 'repetido.zip', 'application/zip');
    await expect(other.getByTestId('library-error')).toContainText(/Já existe uma cópia/);
    await expect(other.getByTestId('v2-copies').locator('li')).toHaveCount(3);
  } finally { await ctx.close(); }

  const ctx2 = await browser.newContext();
  try {
    const third = await ctx2.newPage();
    await third.goto('/launcher/#/documentos');
    const tampered = Buffer.from(zip);
    // Altera o primeiro byte de dados do primeiro arquivo do ZIP (o manifesto): CRC-32 e SHA-256 não podem conferir.
    tampered[30 + tampered.readUInt16LE(26) + tampered.readUInt16LE(28)] ^= 0xff;
    await importFile(third, tampered, 'adulterado.zip', 'application/zip');
    await expect(third.getByTestId('library-error')).toContainText(/Importação não concluída/);
    await expect(third.getByTestId('copy-count')).not.toContainText('3 cópias');
    await importFile(third, Buffer.from('isto não é um zip, só texto'), 'falso.zip', 'application/zip');
    await expect(third.getByTestId('library-error')).toContainText(/Importação não concluída/);
  } finally { await ctx2.close(); }
});

test('backup em ZIP de um app só leva apenas os projetos daquele app', async ({ page }) => {
  await page.goto('/launcher/#/documentos');
  await importFile(page, archive, 'backup.json', 'application/json');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(3);
  await page.getByTestId('zip-scope').selectOption('texts');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-zip').click()]);
  expect(download.suggestedFilename()).toMatch(/^coding-v2-backup-texts-/);
  const zip = await bytesOf(download);
  expect(zip.includes(Buffer.from('imagens/000001.bin'))).toBe(false);
});
