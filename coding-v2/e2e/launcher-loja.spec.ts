import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}
async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0);
}
const hasDb = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'coding-v2-documents'));

test.describe('Launcher · loja no computador', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Início: destaque real, meus apps, atalho ao catálogo e nenhum documento inventado', async ({ page }) => {
    await page.goto('/launcher/');
    const actions = page.getByTestId('home-actions');
    for (const name of ['Meus apps', 'Catálogo', 'Documentos']) await expect(actions.getByRole('link', { name })).toBeVisible();
    await expect(page.getByTestId('stat-docs')).toHaveText('0');
    await expect(page.locator('article.card[data-tool="labels"]').getByRole('link', { name: 'Abrir o editor de Etiquetas' })).toHaveAttribute('href', '/apps/etiquetas/');
    await expect(page.getByRole('heading', { level: 2, name: 'Meus aplicativos' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Explorar o catálogo' })).toBeVisible();
    await expect(page.getByText('8 editores disponíveis', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('recent-docs')).toHaveCount(0);
    expect(await hasDb(page)).toBe(false); // olhar o Início não cria banco algum
    await page.getByRole('link', { name: 'Abrir catálogo' }).click();
    await expect(page).toHaveURL(/#\/catalogo$/);
  });

  test('Documentos recentes aparecem depois de salvar uma etiqueta e abrem o editor', async ({ page }) => {
    await page.goto('/apps/etiquetas/');
    await page.getByLabel('Código do item 1').fill('PRAT-7');
    await page.getByRole('tab', { name: 'Página' }).click();
    await page.getByLabel('Nome do documento').fill('Prateleira 7');
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await page.goto('/launcher/');
    const recent = page.getByTestId('recent-docs');
    await expect(recent).toContainText('Prateleira 7');
    await expect(recent).toContainText('Etiquetas');
    await recent.getByRole('link', { name: 'Abrir Prateleira 7 no editor' }).click();
    await expect(page).toHaveURL(/\/apps\/etiquetas\/\?doc=/);
    await expect(page.getByLabel('Código do item 1')).toHaveValue('PRAT-7');
  });

  test('Catálogo: categorias, busca, filtros, limpar e detalhes', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    await expect(page.locator('article.card')).toHaveCount(8);
    await page.getByTestId('category-button').click();
    await page.getByRole('option', { name: 'Etiquetas e códigos' }).click();
    await expect(page.getByTestId('category-button')).toContainText('Etiquetas e códigos');
    await expect(page.locator('article.card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Em breve', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Não ativados', exact: true }).click();
    await expect(page.locator('article.card')).toHaveCount(0);
    await page.getByTestId('clear-filters').click();
    await expect(page.locator('article.card')).toHaveCount(8);
    await page.getByRole('searchbox', { name: 'Buscar no catálogo' }).fill('zzzz');
    await expect(page.getByText('Nada encontrado.')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).first().click();
    await expect(page.locator('article.card')).toHaveCount(8);
    await page.locator('article.card[data-tool="labels"]').getByRole('link', { name: 'Etiquetas' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Etiquetas');
    await expect(page.getByTestId('ready-list')).toContainText('Colar lista de itens');
    await expect(page.getByTestId('detail-meta')).toContainText('Editor funcional');
    await page.goto('/launcher/#/app/calc');
    await expect(page.getByTestId('ready-list')).toContainText('Fórmulas');
    await expect(page.getByTestId('detail-meta')).toContainText('Editor funcional');
    await expect(page.getByRole('link', { name: 'Abrir editor' })).toHaveAttribute('href', '/apps/planilhas/');
  });

  test('Meus apps: biblioteca com Abrir, desativar e reativar sem apagar nada', async ({ page }) => {
    await page.goto('/launcher/#/meus-apps');
    const card = page.locator('article.card[data-tool="labels"]');
    await expect(card.getByRole('link', { name: 'Abrir o editor de Etiquetas' })).toHaveAttribute('href', '/apps/etiquetas/');
    await expect(card.getByTestId('card-meta')).toContainText('Editor funcional');
    await expect(card.getByTestId('status-pill')).toHaveText('Ativado');
    await page.getByRole('button', { name: 'Desativar Etiquetas no Launcher' }).click();
    await page.getByRole('button', { name: 'Desativar atalho' }).click();
    const avail = page.getByTestId('available-to-activate');
    await expect(avail).toContainText('Etiquetas');
    await avail.getByRole('button', { name: 'Ativar Etiquetas no Launcher' }).click();
    await expect(page.locator('article.card[data-tool="labels"]')).toBeVisible();
  });

  test('grade usa bem monitores largos', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto('/launcher/#/catalogo');
    const tops = await page.locator('article.card').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    const firstRow = tops.filter((t) => t === tops[0]).length;
    expect(firstRow).toBeGreaterThanOrEqual(4);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test('acessibilidade (' + scheme + ') em Início, Meus apps, Catálogo e Detalhes', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/labels', '/launcher/#/documentos', '/launcher/#/ajustes']) {
        await page.goto(route);
        await expect(page.locator('h1')).toHaveCount(1);
        await axeClean(page);
      }
    });
  }
});

test.describe('Launcher · loja no celular', () => {
  for (const width of [320, 390]) {
    test.describe(width + ' px', () => {
      test.use({ viewport: { width, height: 800 } });

      test('Início, Meus apps e Catálogo sem rolagem horizontal, com toque de 44 px e cinco logos', async ({ page }) => {
        for (const route of ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/labels']) {
          await page.goto(route);
          await expect(page.locator('h1')).toHaveCount(1);
          await noHorizontalScroll(page);
          const heights = await page.locator('main a.btn, main button.btn, main button.f, main button.cat').evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().height)));
          for (const h of heights) expect(h).toBeGreaterThanOrEqual(43);
          await expect(page.locator('nav[aria-label="Navegação móvel"] img.legacy-nav-icon')).toHaveCount(5);
        }
      });

      test('grade 3 por linha abre detalhes do app, sem cards gigantes', async ({ page }) => {
        await page.goto('/launcher/#/catalogo');
        const cards = page.locator('article.card');
        const boxes = await cards.evaluateAll((els) => els.slice(0, 4).map((el) => {
          const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
        }));
        expect(new Set(boxes.slice(0,3).map(b => b.y)).size).toBe(1);
        expect(new Set(boxes.slice(0,3).map(b => b.x)).size).toBe(3);
        expect(boxes[3]?.y).toBeGreaterThan(boxes[0]!.y);
        const labels = page.locator('article.card[data-tool="labels"]');
        await labels.getByRole('link', { name: 'Etiquetas' }).click();
        await expect(page.getByTestId('detail-meta')).toContainText('Editor funcional');
        await expect(page.getByRole('link', { name: 'Abrir editor' })).toBeVisible();
        await expect(page.getByRole('searchbox')).toHaveCount(0);
        await axeClean(page);
      });

      test('Início e Documentos passam no axe', async ({ page }) => {
        for (const route of ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/documentos']) { await page.goto(route); await axeClean(page); }
      });
    });
  }
});
