import { test, expect } from '@playwright/test';

test('Fase 4: navegador gera pacote binário, verifica hash e preserva origem v2', async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto('/launcher/#/documentos');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite resolves /src paths in the browser; TS checks this file outside Vite.
    const { createCopy, getCopy } = await import('/src/storage/documents.ts');
    // @ts-expect-error Vite resolves /src paths in the browser; TS checks this file outside Vite.
    const { encodeSafeBackup, decodeBinaryPackage } = await import('/src/storage/archive-pack.ts');
    const total = 4 * 1024 * 1024 + 17;
    const chunks: Uint8Array[] = [];
    for (let size = 0; size < total; size += 65536) {
      const bytes = new Uint8Array(Math.min(65536, total - size));
      crypto.getRandomValues(bytes);
      chunks.push(bytes);
    }
    const original = new Blob(chunks.map((part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer), { type: 'image/png' });
    const sha256 = async (blob: Blob) => {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    };
    const docId = 'v2-labels-browser-pack';
    const record = await createCopy({
      source: 'v2',
      doc: { id: docId, type: 'labels', state: { name: 'Pacote do navegador' } },
      images: [{ id: 'photo', docId, blob: original }]
    });
    const stored = await getCopy(record.id);
    if (!stored) throw new Error('Cópia não gravada');
    const exported = await encodeSafeBackup([stored]);
    const [restored] = await decodeBinaryPackage(exported.blob);
    return {
      kind: exported.kind, extension: exported.extension,
      source: restored.source, snapshotSource: restored.snapshot.source,
      imageSize: restored.snapshot.images[0].blob?.size,
      before: await sha256(original), after: await sha256(restored.snapshot.images[0].blob!)
    };
  });
  expect(result.kind).toBe('binary');
  expect(result.extension).toBe('.codingpack');
  expect(result.source).toBe('v2');
  expect(result.snapshotSource).toBe('v2');
  expect(result.imageSize).toBe(4 * 1024 * 1024 + 17);
  expect(result.before).toBe(result.after);
});
