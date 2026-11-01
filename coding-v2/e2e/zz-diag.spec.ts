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
const dump = (page: Page) => page.evaluate(() => {
  const de = document.documentElement;
  const rows: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (rows.length > 34 || depth > 5) return;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const he = el as HTMLElement;
    rows.push('  '.repeat(depth) + el.tagName.toLowerCase() + '.' + String(he.className).split(' ')[0].slice(0, 18) + ' pos=' + cs.position + ' ov=' + cs.overflowY + ' disp=' + cs.display + ' t=' + Math.round(r.top) + ' b=' + Math.round(r.bottom) + ' sH=' + he.scrollHeight + ' cH=' + he.clientHeight + ' minH=' + cs.minHeight);
    for (const c of Array.from(el.children)) walk(c, depth + 1);
  };
  const ed = document.querySelector('.ed'); if (ed) { rows.push('ed sH=' + ed.scrollHeight + ' cH=' + (ed as HTMLElement).clientHeight + ' doc sH=' + de.scrollHeight + ' iH=' + innerHeight); }
  const main = document.querySelector('.main'); if (main) for (const c of Array.from(main.children)) walk(c, 0);
  return rows;
});

test('diag: Etiquetas por cenário', async ({ browser }) => {
  const out: string[] = [];
  for (const sc of [{ n: 5, c: [1, 1, 1, 1, 1], tag: '5itens-1copia' }, { n: 1, c: [120], tag: '1item-120copias' }, { n: 3, c: [1, 1, 1], tag: '3itens' }]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await setup(page, sc.n, sc.c);
    out.push('## ' + sc.tag, ...(await dump(page)));
    await ctx.close();
  }
  const text = out.join(' | ');
  for (let i = 0; i < text.length; i += 3500) process.stdout.write('::notice title=DIAG' + (i / 3500) + '::' + text.slice(i, i + 3500) + '\n');
});
