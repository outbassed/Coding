import type { Page } from '@playwright/test';

/**
 * Registra aplicativos como "instalados offline" só no registro do navegador (banco `coding-v2-offline`);
 * nenhum arquivo é baixado e nenhum dado de pessoas é tocado. Deixa a página no Launcher, recarregada.
 */
export async function seedInstalledApps(page: Page, ids: string[] | 'all' = 'all'): Promise<void> {
  await page.goto('/launcher/');
  await page.evaluate(async (wanted) => {
    const manifest = (await (await fetch('/offline-manifest.json', { cache: 'no-store' })).json()) as { apps: Record<string, { name: string; version: string }> };
    const list = wanted === 'all' ? Object.keys(manifest.apps) : wanted;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('coding-v2-offline', 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('records')) open.result.createObjectStore('records', { keyPath: 'id' }); };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('records', 'readwrite');
        for (const id of list) {
          const entry = manifest.apps[id];
          if (entry) tx.objectStore('records').put({ id, name: entry.name, version: entry.version, files: [], bytes: 0, installedAt: Date.now() });
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => reject(tx.error);
      };
    });
  }, ids);
  await page.reload();
}
