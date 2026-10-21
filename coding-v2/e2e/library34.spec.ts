import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, importFromLegacy, openCard, readCopiesDb, seedLegacy, uploadBackup } from './helpers';

const URL = '/launcher/#/documentos';

/** Conta quantas vezes o código lê blobs do object store `assets` (getAll em store ou índice). */
async function countAssetReads(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __assetReads: number };
    w.__assetReads = 0;
    const wrap = (proto: { getAll: (...a: unknown[]) => unknown }, storeName: (self: unknown) => string) => {
      const original = proto.getAll;
      proto.getAll = function (this: unknown, ...args: unknown[]) {
        if (storeName(this) === 'assets') w.__assetReads += 1;
        return original.apply(this, args);
      };
    };
    wrap(IDBObjectStore.prototype as never, (self) => (self as IDBObjectStore).name);
    wrap(IDBIndex.prototype as never, (self) => (self as IDBIndex).objectStore.name);
  });
}
const reads = (page: Page) => page.evaluate(() => (window as unknown as { __assetReads: number }).__assetReads);

test.describe('Fase 3.4 · lista só com metadados', () => {
  test('listar não lê blobs; exportar lê só a cópia pedida; detalhes mostram o tamanho', async ({ page }) => {
    await countAssetReads(page);
    await page.goto(URL);
    await uploadBackup(page, backupFile(backupDoc('d1', 'Com foto', { image: true }), backupDoc('d2', 'Sem foto')));
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    expect(await reads(page)).toBe(0);
    await expect(page.locator('[data-copy-card]', { hasText: 'Com foto' })).toContainText('1 imagem');
    await openCard(page, 'Com foto');
    await expect(page.getByTestId('details-panel')).toContainText('1 imagem (5 B)');
    await openCard(page, 'Sem foto');
    await expect(page.getByTestId('details-panel')).toContainText('sem imagens');
    expect(await reads(page)).toBe(0);
    await openCard(page, 'Com foto');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar cópia de Com foto' }).click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toContain(Buffer.from([0, 1, 2, 250, 255]).toString('base64'));
    expect(await reads(page)).toBeGreaterThan(0);
  });

  test('cópia no formato v1 (imagens embutidas) aparece na lista e exporta os bytes', async ({ page }) => {
    await page.goto('/apps/etiquetas/');
    await page.evaluate(async () => {
      const request = indexedDB.open('coding-v2-documents', 1);
      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => { request.result.createObjectStore('copies', { keyPath: 'id' }); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('copies', 'readwrite');
          tx.objectStore('copies').add({
            id: 'v1a', legacyId: 'l1', source: 'backup', label: 'Antiga A', revision: 1, createdAt: 1, updatedAt: 5,
            snapshot: { source: 'backup', doc: { id: 'l1', type: 'images' }, images: [
              { id: 'i1', docId: 'l1', blob: new Blob([new Uint8Array([1, 2, 3])]) }, { id: 'i2', docId: 'l1', blob: new Blob([new Uint8Array([4, 5])]) }] }
          });
          tx.objectStore('copies').add({
            id: 'v1b', legacyId: 'l2', source: 'backup', label: 'Antiga B', revision: 1, createdAt: 1, updatedAt: 4,
            snapshot: { source: 'backup', doc: { id: 'l2', type: 'labels' }, images: [] }
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.goto(URL);
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    await openCard(page, 'Antiga A');
    await expect(page.getByTestId('details-panel')).toContainText('2 imagens (5 B)');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar cópia de Antiga A' }).click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toContain(Buffer.from([1, 2, 3]).toString('base64'));
    expect(text).toContain(Buffer.from([4, 5]).toString('base64'));
  });
});

test.describe('Fase 3.4 · importação em lote atômica', () => {
  test('cria todas juntas e informa o resultado único', async ({ page }) => {
    await page.goto(URL);
    await seedLegacy(page);
    await page.getByTestId('open-import').click();
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await page.getByRole('button', { name: 'Marcar todos os disponíveis' }).click();
    await page.getByRole('button', { name: /^Continuar \(2\)/ }).click();
    await expect(page.getByTestId('import-size')).toContainText('6 B');
    await page.getByTestId('confirm-import').click();
    await expect(page.getByTestId('import-outcome')).toContainText('2 cópia(s) criada(s)');
    await page.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    const db = await readCopiesDb(page);
    expect(db.labels).toEqual(['Caixas do estoque', 'Foto de teste']);
    expect(db.assets).toHaveLength(1);
  });

  test('duplicata criada em outra aba no meio do fluxo: nenhuma cópia é criada pelo lote', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const a = await context.newPage(); const b = await context.newPage();
      await a.goto(URL); await seedLegacy(a);
      await b.goto(URL);
      await a.getByTestId('open-import').click();
      await a.getByRole('button', { name: 'Examinar documentos antigos' }).click();
      await a.getByRole('button', { name: 'Marcar todos os disponíveis' }).click();
      await a.getByRole('button', { name: /^Continuar \(2\)/ }).click();
      await importFromLegacy(b, ['Foto de teste']);
      await a.getByTestId('confirm-import').click();
      const outcome = a.getByTestId('import-outcome');
      await expect(outcome).toContainText('Já existe uma cópia');
      await expect(outcome).toContainText('Nenhuma das 2 cópias foi criada');
      expect((await readCopiesDb(a)).labels).toEqual(['Foto de teste']);
      await a.getByRole('button', { name: 'Concluir' }).click();
      await expect(a.locator('[data-copy-card]')).toHaveCount(1);
    } finally { await context.close(); }
  });

  test('avisa antes de gravar quando as imagens não cabem no espaço estimado', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: {
        estimate: async () => ({ usage: 99, quota: 100 }), persisted: async () => false, persist: async () => false } });
    });
    await page.goto(URL);
    await seedLegacy(page);
    await page.getByTestId('open-import').click();
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await page.getByRole('checkbox', { name: 'Foto de teste' }).check();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await expect(page.getByTestId('space-warning')).toContainText('mais de 80% do espaço livre');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe('Fase 3.4 · espaço e armazenamento persistente', () => {
  test('mostra uso e cota; o pedido só acontece no clique e o resultado é anunciado', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __persistCalls: number }).__persistCalls = 0;
      Object.defineProperty(navigator, 'storage', { configurable: true, value: {
        estimate: async () => ({ usage: 2 * 1048576, quota: 200 * 1048576 }), persisted: async () => false,
        persist: async () => { (window as unknown as { __persistCalls: number }).__persistCalls += 1; return false; } } });
    });
    await page.goto(URL);
    await expect(page.getByTestId('storage-usage')).toContainText('2,0 MB');
    await expect(page.getByTestId('storage-usage')).toContainText('200,0 MB');
    expect(await page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls)).toBe(0);
    await page.getByTestId('ask-persist').click();
    await expect(page.getByTestId('persist-message')).toContainText('não concedeu');
    await expect(page.getByTestId('library-status')).toContainText('não concedeu');
    expect(await page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls)).toBe(1);
  });

  test('navegador real: o painel aparece sem erro e passa no axe', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('storage-panel')).toBeVisible();
    await expect(page.getByTestId('storage-usage')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  test.describe('celular 320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('painel de espaço sem rolagem horizontal', async ({ page }) => {
      await page.goto(URL);
      await expect(page.getByTestId('storage-panel')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
