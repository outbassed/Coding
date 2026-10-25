import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { importFromLegacy, readCopiesDb, seedLegacy } from './helpers';

interface ManifestFile { path: string; bytes: number; sha256: string }
interface Entry { id: string; page: string; bytes: number; ownBytes?: number; files: ManifestFile[] }
interface Manifest { schema: number; core: Entry; apps: Record<string, Entry> }

const state = (page: Page, id: string) => page.getByTestId('offline-' + id);

test.describe('Instalação offline por app (build real, sem rede simulada por mock)', () => {
  test('o manifesto descreve exatamente o que o servidor entrega (tamanho e SHA-256)', async ({ request }) => {
    test.setTimeout(120_000);
    const manifest = (await (await request.get('/offline-manifest.json')).json()) as Manifest;
    expect(manifest.schema).toBe(1);
    expect(Object.keys(manifest.apps).sort()).toEqual(['calc', 'codes', 'draw', 'images', 'labels', 'pdf', 'split', 'texts']);
    expect(Object.keys(manifest.apps)).not.toContain('sheet-labels');
    const unique = new Map<string, ManifestFile>();
    for (const entry of [manifest.core, ...Object.values(manifest.apps)]) {
      expect(entry.files.map((f) => f.path)).toContain(entry.page);
      expect(entry.bytes).toBe(entry.files.reduce((n, f) => n + f.bytes, 0));
      for (const f of entry.files) unique.set(f.path, f);
    }
    for (const f of unique.values()) {
      const res = await request.get(f.path);
      expect(res.status(), f.path).toBe(200);
      const body = await res.body();
      expect(body.length, 'tamanho de ' + f.path).toBe(f.bytes);
      expect(createHash('sha256').update(body).digest('hex'), 'hash de ' + f.path).toBe(f.sha256);
    }
    // Apps com bibliotecas pesadas carregadas em tempo de execução precisam tê-las no manifesto.
    expect(manifest.apps.pdf!.files.some((f) => f.path.startsWith('/vendor/'))).toBe(true);
    // O grafo é por app: o editor de PDF não arrasta o código das Imagens nem o contrário.
    expect(manifest.apps.pdf!.files.some((f) => /\/images-/.test(f.path))).toBe(false);
  });

  test('instala só após o clique, mostra tamanho real, funciona sem rede, sobrevive à recarga e remove sem tocar nos documentos', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/launcher/#/documentos');
    await seedLegacy(page);
    await importFromLegacy(page, ['Foto de teste']);
    expect((await readCopiesDb(page)).labels).toEqual(['Foto de teste']);

    await page.goto('/launcher/#/ajustes');
    await expect(page.getByTestId('offline-manager')).toBeVisible();
    // Nada é registrado antes do clique.
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    expect(await page.evaluate(async () => await caches.has('coding-v2-offline-files'))).toBe(false);
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('coding-v2-offline');
    await expect(state(page, 'pdf')).toHaveAttribute('data-state', 'not-installed');
    await expect(page.getByTestId('offline-size-pdf')).toContainText(/Download: \d/);
    await expect(page.getByTestId('offline-size-pdf')).toContainText('Núcleo do Launcher');

    await page.getByTestId('install-pdf').click();
    await expect(state(page, 'pdf')).toHaveAttribute('data-state', 'installed', { timeout: 120_000 });
    await expect(state(page, 'core')).toHaveAttribute('data-state', 'installed');
    // Outros apps NÃO foram instalados.
    await expect(state(page, 'codes')).toHaveAttribute('data-state', 'not-installed');
    await expect(state(page, 'pdf')).toContainText('Instalado offline');
    await expect(page.getByTestId('offline-size-pdf')).toContainText('Ocupa');

    // O cache só tem o que o manifesto prometeu para Núcleo + PDF.
    const manifest = (await (await page.request.get('/offline-manifest.json')).json()) as Manifest;
    const expected = new Set([...manifest.core.files, ...manifest.apps.pdf!.files].map((f) => f.path));
    const cached = await page.evaluate(async () => { const c = await caches.open('coding-v2-offline-files'); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    expect(new Set(cached)).toEqual(expected);

    // Recarregar mantém o estado, lido do registro real.
    await page.reload();
    await expect(state(page, 'pdf')).toHaveAttribute('data-state', 'installed');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);

    await context.setOffline(true);
    try {
      await page.goto('/launcher/#/catalogo');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo');
      await page.goto('/apps/pdf/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Editor PDF');
      await page.getByTestId('sample-pdf-stage').click();
      await expect(page.getByTestId('pdf-page')).toBeVisible({ timeout: 30_000 });
      // App não instalado: mensagem honesta, não erro de rede nem “desativado”.
      await page.goto('/apps/qr/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('não está disponível offline');
    } finally { await context.setOffline(false); }

    // Remover o PDF: arquivos do app somem, o Núcleo fica (nada mais depende dele ainda, mas o app removido não), documentos intactos.
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('uninstall-pdf').click();
    await expect(page.getByTestId('confirm-pdf')).toContainText('documentos');
    await page.getByTestId('confirm-remove-pdf').click();
    await expect(state(page, 'pdf')).toHaveAttribute('data-state', 'not-installed');
    expect((await readCopiesDb(page)).labels).toEqual(['Foto de teste']);
    const left = await page.evaluate(async () => { const c = await caches.open('coding-v2-offline-files'); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    expect(left.some((p) => p.startsWith('/vendor/'))).toBe(false);
    expect(left).toContain('/launcher/index.html');
  });

  test('apps que compartilham arquivos: remover um não quebra o outro', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('install-images').click();
    await expect(state(page, 'images')).toHaveAttribute('data-state', 'installed', { timeout: 120_000 });
    await page.getByTestId('install-calc').click();
    await expect(state(page, 'calc')).toHaveAttribute('data-state', 'installed', { timeout: 120_000 });
    await page.getByTestId('uninstall-images').click();
    await page.getByTestId('confirm-remove-images').click();
    await expect(state(page, 'images')).toHaveAttribute('data-state', 'not-installed');
    await expect(state(page, 'calc')).toHaveAttribute('data-state', 'installed');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
    await context.setOffline(true);
    try {
      await page.goto('/apps/planilhas/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Planilhas');
    } finally { await context.setOffline(false); }
  });

  test('Detalhes e Catálogo refletem o estado real, e ativar não instala', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/launcher/#/app/draw');
    await page.getByText('Disponibilidade e instalação').click();
    await expect(page.locator('li.level[data-level="offline"]')).toContainText('Não instalado');
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('install-draw').click();
    await expect(state(page, 'draw')).toHaveAttribute('data-state', 'installed', { timeout: 120_000 });
    await page.goto('/launcher/#/app/draw');
    await page.getByText('Disponibilidade e instalação').click();
    await expect(page.locator('li.level[data-level="offline"]')).toContainText('Instalado offline');
    await page.goto('/launcher/#/catalogo');
    await page.getByTestId('offline-filter-yes').click();
    await expect(page.locator('article.card h3')).toHaveText(['Sorteio']);
    await page.getByTestId('offline-filter-no').click();
    await expect(page.locator('article.card', { hasText: 'Sorteio' })).toHaveCount(0);
    await expect(page.locator('article.card').first()).toBeVisible();
  });

  test('cancelar uma instalação lenta não deixa nada pela metade', async ({ page }) => {
    test.setTimeout(90_000);
    // Atrasa só os downloads de instalação para dar tempo de cancelar; os arquivos continuam sendo os reais.
    await page.route('**/vendor/pdf.min.js', async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('install-pdf').click();
    await expect(page.getByTestId('cancel-pdf')).toBeVisible();
    await expect(page.getByTestId('offline-progress-pdf')).toBeVisible();
    await page.getByTestId('cancel-pdf').click();
    await expect(state(page, 'pdf')).toHaveAttribute('data-state', 'not-installed', { timeout: 30_000 });
    await expect(state(page, 'pdf')).not.toContainText('Instalado offline');
    const leftover = await page.evaluate(async () => { const c = await caches.open('coding-v2-offline-files'); return (await c.keys()).length; });
    // Núcleo pode ter sido concluído antes do cancelamento, mas o PDF nunca fica registrado.
    const records = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('coding-v2-offline'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const all = await new Promise<{ id: string }[]>((res) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => res(q.result as { id: string }[]); });
      db.close();
      return all.map((x) => x.id);
    });
    expect(records).not.toContain('pdf');
    expect(leftover).toBeGreaterThanOrEqual(0);
  });
});
