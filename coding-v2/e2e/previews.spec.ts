import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, readCopiesDb, uploadBackup } from './helpers';

type Entry = ReturnType<typeof backupDoc>;
function withState(entry: Entry, state: Record<string, unknown>): Entry {
  return { ...entry, doc: { ...entry.doc, state: { name: (entry.doc.state as { name: string }).name, ...state } } } as Entry;
}
const labelsDoc = (id: string, name: string, code: string, updatedAt: number): Entry => withState(
  backupDoc(id, name, { type: 'labels', updatedAt }),
  { items: [{ id: 'a', code, description: 'Parafuso sextavado', copies: 2 }, { id: 'b', code: 'ZZ-9', description: '', copies: 1 }], cols: 2 }
);
const textDoc = (id: string, name: string, html: string, updatedAt: number): Entry => withState(backupDoc(id, name, { type: 'texts', updatedAt }), { html });

async function seed(page: Page, ...entries: Entry[]): Promise<void> {
  await page.goto('/launcher/#/documentos');
  await uploadBackup(page, backupFile(...entries));
  await expect(page.getByTestId('copy-count')).toContainText('cópia');
}

test('Etiquetas: miniatura A4 desenha as etiquetas reais salvas', async ({ page }) => {
  await seed(page, labelsDoc('l1', 'Estoque A', 'PAR-123', 1_700_000_100_000));
  await page.goto('/launcher/#/app/labels');
  const thumb = page.getByTestId('history-tile').first().getByTestId('doc-thumb');
  await expect(thumb).toHaveAttribute('data-state', 'ready');
  await expect(thumb).toHaveAttribute('data-kind', 'labels');
  await expect(thumb.locator('.entry')).toHaveCount(3);
  await expect(thumb).toContainText('PAR-123');
  await expect(thumb).toContainText('Parafuso sextavado');
  const box = (await thumb.boundingBox())!;
  expect(box.width).toBeGreaterThan(60);
  expect(Math.abs(box.height / box.width - 297 / 210)).toBeLessThan(0.05);
  await expect(thumb).toHaveAttribute('aria-hidden', 'true');
});

test('Texto: miniatura mostra o conteúdo formatado, sem scripts, e documentos inválidos usam o ícone', async ({ page }) => {
  await seed(page,
    textDoc('t1', 'Carta', '<h1>Título da carta</h1><p style="color: #c0392b; font-size: 20px">Olá mundo</p><script>window.__pwn=1</script>', 1_700_000_100_000),
    { ...backupDoc('t2', 'Quebrado', { type: 'texts', updatedAt: 1_700_000_050_000 }) });
  await page.goto('/launcher/#/app/texts');
  const tiles = page.getByTestId('history-tile');
  await expect(tiles).toHaveCount(2);
  const good = tiles.filter({ hasNotText: 'Quebrado' }).getByTestId('doc-thumb');
  await expect(good).toHaveAttribute('data-state', 'ready');
  await expect(good.locator('h1')).toHaveText('Título da carta');
  await expect(good.locator('p')).toHaveCSS('color', 'rgb(192, 57, 43)');
  await expect(good.locator('p')).toHaveCSS('font-size', '20px');
  expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  const bad = tiles.filter({ hasText: 'Quebrado' }).getByTestId('doc-thumb');
  await expect(bad).toHaveAttribute('data-state', 'fallback');
  await expect(bad.getByTestId('app-icon')).toBeVisible();
});

test('miniaturas são lidas sob demanda, não criam nem alteram dados', async ({ page }) => {
  const docs = Array.from({ length: 30 }, (_, i) => labelsDoc('m' + i, 'Lote ' + String(i).padStart(2, '0'), 'COD-' + i, 1_700_000_000_000 + i * 60_000));
  await seed(page, ...docs);
  const before = await readCopiesDb(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/launcher/#/app/labels');
  await expect(page.getByTestId('history-tile')).toHaveCount(8);
  await page.getByTestId('open-history').click();
  const list = page.getByTestId('history-list');
  await expect(list.locator('li')).toHaveCount(24);
  await expect(list.getByTestId('doc-thumb').first()).toHaveAttribute('data-state', 'ready');
  // as linhas fora da área visível ainda não foram carregadas
  expect(await list.locator('[data-testid="doc-thumb"][data-state="idle"]').count()).toBeGreaterThan(0);
  await list.locator('li').last().scrollIntoViewIfNeeded();
  await expect(list.locator('li').last().getByTestId('doc-thumb')).toHaveAttribute('data-state', 'ready');
  const after = await readCopiesDb(page);
  expect(after).toEqual(before);
  expect((await page.evaluate(() => indexedDB.databases())).some((d) => d.name === 'coding-db')).toBe(false);
});

test('miniaturas: responsivas em 320–430 px, sem rolagem horizontal e acessíveis nos dois temas', async ({ page }) => {
  await seed(page, labelsDoc('l1', 'Estoque A', 'PAR-123', 1_700_000_100_000), labelsDoc('l2', 'Estoque B', 'PAR-456', 1_700_000_090_000));
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/launcher/#/app/labels');
    const thumb = page.getByTestId('history-tile').first().getByTestId('doc-thumb');
    // as miniaturas só carregam quando entram na área visível; a seção offline dos Detalhes fica acima delas
    await thumb.scrollIntoViewIfNeeded();
    await expect(thumb).toHaveAttribute('data-state', 'ready');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'largura ' + width).toBeLessThanOrEqual(0);
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(500);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(',')).join(';'))).toEqual([]);
  }
});

test('carrossel continua com no máximo oito arquivos e o modal lista todos', async ({ page }) => {
  await seed(page, ...Array.from({ length: 11 }, (_, i) => labelsDoc('c' + i, 'Item ' + i, 'C-' + i, 1_700_000_000_000 + i * 60_000)));
  await page.goto('/launcher/#/app/labels');
  await expect(page.getByTestId('history-tile')).toHaveCount(8);
  await page.getByTestId('open-history').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(11);
});
