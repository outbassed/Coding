import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Visualizador: abre cada tipo de arquivo de verdade, no navegador, sem enviar nada para a internet. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const open = async (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => {
  await page.getByTestId('viewer-input').setInputFiles(files);
};
async function pngBuffer(page: Page, w = 64, h = 32): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#e8538f'; g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h });
  return Buffer.from(b64, 'base64');
}
const CUBE = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';

test.describe('Visualizador', () => {
  test('começa vazio e explica o que abre', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await expect(page.getByTestId('viewer-empty')).toContainText('modelos 3D');
    await expect(page.getByTestId('viewer-name')).toHaveText('Nenhum arquivo aberto');
  });

  test('imagem: mostra dimensões, zoom e giro; reconhece pelo conteúdo mesmo com nome errado', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'foto-sem-extensao', mimeType: 'application/octet-stream', buffer: await pngBuffer(page, 64, 32) }]);
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await expect(page.getByTestId('viewer-meta')).toContainText('Imagem');
    await expect(page.getByTestId('viewer-meta')).toContainText('64 × 32 px');
    await tab(page, 'Exibição').click();
    await page.getByTestId('zoom-100').click();
    await expect(page.getByTestId('viewer-image')).toHaveCSS('width', '64px');
    await page.getByTestId('turn-right').click();
    await expect(page.getByTestId('viewer-image')).toHaveAttribute('style', /rotate\(90deg\)/);
  });

  test('SVG é saneado: o script nunca roda e o desenho aparece', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__pwned=1"><script>window.__pwned=1</script><rect width="10" height="10" fill="#0a0"/></svg>';
    await open(page, [{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }]);
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    const src = await page.getByTestId('viewer-image').getAttribute('src');
    const clean = await page.evaluate(async (u) => (await fetch(u!)).text(), src);
    expect(clean).toContain('<rect');
    expect(clean).not.toMatch(/script|onload/i);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('SVG inválido mostra o motivo', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'quebrado.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><g></svg>') }]);
    await expect(page.getByTestId('viewer-error')).toContainText('SVG');
  });

  test('texto: números de linha, JSON formatado só na tela, e codificação Latin-1', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'dados.json', mimeType: 'application/json', buffer: Buffer.from('{"a":[1,2],"nome":"Ação"}') }]);
    await expect(page.getByTestId('text-body')).toContainText('"nome":"Ação"');
    await expect(page.getByTestId('viewer-meta')).toContainText('1 linha');
    await tab(page, 'Exibição').click();
    await page.getByTestId('format-json').click();
    await expect(page.getByTestId('text-body')).toContainText('"nome": "Ação"');
    await expect(page.getByTestId('viewer-meta')).toContainText('linhas');
    await tab(page, 'Arquivos').click();
    await open(page, [{ name: 'antigo.txt', mimeType: 'text/plain', buffer: Buffer.from([0x6f, 0x6c, 0xe1, 0x0a, 0x6f, 0x6b]) }]);
    await expect(page.getByTestId('text-body')).toContainText('olá');
    await expect(page.getByTestId('viewer-meta')).toContainText('Latin-1');
  });

  test('modelo 3D OBJ: lê, desenha no canvas, gira com o teclado e mostra só as arestas', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'cubo.obj', mimeType: 'text/plain', buffer: Buffer.from(CUBE) }]);
    const canvas = page.getByTestId('model-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('viewer-meta')).toContainText('12 triângulos');
    await expect(canvas).toHaveAttribute('data-drawn', '12');
    const painted = () => canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const first = [d[0], d[1], d[2]].join();
      let other = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if ([d[i], d[i + 1], d[i + 2]].join() !== first) other++;
      return other;
    });
    await expect.poll(painted).toBeGreaterThan(20); // há cubo desenhado sobre o fundo
    const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await canvas.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);
    await tab(page, 'Exibição').click();
    await page.getByTestId('wireframe').check();
    await expect(canvas).toHaveAttribute('data-drawn', '12');
    await page.getByTestId('reset-3d').click();
  });

  test('STL binário e arquivo 3D quebrado', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const stl = Buffer.alloc(84 + 50);
    stl.writeUInt32LE(1, 80);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, k) => stl.writeFloatLE(v, 84 + 12 + k * 4));
    await open(page, [{ name: 'triangulo.stl', mimeType: 'model/stl', buffer: stl }]);
    await expect(page.getByTestId('viewer-meta')).toContainText('1 triângulo');
    await open(page, [{ name: 'quebrado.stl', mimeType: 'model/stl', buffer: Buffer.alloc(100) }]);
    await expect(page.getByTestId('viewer-error')).toBeVisible();
  });

  test('desconhecido mostra os primeiros bytes; projeto guarda, reabre e remove arquivos', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'misterio.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 2, 3, 0xde, 0xad, 0xbe, 0xef, 0, 0, 0, 0]) }]);
    await expect(page.getByTestId('viewer-unknown')).toContainText('Não há visualização');
    await expect(page.getByTestId('viewer-unknown')).toContainText('de ad be ef');
    await open(page, [{ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('guardada no projeto') }]);
    await expect(page.getByTestId('text-body')).toContainText('guardada no projeto');
    await saved(page);
    await page.reload();
    await expect(page).toHaveURL(/\?doc=/);
    await expect(page.getByTestId('text-body')).toContainText('guardada no projeto');
    await expect(page.getByTestId('viewer-files').locator('li')).toHaveCount(2);
    await page.getByTestId('viewer-files').getByRole('button', { name: 'misterio.bin', exact: false }).first().click();
    await expect(page.getByTestId('viewer-unknown')).toBeVisible();
    await page.getByRole('button', { name: 'Remover misterio.bin do projeto' }).click();
    await expect(page.getByTestId('viewer-files').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('text-body')).toContainText('guardada no projeto');
  });

  test('baixa o arquivo original sem alterá-lo', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'original.txt', mimeType: 'text/plain', buffer: Buffer.from('conteúdo exato\n') }]);
    await tab(page, 'Arquivo').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-original').click()]);
    expect(download.suggestedFilename()).toBe('original.txt');
  });

  test('colar uma imagem (Ctrl+V) abre o arquivo; texto colado em campos não é afetado', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const b64 = (await pngBuffer(page, 20, 10)).toString('base64');
    const prevented = await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, b64);
    expect(prevented).toBe(true);
    await expect(page.getByTestId('viewer-name')).toHaveText('imagem-colada.png');
    await expect(page.getByTestId('viewer-meta')).toContainText('20 × 10 px');
  });

  test('lista de arquivos: busca por nome ou tipo, anterior/próximo e propriedades honestas', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const png = await pngBuffer(page, 40, 20);
    await open(page, [
      { name: 'a.png', mimeType: 'image/png', buffer: png },
      { name: 'b.png', mimeType: 'image/png', buffer: png },
      { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('linha 1\nlinha 2\n') }
    ]);
    await expect(page.getByTestId('viewer-position')).toHaveText('3 de 3');
    await page.getByTestId('viewer-prev').click();
    await expect(page.getByTestId('viewer-position')).toHaveText('2 de 3');
    await expect(page.getByTestId('viewer-name')).toHaveText('b.png');
    await page.getByTestId('viewer-next').click();
    await page.getByTestId('viewer-next').click(); // dá a volta
    await expect(page.getByTestId('viewer-name')).toHaveText('a.png');
    await page.getByTestId('viewer-filter').fill('notas');
    await expect(page.getByTestId('viewer-filter-count')).toHaveText('1 de 3 arquivos.');
    await expect(page.getByTestId('viewer-files').locator('li')).toHaveCount(1);
    await page.getByTestId('viewer-filter').fill('imagem');
    await expect(page.getByTestId('viewer-files').locator('li')).toHaveCount(2);
    const props = page.getByTestId('viewer-props');
    await expect(props).toContainText('a.png');
    await expect(props).toContainText('image/png');
    await expect(props).toContainText(png.length.toLocaleString('pt-BR') + ' bytes');
    await expect(props).toContainText('40 × 20 px');
  });

  test('apresentação de imagens troca sozinha e pára; tela cheia entra e sai', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const png = await pngBuffer(page, 30, 30);
    await open(page, [{ name: 'um.png', mimeType: 'image/png', buffer: png }, { name: 'dois.png', mimeType: 'image/png', buffer: png }]);
    await page.getByTestId('slide-interval').selectOption('1');
    const first = (await page.getByTestId('viewer-name').textContent()) ?? '';
    await page.getByTestId('slideshow').click();
    await expect(page.getByTestId('slideshow')).toHaveText('Parar apresentação');
    await expect(page.getByTestId('viewer-name')).not.toHaveText(first, { timeout: 4000 });
    await page.getByTestId('slideshow').click();
    await expect(page.getByTestId('slideshow')).toHaveText('Iniciar apresentação');
    const stopped = await page.getByTestId('viewer-name').textContent();
    await page.waitForTimeout(1600);
    await expect(page.getByTestId('viewer-name')).toHaveText(stopped ?? '');
    // Esc também pára
    await page.getByTestId('slideshow').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('slideshow')).toHaveText('Iniciar apresentação');

    await page.getByTestId('viewer-fullscreen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(page.getByTestId('viewer-exit-fullscreen')).toBeVisible();
    await page.getByTestId('fs-next').click(); // dá para navegar sem sair da tela cheia
    await page.getByTestId('viewer-exit-fullscreen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });

  test('abre uma cópia de um arquivo de texto no Código e mantém o original aqui', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'nota.js', mimeType: 'text/javascript', buffer: Buffer.from("console.log('vindo do visualizador');\r\n") }]);
    await expect(page.getByTestId('text-body')).toContainText('vindo do visualizador');
    await tab(page, 'Arquivo').click();
    await page.getByTestId('open-in-code').click();
    await expect(page).toHaveURL(/\/apps\/codigo\/\?doc=/);
    await expect(page.getByTestId('code-editor')).toHaveAttribute('data-file', 'nota.js');
    await expect(page.getByTestId('code-editor')).toHaveValue("console.log('vindo do visualizador');\n");
  });

  test('celular: sem rolagem horizontal e sem violações de acessibilidade', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/apps/visualizador/');
    await open(page, [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('linha 1\nlinha 2\n') }]);
    await expect(page.getByTestId('text-body')).toContainText('linha 2');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
