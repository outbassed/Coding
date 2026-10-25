import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, uploadBackup } from './helpers';

const EDITOR = '/apps/etiquetas/';
const T0 = 1_700_000_000_000;
type Entry = ReturnType<typeof backupDoc>;
function labels(id: string, name: string, n: number): Entry {
  const base = backupDoc(id, name, { type: 'labels', updatedAt: T0 + n * 60_000 });
  return { ...base, doc: { ...base.doc, state: { name, items: [{ id: 'a', code: 'K-' + n, description: 'Peça ' + n, copies: 1 }] } } } as Entry;
}
const named = (count: number): Entry[] => Array.from({ length: count }, (_, i) => labels('p' + i, 'Projeto ' + String(i + 1).padStart(2, '0'), i + 1));

async function seed(page: Page, ...entries: Entry[]): Promise<void> {
  await page.goto('/launcher/#/documentos');
  await uploadBackup(page, backupFile(...entries));
  await expect(page.getByTestId('copy-count')).toContainText('cópia');
}
async function ids(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<Array<{ id: string; label: string }>>((resolve, reject) => { const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return Object.fromEntries(rows.map((c) => [c.label, c.id]));
  });
}
const title = (page: Page) => page.getByTestId('doc-title');
const tabs = (page: Page) => page.getByTestId('project-tab');
const stored = (page: Page, app = 'labels') => page.evaluate((key) => JSON.parse(localStorage.getItem('coding-v2-tabs:' + key) ?? 'null'), app);
async function openAll(page: Page, map: Record<string, string>, names: string[]): Promise<void> {
  for (const name of names) {
    await page.goto(EDITOR + '?doc=' + map[name]);
    await expect(title(page)).toHaveText(name);
  }
}

test.describe('Abas de projeto por app', () => {
  test('5 abas visíveis, +N escondido, restaurar o último projeto ao recarregar', async ({ page }) => {
    await seed(page, ...named(8));
    const map = await ids(page);
    const names = Array.from({ length: 8 }, (_, i) => 'Projeto ' + String(i + 1).padStart(2, '0'));
    await openAll(page, map, names);
    await expect(tabs(page)).toHaveCount(5);
    await expect(page.getByTestId('tab-overflow')).toHaveText('+3');
    expect((await stored(page)).open).toHaveLength(8);
    // Abrir o app sem endereço de documento volta ao último projeto.
    await page.goto(EDITOR);
    await expect(title(page)).toHaveText('Projeto 08');
    await expect(page).toHaveURL(/\?doc=/);
    await page.reload();
    await expect(title(page)).toHaveText('Projeto 08');
    // A aba aberta fica marcada.
    await expect(page.locator('[data-testid="project-tab"][aria-current="true"]')).toHaveText('Projeto 08');
  });

  test('escolher uma aba escondida troca a visível menos recentemente acessada e preserva as 8', async ({ page }) => {
    await seed(page, ...named(8));
    const map = await ids(page);
    const names = Array.from({ length: 8 }, (_, i) => 'Projeto ' + String(i + 1).padStart(2, '0'));
    await openAll(page, map, names);
    const before = await stored(page);
    const hidden: string[] = before.open.slice(5).map((t: { title: string }) => t.title);
    const visibleBefore: Array<{ title: string; accessedAt: number }> = before.open.slice(0, 5);
    const lru = [...visibleBefore].filter((t) => t.title !== 'Projeto 08').sort((a, b) => a.accessedAt - b.accessedAt)[0]!.title;
    await page.getByTestId('tab-overflow').click();
    await expect(page.getByTestId('tab-list')).toBeVisible();
    await page.getByTestId('tab-search').fill(hidden[0]!);
    await page.getByTestId('tab-row').first().locator('.pt-row-open').click();
    await expect(title(page)).toHaveText(hidden[0]!);
    const after = await stored(page);
    expect(after.open).toHaveLength(8);
    expect(after.open.slice(0, 5).map((t: { title: string }) => t.title)).toContain(hidden[0]);
    expect(after.open.slice(5).map((t: { title: string }) => t.title)).toContain(lru);
    await expect(page.getByTestId('tab-overflow')).toHaveText('+3');
  });

  test('fechar a aba não apaga o projeto; a Biblioteca continua com todos', async ({ page }) => {
    await seed(page, ...named(3));
    const map = await ids(page);
    await openAll(page, map, ['Projeto 01', 'Projeto 02', 'Projeto 03']);
    await page.getByRole('button', { name: 'Fechar a aba Projeto 01' }).click();
    await expect(tabs(page)).toHaveCount(2);
    await page.goto('/launcher/#/documentos');
    await expect(page.getByTestId('copy-count')).toContainText('3 cópias');
  });

  test('fechar a aba aberta vai para a mais recente; a última leva a um projeto novo em branco', async ({ page }) => {
    await seed(page, ...named(2));
    const map = await ids(page);
    await openAll(page, map, ['Projeto 01', 'Projeto 02']);
    await page.getByRole('button', { name: 'Fechar a aba Projeto 02' }).click();
    await expect(title(page)).toHaveText('Projeto 01');
    await page.getByRole('button', { name: 'Fechar a aba Projeto 01' }).click();
    await expect(page).toHaveURL(/\?novo=1/);
    await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');
    // ?novo=1 não é "restaurado" de volta ao último projeto.
    await page.reload();
    await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');
  });

  test('renomear pela aba (F2) muda o nome do documento salvo', async ({ page }) => {
    await seed(page, ...named(2));
    const map = await ids(page);
    await openAll(page, map, ['Projeto 01']);
    await tabs(page).first().focus();
    await page.keyboard.press('F2');
    await page.getByTestId('tab-rename-input').fill('Estoque de abril');
    await page.keyboard.press('Enter');
    await expect(tabs(page).first()).toHaveText('Estoque de abril');
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 8000 });
    await page.reload();
    await expect(title(page)).toHaveText('Estoque de abril');
  });

  test('projeto da última sessão que não existe mais: abre em branco, sem erro, e some das abas', async ({ page }) => {
    await page.goto(EDITOR + '?novo=1');
    await page.evaluate(() => localStorage.setItem('coding-v2-tabs:labels', JSON.stringify({ v: 1, active: 'fantasma', open: [{ id: 'fantasma', title: 'Fantasma', accessedAt: 1 }] })));
    await page.goto(EDITOR);
    await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');
    await expect(page.getByTestId('load-error')).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).open.length).toBe(0);
  });

  test('preferência "Começar um projeto novo" desliga a restauração', async ({ page }) => {
    await seed(page, ...named(2));
    const map = await ids(page);
    await openAll(page, map, ['Projeto 01']);
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('startup-new').check();
    await page.goto(EDITOR);
    await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('startup-continue').check();
    await page.goto(EDITOR);
    await expect(title(page)).toHaveText('Projeto 01');
  });

  test('celular: seletor de projetos lista todas as abas e abre a escolhida', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, ...named(7));
    const map = await ids(page);
    await openAll(page, map, Array.from({ length: 7 }, (_, i) => 'Projeto ' + String(i + 1).padStart(2, '0')));
    const switcher = page.getByTestId('tab-switcher');
    await expect(switcher).toContainText('Projeto 07');
    await switcher.click();
    await expect(page.getByTestId('tab-row')).toHaveCount(7);
    await page.getByTestId('tab-search').fill('Projeto 03');
    await page.getByTestId('tab-row').first().locator('.pt-row-open').click();
    await expect(page.getByTestId('tab-switcher')).toContainText('Projeto 03');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('sem violações de acessibilidade com a lista de abas aberta', async ({ page }) => {
    await seed(page, ...named(7));
    const map = await ids(page);
    await openAll(page, map, Array.from({ length: 7 }, (_, i) => 'Projeto ' + String(i + 1).padStart(2, '0')));
    await page.getByTestId('tab-overflow').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});

test.describe('Limites de projetos salvos', () => {
  test('manual 32 com 32 salvos: "+" desativado com o motivo e criar é recusado sem gravar nada pela metade', async ({ page }) => {
    await seed(page, ...named(32));
    await page.evaluate(() => localStorage.setItem('coding-v2-limits', JSON.stringify({ v: 1, mode: 'manual', tier: 32, overrides: {} })));
    await page.goto(EDITOR + '?novo=1');
    await expect(page.getByTestId('tab-new')).toBeDisabled();
    await expect(page.getByTestId('tab-limit')).toContainText('Limite de 32');
    // Mesmo assim, digitar num projeto novo tenta salvar: a gravação é recusada de forma atômica.
    await page.getByLabel('Código do item 1').fill('LIMITE-1');
    await expect(page.getByTestId('save-error')).toContainText('Limite de 32', { timeout: 8000 });
    const count = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const n = await new Promise<number>((resolve, reject) => { const r = db.transaction('copies', 'readonly').objectStore('copies').count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      db.close();
      return n;
    });
    expect(count).toBe(32);
  });

  test('Ajustes: faixas abaixo da quantidade salva ficam desativadas, com o motivo', async ({ page }) => {
    await seed(page, ...named(40));
    await page.goto('/launcher/#/ajustes');
    await expect(page.locator('[data-testid="doc-counts"] li', { hasText: 'Etiquetas' })).toContainText('40');
    await page.getByTestId('limit-manual').check();
    await expect(page.getByTestId('limit-tiers')).toBeVisible();
    await expect(page.getByTestId('tier-32')).toBeDisabled();
    await expect(page.getByTestId('tier-64')).toBeEnabled();
    await expect(page.getByTestId('tier-reasons')).toContainText('Você tem 40 projetos salvos');
    // Um app não aceita valor menor que a quantidade salva nele.
    const row = page.locator('[data-testid="limit-apps"] li[data-app="labels"]');
    await expect(row.locator('option[value="32"]')).toBeDisabled();
    await expect(row).toContainText('40 de');
  });

  test('automático eleva o limite efetivo sem apagar nada (70 salvos → 128)', async ({ page }) => {
    await seed(page, ...named(70));
    await page.goto('/launcher/#/ajustes');
    const row = page.locator('[data-testid="limit-apps"] li[data-app="labels"]');
    await expect(row).toContainText('70 de 128 salvos');
    await page.goto('/launcher/#/documentos');
    await expect(page.getByTestId('copy-count')).toContainText('70 cópias');
  });

  test('escolher 64 para um app com 50 salvos vale; cada app tem contagem independente', async ({ page }) => {
    await seed(page, ...named(50));
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('limit-labels').selectOption('64');
    const row = page.locator('[data-testid="limit-apps"] li[data-app="labels"]');
    await expect(row).toContainText('50 de 64 salvos');
    const texto = page.locator('[data-testid="limit-apps"] li[data-app="texts"]');
    await expect(texto).toContainText('0 de');
    await page.reload();
    await expect(page.getByTestId('limit-labels')).toHaveValue('64');
  });

  test('1024 projetos abertos: +1019, só 5 visíveis e a página continua leve', async ({ page }) => {
    await page.goto(EDITOR + '?novo=1');
    await page.evaluate(() => {
      const open = Array.from({ length: 1024 }, (_, i) => ({ id: 'x' + i, title: 'Projeto ' + (i + 1), accessedAt: i + 1 }));
      localStorage.setItem('coding-v2-tabs:labels', JSON.stringify({ v: 1, active: null, open }));
    });
    await page.goto(EDITOR + '?novo=1');
    await expect(page.getByTestId('tab-overflow')).toHaveText('+1019');
    await expect(tabs(page)).toHaveCount(5);
    await page.getByTestId('tab-overflow').click();
    expect(await page.getByTestId('tab-row').count()).toBeLessThanOrEqual(200);
    await page.getByTestId('tab-search').fill('Projeto 1024');
    await expect(page.getByTestId('tab-row')).toHaveCount(1);
  });
});
