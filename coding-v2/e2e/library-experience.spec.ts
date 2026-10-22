import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, uploadBackup } from './helpers';

const T0 = 1_700_000_000_000;
type Entry = ReturnType<typeof backupDoc>;
function labels(id: string, name: string, n: number, image = false): Entry {
  const base = backupDoc(id, name, { type: 'labels', updatedAt: T0 + n * 60_000, image });
  return { ...base, doc: { ...base.doc, state: { name, items: [{ id: 'a', code: 'K-' + n, description: 'Peça ' + n, copies: 1 }] } } } as Entry;
}
const texts = (id: string, name: string, n: number): Entry => backupDoc(id, name, { type: 'texts', updatedAt: T0 + n * 60_000 });
async function seed(page: Page, ...entries: Entry[]): Promise<void> {
  await page.goto('/launcher/#/documentos');
  await uploadBackup(page, backupFile(...entries));
  await expect(page.getByTestId('copy-count')).toContainText('cópia');
}
const tab = (page: Page, name: RegExp) => page.getByTestId('document-app-tabs').getByRole('button', { name });
const summary = (page: Page) => page.locator('.page-summary');

test('grade é o padrão, mostra miniaturas reais, e a lista é lembrada ao recarregar', async ({ page }) => {
  await seed(page, labels('a', 'Prateleira', 1), labels('b', 'Caixa', 2));
  const cards = page.getByTestId('v2-copies');
  await expect(cards).toHaveAttribute('data-view', 'grid');
  await expect(page.getByRole('button', { name: 'Grade' })).toHaveAttribute('aria-pressed', 'true');
  const thumb = cards.locator('li').first().getByTestId('doc-thumb');
  await expect(thumb).toHaveAttribute('data-state', 'ready');
  await expect(thumb).toContainText(/K-\d/);
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(cards).toHaveAttribute('data-view', 'list');
  await expect(page.getByTestId('library-status')).toContainText('lista');
  await page.reload();
  await expect(page.getByTestId('v2-copies')).toHaveAttribute('data-view', 'list');
  await expect(page.getByTestId('v2-copies').locator('li').first().getByTestId('doc-thumb')).toHaveAttribute('data-state', 'ready');
});

test('cartão tem ação visível "Abrir" para o editor e continua selecionável para detalhes', async ({ page }) => {
  await seed(page, labels('a', 'Prateleira', 1), texts('t', 'Texto antigo', 2));
  const labelCard = page.locator('li', { has: page.locator('[data-copy-card]', { hasText: 'Prateleira' }) });
  await expect(labelCard.getByRole('link', { name: 'Abrir Prateleira no editor' })).toHaveAttribute('href', /\/apps\/etiquetas\/\?doc=/);
  const textCard = page.locator('li', { has: page.locator('[data-copy-card]', { hasText: 'Texto antigo' }) });
  await expect(textCard.getByRole('link')).toHaveCount(0);
  await page.locator('[data-copy-card]', { hasText: 'Prateleira' }).click();
  await expect(page.getByTestId('details-panel')).toContainText('Prateleira');
});

test('cada aplicativo lembra a própria página e a posição volta depois de abrir um editor', async ({ page }) => {
  const entries: Entry[] = [];
  for (let i = 0; i < 50; i++) entries.push(labels('l' + i, 'Lote ' + String(i).padStart(2, '0'), i));
  for (let i = 0; i < 30; i++) entries.push(texts('t' + i, 'Nota ' + String(i).padStart(2, '0'), i));
  await seed(page, ...entries);
  await tab(page, /Etiquetas/).click();
  await expect(summary(page)).toContainText('Página 1 de 3');
  await page.getByRole('button', { name: 'Ir para a página 3' }).click();
  await expect(summary(page)).toContainText('Página 3 de 3');
  await tab(page, /Texto/).click();
  await expect(summary(page)).toContainText('Página 1 de 2');
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(summary(page)).toContainText('Página 2 de 2');
  await tab(page, /Etiquetas/).click();
  await expect(summary(page)).toContainText('Página 3 de 3');
  await tab(page, /Todos/).click();
  await expect(summary(page)).toContainText('Página 1 de 4');
  await tab(page, /Etiquetas/).click();
  // abre um editor de verdade e volta pelo link do próprio editor
  await page.getByTestId('v2-copies').getByRole('link', { name: /^Abrir .* no editor$/ }).first().click();
  await expect(page).toHaveURL(/\/apps\/etiquetas\/\?doc=/);
  await page.getByRole('link', { name: 'Voltar à biblioteca' }).first().click();
  await expect(page).toHaveURL(/ferramenta=labels/);
  await expect(tab(page, /Etiquetas/)).toHaveAttribute('aria-pressed', 'true');
  await expect(summary(page)).toContainText('Página 3 de 3');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(2);
  await tab(page, /Texto/).click();
  await expect(summary(page)).toContainText('Página 2 de 2');
  // mudar a busca é um novo conjunto de resultados: volta à primeira página
  await page.getByRole('searchbox', { name: 'Buscar por nome' }).fill('Nota');
  await expect(page.getByTestId('copy-count')).toContainText('30 cópias encontradas');
  await expect(summary(page)).toContainText('Página 1 de 2');
});

test('coleção grande: só uma página é desenhada e «/» movem cinco páginas', async ({ page }) => {
  const entries: Entry[] = [];
  for (let i = 0; i < 340; i++) entries.push(labels('g' + i, 'Item ' + String(i).padStart(3, '0'), i));
  await seed(page, ...entries);
  await expect(page.getByTestId('copy-count')).toContainText('340 cópias');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(24);
  await expect(summary(page)).toContainText('Página 1 de 15');
  await page.getByRole('button', { name: 'Avançar cinco páginas' }).click();
  await expect(summary(page)).toContainText('Página 6 de 15');
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(summary(page)).toContainText('Página 7 de 15');
  await page.getByRole('button', { name: 'Voltar cinco páginas' }).click();
  await expect(summary(page)).toContainText('Página 2 de 15');
  await page.getByRole('spinbutton', { name: 'Ir para a página' }).fill('15');
  await page.getByRole('spinbutton', { name: 'Ir para a página' }).press('Enter');
  await expect(summary(page)).toContainText('Página 15 de 15');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(340 - 14 * 24);
});

test('busca com vários termos e ordenação por quantidade de imagens', async ({ page }) => {
  await seed(page, labels('a', 'Caixa do estoque', 1), labels('b', 'Estoque geral', 2), labels('c', 'Fotos da caixa', 3, true), labels('d', 'Sem fotos', 4));
  await page.getByRole('searchbox', { name: 'Buscar por nome' }).fill('estoque caixa');
  await expect(page.getByTestId('copy-count')).toContainText('1 cópia encontrada');
  await page.getByRole('searchbox', { name: 'Buscar por nome' }).fill('');
  await page.getByLabel('Ordenar por').selectOption('images');
  await expect(page).toHaveURL(/ordem=images/);
  await expect(page.locator('[data-copy-card]').first()).toContainText('Fotos da caixa');
  await page.getByLabel('Ordenar por').selectOption('type');
  await expect(page).toHaveURL(/ordem=type/);
});

test('histórico completo: ordenação, miniaturas e página lembrada ao reabrir', async ({ page }) => {
  const entries: Entry[] = [];
  for (let i = 0; i < 30; i++) entries.push(labels('h' + i, 'Arquivo ' + String(i).padStart(2, '0'), i));
  await seed(page, ...entries);
  await page.goto('/launcher/#/app/labels');
  await page.getByTestId('open-history').click();
  const dialog = page.getByRole('dialog', { name: 'Histórico de Etiquetas' });
  const rows = dialog.getByTestId('history-list').locator('li');
  await expect(rows).toHaveCount(24);
  // a importação grava a data da importação: a ordem por data é indeterminada, a por nome é exata
  await dialog.getByLabel('Ordenar por').selectOption('name-desc');
  await expect(rows.first()).toContainText('Arquivo 29');
  await dialog.getByLabel('Ordenar por').selectOption('name-asc');
  await expect(rows.first()).toContainText('Arquivo 00');
  await dialog.getByRole('button', { name: 'Próxima página' }).click();
  await expect(rows).toHaveCount(6);
  await expect(dialog).toContainText('página 2 de 2');
  await dialog.getByRole('button', { name: 'Fechar histórico' }).click();
  await page.getByTestId('open-history').click();
  await expect(rows).toHaveCount(6);
  // o carrossel não muda: continuam sendo os oito mais recentes
  await dialog.getByRole('button', { name: 'Fechar histórico' }).click();
  await expect(page.getByTestId('history-tile')).toHaveCount(8);
});

test('biblioteca em 320–430 px: duas colunas na grade, sem rolagem horizontal, ambos os temas acessíveis', async ({ page }) => {
  await seed(page, labels('a', 'Prateleira muito comprida para testar a quebra de linha', 1), labels('b', 'Caixa', 2), labels('c', 'Estoque', 3), labels('d', 'Notas', 4));
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/launcher/#/documentos');
    const items = page.getByTestId('v2-copies').locator('li');
    await expect(items.first().getByTestId('doc-thumb')).toHaveAttribute('data-state', 'ready');
    const a = (await items.nth(0).boundingBox())!, b = (await items.nth(1).boundingBox())!, c = (await items.nth(2).boundingBox())!;
    expect(Math.abs(a.y - b.y), 'mesma linha ' + width).toBeLessThan(2);
    expect(c.y).toBeGreaterThan(a.y + 40);
    expect(b.x + b.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'overflow ' + width).toBeLessThanOrEqual(0);
  }
  for (const mode of ['Lista', 'Grade']) {
    await page.getByRole('button', { name: mode }).click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(500);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
      expect(result.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(',')).join(';')), mode + ' ' + scheme).toEqual([]);
    }
  }
});
