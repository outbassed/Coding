import { test } from '@playwright/test';

test('diag: rolagem do documento nas Etiquetas com muitas folhas', async ({ page }) => {
  const report: unknown[] = [];
  for (const vp of [{ width: 1920, height: 1000 }, { width: 1280, height: 720 }, { width: 390, height: 800 }]) {
    await page.setViewportSize(vp);
    await page.goto('/apps/etiquetas/');
    await page.getByLabel('Cópias do item 1').fill('120');
    await page.getByLabel('Cópias do item 1').blur();
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
      const de = document.documentElement;
      const offenders: string[] = [];
      document.body.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom <= innerHeight + 5 || r.right <= 0) return;
        let p: Element | null = el.parentElement; let clipped = false;
        while (p && p !== document.body) { const o = getComputedStyle(p).overflowY; if (o !== 'visible') { clipped = true; break; } p = p.parentElement; }
        if (clipped) return;
        if (offenders.length < 10) offenders.push((el.tagName + '.' + String((el as HTMLElement).className).slice(0, 40) + ' ' + getComputedStyle(el).position + ' b=' + Math.round(r.bottom) + ' h=' + Math.round(r.height) + ' l=' + Math.round(r.left)).replace(/\s+/g, ' '));
      });
      return { scrollH: de.scrollHeight, clientH: de.clientHeight, innerH: innerHeight, bodyH: document.body.scrollHeight, sheets: document.querySelectorAll('[data-testid="print-sheet"]').length, ov: getComputedStyle(de).overflowY + '/' + getComputedStyle(document.body).overflowY, offenders };
    });
    await page.mouse.move(vp.width / 2, 300);
    await page.mouse.wheel(0, 6000);
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => window.scrollY);
    await page.mouse.move(150, 500);
    await page.mouse.wheel(0, 6000);
    await page.waitForTimeout(300);
    const y2 = await page.evaluate(() => window.scrollY);
    report.push({ vp: vp.width + 'x' + vp.height, ...info, scrollYcenter: y, scrollYleft: y2 });
  }
  process.stdout.write('::notice title=DIAG-ETIQUETAS::' + JSON.stringify(report).slice(0, 3800) + '\n');
});
