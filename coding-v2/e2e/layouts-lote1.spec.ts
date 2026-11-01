import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/*
 * Lote 1: cada aplicativo organiza a própria tela (EditorShell layout="free"), em vez de usar o mesmo
 * "painel de ferramentas + prévia". Estes testes conferem a ORGANIZAÇÃO em computador, tablet e celular:
 * quem é o protagonista, o que fica à vista e o que vai para gaveta ou abas.
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

const SIZES = [
  { name: 'computador', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
  { name: 'celular pequeno', width: 320, height: 640 }
] as const;

test.describe('Calculadora: visor e teclado são os protagonistas', () => {
  test('computador: o teclado ocupa a maior parte da tela e histórico/variáveis ficam em coluna ao lado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/calculadora/');
    const calc = await box(page, 'calculator');
    const rail = await box(page, 'calc-rail');
    expect(calc.width).toBeGreaterThan(rail.width * 1.5);
    expect(rail.x).toBeGreaterThanOrEqual(calc.x + calc.width - 2);
    const eq = await box(page, 'key-eq');
    expect(eq.y + eq.height).toBeLessThanOrEqual(800);
    expect(eq.width).toBeGreaterThanOrEqual(44);
    expect(eq.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('open-rail')).toHaveCount(0);
    expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  });

  for (const size of SIZES.filter((s) => s.width < 900)) {
    test(size.name + ': visor e teclado cabem na tela sem rolar; o histórico abre numa gaveta', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/calculadora/');
      const display = await box(page, 'calc-result');
      const eq = await box(page, 'key-eq');
      const zero = await box(page, 'key-0');
      expect(display.y).toBeLessThan(eq.y);
      expect(eq.y + eq.height, 'o "=" precisa estar visível sem rolar').toBeLessThanOrEqual(size.height);
      expect(eq.x + eq.width).toBeLessThanOrEqual(size.width);
      expect(zero.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId('calc-rail')).toBeHidden();
      await page.getByTestId('open-rail').click();
      await expect(page.getByTestId('calc-rail')).toBeVisible();
      await expect(tab(page, 'Histórico')).toBeVisible();
      await page.getByTestId('close-rail').click();
      await expect(page.getByTestId('calc-rail')).toBeHidden();
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Estúdio de Cores: a cor e as paletas ficam à vista', () => {
  for (const size of SIZES) {
    test(size.name + ': a cor grande aparece primeiro, a paleta fica alcançável e nada estoura a largura', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/cores/');
      const hero = await box(page, 'hero-hex');
      expect(hero.y).toBeLessThan(size.height / 2);
      const dock = page.locator('section.dock');
      await dock.scrollIntoViewIfNeeded();
      await expect(dock).toBeVisible();
      if (size.width >= 900) {
        // No PC a edição fica ao lado da cor, sem esconder a cor.
        const slider = await box(page, 'slider-h');
        expect(slider.x).toBeGreaterThan(hero.x + hero.width / 2 - 1);
      }
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Compactador ZIP: arquivos e operações lado a lado', () => {
  test('computador: lista de arquivos à esquerda e operações à direita, sem trocar de aba para ver os arquivos', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/zip/');
    const empty = await box(page, 'file-empty');
    const create = await box(page, 'create-zip');
    expect(create.x).toBeGreaterThan(empty.x + empty.width - 2);
    await expect(tab(page, 'Compactar')).toBeVisible();
    await expect(tab(page, 'Abrir ZIP')).toBeVisible();
    expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  });

  for (const size of SIZES.filter((s) => s.width < 900)) {
    test(size.name + ': arquivos primeiro, operações logo abaixo e sem rolagem horizontal', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/zip/');
      const empty = await box(page, 'file-empty');
      const create = await box(page, 'create-zip');
      expect(create.y).toBeGreaterThan(empty.y);
      expect(create.height).toBeGreaterThanOrEqual(44);
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('Comparador: lados e resultado', () => {
  test('computador: A e B lado a lado e o resultado logo abaixo, tudo na mesma tela', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apps/comparador/?modelo=versoes');
    const a = await box(page, 'side-a-text');
    const b = await box(page, 'side-b-text');
    const status = await box(page, 'compare-status');
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
    expect(b.x).toBeGreaterThan(a.x + a.width - 2);
    expect(status.y).toBeGreaterThan(a.y);
    await expect(page.getByTestId('diff-view')).toBeVisible();
    await expect(page.getByTestId('editor-tabs')).toHaveCount(0);
    // Recolher as entradas dá mais espaço ao resultado.
    await page.getByTestId('toggle-inputs').click();
    await expect(page.getByTestId('side-a-text')).toBeHidden();
    await expect(page.getByTestId('diff-view')).toBeVisible();
    await page.getByTestId('toggle-inputs').click();
    await expect(page.getByTestId('side-a-text')).toBeVisible();
    expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  });

  for (const size of SIZES.filter((s) => s.width < 900)) {
    test(size.name + ': abas Lado A | Lado B | Resultado, uma por vez, sem rolagem horizontal', async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/apps/comparador/?modelo=versoes');
      await expect(tab(page, 'Lado A')).toHaveAttribute('aria-selected', 'true');
      // As opções começam recolhidas para os lados aparecerem logo; "Opções" abre e fecha.
      await expect(page.getByTestId('opt-case')).toBeHidden();
      await page.getByTestId('toggle-opts').click();
      await expect(page.getByTestId('opt-case')).toBeVisible();
      await page.getByTestId('toggle-opts').click();
      await expect(page.getByTestId('opt-case')).toBeHidden();
      expect((await box(page, 'side-a-text')).y).toBeLessThan(size.height);
      await expect(page.getByTestId('side-a-text')).toBeVisible();
      await expect(page.getByTestId('side-b-text')).toBeHidden();
      await expect(page.getByTestId('diff-view')).toBeHidden();
      await tab(page, 'Lado B').click();
      await expect(page.getByTestId('side-b-text')).toBeVisible();
      await expect(page.getByTestId('side-a-text')).toBeHidden();
      await tab(page, 'Resultado').click();
      await expect(page.getByTestId('compare-status')).toBeVisible();
      await expect(page.getByTestId('diff-view')).toBeVisible();
      expect(await hOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test('acessibilidade (' + scheme + ') nos quatro layouts, em computador e celular', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    const urls = [['Calculadora', '/apps/calculadora/'], ['Estúdio de Cores', '/apps/cores/'], ['Compactador ZIP', '/apps/zip/'], ['Comparador', '/apps/comparador/?modelo=versoes']] as const;
    for (const size of [SIZES[0], SIZES[2]]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const [name, url] of urls) { await page.goto(url); await axeClean(page, name + ' ' + size.name + ' ' + scheme); }
    }
  });
}
