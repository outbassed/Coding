import { createHash } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';

/* Ícones da PWA com endereço versionado por conteúdo (scripts/brand-assets.ts) e manifesto ligado em todas as páginas. */
const PAGES = ['/', '/launcher/', '/versoes/', '/apps/texto/', '/apps/versos/', '/versos/'];
const HASHED = /^\/brand\/h\/[0-9a-f]{10}\/[a-z0-9-]+\.(?:png|svg|ico)$/;

async function declared(request: APIRequestContext, page: string) {
  const html = await (await request.get(page)).text();
  const href = (re: RegExp) => re.exec(html)?.[1];
  return {
    manifest: href(/<link rel="manifest" href="([^"]+)"/),
    ico: href(/<link rel="icon" href="([^"]+\.ico)"/),
    svg: href(/<link rel="icon" href="([^"]+\.svg)"/),
    apple: href(/<link rel="apple-touch-icon" href="([^"]+)"/),
    counts: { manifest: (html.match(/rel="manifest"/g) ?? []).length, icon: (html.match(/rel="icon"/g) ?? []).length, apple: (html.match(/rel="apple-touch-icon"/g) ?? []).length }
  };
}
const sha10 = (body: Buffer) => createHash('sha256').update(body).digest('hex').slice(0, 10);

test.describe('Ícones versionados da PWA', () => {
  test('toda página declara manifesto, favicon e ícone de toque com endereço versionado, uma vez', async ({ request }) => {
    const first = await declared(request, PAGES[0]!);
    for (const page of PAGES) {
      const d = await declared(request, page);
      expect(d.manifest, page).toBe('/manifest.webmanifest');
      for (const href of [d.ico, d.svg, d.apple]) expect(href, page).toMatch(HASHED);
      expect(d.counts, page).toEqual({ manifest: 1, icon: 2, apple: 1 });
      expect(d, page).toEqual(first); // o mesmo conjunto em todas as páginas
    }
  });

  test('cada arquivo declarado existe, e o hash no endereço é o hash dos bytes entregues', async ({ request }) => {
    const d = await declared(request, '/launcher/');
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { id: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
    const urls = [d.ico!, d.svg!, d.apple!, ...manifest.icons.map((i) => i.src)];
    for (const url of urls) {
      expect(url).toMatch(HASHED);
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      expect(sha10(await response.body()), url).toBe(url.split('/')[3]);
    }
    for (const icon of manifest.icons) {
      const type = (await request.get(icon.src)).headers()['content-type'] ?? '';
      expect(type, icon.src).toContain(icon.type);
    }
  });

  test('o manifesto continua instalável: id do Coding 1.0, 192, 512 e adaptável', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json() as Record<string, unknown> & { icons: { sizes: string; purpose?: string }[] };
    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('Coding Launcher');
    expect(manifest.short_name).toBe('Coding');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/launcher/');
    expect(manifest.scope).toBe('/');
    expect(manifest.theme_color).toBe('#171c24');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  test('/favicon.ico continua existindo (navegadores pedem sozinho) e é o mesmo desenho do versionado', async ({ request }) => {
    const d = await declared(request, '/launcher/');
    const plain = await (await request.get('/favicon.ico')).body();
    const hashed = await (await request.get(d.ico!)).body();
    expect(plain.equals(hashed)).toBe(true);
  });

  test('o Chrome não aponta problema de manifesto nem de ícone para a página inicial do app', async ({ page }) => {
    await page.goto('/launcher/');
    const client = await page.context().newCDPSession(page);
    const { installabilityErrors } = await client.send('Page.getInstallabilityErrors') as { installabilityErrors: { errorId: string }[] };
    const relevant = installabilityErrors.filter((e) => /manifest|icon|start-url|ids-do-not/i.test(e.errorId));
    console.log('::notice::Erros de instalabilidade informados pelo Chrome: ' + JSON.stringify(installabilityErrors.map((e) => e.errorId)));
    expect(relevant).toEqual([]);
  });

  test('o pacote offline lista o manifesto e os ícones com hash, sem endereços de ícone antigos', async ({ request }) => {
    const offline = await (await request.get('/offline-manifest.json')).json() as { core: { files: { path: string; sha256: string }[] } };
    const paths = offline.core.files.map((f) => f.path);
    expect(paths).toContain('/manifest.webmanifest');
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { icons: { src: string }[] };
    for (const icon of manifest.icons) expect(paths, icon.src).toContain(icon.src);
    expect(paths).not.toContain('/brand/icon-192.png');
    const entry = offline.core.files.find((f) => f.path === '/manifest.webmanifest')!;
    expect(createHash('sha256').update(await (await request.get('/manifest.webmanifest')).body()).digest('hex')).toBe(entry.sha256);
  });

  test('abrir o Launcher não mexe nos dados locais nem registra service worker sozinho', async ({ page }) => {
    await page.goto('/launcher/');
    await page.evaluate(async () => {
      localStorage.setItem('probe-pwa', 'intacto');
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open('probe-pwa-db', 1); open.onupgradeneeded = () => open.result.createObjectStore('s'); open.onsuccess = () => { const tx = open.result.transaction('s', 'readwrite'); tx.objectStore('s').put('ok', 'k'); tx.oncomplete = () => { open.result.close(); resolve(); }; }; open.onerror = () => reject(open.error); });
    });
    await page.reload();
    await page.goto('/versoes/');
    await page.goto('/launcher/');
    const state = await page.evaluate(async () => ({
      ls: localStorage.getItem('probe-pwa'),
      idb: await new Promise<string>((resolve) => { const open = indexedDB.open('probe-pwa-db'); open.onsuccess = () => { const get = open.result.transaction('s').objectStore('s').get('k'); get.onsuccess = () => { open.result.close(); resolve(String(get.result)); }; }; open.onerror = () => resolve('erro'); }),
      workers: (await navigator.serviceWorker.getRegistrations()).length
    }));
    expect(state).toEqual({ ls: 'intacto', idb: 'ok', workers: 0 });
  });
});
