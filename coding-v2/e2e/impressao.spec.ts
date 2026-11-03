import { test, expect, type Page } from '@playwright/test';

/**
 * Impressão nativa (IMPRESSAO.md). O teste troca `window.print` por um contador (a janela do navegador não é automatizável),
 * deixa o app montar a árvore de impressão, e gera o PDF REAL da impressão (`page.pdf`, mídia de impressão): confere quantidade de páginas,
 * tamanho e orientação do papel, margens, conteúdo (texto e pixels) e a ausência de qualquer interface do editor.
 */
const PT_PER_MM = 72 / 25.4;
const A4 = { w: 595, h: 842 };
/** Palavras que só existem na interface dos aplicativos: se aparecerem no PDF, a interface vazou para o papel. */
const UI_WORDS = ['Desfazer', 'Refazer', 'Imprimir', 'Exportar', 'Baixar', 'Salvo', 'Salvar', 'Camadas', 'Propriedades'];

async function stubPrint(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
}
const printed = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __printed: number }).__printed);
async function openApp(page: Page, path: string): Promise<void> { await stubPrint(page); await page.goto(path); }
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });

/** Aciona o Imprimir da aba Arquivo e espera a janela de impressão (simulada) abrir. */
async function printFromFileTab(page: Page, expected = 1): Promise<void> {
  await tab(page, 'Arquivo').click();
  await page.getByTestId('print-app').first().click();
  await expect.poll(() => printed(page)).toBe(expected);
}

interface PageInfo { w: number; h: number; ink: [number, number, number, number] | null; text: string }
/** PDF da impressão atual (mídia de impressão, tamanho de página do CSS). */
async function printPdf(page: Page): Promise<Buffer> {
  await page.emulateMedia({ media: 'print' });
  try { return await page.pdf({ preferCSSPageSize: true, printBackground: true }); }
  finally { await page.emulateMedia({ media: 'screen' }); }
}
/** Desenha cada página do PDF (1 pt = 1 px) e devolve tamanho, caixa dos pixels não brancos e o texto. */
async function analyze(page: Page, pdf: Buffer): Promise<PageInfo[]> {
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const viewer = await page.context().newPage();
  try {
    await viewer.goto('/apps/planilha-etiquetas/');
    await viewer.addScriptTag({ url: '/vendor/pdf.min.js' });
    return await viewer.evaluate(async (b64) => {
      const lib = (window as unknown as { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string }; getDocument(o: unknown): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getViewport(o: unknown): { width: number; height: number }; render(o: unknown): { promise: Promise<void> }; getTextContent(): Promise<{ items: { str: string }[] }> }> }> } } }).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const doc = await lib.getDocument({ data: u8 }).promise;
      const out: { w: number; h: number; ink: [number, number, number, number] | null; text: string }[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const vp = pg.getViewport({ scale: 1 });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: g, viewport: vp }).promise;
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i]! < 240 || d[i + 1]! < 240 || d[i + 2]! < 240) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        const text = (await pg.getTextContent()).items.map((it) => it.str).join(' ');
        out.push({ w: c.width, h: c.height, ink: x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1], text });
      }
      return out;
    }, pdf.toString('base64'));
  } finally { await viewer.close(); }
}
const near = (a: number, b: number, tol = 2): void => { expect(Math.abs(a - b), a + ' ≈ ' + b).toBeLessThanOrEqual(tol); };
function noUi(pages: PageInfo[]): void {
  const all = pages.map((p) => p.text).join(' ');
  for (const word of UI_WORDS) expect(all, 'a interface vazou para o papel: “' + word + '”').not.toContain(word);
}
/** A tinta fica dentro das margens do papel (com 1,5 pt de folga para o serrilhado). */
function insideMargins(p: PageInfo, marginMm: number): void {
  const m = marginMm * PT_PER_MM - 1.5;
  expect(p.ink).not.toBeNull();
  const [x0, y0, x1, y1] = p.ink!;
  expect(x0).toBeGreaterThanOrEqual(m); expect(y0).toBeGreaterThanOrEqual(m);
  expect(x1).toBeLessThanOrEqual(p.w - m); expect(y1).toBeLessThanOrEqual(p.h - m);
}
async function ensureHiddenOnScreen(page: Page): Promise<void> {
  await expect(page.locator('#coding-print-root')).toBeHidden();
}

test.describe('Impressão · Imagens e Pintar (composição final)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Imagens retrato: uma página A4 retrato com a composição inteira, na proporção, sem interface', async ({ page }) => {
    await openApp(page, '/apps/imagens/?modelo=cartaz'); // 1080 × 1350
    await expect(page.getByTestId('image-canvas')).toBeVisible();
    await printFromFileTab(page);
    await ensureHiddenOnScreen(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h);
    insideMargins(pages[0]!, 10);
    const [x0, y0, x1, y1] = pages[0]!.ink!;
    near((x1 - x0) / (y1 - y0), 1080 / 1350, 0.03);
    // ocupa a largura útil inteira (210 − 2×10 mm): nada de miniatura perdida numa página vazia
    near(x1 - x0, 190 * PT_PER_MM, 4);
    noUi(pages);
    expect(pages[0]!.text.trim()).toBe(''); // a composição vai como imagem: qualquer texto aqui seria da interface
  });

  test('Imagens paisagem: papel A4 deitado e Ctrl+P imprime a mesma composição', async ({ page }) => {
    await openApp(page, '/apps/imagens/?modelo=paisagem'); // 1920 × 1080, fundo branco
    await tab(page, 'Camadas').click();
    await page.getByTestId('add-rect').click();
    await page.keyboard.press('Control+p');
    await expect.poll(() => printed(page)).toBe(1);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.h); near(pages[0]!.h, A4.w);
    insideMargins(pages[0]!, 10);
    noUi(pages);
  });

  test('Imagens: fundo transparente imprime sobre papel branco, sem o xadrez da tela', async ({ page }) => {
    await openApp(page, '/apps/imagens/?modelo=quadrado');
    await tab(page, 'Tela').click();
    await page.getByLabel('Fundo transparente').check();
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.ink, 'nada a imprimir além do papel branco: o xadrez da tela não vai').toBeNull();
  });

  test('Pintar A4: o desenho final numa página A4 retrato, com margens', async ({ page }) => {
    await openApp(page, '/apps/pintar/?modelo=a4');
    const canvas = page.getByTestId('paint-canvas');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h);
    expect(pages[0]!.ink, 'o traço aparece').not.toBeNull();
    insideMargins(pages[0]!, 10);
    noUi(pages);
  });
});

function makePdf(labels: string[]): Buffer {
  const objs = new Map<number, string>();
  const pageIds = labels.map((_, i) => 4 + i * 2);
  objs.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objs.set(2, '<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + labels.length + ' >>');
  objs.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  labels.forEach((label, i) => {
    const stream = 'BT /F1 60 Tf 72 700 Td (' + label + ') Tj ET';
    objs.set(pageIds[i]!, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (pageIds[i]! + 1) + ' 0 R >>');
    objs.set(pageIds[i]! + 1, '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  const max = 3 + labels.length * 2;
  for (let id = 1; id <= max; id++) { offsets[id] = out.length; out += id + ' 0 obj\n' + objs.get(id)! + '\nendobj\n'; }
  const xref = out.length;
  out += 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n';
  for (let id = 1; id <= max; id++) out += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + (max + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
async function pngBuffer(page: Page, w: number, h: number): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#2a7de1'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(10, 10, w / 4, h / 4);
    return c.toDataURL('image/png').split(',')[1]!;
  }, { w, h });
  return Buffer.from(b64, 'base64');
}
const CUBE = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';

test.describe('Impressão · Visualizador (cada formato)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const open = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.getByTestId('viewer-input').setInputFiles(files);

  test('imagem larga: uma página A4 paisagem, só a imagem', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    await open(page, [{ name: 'larga.png', mimeType: 'image/png', buffer: await pngBuffer(page, 400, 200) }]);
    await expect(page.getByTestId('viewer-image')).toBeVisible();
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.h); near(pages[0]!.h, A4.w);
    insideMargins(pages[0]!, 10);
    const [x0, y0, x1, y1] = pages[0]!.ink!;
    near((x1 - x0) / (y1 - y0), 2, 0.05);
    noUi(pages);
  });

  test('imagem girada na tela sai girada no papel', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    await open(page, [{ name: 'larga.png', mimeType: 'image/png', buffer: await pngBuffer(page, 400, 200) }]);
    await tab(page, 'Exibição').click();
    await page.getByTestId('turn-right').click();
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h); // virou retrato
    const [x0, y0, x1, y1] = pages[0]!.ink!;
    near((x1 - x0) / (y1 - y0), 0.5, 0.05);
  });

  test('texto: só o nome e o conteúdo do arquivo, em páginas A4', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    const body = Array.from({ length: 140 }, (_, i) => 'linha ' + (i + 1) + ' de teste').join('\n');
    await open(page, [{ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from(body) }]);
    await expect(page.getByTestId('viewer-name')).toHaveText('notas.txt');
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages.length).toBeGreaterThanOrEqual(2); // 140 linhas não cabem numa folha
    pages.forEach((p) => { near(p.w, A4.w); near(p.h, A4.h); });
    const all = pages.map((p) => p.text).join(' ').replace(/\s+/g, ' '); // o pdf.js separa as palavras por espaços variáveis
    expect(all).toContain('notas.txt');
    expect(all).toContain('linha 1 de teste');
    expect(all).toContain('linha 140 de teste');
    noUi(pages);
  });

  test('PDF: uma página impressa para cada página do arquivo', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    await open(page, [{ name: 'dois.pdf', mimeType: 'application/pdf', buffer: makePdf(['Pagina um', 'Pagina dois']) }]);
    await expect(page.getByTestId('viewer-meta')).toContainText('2 páginas', { timeout: 15000 });
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(2);
    for (const p of pages) { near(p.w, A4.w); near(p.h, A4.h); expect(p.ink).not.toBeNull(); insideMargins(p, 5); }
    noUi(pages);
  });

  test('modelo 3D: imprime a vista atual, sem controles', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    await open(page, [{ name: 'cubo.obj', mimeType: 'text/plain', buffer: Buffer.from(CUBE) }]);
    await expect(page.locator('canvas.c3d')).toBeVisible();
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.ink).not.toBeNull();
    noUi(pages);
  });

  test('áudio não tem o que imprimir: avisa e não abre a janela de impressão', async ({ page }) => {
    await openApp(page, '/apps/visualizador/');
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0]), Buffer.from('data'), Buffer.from([0, 0, 0, 0])]);
    await open(page, [{ name: 'som.wav', mimeType: 'audio/wav', buffer: wav }]);
    await expect(page.getByTestId('viewer-name')).toHaveText('som.wav');
    await tab(page, 'Arquivo').click();
    await page.getByTestId('print-app').click();
    await expect(page.getByTestId('viewer-message')).toContainText('Áudio não tem conteúdo visual');
    expect(await printed(page)).toBe(0);
    await page.keyboard.press('Control+p');
    expect(await printed(page)).toBe(0);
  });
});

test.describe('Impressão · demais aplicativos', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Racha-conta: resumo próprio (total, por pessoa, quem paga a quem), sem a interface', async ({ page }) => {
    await openApp(page, '/apps/racha-conta/?modelo=viagem');
    await page.keyboard.press('Control+p');
    await expect.poll(() => printed(page)).toBe(1);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h);
    const text = pages[0]!.text;
    expect(text).toContain('Total das despesas');
    expect(text).toContain('Quem paga a quem');
    expect(text).toContain('Por pessoa');
    for (const w of ['Desfazer', 'Refazer', 'Imprimir', 'Exportar', 'Salvo']) expect(text).not.toContain(w);
  });

  test('Cores: a paleta com as cores de verdade, numa página', async ({ page }) => {
    await openApp(page, '/apps/cores/?modelo=marca');
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.ink).not.toBeNull();
    insideMargins(pages[0]!, 10);
    noUi(pages);
  });

  test('Comparador: relatório e diferenças como texto', async ({ page }) => {
    await openApp(page, '/apps/comparador/?modelo=versoes');
    await page.getByTestId('file-menu').locator('summary').click(); // o Comparador tem o menu Arquivo próprio, sem abas
    await page.getByTestId('print-app').first().click();
    await expect.poll(() => printed(page)).toBe(1);
    const pages = await analyze(page, await printPdf(page));
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0]!.text).toContain('Resultado');
    noUi(pages);
  });

  test('Código: o arquivo aberto, sem explorador, abas nem console', async ({ page }) => {
    await openApp(page, '/apps/codigo/?modelo=ola');
    await printFromFileTab(page);
    const pages = await analyze(page, await printPdf(page));
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0]!.text).toMatch(/index\.html/);
    expect(pages[0]!.text).toMatch(/html/i);
    noUi(pages);
  });

  test('Sorteio sem resultados: avisa e não abre a janela de impressão', async ({ page }) => {
    await openApp(page, '/apps/sorteio/?modelo=em-branco');
    await page.keyboard.press('Control+p');
    expect(await printed(page)).toBe(0);
    await expect(page.getByTestId('print-notice').or(page.locator('[role="status"]').filter({ hasText: 'histórico' })).first()).toBeVisible();
  });

  test('Texto: Ctrl+P imprime só o documento em A4', async ({ page }) => {
    await openApp(page, '/apps/texto/');
    const body = page.locator('#text-body');
    await body.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Relatório de teste da impressão');
    await page.keyboard.press('Control+p');
    await expect.poll(() => printed(page)).toBe(1);
    const pages = await analyze(page, await printPdf(page));
    expect(pages).toHaveLength(1);
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h);
    expect(pages[0]!.text).toContain('Relatório de teste da impressão');
    for (const w of ['Negrito', 'Itálico', 'Desfazer', 'Exportar', 'Imprimir']) expect(pages[0]!.text).not.toContain(w);
  });

  test('QR / Barras: só a folha de códigos, em A4', async ({ page }) => {
    await openApp(page, '/apps/qr/?modelo=exemplo');
    await page.keyboard.press('Control+p');
    await expect.poll(() => printed(page)).toBe(1);
    const pages = await analyze(page, await printPdf(page));
    expect(pages.length).toBeGreaterThanOrEqual(1);
    near(pages[0]!.w, A4.w); near(pages[0]!.h, A4.h);
    expect(pages[0]!.ink).not.toBeNull();
    noUi(pages);
  });
});
