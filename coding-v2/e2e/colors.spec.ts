import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
const baseHex = (page: Page) => page.getByTestId('base-hex');
async function setBase(page: Page, hex: string): Promise<void> {
  await tab(page, 'Cor').click();
  await baseHex(page).fill(hex);
}

test.describe('Estúdio de Cores', () => {
  test('digitar um código mostra todos os formatos; código inválido avisa e não muda a cor', async ({ page }) => {
    await page.goto('/apps/cores/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await setBase(page, '#336699');
    await expect(page.getByTestId('hero-hex')).toHaveText('#336699');
    await expect(page.getByTestId('value-rgb')).toHaveText('rgb(51, 102, 153)');
    await expect(page.getByTestId('value-hsl')).toHaveText('hsl(210, 50%, 40%)');
    await expect(page.getByTestId('value-cmyk')).toHaveText('cmyk(67%, 33%, 0%, 40%)');
    await baseHex(page).fill('azulzinho');
    await expect(page.getByTestId('hex-error')).toBeVisible();
    await expect(page.getByTestId('hero-hex')).toHaveText('#336699');
    await baseHex(page).fill('rgb(255, 0, 0)');
    await expect(page.getByTestId('hero-hex')).toHaveText('#FF0000');
    await expect(page.getByTestId('hex-error')).toHaveCount(0);
  });

  test('sliders mudam a cor e o seletor nativo também', async ({ page }) => {
    await page.goto('/apps/cores/');
    await setBase(page, '#FF0000');
    await page.getByTestId('slider-h').fill('120');
    await expect(page.getByTestId('hero-hex')).toHaveText('#00FF00');
    await page.getByTestId('slider-l').fill('25');
    await expect(page.getByTestId('hero-hex')).toHaveText('#008000');
    await page.getByTestId('base-picker').fill('#0000ff');
    await expect(page.getByTestId('hero-hex')).toHaveText('#0000FF');
  });

  test('paleta: adicionar sem repetir, nomear, reordenar, remover; salva e reabre', async ({ page }) => {
    await page.goto('/apps/cores/');
    await setBase(page, '#112233');
    await page.getByTestId('add-base').click();
    await page.getByTestId('add-base').click(); // repetida: não duplica
    await setBase(page, '#445566');
    await page.getByTestId('add-base').click();
    await expect(page.getByTestId('palette-strip').locator('li')).toHaveCount(2);
    await tab(page, 'Paleta').click();
    await expect(page.getByTestId('palette-list').locator('li')).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Nome da cor #112233' }).fill('Fundo');
    await page.getByRole('textbox', { name: 'Nome da cor #112233' }).press('Tab');
    await page.getByRole('button', { name: 'Mover #112233 para baixo' }).click();
    await expect(page.getByTestId('swatch-0')).toContainText('#445566');
    await page.getByTestId('remove-0').click();
    await expect(page.getByTestId('palette-list').locator('li')).toHaveCount(1);
    await saved(page);
    await page.reload();
    await tab(page, 'Paleta').click();
    await expect(page.getByTestId('swatch-0')).toContainText('#112233');
    await expect(page.getByRole('textbox', { name: 'Nome da cor #112233' })).toHaveValue('Fundo');
  });

  test('harmonias: tríade soma três cores à paleta', async ({ page }) => {
    await page.goto('/apps/cores/');
    await setBase(page, '#FF0000');
    await tab(page, 'Harmonias').click();
    await page.getByTestId('scheme-select').selectOption('triadic');
    await expect(page.getByTestId('harmony-list').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('harmony-list')).toContainText('#00FF00');
    await expect(page.getByTestId('harmony-list')).toContainText('#0000FF');
    await page.getByTestId('add-harmony').click();
    await expect(page.getByTestId('palette-strip').locator('li')).toHaveCount(3);
  });

  test('contraste WCAG: preto no branco passa tudo; cinza claro no branco falha e sugere correção', async ({ page }) => {
    await page.goto('/apps/cores/');
    await tab(page, 'Contraste').click();
    await page.getByTestId('contrast-fg').fill('#000000');
    await page.getByTestId('contrast-bg').fill('#FFFFFF');
    await expect(page.getByTestId('contrast-ratio')).toHaveText('Contraste 21,00 : 1');
    for (const id of ['aa', 'aa-large', 'aaa', 'aaa-large', 'ui']) await expect(page.getByTestId('check-' + id)).toHaveAttribute('data-ok', 'sim');
    await page.getByTestId('contrast-fg').fill('#BBBBBB');
    await expect(page.getByTestId('check-aa')).toHaveAttribute('data-ok', 'nao');
    await expect(page.getByTestId('contrast-suggest')).toBeVisible();
    await page.getByTestId('contrast-suggest').click();
    await expect(page.getByTestId('check-aa')).toHaveAttribute('data-ok', 'sim');
    await page.getByTestId('contrast-swap').click();
    await expect(page.getByTestId('contrast-bg')).not.toHaveValue('#FFFFFF');
  });

  test('importar cores de um texto, com aviso quando não há nenhuma', async ({ page }) => {
    await page.goto('/apps/cores/');
    await tab(page, 'Paleta').click();
    await page.getByTestId('import-text').fill('sem cor nenhuma');
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-error')).toBeVisible();
    await page.getByTestId('import-text').fill('a { color: #FF8800; background: rgb(0, 128, 0); } b { color: #ff8800 }');
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('palette-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('palette-list')).toContainText('#008000');
  });

  test('extrai as cores dominantes de uma imagem (vermelho e azul)', async ({ page }) => {
    await page.goto('/apps/cores/');
    await tab(page, 'Imagem').click();
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 20;
      const g = c.getContext('2d')!; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#0000ff'; g.fillRect(20, 0, 20, 20);
      return c.toDataURL('image/png').split(',')[1] as string;
    });
    await page.getByTestId('image-input').setInputFiles({ name: 'duas.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByTestId('extract-count').fill('2');
    await expect(page.getByTestId('extracted-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('extracted-list')).toContainText('#FF0000');
    await expect(page.getByTestId('extracted-list')).toContainText('#0000FF');
    await page.getByTestId('add-extracted').click();
    await expect(page.getByTestId('palette-strip').locator('li')).toHaveCount(2);
    await page.getByTestId('image-input').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem') });
    await expect(page.getByTestId('image-error')).toBeVisible();
  });

  test('Ctrl+V com imagem abre a aba Imagem, extrai cores e clicar na imagem pega a cor exata', async ({ page }) => {
    await page.goto('/apps/cores/');
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 20;
      const g = c.getContext('2d')!; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#0000ff'; g.fillRect(20, 0, 20, 20);
      return c.toDataURL('image/png').split(',')[1] as string;
    });
    const firePaste = (payload: { b64?: string; text?: string }, selector = '') => page.evaluate(({ b64, text, selector }) => {
      const dt = new DataTransfer();
      if (b64) dt.items.add(new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      if (text) dt.setData('text/plain', text);
      const target = selector ? document.querySelector(selector)! : document.body;
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    }, { b64: payload.b64 ?? '', text: payload.text ?? '', selector });
    // texto puro não é tomado pelo app
    expect(await firePaste({ text: '#123456' })).toBe(false);
    expect(await firePaste({ b64: png })).toBe(true);
    await expect(tab(page, 'Imagem')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('extracted-list')).toContainText('#FF0000');
    await expect(page.getByTestId('extracted-list')).toContainText('#0000FF');
    // clicar no lado direito da imagem (azul) leva #0000FF para o editor
    const box = (await page.getByTestId('image-preview').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
    await expect(tab(page, 'Cor')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('#0000FF').first()).toBeVisible();
  });

  test('exporta CSS, JSON, SVG e TXT com a paleta', async ({ page }) => {
    await page.goto('/apps/cores/?modelo=marca');
    await tab(page, 'Arquivo').click();
    const text = async (id: string): Promise<string> => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()]);
      const stream = await download.createReadStream();
      let out = '';
      for await (const chunk of stream) out += chunk.toString();
      return out + '|' + download.suggestedFilename();
    };
    const css = await text('export-css');
    expect(css).toContain('--primaria: #2F5FD0;');
    expect(css).toMatch(/\|Identidade visual\.css$/);
    expect(await text('export-json')).toContain('"hex": "#F28B30"');
    expect(await text('export-svg')).toContain('<svg');
    expect(await text('export-txt')).toContain('Sucesso #17724A');
  });

  test('modelo Oceano abre pronto e a cor é uma das da paleta', async ({ page }) => {
    await page.goto('/apps/cores/?modelo=oceano');
    await expect(page.getByTestId('palette-strip').locator('li')).toHaveCount(5);
    await expect(page.getByTestId('hero-hex')).toHaveText('#0E7490');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test('acessível no tema ' + scheme + ' (todas as abas)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/apps/cores/?modelo=marca');
      await expect(page.getByTestId('colors-stage')).toBeVisible();
      for (const name of ['Cor', 'Harmonias', 'Contraste', 'Imagem', 'Paleta', 'Arquivo']) {
        await tab(page, name).click();
        await axeClean(page, name + ' ' + scheme);
      }
    });
  }

  test('celular 320 px: sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/apps/cores/?modelo=marca');
    await expect(page.getByTestId('colors-stage')).toBeVisible();
    for (const name of ['Cor', 'Contraste', 'Paleta']) {
      await tab(page, name).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
