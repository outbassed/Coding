import { test, expect, type Page, type Download } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/* Fumaça funcional dos nove apps: abrir, editar, salvar, reabrir e exportar de verdade. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
async function axeClean(page: Page, label = ''): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
async function bytesOf(download: Download): Promise<Buffer> { return readFileSync((await download.path())!); }
async function makePng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200;
    const g = c.getContext('2d')!; g.fillStyle = '#2a7de1'; g.fillRect(0, 0, 320, 200); g.fillStyle = '#fff'; g.fillRect(20, 20, 120, 60);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });

test.describe('Racha-conta', () => {
  test('modelo pronto, nova despesa em centavos, salva, reabre e exporta CSV', async ({ page }) => {
    await page.goto('/apps/racha-conta/');
    await expect(page.getByTestId('split-total')).toHaveText('R$ 2.006,40');
    await expect(page.getByTestId('transfers').locator('li')).toHaveCount(3);
    await page.getByTestId('add-expense').click();
    await page.locator('#exp-desc').fill('Sorvete');
    await page.locator('#exp-amount').fill('40,10');
    await expect(page.getByTestId('split-total')).toHaveText('R$ 2.046,50');
    await saved(page);
    await expect(page).toHaveURL(/\?doc=/);
    await page.reload();
    await expect(page.getByTestId('split-total')).toHaveText('R$ 2.046,50');
    await tab(page, 'Arquivo').click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    expect((await bytesOf(csv)).toString('utf8')).toContain('Sorvete');
  });
  test('divisão por porcentagem incompleta é avisada e fica fora das contas', async ({ page }) => {
    await page.goto('/apps/racha-conta/?modelo=em-branco');
    await page.getByTestId('add-expense').click();
    await page.locator('#exp-amount').fill('100');
    await page.getByRole('radio', { name: 'Porcentagem' }).click();
    const first = page.locator('[id^="share-"]').first();
    await first.fill('10');
    await expect(page.getByTestId('expense-error')).toContainText('precisam somar 100%');
    await expect(page.getByTestId('split-total')).toHaveText('R$ 0,00');
  });
});

test.describe('Sorteio', () => {
  test('roleta sem repetir, números sem repetição e histórico salvo', async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('coding-v2-motion', 'reduce'));
    page.setDefaultTimeout(8000);
    await page.goto('/apps/sorteio/');
    await expect(page.getByTestId('spin')).toBeEnabled();
    const names = ['Ana', 'Bruno', 'Carla', 'Davi', 'Elisa', 'Fábio', 'Gabi', 'Hugo'];
    const drawn: string[] = [];
    for (let i = 0; i < 8; i++) {
      await test.step('giro ' + (i + 1), async () => { await page.getByTestId('spin').click(); await expect(page.getByTestId('spin')).toBeEnabled(); });
      const result = page.getByTestId('draw-result').locator('strong');
      await expect(page.getByTestId('history').locator('li')).toHaveCount(i + 1);
      drawn.push((await result.textContent())!.trim());
    }
    expect([...drawn].sort()).toEqual([...names].sort());
    await page.getByTestId('spin').click();
    await expect(page.getByTestId('draw-error')).toContainText('Todos os nomes já foram sorteados');
    await tab(page, 'Números').click();
    await page.getByTestId('num-min').fill('1'); await page.getByTestId('num-max').fill('3'); await page.getByTestId('num-count').fill('3');
    await page.getByTestId('draw-numbers').click();
    const nums = (await page.getByTestId('draw-result').locator('strong').textContent())!.split(',').map((x) => Number(x.trim())).sort();
    expect(nums).toEqual([1, 2, 3]);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('history').locator('li')).toHaveCount(9);
  });
});

test.describe('QR / Barras', () => {
  test('gera, valida EAN-13 e exporta SVG e PNG', async ({ page }) => {
    page.setDefaultTimeout(8000);
    await page.goto('/apps/qr/');
    await expect(page.getByTestId('code-preview').locator('svg')).toBeVisible();
    await page.getByTestId('code-kind').selectOption('ean13');
    await page.getByTestId('code-caption').fill('');
    await page.getByTestId('code-value').fill('7891234567890');
    await expect(page.getByTestId('code-error')).toContainText('Dígito verificador incorreto');
    await page.getByTestId('code-value').fill('789123456789');
    await expect(page.getByTestId('code-preview')).toContainText('7891234567895');
    await tab(page, 'Arquivo').click();
    const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-svg').click()]);
    expect((await bytesOf(svg)).toString('utf8')).toMatch(/^<svg[\s\S]*<rect/);
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    expect([...(await bytesOf(png)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('code-value')).toHaveValue('789123456789');
  });
});

test.describe('Planilhas', () => {
  test('fórmulas recalculam, salvam, reabrem e exportam XLSX; importa CSV como nova aba', async ({ page }) => {
    await page.goto('/apps/planilhas/');
    await expect(page.locator('[data-cell="B8"]')).toHaveText('R$ 4.120,00');
    await page.locator('[data-cell="B2"]').click();
    await page.keyboard.type('2000');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-cell="B8"]')).toHaveText('R$ 4.320,00');
    await page.locator('[data-cell="G2"]').click();
    await page.getByTestId('formula-bar').fill('=SOMA(B2:B3)*2');
    await page.getByTestId('formula-bar').press('Enter');
    await expect(page.locator('[data-cell="G2"]')).toHaveText('5900');
    await page.locator('[data-cell="G3"]').click();
    await page.getByTestId('formula-bar').fill('=1/0');
    await page.getByTestId('formula-bar').press('Enter');
    await expect(page.locator('[data-cell="G3"]')).toHaveText('#DIV/0!');
    await saved(page);
    await page.reload();
    await expect(page.locator('[data-cell="B8"]')).toHaveText('R$ 4.320,00');
    await tab(page, 'Arquivo').click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    expect((await bytesOf(xlsx)).subarray(0, 2).toString('latin1')).toBe('PK');
    await page.getByTestId('import-input').setInputFiles({ name: 'vendas.csv', mimeType: 'text/csv', buffer: Buffer.from('Produto;Valor\nCafé;12,50\nPão;3,20\n') });
    await expect(page.getByTestId('file-message')).toContainText('1 aba(s) importada(s)');
    await expect(page.getByTestId('sheet-tabs').getByRole('tab', { name: 'vendas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-cell="A2"]')).toHaveText('Café');
  });
});

test.describe('Planilha → Etiquetas', () => {
  test('planilha de exemplo vira documento de Etiquetas; importação mostra linhas com problema', async ({ page }) => {
    await page.goto('/apps/planilha-etiquetas/');
    await tab(page, 'Gerar').click();
    await expect(page.getByTestId('conversion-summary')).toContainText('5 itens · 13 etiquetas');
    await page.getByTestId('create-labels').click();
    await expect(page.getByTestId('created')).toContainText('Estoque da oficina');
    await page.getByTestId('open-created').click();
    await expect(page).toHaveURL(/\/apps\/etiquetas\/\?doc=/);
    await expect(page.getByTestId('doc-title')).toHaveText('Estoque da oficina');
    await page.goto('/apps/planilha-etiquetas/?modelo=em-branco');
    await page.getByTestId('table-input').setInputFiles({ name: 'itens.csv', mimeType: 'text/csv', buffer: Buffer.from('SKU;Produto;Qtd\nX1;Item um;2\nX2;Item dois;dez\nX3;Item três;\n') });
    await expect(page.getByTestId('map-code')).toHaveValue('0');
    await tab(page, 'Gerar').click();
    await expect(page.getByTestId('conversion-summary')).toContainText('2 itens · 3 etiquetas');
    await expect(page.getByTestId('issues')).toContainText('Linha 3');
  });
});

test.describe('Imagens', () => {
  test('camadas, imagem enviada, desfazer, exportar PNG e reabrir com a foto', async ({ page }) => {
    await page.goto('/apps/imagens/');
    const layers = page.getByTestId('layers').locator('li');
    await expect(layers).toHaveCount(6);
    await page.getByTestId('add-text').click();
    await expect(layers).toHaveCount(7);
    await page.getByTestId('undo').click();
    await expect(layers).toHaveCount(6);
    await page.getByTestId('image-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
    await expect(layers).toHaveCount(7);
    await expect(layers.first()).toContainText('foto');
    await tab(page, 'Ajustar').click();
    await page.getByTestId('flip-x').click();
    await page.getByTestId('crop-left').fill('10'); await page.getByTestId('crop-left').press('Tab');
    await tab(page, 'Filtros').click();
    await page.locator('[data-preset="bw"]').click();
    await tab(page, 'Arquivo').click();
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
    expect([...(await bytesOf(png)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const [jpg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-jpg').click()]);
    expect([...(await bytesOf(jpg)).subarray(0, 2)]).toEqual([0xff, 0xd8]);
    await saved(page);
    await page.reload();
    await tab(page, 'Camadas').click();
    await expect(page.getByTestId('layers').locator('li')).toHaveCount(7);
    await expect(page.getByTestId('layers').locator('li').first()).toContainText('foto');
  });
});

test.describe('Editor PDF', () => {
  test('PDF de exemplo: girar, duplicar, anotar, salvar, reabrir e baixar um PDF novo', async ({ page }) => {
    await page.goto('/apps/pdf/');
    await page.getByTestId('sample-pdf-stage').click();
    await expect(page.getByTestId('page-number')).toHaveText('1 / 3');
    await page.getByTestId('rotate-page').click();
    await page.getByTestId('duplicate-page').click();
    await expect(page.getByTestId('page-number')).toHaveText('1 / 4');
    await tab(page, 'Anotar').click();
    await page.getByTestId('add-note-text').click();
    await page.getByTestId('note-text').fill('Aprovado');
    await expect(page.getByTestId('ann-text')).toContainText('Aprovado');
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('page-number')).toHaveText('1 / 4');
    await tab(page, 'Arquivo').click();
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    const bytes = await bytesOf(pdf);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await tab(page, 'Páginas').click();
    await page.getByTestId('pdf-input').setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('não sou um pdf') });
    await expect(page.getByTestId('pdf-message')).toContainText('não é um PDF');
    await expect(page.getByTestId('page-number')).toHaveText('1 / 4');
  });
});

test.describe('Etiquetas · novidades', () => {
  test('modelo novo, layout pronto e importação CSV com colunas', async ({ page }) => {
    await page.goto('/apps/etiquetas/?modelo=prateleira');
    await expect(page.getByTestId('doc-title')).toHaveText('Prateleira');
    await expect(page.getByTestId('sheet')).toContainText('A-01');
    await page.getByRole('tab', { name: 'Modelos' }).click();
    await page.locator('[data-layout="pequenas"]').click();
    await page.getByRole('tab', { name: 'Página' }).click();
    await expect(page.getByRole('button', { name: '3 colunas' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'Itens' }).click();
    await page.getByTestId('open-table-import').click();
    await page.getByTestId('table-import-input').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from('Código;Descrição;Quantidade\nZ1;Parafuso;2\nZ2;Porca;1\n') });
    await expect(page.getByTestId('ti-summary')).toContainText('2 itens');
    await page.getByTestId('ti-append').click();
    await expect(page.getByTestId('sheet')).toContainText('Z2');
  });
  test('QR e código de barras dentro das etiquetas, também no PDF', async ({ page }) => {
    await page.goto('/apps/etiquetas/?modelo=produtos');
    await page.getByRole('tab', { name: 'Formato' }).click();
    await page.getByTestId('label-barcode').selectOption('qr');
    await expect(page.getByTestId('sheet').locator('.graphic svg').first()).toBeVisible();
    await page.getByTestId('label-barcode').selectOption('code128');
    await expect(page.getByTestId('sheet').locator('.graphic.code128 svg')).toHaveCount(4);
    await page.getByRole('tab', { name: 'Exportar' }).click();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('pdf').click()]);
    expect((await bytesOf(pdf)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

test.describe('Texto · novidades', () => {
  test('tabela editável, quebra de página e exportações DOCX e PDF', async ({ page }) => {
    await page.goto('/apps/texto/?modelo=relatorio');
    const ed = page.getByTestId('text-editor');
    await expect(ed.locator('table')).toHaveCount(1);
    await expect(page.getByTestId('page-count')).toContainText('2 páginas');
    await ed.locator('td').first().click();
    await page.getByTestId('row-below').click();
    await expect(ed.locator('table tr')).toHaveCount(5);
    await page.getByTestId('col-right').click();
    await expect(ed.locator('table tr').first().locator('th, td')).toHaveCount(4);
    const [docx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    expect(docx.suggestedFilename()).toMatch(/\.docx$/);
    expect((await bytesOf(docx)).subarray(0, 2).toString('latin1')).toBe('PK');
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('export-pdf').click()]);
    expect((await bytesOf(pdf)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expect(page.getByTestId('text-announcement')).toContainText('2 folhas');
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('text-editor').locator('table tr')).toHaveCount(5);
  });
});

test.describe('Biblioteca com os novos apps', () => {
  test('documento salvo em cada app aparece e abre de volta no app certo', async ({ page }) => {
    await page.goto('/apps/racha-conta/');
    await page.getByTestId('add-expense').click();
    await saved(page);
    await page.goto('/apps/qr/');
    await page.getByTestId('code-caption').fill('Teste');
    await saved(page);
    await page.goto('/launcher/#/documentos');
    await expect(page.getByTestId('copy-count')).toContainText('2 cópias');
    const card = page.locator('li', { has: page.locator('[data-copy-card]', { hasText: 'Viagem para a praia' }) });
    await card.getByRole('link', { name: /^Abrir .* no editor$/ }).click();
    await expect(page).toHaveURL(/\/apps\/racha-conta\/\?doc=/);
    await expect(page.getByTestId('split-total')).toBeVisible();
  });
});

test.describe('Documentos do Coding 1.0', () => {
  test('planilha antiga vira documento novo do 2.0 sem mudar a original', async ({ page }) => {
    await page.goto('/launcher/#/documentos');
    const backup = { schema: 'coding-v2-safe-backup', version: 1, entries: [{ source: 'backup', images: [], doc: { id: 'calc-antiga', type: 'calc', state: { name: 'Contas antigas', rows: 10, cols: 4, cells: { '0,0': { v: '7' }, '1,0': { v: '5' }, '2,0': { v: '=SOMA(A1:A2)', n: 'brl' } } } } }] };
    await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.locator('[data-copy-card]', { hasText: 'Contas antigas' }).click();
    await page.getByRole('button', { name: /^Converter Contas antigas/ }).click();
    await expect(page).toHaveURL(/\/apps\/planilhas\/\?doc=/);
    await expect(page.locator('[data-cell="A3"]')).toHaveText(/R\$\s12,00/);
    await page.goto('/launcher/#/documentos');
    await expect(page.getByTestId('copy-count')).toContainText('2 cópias');
  });
});

test.describe('Casca dos editores · celular e acessibilidade', () => {
  const apps = ['/apps/planilhas/', '/apps/imagens/', '/apps/pdf/', '/apps/qr/', '/apps/planilha-etiquetas/', '/apps/sorteio/', '/apps/racha-conta/'];
  test('celular (390 px): prévia em cima, ferramentas embaixo, sem rolagem horizontal, sem violações', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of apps) {
      await page.goto(url);
      const stage = (await page.getByTestId('editor-stage').boundingBox())!;
      const tabs = (await page.getByTestId('editor-tabs').boundingBox())!;
      expect(tabs.y, url).toBeGreaterThan(stage.y);
      expect(Math.round(tabs.y + tabs.height), url).toBeLessThanOrEqual(844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
      await axeClean(page, url + ' celular');
    }
  });
  test('computador: ferramentas no topo e sem violações nos dois temas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const url of apps) {
      await page.goto(url);
      const stage = (await page.getByTestId('editor-stage').boundingBox())!;
      const tabs = (await page.getByTestId('editor-tabs').boundingBox())!;
      expect(tabs.y, url).toBeLessThan(stage.y);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForTimeout(300);
        await axeClean(page, url + ' ' + scheme);
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
  });
});
