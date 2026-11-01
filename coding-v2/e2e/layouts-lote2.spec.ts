import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/*
 * Lote 2: Sorteio e Racha-conta organizam a própria tela (EditorShell layout="free").
 * Sorteio: o palco (roleta, números, dados, equipes) é o protagonista. Racha-conta: o total e os acertos ficam sempre à vista.
 */
type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, testid: string): Promise<Box> => {
  const b = await page.getByTestId(testid).first().boundingBox();
  if (!b) throw new Error('sem caixa para ' + testid);
  return b;
};
const hOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
const NARROW = [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
  { name: 'celular pequeno', width: 320, height: 640 }
] as const;

test.describe('Sorteio: o palco é o protagonista', () => {
  test('computador: participantes à esquerda, roleta grande no centro e histórico à direita', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/sorteio/');
    const names = await box(page, 'names');
    const wheel = await box(page, 'wheel');
    const spin = await box(page, 'spin');
    expect(names.x + names.width).toBeLessThanOrEqual(wheel.x + 2);
    expect(wheel.width).toBeGreaterThanOrEqual(320);
    expect(spin.y + spin.height).toBeLessThanOrEqual(800);
    const hist = page.getByRole('heading', { name: /Histórico/ });
    expect((await hist.boundingBox())!.x).toBeGreaterThanOrEqual(wheel.x + wheel.width - 2);
    await expect(page.getByTestId('editor-tabs').getByRole('tab')).toHaveCount(5);
    expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  });

  for (const size of NARROW) {
    test(size.name + ': a roleta e o botão de girar cabem na tela; números e dados mostram os campos antes do botão', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/sorteio/');
      const wheel = await box(page, 'wheel');
      const spin = await box(page, 'spin');
      expect(spin.y + spin.height, 'o botão de girar precisa estar visível sem rolar').toBeLessThanOrEqual(size.height);
      expect(spin.y).toBeGreaterThan(wheel.y);
      const names = await box(page, 'names');
      expect(names.y, 'a lista de participantes vem depois do palco').toBeGreaterThan(spin.y);
      await tab(page, 'Números').click();
      const min = await box(page, 'num-min');
      const go = await box(page, 'draw-numbers');
      expect(min.y).toBeLessThan(go.y);
      await tab(page, 'Dados').click();
      expect((await box(page, 'dice-count')).y).toBeLessThan((await box(page, 'roll')).y);
      await tab(page, 'Equipes').click();
      await expect(page.getByTestId('make-teams')).toBeVisible();
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Sorteio: as cinco abas ficam sempre acessíveis no celular', () => {
  for (const size of NARROW) {
    test(size.name + ': rótulos inteiros, alvos de 44 px, barra fixa ao rolar e nenhuma função escondida', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/sorteio/');
      const tabs = page.getByTestId('editor-tabs').getByRole('tab');
      await expect(tabs).toHaveCount(5);
      const dims = await tabs.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { label: e.textContent, w: r.width, h: r.height, clipped: e.scrollWidth > e.clientWidth, right: r.right }; }));
      for (const d of dims) {
        expect(d.w, d.label + ' largura').toBeGreaterThanOrEqual(44);
        expect(d.h, d.label + ' altura').toBeGreaterThanOrEqual(44);
        expect(d.clipped, d.label + ' cortado').toBe(false);
        expect(d.right, d.label + ' dentro da tela').toBeLessThanOrEqual(size.width);
      }
      const list = await page.getByTestId('editor-tabs').evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(list, 'a barra de abas não precisa rolar para o lado').toBeLessThanOrEqual(0);
      // rola até o fim: as abas continuam visíveis e clicáveis
      await page.getByTestId('names').fill(Array.from({ length: 40 }, (_, i) => 'Pessoa ' + (i + 1)).join('\n'));
      await page.locator('.es-stage').evaluate((e) => { e.scrollTop = e.scrollHeight; });
      const bar = await box(page, 'editor-tabs');
      expect(bar.y, 'a barra fica no topo da área de trabalho ao rolar').toBeLessThan(160);
      expect(bar.y + bar.height).toBeLessThanOrEqual(size.height);
      await tab(page, 'Arquivo').click();
      await expect(tab(page, 'Arquivo')).toHaveAttribute('aria-selected', 'true');
      const exportBtn = page.getByTestId('export-history');
      await expect(exportBtn).toBeVisible();
      await page.locator('.es-stage').evaluate((e) => { e.scrollTop = 0; });
      expect((await box(page, 'export-history')).y, 'Arquivo mostra as funções logo abaixo das abas').toBeLessThan(size.height);
      for (const name of ['Roleta', 'Números', 'Dados', 'Equipes']) {
        await tab(page, name).click();
        await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
      }
      await expect(page.getByTestId('make-teams')).toBeVisible();
      await tab(page, 'Roleta').click();
      await expect(page.getByTestId('presets')).toBeAttached();
      await expect(page.getByTestId('exclude')).toBeAttached();
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Racha-conta: o total e os acertos ficam à vista', () => {
  test('computador: pessoas e despesas à esquerda e o resultado sempre à direita, sem abas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/racha-conta/');
    const total = await box(page, 'split-total');
    const editor = await box(page, 'expense-editor');
    const transfers = await box(page, 'transfers');
    const balances = await box(page, 'balances');
    expect(transfers.x).toBeGreaterThanOrEqual(editor.x + editor.width - 2);
    expect(balances.x).toBeGreaterThanOrEqual(editor.x + editor.width - 2);
    expect(total.y).toBeLessThan(editor.y);
    await expect(page.getByTestId('editor-tabs')).toHaveCount(0);
    await expect(page.getByTestId('add-person')).toBeVisible();
    await expect(page.getByTestId('add-expense')).toBeVisible();
    expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  });

  for (const size of NARROW) {
    test(size.name + ': total sempre no alto e uma seção por vez (Despesas, Pessoas, Acertos, Arquivo)', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/racha-conta/');
      await expect(page.getByTestId('split-total')).toBeVisible();
      await expect(tab(page, 'Despesas')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('add-expense')).toBeVisible();
      await expect(page.getByTestId('add-person')).toBeHidden();
      await tab(page, 'Pessoas').click();
      await expect(page.getByTestId('add-person')).toBeVisible();
      await expect(page.getByTestId('split-total')).toBeVisible();
      await tab(page, 'Acertos').click();
      await expect(page.getByTestId('transfers')).toBeVisible();
      await expect(page.getByTestId('balances')).toBeVisible();
      await expect(page.getByTestId('add-expense')).toBeHidden();
      await tab(page, 'Arquivo').click();
      await expect(page.getByTestId('export-csv')).toBeVisible();
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test('acessibilidade (' + scheme + ') em Sorteio e Racha-conta, computador e celular', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    for (const size of [{ width: 1280, height: 800, name: 'computador' }, { width: 390, height: 844, name: 'celular' }]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const [name, url] of [['Sorteio', '/apps/sorteio/'], ['Racha-conta', '/apps/racha-conta/']] as const) {
        await page.goto(url);
        await axeClean(page, name + ' ' + size.name + ' ' + scheme);
      }
    }
  });
}
