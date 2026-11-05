import { test, expect, type Page } from '@playwright/test';
import { APP_COUNT } from './helpers';

/* Identidade oficial (CD · Negativo): marca única do Coding e do Launcher, em todos os pontos globais. Os ícones dos apps não mudam. */
const BRAND_SVGS = ['icon', 'icon-light', 'icon-dark', 'icon-maskable', 'favicon', 'symbol', 'symbol-white', 'logo-horizontal-light', 'logo-horizontal-dark', 'splash-light', 'splash-dark'];
const BRAND_PNGS = ['icon-192', 'icon-512', 'icon-maskable-512', 'apple-touch-icon', 'favicon-16', 'favicon-32'];
const loaded = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);

test.describe('Arquivos da marca', () => {
  test('SVGs são vetoriais de verdade: sem imagem embutida, sem script e sem fontes', async ({ request }) => {
    for (const name of BRAND_SVGS) {
      const response = await request.get('/brand/' + name + '.svg');
      expect(response.status(), name).toBe(200);
      const source = await response.text();
      expect(source, name).toContain('<svg');
      expect(source, name).toContain('viewBox=');
      expect(source, name).toMatch(/<path /);
      expect(source, name).not.toMatch(/<image|data:image|<script|<text|font-family|href="http/);
    }
  });

  test('PNGs e favicon.ico existem e têm o formato certo', async ({ request }) => {
    for (const name of BRAND_PNGS) {
      const response = await request.get('/brand/' + name + '.png');
      expect(response.status(), name).toBe(200);
      const body = await response.body();
      expect([...body.subarray(0, 4)], name).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const size = Number(name.match(/-(\d+)$/)?.[1] ?? (name === 'apple-touch-icon' ? 180 : 0));
      if (size) { expect(body.readUInt32BE(16), name).toBe(size); expect(body.readUInt32BE(20), name).toBe(size); }
    }
    const ico = await (await request.get('/favicon.ico')).body();
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(3);
  });

  test('manifesto aponta só para ícones da marca nova, e todos existem', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { icons: { src: string; sizes: string; purpose?: string }[] };
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/brand/'), icon.src).toBe(true);
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
  });

  test('o ícone de documento antigo saiu do conjunto global', async ({ request }) => {
    const icon = await (await request.get('/brand/icon.svg')).text();
    expect(icon).not.toContain('#3f63a8');
    expect(icon).not.toContain('M168 96h120l72 72');
  });
});

test.describe('Legibilidade em tamanhos pequenos', () => {
  for (const file of ['favicon', 'icon']) {
    for (const px of [16, 32, 64, 128]) {
      test(`${file}.svg a ${px} px mantém o D branco sobre o azul e o corte em gelo`, async ({ page, request }) => {
        const svg = await (await request.get('/brand/' + file + '.svg')).text();
        await page.goto('/launcher/');
        const r = await page.evaluate(async ([markup, size]) => {
          const im = new Image();
          im.src = 'data:image/svg+xml;base64,' + btoa(markup as string);
          await im.decode();
          const n = size as number;
          const c = document.createElement('canvas'); c.width = c.height = n;
          const x = c.getContext('2d')!; x.drawImage(im, 0, 0, n, n);
          const d = x.getImageData(0, 0, n, n).data;
          let white = 0, blue = 0, ice = 0, clear = 0;
          for (let i = 0; i < d.length; i += 4) {
            const [r0, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
            if (a < 128) clear++;
            else if (r0 > 225 && g > 225 && b > 225) white++;
            else if (r0 < 140 && b > 150 && g < 170) blue++;
            else if (g > 200 && b > 230 && r0 < 190) ice++;
          }
          return { white: white / (n * n), blue: blue / (n * n), ice: ice / (n * n), clear: clear / (n * n) };
        }, [svg, px] as const);
        expect(r.white).toBeGreaterThan(0.08);
        expect(r.blue).toBeGreaterThan(0.4);
        expect(r.clear).toBeLessThan(0.12);
        if (px >= 32) expect(r.ice).toBeGreaterThan(0.01);
      });
    }
  }
});

test.describe('A marca nova nos pontos globais', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`cabeçalho e Início do Launcher (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/launcher/#/inicio');
      const mark = page.locator('header.top img.mark');
      await expect(mark).toHaveAttribute('src', '/brand/icon.svg');
      await expect.poll(() => loaded(page, 'header.top img.mark')).toBe(true);
      expect(Math.round((await mark.boundingBox())!.width)).toBe(34);
      const title = page.locator('#page-title img.logo');
      await expect(title).toHaveAttribute('src', '/brand/icon.svg');
      await expect.poll(() => loaded(page, '#page-title img.logo')).toBe(true);
    });
  }

  test('favicon e ícone de toque declarados no Launcher, na abertura e na Central de Versões', async ({ page }) => {
    for (const url of ['/launcher/', '/versoes/']) {
      await page.goto(url);
      await expect(page.locator('link[rel="icon"][href="/brand/favicon.svg"]')).toHaveCount(1);
      await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
      await expect(page.locator('link[rel="apple-touch-icon"][href="/brand/apple-touch-icon.png"]')).toHaveCount(1);
    }
    const html = await (await page.request.get('/')).text();
    expect(html).toContain('href="/brand/favicon.svg"');
    expect(html).toContain('href="/brand/apple-touch-icon.png"');
  });

  test('Central de Versões usa a marca nova no cabeçalho e no menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/versoes/');
    await expect(page.locator('header.top img.mark')).toHaveAttribute('src', '/brand/icon.svg');
    await expect.poll(() => loaded(page, 'header.top img.mark')).toBe(true);
    await expect(page.locator('img.lmark').first()).toHaveAttribute('src', '/brand/icon.svg');
  });

  test('Ajustes → Sobre mostra a marca nova', async ({ page }) => {
    await page.goto('/launcher/#/ajustes?aba=sobre');
    const about = page.getByTestId('settings-panel').locator('img[src="/brand/icon.svg"]');
    await expect(about).toBeVisible();
    await expect.poll(() => about.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  });

  test('tela de abertura usa a marca nova e ela carrega', async ({ page }) => {
    await page.route((url) => url.pathname === '/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<script>[^<]*location\.replace[^<]*<\/script>/, '').replace(/<noscript>[\s\S]*?<\/noscript>/, '');
      await route.fulfill({ response, body, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) } });
    });
    await page.goto('/');
    await expect(page.getByTestId('splash').locator('img.logo')).toHaveAttribute('src', '/brand/icon.svg');
    await expect.poll(() => loaded(page, '[data-testid="splash"] img.logo')).toBe(true);
  });

  test('os ícones dos aplicativos continuam os mesmos', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    const imgs = page.locator('article.card [data-testid="app-icon"] img');
    await expect(imgs).toHaveCount(APP_COUNT);
    const sources = await imgs.evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute('src')));
    for (const name of ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split', 'calculator', 'colors', 'zip', 'compare', 'code', 'viewer', 'paint', 'versos']) {
      expect(sources).toContain('/legacy-icons/' + name + '.svg');
    }
    expect(sources.some((s) => s?.startsWith('/brand/'))).toBe(false);
  });
});
