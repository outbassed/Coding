import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/* Retomada inteligente no celular: 20 minutos desde a última atividade real, só em celulares, sem passar por cima de links diretos. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;
const MIN = 60_000;
const T0 = new Date('2026-11-05T12:00:00-03:00');
const KEY = 'coding-v2-session';

const record = (page: Page) => page.evaluate((key) => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as { at: number; here: string | null; origin: string | null } : null; }, KEY);
/** Grava um registro de navegação em um documento neutro do mesmo endereço (não passa pelo Launcher nem por aplicativos). */
async function seed(context: BrowserContext, value: unknown): Promise<void> {
  const page = await context.newPage();
  await page.goto('/legacy-icons/coding.svg');
  await page.evaluate(([key, raw]) => localStorage.setItem(key as string, raw as string), [KEY, typeof value === 'string' ? value : JSON.stringify(value)]);
  await page.close();
}
const countCopies = (page: Page) => page.evaluate(() => new Promise<number>((resolve) => {
  const open = indexedDB.open('coding-v2-documents');
  open.onerror = () => resolve(-1);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('copies')) { db.close(); resolve(0); return; }
    const count = db.transaction('copies').objectStore('copies').count();
    count.onsuccess = () => { db.close(); resolve(count.result); };
  };
}));
async function phone(browser: Browser, clock = false): Promise<BrowserContext> {
  const context = await browser.newContext({ ...PHONE, baseURL: test.info().project.use.baseURL });
  if (clock) await context.clock.install({ time: T0 });
  return context;
}
async function visit(context: BrowserContext, route: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(route);
  return page;
}
/**
 * Fecha a página como o celular faz ao esconder o app: o navegador avisa (pagehide) e a página grava o último estado.
 * Antes de fechar, espera o registro chegar a outra aba do mesmo contexto, para que o teste não dependa de o navegador
 * descarregar a escrita no instante em que a aba é destruída.
 */
async function leave(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const written = await page.evaluate((key) => localStorage.getItem(key), KEY);
  const probe = await page.context().newPage();
  await probe.goto('/legacy-icons/coding.svg');
  await expect.poll(() => probe.evaluate((key) => localStorage.getItem(key), KEY)).toBe(written);
  await probe.close();
  await page.close();
}

test.describe('Retomada no celular', () => {
  for (const [route, hash, title] of [
    ['/launcher/#/catalogo', '#/catalogo', 'Catálogo'],
    ['/launcher/#/meus-apps', '#/meus-apps', 'Meus apps'],
    ['/launcher/#/app/viewer', '#/app/viewer', 'Visualizador'],
    ['/launcher/#/documentos', '#/documentos', 'Documentos']
  ] as const) {
    test('reabrir pela página inicial leva de volta a ' + title, async ({ browser }) => {
      const context = await phone(browser);
      const first = await visit(context, route);
      await expect.poll(async () => (await record(first))?.here).toBe('/launcher/' + hash);
      await leave(first);
      const second = await context.newPage();
      await second.goto('/');
      await expect(second).toHaveURL(new RegExp('/launcher/' + hash.replace(/[#/]/g, (c) => '\\' + c) + '$'));
      await expect(second.locator('h1').first()).toContainText(title);
      await context.close();
    });
  }

  test('estava no Início: reabre no Início', async ({ browser }) => {
    const context = await phone(browser);
    const first = await visit(context, '/launcher/#/');
    await leave(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });

  test('aplicativo com documento: volta ao mesmo documento, sem criar outro', async ({ browser }) => {
    const context = await phone(browser);
    const first = await visit(context, '/apps/visualizador/');
    await first.getByTestId('viewer-input').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('meu documento em edição') });
    await expect(first.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
    await expect(first).toHaveURL(/\?doc=/);
    const url = first.url();
    const before = await countCopies(first);
    expect(before).toBe(1);
    await expect.poll(async () => (await record(first))?.here, { timeout: 8000 }).toContain('?doc='); // o app trocou o endereço sozinho e o registro acompanhou
    await leave(first);

    const second = await context.newPage();
    await second.goto('/');
    await expect(second).toHaveURL(url);
    await expect(second.locator('body')).toContainText('meu documento em edição'); // é o mesmo documento, com o conteúdo dele
    expect(await countCopies(second)).toBe(before);
    await context.close();
  });

  for (const minutes of [1, 5, 19]) {
    test('retoma ' + minutes + ' min depois da última atividade', async ({ browser }) => {
      const context = await phone(browser, true);
      const first = await visit(context, '/launcher/#/catalogo');
      await expect.poll(async () => (await record(first))?.here).toBe('/launcher/#/catalogo');
      await leave(first);
      await context.clock.fastForward(minutes * MIN);
      const second = await context.newPage();
      await second.goto('/');
      await expect(second).toHaveURL(/\/launcher\/#\/catalogo$/);
      await context.close();
    });
  }

  test('aos 20 min expira: abre no Início e não apaga nada', async ({ browser }) => {
    const context = await phone(browser, true);
    const marker = await context.newPage();
    await marker.goto('/legacy-icons/coding.svg');
    await marker.evaluate(() => { localStorage.setItem('coding-v2-theme', 'dark'); localStorage.setItem('coding-v2-marcador', 'fica'); localStorage.setItem('coding-v2-marcador-2', '{"a":[1,2]}'); });
    await marker.close();
    const first = await visit(context, '/launcher/#/catalogo');
    await expect.poll(async () => (await record(first))?.here).toBe('/launcher/#/catalogo');
    await leave(first);
    await context.clock.fastForward(20 * MIN);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second).toHaveURL(/\/launcher\/#\/$/);
    expect(await second.evaluate(() => [localStorage.getItem('coding-v2-theme'), localStorage.getItem('coding-v2-marcador'), localStorage.getItem('coding-v2-marcador-2')])).toEqual(['dark', 'fica', '{"a":[1,2]}']);
    // a sessão vencida não deixa origem antiga para trás
    expect((await record(second))?.origin).toBeNull();
    await context.close();
  });

  test('o prazo conta a partir da última atividade, não da abertura', async ({ browser }) => {
    const context = await phone(browser, true);
    const first = await visit(context, '/launcher/#/catalogo');
    await expect.poll(async () => (await record(first))?.here).toBe('/launcher/#/catalogo'); // o Launcher já está acompanhando
    await context.clock.fastForward(15 * MIN);
    await first.mouse.wheel(0, 40); // atividade real (rolagem) aos 15 min
    // A gravação pode esperar até 15 s (controle de escrita), mas o fechamento sempre grava a última atividade real.
    await leave(first);
    await context.clock.fastForward(19 * MIN); // 34 min desde a abertura, 19 desde a última atividade
    const second = await context.newPage();
    await second.goto('/');
    await expect(second).toHaveURL(/\/launcher\/#\/catalogo$/);
    await context.close();

    const other = await phone(browser, true);
    const a = await visit(other, '/launcher/#/catalogo');
    await expect.poll(async () => (await record(a))?.here).toBe('/launcher/#/catalogo');
    await other.clock.fastForward(15 * MIN);
    await a.mouse.wheel(0, 40);
    await leave(a);
    await other.clock.fastForward(20 * MIN);
    const b = await other.newPage();
    await b.goto('/');
    await expect(b).toHaveURL(/\/launcher\/#\/$/);
    await other.close();
  });

  test('links diretos mandam: a retomada não passa por cima deles', async ({ browser }) => {
    const context = await phone(browser);
    await seed(context, { v: 1, at: Date.now(), here: '/apps/zip/', origin: null });
    const settings = await context.newPage();
    await settings.goto('/launcher/#/ajustes');
    await expect(settings).toHaveURL(/#\/ajustes$/);
    await settings.close();
    await seed(context, { v: 1, at: Date.now(), here: '/apps/zip/', origin: null });
    const home = await context.newPage();
    await home.goto('/launcher/#/');
    await expect(home).toHaveURL(/\/launcher\/#\/$/); // endereço pedido por inteiro, mesmo sendo o Início
    await home.close();
    await seed(context, { v: 1, at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    const direct = await context.newPage();
    await direct.goto('/apps/calculadora/');
    await expect(direct).toHaveURL(/\/apps\/calculadora\/$/);
    await context.close();
  });

  test('recarregar a página não dispara retomada', async ({ browser }) => {
    const context = await phone(browser);
    const page = await visit(context, '/launcher/#/');
    await seed(context, { v: 1, at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    await page.reload();
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });

  test('documento apagado, aplicativo desconhecido ou registro adulterado abrem o Início, sem tela de erro', async ({ browser }) => {
    for (const here of ['/apps/texto/?doc=nao-existe-mais', '/apps/inexistente/', 'https://evil.example/', 'javascript:alert(1)', '/launcher/#/rota-que-nao-existe']) {
      const context = await phone(browser);
      await seed(context, { v: 1, at: Date.now(), here, origin: null });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page, here).toHaveURL(/\/launcher\/#\/$/);
      await expect(page.locator('h1').first()).toBeVisible();
      await context.close();
    }
    const context = await phone(browser);
    await seed(context, 'isto não é json');
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });

  test('tela de erro (rota inexistente) não é guardada para retomada', async ({ browser }) => {
    const context = await phone(browser);
    const first = await visit(context, '/launcher/#/meus-apps');
    await expect.poll(async () => (await record(first))?.here).toBe('/launcher/#/meus-apps');
    await first.goto('/launcher/#/rota-que-nao-existe');
    await expect(first.locator('h1').first()).toBeVisible();
    await leave(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second).toHaveURL(/\/launcher\/#\/meus-apps$/);
    await context.close();
  });

  test('sem laço: depois de retomar um app, "Início" leva ao Launcher e ele fica lá', async ({ browser }) => {
    const context = await phone(browser);
    await seed(context, { v: 1, at: Date.now(), here: '/apps/zip/', origin: null });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/apps\/zip\/$/);
    await page.locator('a[href^="/launcher/"]').first().click();
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });

  test('a origem sobrevive à retomada dentro dos 20 min', async ({ browser }) => {
    const context = await phone(browser);
    await seed(context, { v: 1, at: Date.now(), here: '/apps/zip/', origin: '/launcher/#/catalogo' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/apps\/zip\/$/);
    await page.locator('a[href^="/launcher/"]').first().click();
    await expect(page).toHaveURL(/\/launcher\/#\/catalogo$/);
    await context.close();
  });
});

test.describe('Fora do celular não há retomada automática', () => {
  test('computador (desktop)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: test.info().project.use.baseURL });
    await seed(context, { v: 1, at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });
  test('tablet com toque', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
    await seed(context, { v: 1, at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/launcher\/#\/$/);
    await context.close();
  });
});
