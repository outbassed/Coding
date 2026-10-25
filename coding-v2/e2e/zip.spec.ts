import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
const TEXT = Buffer.from('Linha repetida para compactar bem. '.repeat(300), 'utf8');
const BIN = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 37) & 255));
const addFiles = (page: Page, files: { name: string; buffer: Buffer }[]) =>
  page.getByTestId('zip-files-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'application/octet-stream', buffer: f.buffer })));

/** CRC-32 independente do app, para montar ZIPs de teste (método "armazenado"). */
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function craftZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), crc = crc32(e.data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(e.data.length, 18); l.writeUInt32LE(e.data.length, 22); l.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(e.data.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, name, e.data); centrals.push(c, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; data: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await d.createReadStream()) chunks.push(chunk as Buffer);
  return { name: d.suggestedFilename(), data: Buffer.concat(chunks) };
}
const openZip = (page: Page, buffer: Buffer, name = 'teste.zip') => page.getByTestId('zip-open-input').setInputFiles({ name, mimeType: 'application/zip', buffer });

test.describe('Compactador ZIP', () => {
  test('cria um ZIP real, reabre, confere e extrai com o mesmo conteúdo', async ({ page }) => {
    await page.goto('/apps/zip/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByTestId('file-empty')).toBeVisible();
    await addFiles(page, [{ name: 'texto.txt', buffer: TEXT }, { name: 'dados.bin', buffer: BIN }]);
    await expect(page.getByTestId('file-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('project-summary')).toContainText('2 arquivos');
    await tab(page, 'Compactar').click();
    const zip = await download(page, () => page.getByTestId('create-zip').click());
    expect(zip.name).toBe('Arquivos compactados.zip');
    expect(zip.data.subarray(0, 2).toString()).toBe('PK');
    expect(zip.data.length).toBeLessThan(TEXT.length + BIN.length);
    await expect(page.getByTestId('zip-result')).toContainText('Arquivos compactados.zip');
    await expect(page.getByTestId('zip-result')).toContainText('menor');

    await tab(page, 'Abrir ZIP').click();
    await openZip(page, zip.data, zip.name);
    await expect(page.getByTestId('opened-summary')).toContainText('2 itens');
    await expect(page.getByTestId('entry-list')).toContainText('texto.txt');
    await expect(page.getByTestId('entry-list')).toContainText('dados.bin');
    await page.getByTestId('verify-zip').click();
    await expect(page.getByTestId('verify-result')).toContainText('Todos os 2 arquivos conferem');
    const out = await download(page, () => page.getByTestId('extract-0').click());
    expect(out.name).toBe('texto.txt');
    expect(out.data.equals(TEXT)).toBe(true);
  });

  test('os arquivos ficam salvos no projeto e o ZIP ainda pode ser criado depois de recarregar', async ({ page }) => {
    await page.goto('/apps/zip/');
    await addFiles(page, [{ name: 'a.txt', buffer: TEXT }]);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('file-list').locator('li')).toHaveCount(1);
    await tab(page, 'Compactar').click();
    const zip = await download(page, () => page.getByTestId('create-zip').click());
    expect(zip.data.subarray(0, 2).toString()).toBe('PK');
    await tab(page, 'Abrir ZIP').click();
    await openZip(page, zip.data);
    const out = await download(page, () => page.getByTestId('extract-0').click());
    expect(out.data.equals(TEXT)).toBe(true);
  });

  test('"só agrupar" guarda sem compressão e avisa; sem arquivos não cria', async ({ page }) => {
    await page.goto('/apps/zip/');
    await tab(page, 'Compactar').click();
    await expect(page.getByTestId('create-zip')).toBeDisabled();
    await page.getByTestId('mode-store').check();
    await tab(page, 'Arquivos').click();
    await addFiles(page, [{ name: 'texto.txt', buffer: TEXT }]);
    await tab(page, 'Compactar').click();
    const zip = await download(page, () => page.getByTestId('create-zip').click());
    expect(zip.data.length).toBeGreaterThan(TEXT.length);
    await tab(page, 'Abrir ZIP').click();
    await openZip(page, zip.data);
    await expect(page.getByTestId('entry-0')).toContainText('armazenado');
  });

  test('nomes repetidos ganham número; renomear para um nome existente é recusado', async ({ page }) => {
    await page.goto('/apps/zip/');
    await addFiles(page, [{ name: 'a.txt', buffer: Buffer.from('1') }, { name: 'a.txt', buffer: Buffer.from('2') }]);
    await expect(page.getByRole('textbox', { name: 'Nome de a (2).txt no ZIP' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome de a (2).txt no ZIP' }).fill('A.TXT');
    await page.getByRole('textbox', { name: 'Nome de a (2).txt no ZIP' }).press('Tab');
    await expect(page.getByTestId('zip-error')).toContainText('Já existe');
    await page.getByRole('textbox', { name: 'Nome de a (2).txt no ZIP' }).fill('pasta/../novo.txt');
    await page.getByRole('textbox', { name: 'Nome de a (2).txt no ZIP' }).press('Tab');
    await expect(page.getByTestId('file-1').getByRole('textbox')).toHaveValue('pasta/novo.txt');
    await page.getByTestId('remove-0').click();
    await expect(page.getByTestId('file-list').locator('li')).toHaveCount(1);
  });

  test('recusa o que não é ZIP, aponta arquivo adulterado e nomes perigosos', async ({ page }) => {
    await page.goto('/apps/zip/');
    await tab(page, 'Abrir ZIP').click();
    await openZip(page, Buffer.from('isto não é um zip, é apenas texto comum bem comprido.'));
    await expect(page.getByTestId('zip-error')).toContainText('não é um ZIP válido');
    await expect(page.getByTestId('opened-zip')).toHaveCount(0);

    const good = craftZip([{ name: 'ok.txt', data: Buffer.from('conteudo bom') }]);
    await openZip(page, good);
    await page.getByTestId('verify-zip').click();
    await expect(page.getByTestId('verify-result')).toContainText('O arquivo confere');

    const bad = Buffer.from(good); bad[30 + 6 + 2] ^= 0xff;
    await openZip(page, bad);
    await page.getByTestId('verify-zip').click();
    await expect(page.getByTestId('verify-result')).toContainText('Com problema: ok.txt');

    await openZip(page, craftZip([{ name: '../../fora.txt', data: Buffer.from('x') }, { name: '/abs/b.txt', data: Buffer.from('y') }]));
    await expect(page.getByTestId('entry-0')).toContainText('fora.txt');
    await expect(page.getByTestId('entry-0').getByTestId('entry-unsafe')).toBeVisible();
    await expect(page.getByTestId('entry-1').getByTestId('entry-unsafe')).toBeVisible();
    // “Ao projeto” grava com o nome já limpo
    await page.getByTestId('to-project-0').click();
    await expect(page.getByTestId('file-list').getByRole('textbox')).toHaveValue('fora.txt');
  });

  test('"Adicionar tudo ao projeto" traz o conteúdo do ZIP', async ({ page }) => {
    await page.goto('/apps/zip/');
    await tab(page, 'Abrir ZIP').click();
    await openZip(page, craftZip([{ name: 'um.txt', data: Buffer.from('1') }, { name: 'sub/dois.txt', data: Buffer.from('22') }]));
    await page.getByTestId('add-all').click();
    await expect(page.getByTestId('file-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('project-summary')).toContainText('2 arquivos');
    await page.getByTestId('close-zip').click();
    await expect(page.getByTestId('opened-zip')).toHaveCount(0);
  });

  test('modelo "ZIP sem compressão" abre pronto', async ({ page }) => {
    await page.goto('/apps/zip/?modelo=armazenar');
    await expect(page.getByTestId('project-summary')).toContainText('sem compressão');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test('acessível no tema ' + scheme + ' (todas as abas, com projeto e ZIP aberto)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/apps/zip/');
      await addFiles(page, [{ name: 'a.txt', buffer: TEXT }]);
      await tab(page, 'Abrir ZIP').click();
      await openZip(page, craftZip([{ name: 'x.txt', data: Buffer.from('x') }]));
      await expect(page.getByTestId('opened-zip')).toBeVisible();
      for (const name of ['Arquivos', 'Compactar', 'Abrir ZIP', 'Arquivo']) {
        await tab(page, name).click();
        await axeClean(page, name + ' ' + scheme);
      }
    });
  }

  test('celular 320 px: sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/apps/zip/');
    await addFiles(page, [{ name: 'um-nome-de-arquivo-bem-comprido-para-testar-a-quebra-de-linha.txt', buffer: TEXT }]);
    await tab(page, 'Abrir ZIP').click();
    await openZip(page, craftZip([{ name: 'pasta/subpasta/outro-nome-bem-comprido-para-testar.txt', data: Buffer.from('x') }]));
    for (const name of ['Arquivos', 'Compactar', 'Abrir ZIP']) {
      await tab(page, name).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
