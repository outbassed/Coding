import { test, expect, type Page } from '@playwright/test';
import { backupDoc, backupFile, uploadBackup } from './helpers';

/* Cenários K e L: salvamentos antigos migram sem perda; cota cheia, gravação interrompida e duas janelas nunca perdem nem sobrescrevem texto sem aviso. */
const EDITOR = '/apps/codigo/';
const saveStatus = (page: Page) => page.getByTestId('save-status');
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const row = (page: Page, path: string) => page.locator('[data-testid="tree-row"][data-path="' + path + '"]');
const frame = (page: Page) => page.frameLocator('[data-testid="code-frame"]');

async function copies(page: Page): Promise<{ id: string; label: string; revision: number; state: Record<string, unknown> }[]> {
  return page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((d) => d.name === 'coding-v2-documents')) return []; // não cria um banco vazio só para olhar
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    if (!db.objectStoreNames.contains('copies')) { db.close(); return []; }
    const rows = await new Promise<Array<{ id: string; label: string; revision: number; snapshot: { doc: { state: Record<string, unknown> } } }>>((resolve, reject) => {
      const r = db.transaction('copies', 'readonly').objectStore('copies').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close();
    return rows.map((c) => ({ id: c.id, label: c.label, revision: c.revision, state: c.snapshot.doc.state }));
  });
}
async function edit(page: Page, path: string, value: string): Promise<void> {
  await tab(page, 'Explorador').click();
  await row(page, path).click();
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', path);
  await page.getByTestId('code-editor').fill(value);
}

test.describe('Persistência', () => {
  test('K: projeto salvo no formato antigo (html/css/js) abre migrado, sem perder nada e sem regravar sozinho', async ({ page }) => {
    const base = backupDoc('cod-antigo', 'Projeto antigo', { type: 'code', updatedAt: 1_700_000_000_000 });
    const entry = { ...base, doc: { ...base.doc, state: { name: 'Projeto antigo', html: '<h1>Título antigo</h1>', css: 'h1 { color: rgb(9, 8, 7); }', js: "console.log('do formato antigo');", auto: true, tabSize: 4 } } };
    await page.goto('/launcher/#/documentos');
    await uploadBackup(page, backupFile(entry as ReturnType<typeof backupDoc>));
    await expect(page.getByTestId('copy-count')).toContainText('cópia');
    const [saved] = await copies(page);
    expect(saved).toBeTruthy();

    await page.goto(EDITOR + '?doc=' + saved!.id);
    await expect(frame(page).getByRole('heading', { name: 'Título antigo' })).toBeVisible();
    await expect(frame(page).getByRole('heading', { name: 'Título antigo' })).toHaveCSS('color', 'rgb(9, 8, 7)');
    await expect(page.getByTestId('console')).toContainText('do formato antigo');
    for (const p of ['index.html', 'style.css', 'script.js']) await expect(row(page, p)).toBeVisible();
    await expect(saveStatus(page)).toHaveText('Salvo neste aparelho');
    expect((await copies(page))[0]!.revision).toBe(saved!.revision); // abrir não regrava

    // ao editar, grava no formato novo e os três conteúdos continuam lá
    await edit(page, 'script.js', "console.log('editado depois da migração');");
    await expect(saveStatus(page)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    const after = (await copies(page))[0]!;
    expect(after.revision).toBeGreaterThan(saved!.revision);
    const files = after.state.files as { path: string; text: string }[];
    expect(files.find((f) => f.path === 'index.html')!.text).toBe('<h1>Título antigo</h1>');
    expect(files.find((f) => f.path === 'style.css')!.text).toBe('h1 { color: rgb(9, 8, 7); }');
    expect(files.find((f) => f.path === 'script.js')!.text).toContain('editado depois da migração');
  });

  test('K: documento com conteúdo ilegível não derruba o app nem é apagado', async ({ page }) => {
    const base = backupDoc('cod-ruim', 'Projeto estranho', { type: 'code', updatedAt: 1_700_000_000_000 });
    const entry = { ...base, doc: { ...base.doc, state: { name: 'Projeto estranho', files: 'isto não é uma lista', html: 42, auto: 'talvez' } } };
    await page.goto('/launcher/#/documentos');
    await uploadBackup(page, backupFile(entry as ReturnType<typeof backupDoc>));
    await expect(page.getByTestId('copy-count')).toContainText('cópia');
    const [saved] = await copies(page);
    await page.goto(EDITOR + '?doc=' + saved!.id);
    await expect(page.getByTestId('code-editor')).toBeVisible(); // abre com arquivos de partida
    await expect(page.getByTestId('load-error')).toHaveCount(0);
    expect((await copies(page)).length).toBe(1); // o original continua guardado
  });

  test('L: cota cheia mostra o erro, mantém o texto na tela e salva quando há espaço de novo', async ({ page }) => {
    await page.goto(EDITOR + '?modelo=ola');
    await page.evaluate(() => {
      const w = window as unknown as { __quota: boolean };
      w.__quota = true;
      for (const method of ['put', 'add'] as const) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
          if (w.__quota) throw new DOMException('simulado', 'QuotaExceededError');
          return original.apply(this, args);
        } as typeof original;
      }
    });
    await edit(page, 'script.js', "console.log('texto que não pode se perder');");
    await expect(saveStatus(page)).toHaveText('Erro ao salvar', { timeout: 10000 });
    await expect(page.getByTestId('save-error')).toContainText('armazenamento deste aparelho está cheio');
    await expect(page.getByTestId('save-error')).toContainText('Suas alterações continuam na tela');
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('texto que não pode se perder');");
    expect(await copies(page)).toHaveLength(0); // nada foi gravado pela metade

    await page.evaluate(() => { (window as unknown as { __quota: boolean }).__quota = false; });
    await page.getByTestId('save-error').getByRole('button', { name: 'Tentar salvar de novo' }).click();
    await expect(saveStatus(page)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    await page.reload();
    await tab(page, 'Explorador').click();
    await row(page, 'script.js').click();
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('texto que não pode se perder');");
    expect(await copies(page)).toHaveLength(1);
  });

  test('L: duas janelas no mesmo projeto — a segunda não sobrescreve em silêncio e oferece uma cópia', async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    await a.goto(EDITOR + '?modelo=ola');
    await edit(a, 'script.js', "console.log('versão A');");
    await expect(saveStatus(a)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    const url = a.url();
    expect(url).toMatch(/\?doc=/);

    const b = await context.newPage();
    await b.goto(url);
    await expect(frame(b).getByRole('heading', { name: 'Olá, mundo!' })).toBeVisible();
    await edit(a, 'script.js', "console.log('versão A2');");
    await expect(saveStatus(a)).toHaveText('Salvo neste aparelho', { timeout: 10000 });

    await edit(b, 'script.js', "console.log('versão B');");
    await expect(saveStatus(b)).toHaveText('Conflito · não salvo', { timeout: 10000 });
    await expect(b.getByTestId('conflict')).toContainText('Este documento mudou em outra janela');
    await expect(b.getByTestId('code-editor')).toHaveValue("console.log('versão B');"); // o texto de B continua na tela
    let saved: Awaited<ReturnType<typeof copies>>[number] | undefined = (await copies(a))[0];
    expect((saved!.state.files as { path: string; text: string }[]).find((f) => f.path === 'script.js')!.text).toContain('versão A2'); // e A não foi sobrescrita

    await b.getByTestId('conflict-copy').click();
    await expect(saveStatus(b)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    const all = await copies(a);
    expect(all).toHaveLength(2);
    saved = all.find((c) => c.label.includes('(cópia)'));
    expect(saved).toBeTruthy();
    expect((saved!.state.files as { path: string; text: string }[]).find((f) => f.path === 'script.js')!.text).toContain('versão B');
    await context.close();
  });

  test('L: “Descartar e abrir a versão salva” traz de volta o texto da outra janela', async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    await a.goto(EDITOR + '?modelo=ola');
    await edit(a, 'script.js', "console.log('primeira');");
    await expect(saveStatus(a)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    const b = await context.newPage();
    await b.goto(a.url());
    await edit(a, 'script.js', "console.log('segunda');");
    await expect(saveStatus(a)).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    await edit(b, 'script.js', "console.log('terceira');");
    await expect(saveStatus(b)).toHaveText('Conflito · não salvo', { timeout: 10000 });
    await b.getByTestId('conflict-reload').click();
    await expect(saveStatus(b)).toHaveText('Salvo neste aparelho');
    await expect(b.getByTestId('code-editor')).toHaveValue("console.log('segunda');");
    await context.close();
  });
});
