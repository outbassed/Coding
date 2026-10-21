import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, openCard, readCopiesDb, uploadBackup } from './helpers';

const URL = '/launcher/#/documentos';
const rename = (page: Page, from: string) => page.getByRole('button', { name: 'Renomear cópia de ' + from });
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Novo nome da cópia' });

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0);
}
async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}

test.describe('duas abas reais editando o mesmo documento (A1)', () => {
  async function twoTabs(browser: import('@playwright/test').Browser) {
    const context = await browser.newContext();
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto(URL);
    await uploadBackup(a, backupFile(backupDoc('d1', 'Original', { image: true })));
    await expect(a.locator('[data-copy-card]')).toHaveCount(1);
    await b.goto(URL);
    await expect(b.locator('[data-copy-card]')).toHaveCount(1);
    return { context, a, b };
  }
  async function startConflict(a: Page, b: Page) {
    await openCard(b, 'Original');
    await rename(b, 'Original').click();
    await nameBox(b).fill('Nome da aba B');
    // A conclui a renomeação enquanto B ainda está com o diálogo aberto.
    await openCard(a, 'Original');
    await rename(a, 'Original').click();
    await nameBox(a).fill('Nome da aba A');
    await a.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(a.getByTestId('library-status')).toContainText('Nome salvo: Nome da aba A');
    // A lista de B atualiza por trás do diálogo, mas o texto digitado e a revisão esperada não mudam.
    await expect(b.locator('[data-copy-card]')).toContainText('Nome da aba A');
    await expect(nameBox(b)).toHaveValue('Nome da aba B');
    await b.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(b.getByTestId('conflict')).toBeVisible();
  }

  test('conflito mostra os dois nomes e cancelar não sobrescreve', async ({ browser }) => {
    const { context, a, b } = await twoTabs(browser);
    try {
      await startConflict(a, b);
      await expect(b.getByTestId('conflict-mine')).toHaveText('Nome da aba B');
      await expect(b.getByTestId('conflict-theirs')).toHaveText('Nome da aba A');
      await expect(b.getByRole('heading', { name: 'Esta cópia mudou em outra janela' })).toBeFocused();
      await axeClean(b);
      await b.getByRole('button', { name: 'Cancelar e não sobrescrever' }).click();
      await expect(b.getByRole('dialog')).toHaveCount(0);
      await expect(b.locator('[data-copy-card]')).toBeFocused();
      const db = await readCopiesDb(b);
      expect(db.labels).toEqual(['Nome da aba A']);
      expect(db.revisions).toEqual([2]);
    } finally { await context.close(); }
  });

  test('atualizar adota o nome da outra janela sem gravar nada', async ({ browser }) => {
    const { context, a, b } = await twoTabs(browser);
    try {
      await startConflict(a, b);
      await b.getByRole('button', { name: 'Atualizar e usar o nome da outra janela' }).click();
      await expect(b.getByRole('dialog')).toHaveCount(0);
      await expect(b.getByTestId('library-status')).toContainText('O nome atual é: Nome da aba A');
      expect((await readCopiesDb(b)).revisions).toEqual([2]);
    } finally { await context.close(); }
  });

  test('salvar como nova cópia usa a API real, preserva imagens e atualiza a outra aba', async ({ browser }) => {
    const { context, a, b } = await twoTabs(browser);
    try {
      await startConflict(a, b);
      await b.getByRole('button', { name: 'Salvar o meu nome como nova cópia' }).click();
      await expect(b.getByRole('dialog')).toHaveCount(0);
      await expect(b.locator('[data-copy-card]')).toHaveCount(2);
      await expect(a.locator('[data-copy-card]')).toHaveCount(2);
      const db = await readCopiesDb(b);
      expect(db.labels).toEqual(['Nome da aba A', 'Nome da aba B']);
      expect(db.revisions.sort()).toEqual([1, 2]);
      expect(db.assets).toHaveLength(2);
      for (const asset of db.assets) expect(asset.bytes).toEqual([0, 1, 2, 250, 255]);
      expect(new Set(db.assets.map((x) => x.copyId)).size).toBe(2);
    } finally { await context.close(); }
  });

  test('excluir em uma aba com a outra tendo alterado: nada é excluído', async ({ browser }) => {
    const { context, a, b } = await twoTabs(browser);
    try {
      await openCard(b, 'Original');
      await b.getByRole('button', { name: 'Excluir cópia de Original' }).click();
      await openCard(a, 'Original');
      await rename(a, 'Original').click();
      await nameBox(a).fill('Mudou na A');
      await a.getByRole('button', { name: 'Salvar nome' }).click();
      await expect(a.getByTestId('library-status')).toContainText('Nome salvo');
      await b.getByRole('button', { name: 'Excluir cópia', exact: true }).click();
      await expect(b.getByTestId('library-error')).toContainText('foi alterada em outra janela, então nada foi excluído');
      expect((await readCopiesDb(b)).labels).toEqual(['Mudou na A']);
    } finally { await context.close(); }
  });
});

test.describe('ações do documento', () => {
  test('criar cópia e excluir (com bytes e confirmação explícita)', async ({ page }) => {
    await page.goto(URL);
    await uploadBackup(page, backupFile(backupDoc('d1', 'Contrato', { image: true })));
    await openCard(page, 'Contrato');
    await page.getByRole('button', { name: 'Criar nova cópia de Contrato' }).click();
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    await expect(page.getByTestId('library-status')).toContainText('A original não foi alterada');
    const two = await readCopiesDb(page);
    expect(two.labels).toEqual(['Contrato', 'Cópia de Contrato']);
    expect(two.assets.map((x) => x.bytes)).toEqual([[0, 1, 2, 250, 255], [0, 1, 2, 250, 255]]);

    await page.getByRole('button', { name: 'Excluir cópia de Cópia de Contrato' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('O documento original no Coding antigo não é afetado');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('button', { name: 'Excluir cópia de Cópia de Contrato' })).toBeFocused();
    expect((await readCopiesDb(page)).labels).toHaveLength(2);

    await page.getByRole('button', { name: 'Excluir cópia de Cópia de Contrato' }).click();
    await page.getByRole('button', { name: 'Excluir cópia', exact: true }).click();
    await expect(page.getByTestId('library-status')).toContainText('excluída');
    const one = await readCopiesDb(page);
    expect(one.labels).toEqual(['Contrato']);
    expect(one.assets).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'Minhas cópias' })).toBeFocused();
  });
});

test.describe('busca, filtros, ordem e lista progressiva', () => {
  test.beforeEach(async ({ page }) => {
    const docs = Array.from({ length: 59 }, (_, i) => backupDoc('n' + i, 'Doc ' + String(i + 1).padStart(2, '0'), { type: i % 3 === 0 ? 'labels' : i % 3 === 1 ? 'texts' : 'images' }));
    docs.push(backupDoc('acao', 'Ação especial', { type: 'codes' }));
    await page.goto(URL);
    await uploadBackup(page, backupFile(...docs));
    await expect(page.getByTestId('copy-count')).toHaveText('60 cópias');
  });

  test('carrega 24 por vez e move o foco para o primeiro item novo', async ({ page }) => {
    await expect(page.locator('[data-copy-card]')).toHaveCount(24);
    await page.getByTestId('show-more').click();
    await expect(page.locator('[data-copy-card]')).toHaveCount(48);
    await expect(page.locator('[data-copy-card]').nth(24)).toBeFocused();
    await page.getByTestId('show-more').click();
    await expect(page.locator('[data-copy-card]')).toHaveCount(60);
    await expect(page.getByTestId('show-more')).toHaveCount(0);
  });

  test('busca ignora acentos e caixa; filtros e ordem ficam na URL', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Buscar por nome' }).fill('ACAO');
    await expect(page.locator('[data-copy-card]')).toHaveCount(1);
    await expect(page.getByTestId('library-status')).toContainText('1 cópia encontrada');
    await page.getByRole('searchbox', { name: 'Buscar por nome' }).fill('');
    await page.getByLabel('Ferramenta').selectOption('labels');
    await expect(page.getByTestId('copy-count')).toHaveText('20 cópias encontradas de 60');
    await expect(page).toHaveURL(/ferramenta=labels/);
    await page.getByLabel('Ordenar por').selectOption('name-desc');
    await expect(page.locator('[data-copy-card]').first()).toContainText('Doc 58');
    await page.reload();
    await expect(page.getByTestId('copy-count')).toHaveText('20 cópias encontradas de 60');
    await expect(page.getByLabel('Ferramenta')).toHaveValue('labels');
    await page.getByLabel('Origem').selectOption('indexeddb');
    await expect(page.getByText('Nenhuma cópia encontrada')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).click();
    await expect(page.getByTestId('copy-count')).toHaveText('60 cópias');
  });
});

test.describe('acessibilidade e responsividade', () => {
  test('desktop: axe com lista, detalhes e diálogos', async ({ page }) => {
    await page.goto(URL);
    await uploadBackup(page, backupFile(backupDoc('d1', 'Etiquetas da loja', { type: 'labels', image: true }), backupDoc('d2', 'Texto longo', { type: 'texts' })));
    await expect(page.locator('[data-copy-card]')).toHaveCount(2);
    await axeClean(page);
    await openCard(page, 'Etiquetas da loja');
    await axeClean(page);
    await rename(page, 'Etiquetas da loja').click();
    await axeClean(page);
    await page.keyboard.press('Escape');
    await expect(rename(page, 'Etiquetas da loja')).toBeFocused();
    await page.getByTestId('open-import').click();
    await axeClean(page);
    await page.getByRole('button', { name: 'Examinar documentos antigos' }).click();
    await expect(page.getByTestId('wizard-none')).toBeVisible();
    await axeClean(page);
  });

  test.describe('celular 320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('gaveta de detalhes, alvos de 44 px, foco e sem rolagem horizontal', async ({ page }) => {
      await page.goto(URL);
      const longName = 'Documento com um nome absurdamente comprido para testar quebra de linha sem estourar a tela';
      await uploadBackup(page, backupFile(backupDoc('d1', longName, { type: 'labels' })));
      await expect(page.locator('[data-copy-card]')).toHaveCount(1);
      await noHorizontalScroll(page);
      await axeClean(page);
      await page.getByRole('button', { name: 'Filtros' }).click();
      await expect(page.getByLabel('Ferramenta')).toBeVisible();
      await axeClean(page);
      await page.getByRole('button', { name: 'Filtros' }).click();

      const card = page.locator('[data-copy-card]');
      await card.click();
      const sheet = page.getByRole('dialog', { name: 'Detalhes de ' + longName });
      await expect(sheet).toBeVisible();
      await noHorizontalScroll(page);
      await axeClean(page);
      for (const name of [/^Renomear cópia/, /^Exportar cópia/, /^Criar nova cópia/, /^Excluir cópia/]) {
        const box = await sheet.getByRole('button', { name }).boundingBox();
        expect(box!.height, String(name)).toBeGreaterThanOrEqual(44);
      }
      await sheet.getByRole('button', { name: /^Renomear cópia/ }).click();
      await expect(nameBox(page)).toBeFocused();
      const field = await nameBox(page).boundingBox();
      expect(field!.height).toBeGreaterThanOrEqual(44);
      expect(await nameBox(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await noHorizontalScroll(page);
      await page.keyboard.press('Escape');
      await expect(card).toBeFocused();
    });

    test('assistente de importação cabe em 320 px', async ({ page }) => {
      await page.goto(URL);
      await page.getByTestId('open-import').click();
      await noHorizontalScroll(page);
      await axeClean(page);
    });
  });

  test('movimento reduzido: sem animação nos diálogos', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(URL);
    await uploadBackup(page, backupFile(backupDoc('d1', 'Um', { type: 'labels' })));
    await page.locator('[data-copy-card]').click();
    const animation = await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });
});
