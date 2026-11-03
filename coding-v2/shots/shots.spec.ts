import { test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { routes } from './routes';

/** Robô de capturas: uma imagem por tela × aparelho × tema, mais um aviso quando a página rola onde não devia. */
const OUT = process.env.SHOTS_OUT || 'shots-out';
const list = (value: string | undefined, fallback: string[]): string[] => {
  const items = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
};
const filter = list(process.env.SHOTS_FILTER, []);
const schemes = list(process.env.SHOTS_SCHEMES, ['light']) as Array<'light' | 'dark'>;
mkdirSync(OUT, { recursive: true });
const selected = routes.filter((r) => filter.length === 0 || filter.some((f) => r.name.includes(f)));

for (const scheme of schemes) {
  for (const route of selected) {
    test(route.name + ' · ' + scheme, async ({ page }, info) => {
      const device = info.project.name;
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await route.before?.(page);
      await page.goto(route.path);
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.evaluate(async () => { await document.fonts.ready; });
      await route.after?.(page);
      await page.waitForTimeout(500);

      const over = await page.evaluate(() => {
        const d = document.documentElement;
        return { horizontal: d.scrollWidth - d.clientWidth, vertical: d.scrollHeight - d.clientHeight };
      });
      const file = join(OUT, device, scheme, route.name + '.png');
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: route.fullPage === true });

      const issues: string[] = [];
      if (over.horizontal > 1) issues.push('rolagem horizontal de ' + over.horizontal + ' px');
      if (route.noVerticalScroll && over.vertical > 1) issues.push('a página rola ' + over.vertical + ' px na vertical (o editor deveria caber na janela)');
      for (const issue of issues) process.stdout.write('::warning title=Layout ' + device + '::' + route.name + ' [' + scheme + ']: ' + issue + '\n');
      appendFileSync(join(OUT, 'report.jsonl'), JSON.stringify({ device, scheme, route: route.name, file: device + '/' + scheme + '/' + route.name + '.png', issues }) + '\n');
    });
  }
}
