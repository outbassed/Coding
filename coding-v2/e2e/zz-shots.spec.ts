import { test, type Page } from '@playwright/test';

/* TEMPORÁRIO: captura telas para revisão visual e as devolve na mensagem do erro. Será removido. */
async function shot(page: Page, name: string): Promise<never> {
  await page.waitForTimeout(1200);
  const buf = await page.screenshot({ type: 'jpeg', quality: 42 });
  throw new Error('SHOT:' + name + ':' + buf.toString('base64'));
}
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });

test('shot mobile fechada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apps/versos/?modelo=letra');
  await page.getByTestId('versos-canvas').waitFor();
  await shot(page, 'm1');
});
test('shot mobile gaveta textos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apps/versos/?modelo=citacao');
  await page.getByTestId('versos-canvas').waitFor();
  await tab(page, 'Textos').click();
  await shot(page, 'm2');
});
test('shot desktop claro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/apps/versos/?modelo=letra');
  await page.getByTestId('versos-canvas').waitFor();
  await tab(page, 'Textos').click();
  await page.getByTestId('text-pick').first().click();
  await shot(page, 'd1');
});
test('shot desktop escuro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/apps/versos/?modelo=citacao');
  await page.getByTestId('versos-canvas').waitFor();
  await page.getByTestId('text-pick').first().click().catch(() => undefined);
  await shot(page, 'd2');
});
