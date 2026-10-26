import { expect, test } from '@playwright/test';

/* Todos os apps em todas as larguras pedidas: sem rolagem horizontal da página, controles dentro da tela e ferramentas no lugar certo. */
const APPS = [
  '/apps/etiquetas/', '/apps/texto/', '/apps/planilhas/', '/apps/imagens/', '/apps/pdf/', '/apps/qr/', '/apps/sorteio/',
  '/apps/racha-conta/', '/apps/calculadora/', '/apps/cores/', '/apps/zip/', '/apps/comparador/', '/apps/codigo/', '/apps/visualizador/', '/apps/pintar/'
];
/** Etiquetas e Texto têm editor próprio, sem o painel padrão: só a página inteira é verificada. */
const OWN_LAYOUT = new Set(['/apps/etiquetas/', '/apps/texto/']);
const WIDTHS = [320, 375, 390, 430, 600, 768, 1024, 1280];

/** Controles visíveis que escapam da tela sem estarem dentro de uma área com rolagem própria. */
function escapedControls(): { name: string; left: number; right: number }[] {
  const out: { name: string; left: number; right: number }[] = [];
  const scrolls = (el: Element): boolean => {
    for (let p: Element | null = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  };
  for (const el of Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || el.closest('.sr-only')) continue;
    if (r.left < -1 || r.right > window.innerWidth + 1) {
      if (scrolls(el)) continue;
      out.push({ name: (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  return out;
}

test.describe('Responsivo · todos os apps', () => {
  for (const width of WIDTHS) {
    test('largura ' + width, async ({ page }) => {
      test.setTimeout(120_000);
      const height = width >= 900 ? 800 : 844;
      await page.setViewportSize({ width, height });
      for (const url of APPS) {
        await page.goto(url);
        if (OWN_LAYOUT.has(url)) {
          await page.waitForLoadState('networkidle');
          await expect(page.locator('#app button').first(), url).toBeVisible();
        } else await expect(page.getByTestId('editor-tabs').first(), url).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(overflow, url + ' rolagem horizontal').toBeLessThanOrEqual(0);
        if (!OWN_LAYOUT.has(url)) {
          const tabs = (await page.getByTestId('editor-tabs').first().boundingBox())!;
          expect.soft(tabs.x, url).toBeGreaterThanOrEqual(-1);
          expect.soft(tabs.x + tabs.width, url).toBeLessThanOrEqual(width + 1);
          expect.soft(tabs.y + tabs.height, url).toBeLessThanOrEqual(height + 1);
        }
        const escaped = await page.evaluate(escapedControls);
        expect.soft(escaped, url + ' controles fora da tela').toEqual([]);
      }
    });
  }
});
