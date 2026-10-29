import { test } from '@playwright/test';

/* TEMPORÁRIO: captura telas em baixa resolução e as devolve em pedaços nas mensagens de erro. Será removido. */
const shots: Record<string, string> = {};
const SPECS = [
  { name: 'm2', w: 390, h: 844, f: 0.55, scheme: 'dark' as const, url: '/apps/versos/?modelo=citacao', tab: 'Textos' },
  { name: 'd1', w: 1280, h: 720, f: 0.55, scheme: 'light' as const, url: '/apps/versos/?modelo=letra', tab: 'Textos' }
];
const CHUNK = 3800, CHUNKS = 6;

test('prepara capturas', async ({ browser }) => {
  for (const s of SPECS) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.f, colorScheme: s.scheme });
    const page = await ctx.newPage();
    await page.goto(s.url);
    await page.getByTestId('versos-canvas').waitFor();
    if (s.tab) {
      await page.getByTestId('editor-tabs').getByRole('tab', { name: s.tab, exact: true }).click();
      await page.getByTestId('text-pick').first().click().catch(() => undefined);
    }
    await page.waitForTimeout(1500);
    shots[s.name] = (await page.screenshot({ type: 'jpeg', quality: 30 })).toString('base64');
    await ctx.close();
  }
  for (const sp of SPECS) {
    const data = shots[sp.name] ?? '';
    for (let i = 0; i < Math.min(CHUNKS, Math.ceil(data.length / CHUNK)); i++) console.log('::notice title=S' + sp.name + i + '::SHOT:' + sp.name + ':' + i + ':' + data.length + ':' + data.slice(i * CHUNK, (i + 1) * CHUNK) + ':END');
  }
});
