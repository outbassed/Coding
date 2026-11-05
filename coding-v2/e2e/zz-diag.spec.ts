import { test } from '@playwright/test';
/* DIAGNÓSTICO TEMPORÁRIO (será removido). */
test.only('diag retomada: quem grava o registro depois da rolagem', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
  await context.clock.install({ time: new Date('2026-11-05T12:00:00-03:00') });
  const page = await context.newPage();
  await page.goto('/launcher/#/catalogo');
  await page.waitForFunction(() => !!localStorage.getItem('coding-v2-session')?.includes('catalogo'));
  await page.evaluate(() => {
    const w = window as unknown as { __log: unknown[] };
    w.__log = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { w.__log.push(['set', k, String(v).slice(0, 70), Date.now()]); return original.call(this, k, v); };
    for (const n of ['pointerdown', 'wheel', 'scroll', 'keydown']) window.addEventListener(n, () => w.__log.push(['evt', n, Date.now()]), true);
  });
  await context.clock.fastForward(15 * 60_000);
  await page.mouse.wheel(0, 40);
  await page.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => ({ log: (window as unknown as { __log: unknown[] }).__log, now: Date.now(), raw: localStorage.getItem('coding-v2-session'), vis: document.visibilityState }));
  console.log('::warning::DIAG ' + JSON.stringify(out));
  await context.close();
});
