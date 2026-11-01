import { test, type Page } from '@playwright/test';

async function setup(page: Page, items: number, copies: number[]): Promise<void> {
  await page.goto('/apps/etiquetas/');
  for (let i = 2; i <= items; i++) await page.getByRole('button', { name: 'Adicionar item' }).click();
  for (let i = 1; i <= items; i++) {
    await page.getByLabel('Código do item ' + i, { exact: true }).fill('10000' + i);
    await page.getByLabel('Descrição do item ' + i, { exact: true }).fill('POTE PREMIUM 10L ITEM ' + i + ' UZ');
    await page.getByLabel('Cópias do item ' + i, { exact: true }).fill(String(copies[i - 1]));
    await page.getByLabel('Cópias do item ' + i, { exact: true }).blur();
  }
  await page.waitForTimeout(800);
}
async function measure(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const rect = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(e.scrollHeight), Math.round(e.clientHeight)].join(','); };
    const offenders: string[] = [];
    document.body.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= innerHeight + 5 || r.right <= 0) return;
      let p: Element | null = el.parentElement; let clipped = false;
      while (p && p !== document.body) { if (getComputedStyle(p).overflowY !== 'visible') { clipped = true; break; } p = p.parentElement; }
      if (clipped) return;
      if (offenders.length < 8) offenders.push(el.tagName + '.' + String((el as HTMLElement).className).slice(0, 30) + ' ' + getComputedStyle(el).position + ' b=' + Math.round(r.bottom) + ' l=' + Math.round(r.left));
    });
    return { sH: de.scrollHeight, cH: de.clientHeight, iH: innerHeight, sheets: document.querySelectorAll('[data-testid="print-sheet"]').length, ed: rect('.ed'), main: rect('.main'), side: rect('.side'), panel: rect('#tabpanel'), stage: rect('.stage'), offenders };
  });
}

test('diag: Etiquetas rolagem', async ({ page }) => {
  const report: unknown[] = [];
  for (const vp of [{ width: 1920, height: 1000 }, { width: 1280, height: 720 }]) {
    for (const scenario of [{ n: 1, c: [120] }, { n: 5, c: [10, 10, 10, 14, 14] }]) {
      await page.setViewportSize(vp);
      await setup(page, scenario.n, scenario.c);
      const m = await measure(page);
      await page.mouse.move(150, 500);
      const ys: number[] = [];
      for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(150); ys.push(await page.evaluate(() => window.scrollY)); }
      const panelTop = await page.evaluate(() => document.querySelector('#tabpanel')?.scrollTop ?? -1);
      report.push({ vp: vp.width + 'x' + vp.height, items: scenario.n, ...m, scrollY: ys.join(','), panelTop });
    }
  }
  const text = JSON.stringify(report);
  for (let i = 0; i < text.length; i += 3500) process.stdout.write('::notice title=DIAG' + (i / 3500) + '::' + text.slice(i, i + 3500) + '\n');
});
