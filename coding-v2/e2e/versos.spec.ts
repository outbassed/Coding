import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupFile, uploadBackup } from './helpers';

/*
 * Versos: composição tipográfica para imagens. Os testes leem pixels reais do canvas, baixam os PNG/ZIP exportados e
 * decodificam os arquivos no navegador; a música de referência usa arquivos WAV/WebM gerados aqui mesmo.
 */

// ---------- utilidades ----------
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const canvas = (page: Page) => page.getByTestId('versos-canvas');
const sceneItems = (page: Page) => page.getByTestId('scene-item');
const textItems = (page: Page) => page.getByTestId('text-item');
const savedStatus = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const settle = async (page: Page): Promise<void> => { await page.waitForTimeout(1500); await savedStatus(page); };

async function openVersos(page: Page, modelo = 'em-branco'): Promise<void> {
  await page.goto('/apps/versos/?modelo=' + modelo);
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByTestId('scene-position')).toContainText('Cena 1 de');
}
/** Digita num campo numérico/hexadecimal do painel e confirma. */
async function setField(page: Page, id: string, value: string | number): Promise<void> {
  const el = page.getByTestId(id);
  await el.fill(String(value));
  await el.press('Enter');
}
async function addText(page: Page, content?: string): Promise<void> {
  await tab(page, 'Textos').click();
  await page.getByTestId('add-text').click();
  if (content !== undefined) await page.getByTestId('text-content').fill(content);
}
async function setBackground(page: Page, hex: string): Promise<void> {
  await tab(page, 'Cena').click();
  await page.getByTestId('bg-color').click();
  await setField(page, 'bg-color-hex', hex);
}
async function pixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return await canvas(page).evaluate((c: HTMLCanvasElement, [x, y]) => {
    const d = c.getContext('2d')!.getImageData(Math.min(c.width - 1, Math.floor(c.width * x!)), Math.min(c.height - 1, Math.floor(c.height * y!)), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]!];
  }, [fx, fy]);
}
/** Quantos pixels opacos do canvas estão perto da cor dada. */
async function count(page: Page, rgb: [number, number, number], tol = 60): Promise<number> {
  return await canvas(page).evaluate((c: HTMLCanvasElement, [r, g, b, t]) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200 && Math.abs(d[i]! - r!) < t! && Math.abs(d[i + 1]! - g!) < t! && Math.abs(d[i + 2]! - b!) < t!) n++;
    return n;
  }, [rgb[0], rgb[1], rgb[2], tol]);
}
const near = (p: number[], rgb: [number, number, number], tol = 12): boolean => p[3]! > 250 && Math.abs(p[0]! - rgb[0]) <= tol && Math.abs(p[1]! - rgb[1]) <= tol && Math.abs(p[2]! - rgb[2]) <= tol;
const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const GREEN: [number, number, number] = [0, 192, 0];

async function makePng(page: Page, w: number, h: number, color: string): Promise<Buffer> {
  const b64 = await page.evaluate(([width, height, fill]) => {
    const cv = document.createElement('canvas'); cv.width = width as number; cv.height = height as number;
    const g = cv.getContext('2d')!; g.fillStyle = fill as string; g.fillRect(0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png').split(',')[1]!;
  }, [w, h, color]);
  return Buffer.from(b64, 'base64');
}
const importBackground = (page: Page, file: Buffer, name = 'fundo.png') => page.getByTestId('bg-input').setInputFiles({ name, mimeType: 'image/png', buffer: file });

async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; data: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await d.createReadStream()) chunks.push(chunk as Buffer);
  return { name: d.suggestedFilename(), data: Buffer.concat(chunks) };
}
interface PngInfo { w: number; h: number; points: number[][]; opaque: number; clear: number }
/** Decodifica o PNG exportado no navegador e lê pixels (frações da imagem). */
async function inspectPng(page: Page, data: Buffer, points: [number, number][] = []): Promise<PngInfo> {
  expect([...data.subarray(0, 4)], 'assinatura PNG').toEqual([0x89, 0x50, 0x4e, 0x47]);
  return await page.evaluate(async ([b64, pts]) => {
    const bin = atob(b64 as string); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
    const g = cv.getContext('2d')!; g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0, clear = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i]! > 250) opaque++; else if (d[i]! === 0) clear++; }
    const points = (pts as [number, number][]).map(([x, y]) => {
      const k = (Math.min(cv.height - 1, Math.floor(cv.height * y)) * cv.width + Math.min(cv.width - 1, Math.floor(cv.width * x))) * 4;
      return [d[k]!, d[k + 1]!, d[k + 2]!, d[k + 3]!];
    });
    return { w: cv.width, h: cv.height, points, opaque, clear };
  }, [data.toString('base64'), points]);
}
/** Lê os nomes e os dados (armazenados, sem compressão) de um .zip. */
function readZip(buf: Buffer): { name: string; method: number; data: Buffer }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  expect(eocd, 'fim do diretório central').toBeGreaterThan(-1);
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; method: number; data: Buffer }[] = [];
  for (let n = 0; n < total; n++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28);
    out.push({ name, method, data: buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + size) });
    p += 46 + nl + el + cl;
  }
  return out;
}
/** WAV mono de 8 bits (tom de 440 Hz) com a duração pedida. */
function makeWav(seconds: number, rate = 8000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return b;
}
const loadWav = (page: Page, seconds = 20, name = 'musica.wav') => page.getByTestId('media-input').setInputFiles({ name, mimeType: 'audio/wav', buffer: makeWav(seconds) });
const timeOf = async (page: Page): Promise<number> => {
  const m = /^(\d+):(\d\d)/.exec((await page.getByTestId('player-time').textContent()) ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};
/** Registra play/pause/revoke da mídia em sessionStorage (sobrevive à troca de página), para provar o que a página fez ao sair. */
const MEDIA_LOG = `(() => {
  const log = (e) => { try { const a = JSON.parse(sessionStorage.getItem('vlog') || '[]'); a.push(e); sessionStorage.setItem('vlog', JSON.stringify(a)); } catch (_) {} };
  const p = HTMLMediaElement.prototype, play = p.play, pause = p.pause;
  p.play = function (...a) { log('play'); return play.apply(this, a); };
  p.pause = function (...a) { log('pause'); return pause.apply(this, a); };
  const rev = URL.revokeObjectURL; URL.revokeObjectURL = function (u) { log('revoke'); return rev.call(URL, u); };
})();`;
const mediaLog = (page: Page): Promise<string[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('vlog') || '[]') as string[]);
const openPlayer = async (page: Page): Promise<void> => {
  if ((await page.getByTestId('player-toggle').getAttribute('aria-expanded')) !== 'true') await page.getByTestId('player-toggle').click();
};
/** Lê o armazenamento de documentos: estados dos projetos Versos e os tipos dos arquivos (imagens) guardados. */
async function readVersosDb(page: Page): Promise<{ states: string[]; blobTypes: string[] }> {
  return await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('coding-v2-documents'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = <T>(store: string): Promise<T[]> => new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result as T[]); r.onerror = () => rej(r.error); });
    const copies = await all<{ snapshot: { doc: { type?: string; state: unknown }; images: { blob?: Blob }[] } }>('copies');
    const assets = await all<{ image: { blob?: Blob } }>('assets');
    const mine = copies.filter((c) => c.snapshot.doc.type === 'versos');
    const blobs = [...mine.flatMap((c) => c.snapshot.images), ...assets.map((a) => a.image)].map((i) => i.blob?.type ?? '').filter(Boolean);
    db.close();
    return { states: mine.map((c) => JSON.stringify(c.snapshot.doc.state)), blobTypes: blobs };
  });
}
async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal').toBeLessThanOrEqual(0);
}

// ---------- 1 a 4: projeto, textos, formatação, posição e camadas ----------
test.describe('Versos · cenas e textos', () => {
  test('1. criar um projeto com uma cena em branco', async ({ page }) => {
    await openVersos(page);
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 1 de 1');
    await expect(sceneItems(page)).toHaveCount(1);
    await expect(page.getByTestId('scene-dims')).toHaveText('1080 × 1080 px');
    await expect(page.getByTestId('doc-name')).not.toHaveValue('');
    await expect.poll(async () => near(await pixel(page, 0.5, 0.5), [0x14, 0x16, 0x1c], 3)).toBe(true);
    await expect(page.getByTestId('text-props-empty')).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('ainda não salvo'); // nada é gravado até a primeira alteração
    await page.getByTestId('doc-name').fill('Primeiro projeto');
    await settle(page);
    expect(page.url()).toContain('?doc=');
  });

  test('2. adicionar texto e formatar: conteúdo, tamanho, peso, cor, alinhamento, contorno e sombra aparecem na prévia', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'MMM');
    await expect(textItems(page)).toHaveCount(1);
    await setField(page, 'text-size', 300);
    await setField(page, 'text-color', '#ff0000');
    await setBackground(page, '#102030');
    await expect.poll(() => count(page, RED)).toBeGreaterThan(1500);
    // contorno azul de 30 px: aparecem pixels azuis ao redor das letras
    expect(await count(page, BLUE)).toBe(0);
    await setField(page, 'stroke-width', 30);
    await setField(page, 'stroke-color', '#0000ff');
    await expect.poll(() => count(page, BLUE)).toBeGreaterThan(300);
    // peso, itálico e alinhamento são controles reais
    await page.getByTestId('text-weight').selectOption('700');
    await expect(page.getByTestId('text-weight')).toHaveValue('700');
    await page.getByTestId('text-italic').click();
    await expect(page.getByTestId('text-italic')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('align-left').click();
    await expect(page.getByTestId('align-left')).toHaveAttribute('aria-pressed', 'true');
    // sombra verde deslocada (sem desfoque) cria pixels verdes
    await setField(page, 'stroke-width', 0);
    await setField(page, 'shadow-color', '#00c000');
    await setField(page, 'shadow-opacity', 100);
    await setField(page, 'shadow-x', 40);
    await setField(page, 'shadow-y', 40);
    await expect.poll(() => count(page, GREEN)).toBeGreaterThan(300);
    await setField(page, 'text-opacity', 0);
    await expect.poll(() => count(page, RED)).toBe(0);
  });

  test('3. vários textos independentes na mesma cena', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Primeiro');
    await page.getByTestId('add-text').click(); await page.getByTestId('text-content').fill('Segundo');
    await page.getByTestId('add-text').click(); await page.getByTestId('text-content').fill('Terceiro');
    await expect(textItems(page)).toHaveCount(3);
    await setField(page, 'text-size', 200);
    // o terceiro está selecionado: os outros não mudaram
    await textItems(page).nth(2).getByTestId('text-pick').click(); // lista do mais acima para o mais abaixo: o último da lista é o primeiro texto
    await expect(page.getByTestId('text-content')).toHaveValue('Primeiro');
    expect(Number(await page.getByTestId('text-size').inputValue())).not.toBe(200);
    await textItems(page).nth(0).getByTestId('text-pick').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Terceiro');
    await expect(page.getByTestId('text-size')).toHaveValue('200');
    // ocultar um texto não apaga os demais
    await textItems(page).nth(0).getByTestId('text-eye').click();
    await expect(textItems(page).nth(0)).toContainText('oculto');
    await expect(textItems(page)).toHaveCount(3);
  });

  test('4. posição numérica, centralizar, rotação e ordem das camadas', async ({ page }) => {
    await openVersos(page);
    await setBackground(page, '#ffffff');
    await addText(page, 'M');
    await setField(page, 'text-size', 600);
    await setField(page, 'text-color', '#ff0000');
    await setField(page, 'text-x', 270);
    await setField(page, 'text-y', 540);
    await expect.poll(() => count(page, RED)).toBeGreaterThan(1000);
    const cx = await canvas(page).evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200 && d[i]! > 200 && d[i + 1]! < 80) { sum += (i / 4) % c.width; n++; }
      return n ? sum / n / c.width : -1;
    });
    expect(cx).toBeGreaterThan(0.05); expect(cx).toBeLessThan(0.45);
    await page.getByTestId('center-h').click();
    await expect(page.getByTestId('text-x')).toHaveValue('540');
    await setField(page, 'text-rotation', 90);
    await expect(page.getByTestId('text-rotation')).toHaveValue('90');
    await setField(page, 'text-rotation', 0);

    // ordem: dois textos idênticos no mesmo lugar; o que está por cima cobre o outro
    await page.getByTestId('add-text').click(); await page.getByTestId('text-content').fill('M');
    await setField(page, 'text-size', 600); await setField(page, 'text-color', '#0000ff');
    await setField(page, 'text-x', 540); await setField(page, 'text-y', 540);
    await expect.poll(() => count(page, BLUE)).toBeGreaterThan(1000);
    expect(await count(page, RED)).toBeLessThan(150);
    await textItems(page).nth(1).getByTestId('text-pick').click(); // o vermelho (embaixo)
    await page.getByTestId('prop-up').click();
    await expect.poll(() => count(page, RED)).toBeGreaterThan(1000);
    expect(await count(page, BLUE)).toBeLessThan(150);
    await page.getByTestId('prop-down').click();
    await expect.poll(() => count(page, BLUE)).toBeGreaterThan(1000);
  });

  test('duplicar e excluir texto; colar formatação sem trocar o conteúdo', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Original');
    await setField(page, 'text-size', 150); await setField(page, 'text-color', '#ff8800');
    await page.getByTestId('prop-copy-format').click();
    await page.getByTestId('prop-dup').click();
    await expect(textItems(page)).toHaveCount(2);
    await page.getByTestId('add-text').click(); await page.getByTestId('text-content').fill('Outro');
    await setField(page, 'text-size', 40); await setField(page, 'text-color', '#00ffcc');
    await page.getByTestId('prop-paste-format').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Outro');
    await expect(page.getByTestId('text-size')).toHaveValue('150');
    await expect(page.getByTestId('text-color')).toHaveValue('#ff8800');
    await page.getByTestId('prop-del').click();
    await expect(textItems(page)).toHaveCount(2);
  });
});

// ---------- 5 a 7: fundos ----------
test.describe('Versos · fundos', () => {
  test('5. importar imagem de fundo, trocar o encaixe e remover sem mexer nos textos', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Fica no lugar');
    await tab(page, 'Cena').click();
    await importBackground(page, await makePng(page, 300, 200, '#00c000'));
    await expect(page.getByTestId('bg-image')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => near(await pixel(page, 0.02, 0.02), GREEN, 30)).toBe(true);
    await expect.poll(async () => near(await pixel(page, 0.98, 0.98), GREEN, 30)).toBe(true);
    await page.getByTestId('bg-fit').selectOption('contain');
    await page.getByTestId('bg-fit').selectOption('stretch');
    await setField(page, 'bg-zoom', 200);
    await expect(canvas(page)).toHaveAttribute('aria-label', /com 1 texto/);
    await page.getByTestId('bg-remove').click();
    await expect(page.getByTestId('bg-remove')).toHaveCount(0);
    await expect.poll(async () => near(await pixel(page, 0.02, 0.02), [0x14, 0x16, 0x1c], 6)).toBe(true);
    await expect(canvas(page)).toHaveAttribute('aria-label', /com 1 texto/);
    await tab(page, 'Textos').click();
    await expect(textItems(page)).toHaveCount(1);
  });

  test('importar arquivo que não é imagem mostra mensagem e não muda a cena', async ({ page }) => {
    await openVersos(page);
    await tab(page, 'Cena').click();
    await page.getByTestId('bg-input').setInputFiles({ name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') });
    await expect(page.getByTestId('editor-status')).toContainText(/imagem/i);
    await expect(page.getByTestId('bg-color')).toHaveAttribute('aria-checked', 'true');
  });

  test('6. fundo de cor sólida pelo seletor hexadecimal, com opacidade', async ({ page }) => {
    await openVersos(page);
    await setBackground(page, '#336699');
    await expect.poll(async () => near(await pixel(page, 0.5, 0.1), [0x33, 0x66, 0x99], 2)).toBe(true);
    await setField(page, 'bg-color-hex', 'zzz');
    await expect(page.getByTestId('bg-color-hex')).toHaveAttribute('aria-invalid', 'true');
    await setField(page, 'bg-alpha', 50);
    await expect.poll(async () => { const p = await pixel(page, 0.5, 0.1); return p[3]! > 100 && p[3]! < 160; }).toBe(true);
  });

  test('7. fundo transparente: a grade xadrez é só da tela, o canvas fica realmente transparente', async ({ page }) => {
    await openVersos(page);
    await tab(page, 'Cena').click();
    await page.getByTestId('bg-transparent').click();
    await expect.poll(async () => (await pixel(page, 0.5, 0.5))[3]).toBe(0);
    const board = await page.getByTestId('versos-board').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(board).toContain('conic-gradient');
  });
});

// ---------- 8 a 12: cenas ----------
test.describe('Versos · operações de cenas', () => {
  const ids = (page: Page) => sceneItems(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.sceneId!));

  test('8. duplicar cena gera ids novos e cópia independente', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Verso um');
    const before = await ids(page);
    await page.getByTestId('dup-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    const after = await ids(page);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[0]);
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 2 de 2');
    await tab(page, 'Textos').click();
    await expect(textItems(page)).toHaveCount(1);
    await textItems(page).first().getByTestId('text-pick').click();
    await page.getByTestId('text-content').fill('Só na cópia');
    await sceneItems(page).first().getByTestId('scene-pick').click();
    await textItems(page).first().getByTestId('text-pick').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Verso um');
  });

  test('9. copiar e colar cena cria sempre uma cena nova e nunca substitui', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Copie-me');
    const original = (await ids(page))[0]!;
    await expect(page.getByTestId('paste-scene')).toBeDisabled();
    await page.getByTestId('copy-scene').click();
    await expect(page.getByTestId('paste-scene')).toBeEnabled();
    await page.getByTestId('paste-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await page.getByTestId('paste-scene').click();
    await expect(sceneItems(page)).toHaveCount(3);
    const all = await ids(page);
    expect(all[0]).toBe(original);
    expect(new Set(all).size).toBe(3);
    // recortar tira a cena e a deixa disponível para colar
    await page.getByTestId('cut-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await page.getByTestId('paste-scene').click();
    await expect(sceneItems(page)).toHaveCount(3);
  });

  test('10. reordenar cenas pelos botões e navegar entre elas', async ({ page }) => {
    await openVersos(page);
    const rename = async (name: string) => { await tab(page, 'Cena').click(); await page.getByTestId('scene-name').fill(name); };
    await rename('A');
    await page.getByTestId('add-scene').click(); await rename('B');
    await page.getByTestId('add-scene').click(); await rename('C');
    const names = () => page.locator('[data-testid="scene-item"] .sl-name').allTextContents();
    expect(await names()).toEqual(['A', 'B', 'C']);
    await sceneItems(page).nth(0).getByTestId('scene-down').click();
    expect(await names()).toEqual(['B', 'A', 'C']);
    await sceneItems(page).nth(2).getByTestId('scene-up').click();
    expect(await names()).toEqual(['B', 'C', 'A']);
    await expect(sceneItems(page).nth(0).getByTestId('scene-up')).toBeDisabled();
    await expect(sceneItems(page).nth(2).getByTestId('scene-down')).toBeDisabled();
    // anterior / próxima
    await sceneItems(page).nth(2).getByTestId('scene-pick').click();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 3 de 3');
    await expect(page.getByTestId('scene-next')).toBeDisabled();
    await page.getByTestId('scene-prev').click();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 2 de 3');
    await page.getByTestId('scene-next').click();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 3 de 3');
  });

  test('11. excluir a última cena deixa uma cena inicial vazia', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Vai embora');
    const old = (await ids(page))[0]!;
    await sceneItems(page).first().getByTestId('scene-del').click();
    await expect(sceneItems(page)).toHaveCount(1);
    expect((await ids(page))[0]).not.toBe(old);
    await expect(page.getByTestId('texts-empty')).toBeVisible();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 1 de 1');
    // e o desfazer traz tudo de volta
    await page.getByTestId('undo').click();
    await expect(textItems(page)).toHaveCount(1);
  });

  test('12. desfazer e refazer pelos botões e pelo teclado; em campo de texto o atalho é do campo', async ({ page }) => {
    await openVersos(page);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.getByTestId('add-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await page.getByTestId('undo').click();
    await expect(sceneItems(page)).toHaveCount(1);
    await page.getByTestId('redo').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await page.getByTestId('scene-pick').first().focus();
    await page.keyboard.press('Control+z');
    await expect(sceneItems(page)).toHaveCount(1);
    await page.keyboard.press('Control+y');
    await expect(sceneItems(page)).toHaveCount(2);
    await page.keyboard.press('Control+Shift+Z');
    await expect(sceneItems(page)).toHaveCount(2); // nada a refazer
    await page.keyboard.press('Control+z');
    await expect(sceneItems(page)).toHaveCount(1);
    // dentro do campo de nome da cena o Ctrl+Z desfaz a digitação, não o projeto
    await page.getByTestId('add-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await tab(page, 'Cena').click();
    const name = page.getByTestId('scene-name');
    await name.click(); await page.keyboard.type('abc');
    await page.keyboard.press('Control+z');
    await expect(sceneItems(page)).toHaveCount(2);
  });

  test('copiar/colar entre projetos Versos e aplicar o estilo de outra cena sem trocar o conteúdo', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Veio do projeto A');
    await setField(page, 'text-size', 222); await setField(page, 'text-color', '#ffaa00');
    await tab(page, 'Cena').click();
    await importBackground(page, await makePng(page, 200, 200, '#00c000'));
    await expect(page.getByTestId('bg-image')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('copy-scene').click();
    await settle(page);
    await openVersos(page, 'em-branco'); // outro projeto
    await expect(page.getByTestId('paste-scene')).toBeEnabled();
    await page.getByTestId('paste-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await expect.poll(async () => near(await pixel(page, 0.02, 0.02), GREEN, 30)).toBe(true);
    await tab(page, 'Textos').click();
    await textItems(page).first().getByTestId('text-pick').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Veio do projeto A');

    // estilo de outra cena: escolhe a cena 2 como origem e aplica ao texto da cena 1
    await sceneItems(page).first().getByTestId('scene-pick').click();
    await addText(page, 'Conteúdo da cena 1');
    await setField(page, 'text-size', 30);
    await tab(page, 'Estilos').click();
    await page.getByTestId('apply-from').click();
    await tab(page, 'Textos').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Conteúdo da cena 1');
    await expect(page.getByTestId('text-size')).toHaveValue('222');
    await expect(page.getByTestId('text-color')).toHaveValue('#ffaa00');
  });

  test('estilos prontos e estilo salvo no projeto', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Estilo');
    await tab(page, 'Estilos').click();
    await page.locator('[data-preset="impacto"]').click();
    await tab(page, 'Textos').click();
    await expect(page.getByTestId('text-font')).toHaveValue('bebas-neue');
    await expect(page.getByTestId('text-content')).toHaveValue('Estilo');
    await tab(page, 'Estilos').click();
    await page.getByTestId('style-name').fill('Meu verso');
    await page.getByTestId('save-style').click();
    await expect(page.getByTestId('saved-styles')).toContainText('Meu verso');
    await page.locator('[data-preset="manuscrito"]').click();
    await tab(page, 'Textos').click();
    await expect(page.getByTestId('text-font')).toHaveValue('caveat');
    await tab(page, 'Estilos').click();
    await page.getByTestId('apply-saved').click();
    await tab(page, 'Textos').click();
    await expect(page.getByTestId('text-font')).toHaveValue('bebas-neue');
  });
});

// ---------- 13 e 14: salvar, reabrir e recarregar ----------
test.describe('Versos · persistência', () => {
  test('13. salvar, reabrir pela Biblioteca e recarregar mantêm cenas, textos e imagem de fundo', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('doc-name').fill('Projeto persistente');
    await addText(page, 'Persistir');
    await setField(page, 'text-size', 300); await setField(page, 'text-color', '#ff0000');
    await tab(page, 'Cena').click();
    await importBackground(page, await makePng(page, 200, 200, '#00c000'));
    await page.getByTestId('add-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await settle(page);
    expect(page.url()).toContain('?doc=');

    // 14. recarregar: nada de blob: temporário, a imagem volta do armazenamento
    await page.reload();
    await expect(canvas(page)).toBeVisible();
    await expect(sceneItems(page)).toHaveCount(2);
    await expect(page.getByTestId('doc-name')).toHaveValue('Projeto persistente');
    await expect.poll(async () => near(await pixel(page, 0.02, 0.02), GREEN, 30)).toBe(true);
    await expect(page.getByTestId('missing-image')).toHaveCount(0);
    await sceneItems(page).first().getByTestId('scene-pick').click();
    await tab(page, 'Textos').click();
    await textItems(page).first().getByTestId('text-pick').click();
    await expect(page.getByTestId('text-content')).toHaveValue('Persistir');
    await expect(page.getByTestId('text-size')).toHaveValue('300');
    await expect.poll(() => count(page, RED)).toBeGreaterThan(1000);

    // reabrir pela Biblioteca de documentos
    await page.goto('/launcher/#/documentos');
    const card = page.locator('[data-copy-card]', { hasText: 'Projeto persistente' });
    await expect(card).toBeVisible();
    await card.click();
    await page.locator('[data-copy-action="open"]').click();
    await expect(canvas(page)).toBeVisible();
    await expect(page.getByTestId('doc-name')).toHaveValue('Projeto persistente');
    await expect(sceneItems(page)).toHaveCount(2);
  });

  test('o projeto salvo não guarda endereços blob: e a imagem fica no armazenamento do app', async ({ page }) => {
    await openVersos(page);
    await tab(page, 'Cena').click();
    await importBackground(page, await makePng(page, 120, 80, '#00c000'));
    await settle(page);
    const stored = await readVersosDb(page);
    expect(stored.states.length).toBe(1);
    expect(stored.states[0]).not.toContain('blob:');
    expect(stored.states[0]).toContain('"imageId"');
    expect(stored.blobTypes).toContain('image/png');
  });
});

// ---------- 15 a 18: exportação ----------
test.describe('Versos · exportação', () => {
  test('15. exporta a cena completa em PNG, no tamanho da cena e com nome previsível', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('doc-name').fill('Meu Versos');
    await setBackground(page, '#102030');
    await tab(page, 'Cena').click();
    await page.getByTestId('ratio-16:9').click();
    await setField(page, 'scene-width', 640);
    await expect(page.getByTestId('scene-dims')).toHaveText('640 × 360 px');
    await addText(page, 'MMM');
    await setField(page, 'text-size', 200); await setField(page, 'text-color', '#ff0000');
    await setField(page, 'text-x', 320); await setField(page, 'text-y', 180);
    await tab(page, 'Arquivo').click();
    const file = await download(page, () => page.getByTestId('export-scene').click());
    expect(file.name).toBe('Meu Versos-001.png');
    const png = await inspectPng(page, file.data, [[0.02, 0.02], [0.98, 0.98]]);
    expect([png.w, png.h]).toEqual([640, 360]);
    expect(near(png.points[0]!, [0x10, 0x20, 0x30], 2)).toBe(true);
    expect(png.opaque).toBe(640 * 360); // a grade xadrez da prévia nunca entra na exportação
    await expect(page.getByTestId('export-message')).toBeVisible();
  });

  test('16. só os textos: PNG com fundo transparente e textos opacos; completo mantém fundo semitransparente', async ({ page }) => {
    await openVersos(page, 'transparente');
    await page.getByTestId('doc-name').fill('Legenda');
    await tab(page, 'Arquivo').click();
    // fundo transparente, imagem completa: nada opaco além dos textos
    const full = await download(page, () => page.getByTestId('export-scene').click());
    const f = await inspectPng(page, full.data, [[0.01, 0.01]]);
    expect(f.points[0]![3]).toBe(0);
    expect(f.clear).toBeGreaterThan(f.w * f.h * 0.5);
    // só os textos sobre um fundo de cor
    await tab(page, 'Cena').click();
    await page.getByTestId('bg-color').click();
    await setField(page, 'bg-color-hex', '#ff0000');
    await tab(page, 'Arquivo').click();
    await page.getByTestId('kind-text').check();
    const only = await download(page, () => page.getByTestId('export-scene').click());
    expect(only.name).toBe('Legenda-001-texto.png');
    const t = await inspectPng(page, only.data, [[0.01, 0.01], [0.99, 0.99]]);
    expect(t.points[0]![3]).toBe(0);
    expect(t.points[1]![3]).toBe(0);
    expect(t.opaque).toBeGreaterThan(500);
    expect([t.w, t.h]).toEqual([1920, 1080]);
    // completa com fundo vermelho sólido
    await page.getByTestId('kind-full').check();
    const complete = await download(page, () => page.getByTestId('export-scene').click());
    const c = await inspectPng(page, complete.data, [[0.01, 0.01]]);
    expect(near(c.points[0]!, RED, 2)).toBe(true);
  });

  test('17. exporta todas as cenas em um ZIP, na ordem, e em PNGs separados', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('doc-name').fill('Letra');
    await setBackground(page, '#aa0000');
    await page.getByTestId('add-scene').click();
    await setBackground(page, '#00aa00');
    await page.getByTestId('add-scene').click();
    await setBackground(page, '#0000aa');
    await tab(page, 'Arquivo').click();
    const zip = await download(page, () => page.getByTestId('export-zip').click());
    expect(zip.name).toMatch(/\.zip$/);
    const entries = readZip(zip.data);
    expect(entries.map((e) => e.name)).toEqual(['Letra-001.png', 'Letra-002.png', 'Letra-003.png']);
    expect(entries.every((e) => e.method === 0)).toBe(true);
    const colors: number[][] = [];
    for (const e of entries) colors.push((await inspectPng(page, e.data, [[0.5, 0.5]])).points[0]!);
    expect(near(colors[0]!, [0xaa, 0, 0], 2)).toBe(true);
    expect(near(colors[1]!, [0, 0xaa, 0], 2)).toBe(true);
    expect(near(colors[2]!, [0, 0, 0xaa], 2)).toBe(true);
    // intervalo
    await page.getByTestId('range-from').fill('2'); await page.getByTestId('range-to').fill('3');
    const part = await download(page, () => page.getByTestId('export-range').click());
    expect(readZip(part.data).map((e) => e.name)).toEqual(['Letra-002.png', 'Letra-003.png']);
    // PNGs separados
    const names: string[] = [];
    page.on('download', (d) => names.push(d.suggestedFilename()));
    await page.getByTestId('export-all-png').click();
    await expect.poll(() => names.length).toBe(3);
    expect(names.sort()).toEqual(['Letra-001.png', 'Letra-002.png', 'Letra-003.png']);
  });

  test('18. cada cena sai na própria resolução; valores inválidos são recusados com mensagem', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('doc-name').fill('Tamanhos');
    await tab(page, 'Cena').click();
    await page.getByTestId('add-scene').click();
    await page.getByTestId('ratio-16:9').click();
    await setField(page, 'scene-width', 1920);
    await expect(page.getByTestId('scene-dims')).toHaveText('1920 × 1080 px');
    await page.getByTestId('add-scene').click();
    await page.getByTestId('ratio-9:16').click();
    await setField(page, 'scene-height', 1280);
    await expect(page.getByTestId('scene-dims')).toHaveText('720 × 1280 px');
    // inválidos: a cena não muda
    await setField(page, 'scene-width', 5);
    await expect(page.getByTestId('size-error')).toBeVisible();
    await expect(page.getByTestId('scene-dims')).toHaveText('720 × 1280 px');
    await setField(page, 'scene-width', 20000);
    await expect(page.getByTestId('size-error')).toBeVisible();
    await expect(page.getByTestId('scene-dims')).toHaveText('720 × 1280 px');
    // personalizado: largura e altura independentes
    await page.getByTestId('ratio-custom').click();
    await setField(page, 'scene-width', 500); await setField(page, 'scene-height', 300);
    await expect(page.getByTestId('scene-dims')).toHaveText('500 × 300 px');
    await expect(page.getByTestId('size-error')).toHaveCount(0);
    await tab(page, 'Arquivo').click();
    const zip = await download(page, () => page.getByTestId('export-zip').click());
    const sizes: number[][] = [];
    for (const e of readZip(zip.data)) { const p = await inspectPng(page, e.data); sizes.push([p.w, p.h]); }
    expect(sizes).toEqual([[1080, 1080], [1920, 1080], [500, 300]]);
  });

  test('exportação funciona sem música e não inclui áudio no ZIP', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('add-scene').click();
    await tab(page, 'Arquivo').click();
    const zip = await download(page, () => page.getByTestId('export-zip').click());
    expect(readZip(zip.data).every((e) => e.name.endsWith('.png'))).toBe(true);
    await expect(page.getByTestId('player-name')).toHaveCount(0);
  });
});

// ---------- 19 a 25: música de referência ----------
test.describe('Versos · música de referência', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(MEDIA_LOG); });

  test('19. importar áudio: só toca depois do clique, mostra nome, tempo e controles', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    await loadWav(page, 20, 'minha-musica.wav');
    await expect(page.getByTestId('player-name')).toHaveText('minha-musica.wav');
    await expect(page.getByTestId('player-play')).toBeEnabled();
    expect(await mediaLog(page)).not.toContain('play'); // nada toca sozinho
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    await expect.poll(() => timeOf(page), { timeout: 8000 }).toBeGreaterThan(0);
    await page.getByTestId('player-volume').fill('30');
    await page.getByTestId('player-mute').click();
    await expect(page.getByTestId('player-mute')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('player-mute').click();
    // trocar e remover
    await page.getByTestId('media-remove').click();
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    expect(await mediaLog(page)).toContain('revoke');
    // a música nunca vai para o projeto
    await addText(page, 'Salvar');
    await settle(page);
    await loadWav(page, 5, 'outra.wav');
    await settle(page);
    const stored = await readVersosDb(page);
    expect(stored.states.length).toBe(1);
    expect(stored.states[0]).not.toContain('outra.wav');
    expect(stored.states[0]).not.toContain('blob:');
    expect(stored.blobTypes.filter((t) => t.startsWith('audio') || t.startsWith('video'))).toEqual([]);
  });

  test('20. importar vídeo: só o áudio é usado e nenhuma imagem de vídeo aparece', async ({ page }) => {
    await openVersos(page);
    const b64 = await page.evaluate(async () => {
      try {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const g = cv.getContext('2d')!;
        const stream = cv.captureStream(15);
        const ac = new AudioContext(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination();
        osc.connect(dest); osc.start();
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks: Blob[] = []; rec.ondataavailable = (e) => chunks.push(e.data);
        const done = new Promise<void>((r) => { rec.onstop = () => r(); });
        rec.start(); let i = 0;
        const iv = setInterval(() => { g.fillStyle = 'hsl(' + (i++ * 20) + ',80%,50%)'; g.fillRect(0, 0, 64, 64); }, 60);
        await new Promise((r) => setTimeout(r, 2500));
        clearInterval(iv); rec.stop(); await done; osc.stop();
        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        let s = ''; for (let k = 0; k < bytes.length; k += 8192) s += String.fromCharCode(...bytes.subarray(k, k + 8192));
        return btoa(s);
      } catch { return ''; }
    });
    test.skip(!b64, 'este navegador não gerou um WebM de teste (MediaRecorder indisponível)');
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') });
    await expect(page.getByTestId('player-name')).toHaveText('clipe.webm');
    await expect(page.getByTestId('player')).toContainText('só o áudio toca');
    await expect(page.locator('video')).toHaveCount(0); // o vídeo nunca entra na página
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('21. trocar, criar, duplicar e excluir cenas durante a reprodução não interrompe nem reinicia', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await loadWav(page, 30);
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    await expect.poll(() => timeOf(page), { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    const pausesBefore = (await mediaLog(page)).filter((e) => e === 'pause').length;
    const t0 = await timeOf(page);
    await page.getByTestId('footer-add-scene').click();
    await page.getByTestId('scene-prev').click();
    await page.getByTestId('dup-scene').click();
    await addText(page, 'Editando enquanto toca');
    await setField(page, 'text-size', 90);
    await page.getByTestId('scene-next').click();
    await sceneItems(page).last().getByTestId('scene-del').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    expect((await mediaLog(page)).filter((e) => e === 'pause').length).toBe(pausesBefore);
    expect(await timeOf(page)).toBeGreaterThanOrEqual(t0); // continuou, não voltou ao início
  });

  test('22. pausar e retomar continua do mesmo ponto', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await loadWav(page, 30);
    await page.getByTestId('player-play').click();
    await expect.poll(() => timeOf(page), { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Tocar');
    const paused = await timeOf(page);
    await page.waitForTimeout(1500);
    expect(await timeOf(page)).toBe(paused);
    await page.getByTestId('player-play').click();
    await expect.poll(() => timeOf(page), { timeout: 8000 }).toBeGreaterThan(paused);
    expect(await timeOf(page)).toBeGreaterThanOrEqual(paused);
  });

  test('23. sair de /versos/ ou recarregar encerra a reprodução e nada volta a tocar sozinho', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await loadWav(page, 30);
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    // recarregar
    const before = (await mediaLog(page)).length;
    await page.reload();
    await expect(canvas(page)).toBeVisible();
    const afterReload = await mediaLog(page);
    expect(afterReload.slice(before)).toContain('pause');
    expect(afterReload.slice(before)).toContain('revoke');
    expect(afterReload.slice(before)).not.toContain('play');
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    // tocar de novo e sair para o Launcher
    await openPlayer(page);
    await loadWav(page, 30);
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toContainText('Pausar');
    const mark = (await mediaLog(page)).length;
    await page.getByTestId('back-home').click();
    await expect(page).toHaveURL(/\/launcher\//);
    const afterLeave = (await mediaLog(page)).slice(mark);
    expect(afterLeave).toContain('pause');
    expect(afterLeave).toContain('revoke');
    // voltar ao Versos: sem música carregada e sem tocar
    await page.goBack();
    await expect(canvas(page)).toBeVisible();
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    expect((await mediaLog(page)).slice(mark + afterLeave.length)).not.toContain('play');
  });

  test('24. arquivos incompatíveis: mensagem clara e o editor continua funcionando', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('não sou música') });
    await expect(page.getByTestId('player-notice')).toContainText('não parece ser de áudio nem de vídeo');
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    await page.getByTestId('media-input').setInputFiles({ name: 'quebrado.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('isto nao e um mp3 de verdade '.repeat(40)) });
    await expect(page.getByTestId('player-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('player-error')).toContainText(/formato|codec|carregar|ler/i);
    await expect(page.getByTestId('player-play')).toBeDisabled();
    // o editor segue funcionando
    await addText(page, 'Ainda funciona');
    await expect(textItems(page)).toHaveCount(1);
    // e um arquivo bom substitui o ruim
    await loadWav(page, 10);
    await expect(page.getByTestId('player-error')).toHaveCount(0);
    await expect(page.getByTestId('player-play')).toBeEnabled();
  });

  test('25. restrições configuráveis em Ajustes (bloquear, avisar, desligar) valem para a música', async ({ page }) => {
    await page.goto('/launcher/#/ajustes?aba=projetos');
    const panel = page.getByTestId('import-limits-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('import-limits-enabled')).toBeChecked();
    // bloqueia acima de 1 MB (arquivo de ~2,4 MB)
    await page.getByTestId('import-warn-audio').fill('1'); await page.getByTestId('import-warn-audio').press('Tab');
    await page.getByTestId('import-max-audio').fill('2'); await page.getByTestId('import-max-audio').press('Tab');
    await expect(page.getByTestId('import-limits-error')).toHaveCount(0);
    const big = makeWav(300); // 300 s a 8 kHz = ~2,3 MB
    await openVersos(page);
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'grande.wav', mimeType: 'audio/wav', buffer: big });
    await expect(page.getByTestId('player-notice')).toContainText(/limite|grande|acima/i);
    await expect(page.getByTestId('player-name')).toHaveCount(0);
    // entre o aviso e o máximo: carrega e avisa
    await page.goto('/launcher/#/ajustes?aba=projetos');
    await page.getByTestId('import-max-audio').fill('100'); await page.getByTestId('import-max-audio').press('Tab');
    await openVersos(page);
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'grande.wav', mimeType: 'audio/wav', buffer: big });
    await expect(page.getByTestId('player-name')).toHaveText('grande.wav');
    await expect(page.getByTestId('player-notice')).toBeVisible();
    // desligado: nem aviso nem bloqueio
    await page.goto('/launcher/#/ajustes?aba=projetos');
    await page.getByTestId('import-limits-enabled').uncheck();
    await openVersos(page);
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'grande.wav', mimeType: 'audio/wav', buffer: big });
    await expect(page.getByTestId('player-name')).toHaveText('grande.wav');
    await expect(page.getByTestId('player-notice')).toHaveCount(0);
    // valores inválidos em Ajustes são recusados
    await page.goto('/launcher/#/ajustes?aba=projetos');
    await page.getByTestId('import-limits-enabled').check();
    await page.getByTestId('import-max-audio').fill('0'); await page.getByTestId('import-max-audio').press('Tab');
    await expect(page.getByTestId('import-limits-error')).toBeVisible();
    await page.getByTestId('import-limits-reset').click();
    await expect(page.getByTestId('import-max-audio')).toHaveValue('100');
  });
});

// ---------- 26: fontes ----------
test.describe('Versos · fontes', () => {
  test('26. fonte que falha ao carregar usa a Arimo só na exibição e não troca a escolha', async ({ page }) => {
    await page.route('**/fonts/versos/pacifico/**', (route) => route.abort());
    await openVersos(page);
    await addText(page, 'Pacifico');
    await page.getByTestId('text-font').selectOption('pacifico');
    await expect(page.getByTestId('font-note')).toContainText(/Arimo/, { timeout: 10000 });
    await expect(page.getByTestId('text-font')).toHaveValue('pacifico');
    await setField(page, 'text-size', 300);
    await expect(page.getByTestId('text-font')).toHaveValue('pacifico');
    await setField(page, 'text-color', '#ff0000');
    await expect.poll(() => count(page, RED)).toBeGreaterThan(500); // o texto aparece com a fonte reserva
  });

  test('26b. fonte que não existe neste aparelho: o nome original fica guardado e a exibição usa a Arimo', async ({ page }) => {
    const state = {
      v: 1, name: 'Fonte rara', styles: [],
      scenes: [{
        id: 'sc_a', name: '', width: 800, height: 600, ratio: 'custom', background: { mode: 'color', color: '#112233', alpha: 1, image: null },
        texts: [{ id: 'tx_a', text: 'MMM', font: { id: 'minha-fonte-rara', label: 'Minha Fonte Rara' }, size: 300, color: '#ff0000', x: 400, y: 300, width: 700 }]
      }]
    };
    await page.goto('/launcher/#/documentos');
    await uploadBackup(page, backupFile({ source: 'backup', doc: { id: 'v2-versos-rara', type: 'versos', updatedAt: 1, state }, images: [] } as never));
    const card = page.locator('[data-copy-card]', { hasText: 'Fonte rara' });
    await expect(card).toBeVisible();
    await card.click();
    await page.locator('[data-copy-action="open"]').click();
    await expect(canvas(page)).toBeVisible();
    await expect.poll(() => count(page, RED)).toBeGreaterThan(500);
    await tab(page, 'Textos').click();
    await textItems(page).first().getByTestId('text-pick').click();
    await expect(page.getByTestId('font-note')).toContainText('Minha Fonte Rara');
    await expect(page.getByTestId('text-font').locator('option:checked')).toContainText('indisponível');
    await setField(page, 'text-size', 280);
    await expect(page.getByTestId('text-font').locator('option:checked')).toContainText('Minha Fonte Rara');
    await settle(page);
    await page.reload();
    await tab(page, 'Textos').click();
    await textItems(page).first().getByTestId('text-pick').click();
    await expect(page.getByTestId('text-font').locator('option:checked')).toContainText('Minha Fonte Rara');
    await expect(page.getByTestId('font-note')).toContainText('Arimo');
  });

  test('as doze fontes incluídas estão listadas e cada uma desenha o texto', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Rede');
    const options = await page.getByTestId('text-font').locator('option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(12);
    await setField(page, 'text-color', '#ff0000'); await setField(page, 'text-size', 300);
    for (const id of ['oswald', 'playfair-display', 'great-vibes', 'bebas-neue', 'arimo']) {
      await page.getByTestId('text-font').selectOption(id);
      await expect(page.getByTestId('text-font')).toHaveValue(id);
      await expect(page.getByTestId('font-note')).toHaveCount(0, { timeout: 10000 }); // carregou, sem aviso
      await expect.poll(() => count(page, RED)).toBeGreaterThan(300);
    }
  });
});

// ---------- 27 e 28: celular e teclado ----------
test.describe('Versos · celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('regressão: importar música mantém o player compacto e a prévia legível, mesmo com a gaveta aberta', async ({ page }) => {
    await openVersos(page);
    await openPlayer(page);
    await page.getByTestId('media-input').setInputFiles({ name: 'referencia.wav', mimeType: 'audio/wav', buffer: makeWav(20) });
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('player-quick')).toBeVisible();
    await expect(page.getByTestId('player-play')).toBeHidden();
    await expect(page.getByTestId('player-toggle')).toContainText('referencia.wav');
    const fit = (await canvas(page).boundingBox())!;
    expect(fit.width, 'prévia deve ser grande quando player está recolhido').toBeGreaterThan(235);
    expect(fit.height).toBeGreaterThan(235);
    await page.getByTestId('player-quick').click();
    await expect(page.getByTestId('player-quick')).toHaveAttribute('aria-label', 'Pausar');
    await tab(page, 'Cena').click();
    await expect(page.getByTestId('bottom-sheet')).toBeVisible();
    await expect.poll(async () => (await canvas(page).boundingBox())?.width ?? 0).toBeGreaterThan(185);
    await expect(page.getByTestId('player-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('footer-add-scene').click();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 2 de 2');
    await expect(page.getByTestId('player-quick')).toHaveAttribute('aria-label', 'Pausar');
    await noHorizontalScroll(page);
  });

  test('27. layout próprio no celular: prévia principal, abas, cenas e propriedades em gaveta, sem rolagem horizontal', async ({ page }) => {
    await openVersos(page);
    await expect(page.getByTestId('editor-sidebar')).toHaveCount(0);
    const box = (await canvas(page).boundingBox())!;
    const metrics = await page.evaluate(() => {
      const r = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
      const kids = Array.from(document.querySelectorAll('.es-head > *')).map((e) => { const b = e.getBoundingClientRect(); return (e.className || e.tagName) + ':' + Math.round(b.x) + ',' + Math.round(b.width); });
      return { head: r('.es-head'), canvasArea: r('.es-canvas'), stage: r('[data-testid="editor-stage"]'), footer: r('.es-footer'), sheet: r('.es-mobile-sheet'), nav: r('.es-mobile-nav'), zoombar: r('.zoombar'), kids, sw: document.documentElement.scrollWidth };
    });
    expect(box.width, JSON.stringify(metrics)).toBeGreaterThan(250);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    for (const name of ['Cena', 'Textos', 'Estilos', 'Arquivo', 'Cenas', 'Propriedades']) await expect(tab(page, name)).toBeVisible();
    await noHorizontalScroll(page);
    // adicionar texto pela aba Textos
    await tab(page, 'Textos').click();
    await page.getByTestId('add-text').click();
    await expect(textItems(page)).toHaveCount(1);
    await noHorizontalScroll(page);
    // propriedades numa gaveta
    await tab(page, 'Propriedades').click();
    await expect(page.getByTestId('text-content')).toBeVisible();
    await page.getByTestId('text-content').fill('Celular');
    await setField(page, 'text-size', 120);
    await noHorizontalScroll(page);
    // cenas com miniaturas e navegação simples
    await tab(page, 'Cenas').click();
    await page.getByTestId('add-scene').click();
    await expect(sceneItems(page)).toHaveCount(2);
    await tab(page, 'Cenas').click(); // toca na aba de novo: recolhe a gaveta
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 2 de 2');
    await page.getByTestId('scene-prev').click();
    await expect(page.getByTestId('scene-position')).toHaveText('Cena 1 de 2');
    // alvos de toque de pelo menos 44 px nos botões da navegação
    for (const id of ['scene-prev', 'scene-next']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(40);
    }
    await noHorizontalScroll(page);
  });

  test('toque longo numa cena abre o menu de contexto com as operações da cena', async ({ page }) => {
    await openVersos(page);
    await tab(page, 'Cenas').click();
    const item = sceneItems(page).first();
    const b = (await item.boundingBox())!;
    const at = { pointerType: 'touch', isPrimary: true, button: 0, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
    await item.dispatchEvent('pointerdown', at);
    await expect(page.getByTestId('coding-context-menu')).toBeVisible({ timeout: 2500 });
    await item.dispatchEvent('pointerup', at);
    await page.getByRole('menuitem', { name: /^Duplicar cena/ }).click();
    await expect(sceneItems(page)).toHaveCount(2);
  });

  test('o editor no celular também passa na verificação de acessibilidade', async ({ page }) => {
    await openVersos(page);
    await tab(page, 'Textos').click();
    await page.getByTestId('add-text').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});

test.describe('Versos · teclado, menu de contexto e acessibilidade', () => {
  test('28. atalhos: Ctrl+C/V/X/D nas cenas, Delete, PageUp/PageDown, setas movem o texto e Esc limpa a seleção', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('scene-pick').first().click();
    await page.keyboard.press('Control+d');
    await expect(sceneItems(page)).toHaveCount(2);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(sceneItems(page)).toHaveCount(3);
    await page.keyboard.press('Control+x');
    await expect(sceneItems(page)).toHaveCount(2);
    await page.keyboard.press('Control+v');
    await expect(sceneItems(page)).toHaveCount(3);
    await page.keyboard.press('Delete');
    await expect(sceneItems(page)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(sceneItems(page)).toHaveCount(3);
    await page.keyboard.press('PageUp');
    const position = await page.getByTestId('scene-position').textContent();
    await page.keyboard.press('PageDown');
    expect(await page.getByTestId('scene-position').textContent()).not.toBe(position);

    // texto selecionado na prévia: setas, Shift+setas e Esc
    await addText(page, 'Seta');
    const x0 = Number(await page.getByTestId('text-x').inputValue());
    await page.getByTestId('versos-viewport').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('text-x')).toHaveValue(String(x0 + 1));
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('text-x')).toHaveValue(String(x0 + 11));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-props-empty')).toBeVisible();
    // Delete na prévia exclui o texto selecionado
    await textItems(page).first().getByTestId('text-pick').click();
    await page.getByTestId('versos-viewport').focus();
    await page.keyboard.press('Delete');
    await expect(textItems(page)).toHaveCount(0);
  });

  test('em campos de texto Ctrl+C, Ctrl+V, Delete e Backspace pertencem ao campo', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Texto do campo');
    const scenes = await sceneItems(page).count();
    const area = page.getByTestId('text-content');
    await area.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Delete');
    await expect(area).toHaveValue('');
    await page.keyboard.press('Control+v');
    await expect(area).toHaveValue('Texto do campo');
    await page.keyboard.press('Control+d');
    await expect(sceneItems(page)).toHaveCount(scenes);
    await expect(textItems(page)).toHaveCount(1);
  });

  test('a navegação por Tab percorre os controles na ordem visual e o foco é visível', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('add-scene').click(); // com histórico, desfazer fica habilitado e entra na ordem do Tab
    await page.getByTestId('doc-name').focus();
    const reached = new Set<string>();
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ?? document.activeElement?.getAttribute('aria-label') ?? '');
      if (id) reached.add(id);
    }
    for (const id of ['undo', 'add-scene', 'scene-pick', 'versos-viewport', 'scene-prev', 'footer-add-scene']) expect(reached.has(id), id).toBe(true);
    const outline = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const s = getComputedStyle(el); return s.outlineStyle + s.boxShadow; });
    expect(outline).not.toBe('nonenone');
  });

  test('menu de contexto: cena (lista) e texto (prévia) mostram as operações do elemento', async ({ page }) => {
    await openVersos(page);
    await addText(page, 'Menu');
    await sceneItems(page).first().getByTestId('scene-pick').click({ button: 'right' });
    await expect(page.getByTestId('coding-context-menu')).toBeVisible();
    for (const label of [/^Copiar cena/, /^Recortar cena/, /^Duplicar cena/, /^Excluir cena/]) await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
    await page.getByRole('menuitem', { name: /^Duplicar cena/ }).click();
    await expect(sceneItems(page)).toHaveCount(2);
    await sceneItems(page).first().getByTestId('scene-pick').click();
    await canvas(page).click({ button: 'right' }); // o centro da cena é onde está o texto
    await expect(page.getByTestId('coding-context-menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Duplicar texto/ })).toBeVisible();
    await page.getByRole('menuitem', { name: /^Duplicar texto/ }).click();
    await tab(page, 'Textos').click();
    await expect(textItems(page)).toHaveCount(2);
    // ferramentas do app no mesmo menu
    await sceneItems(page).first().getByTestId('scene-pick').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: /^Adicionar texto/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Alt+Shift+N adiciona um texto e Alt+Shift+E leva à exportação', async ({ page }) => {
    await openVersos(page);
    await page.getByTestId('editor-stage').focus();
    await page.keyboard.press('Alt+Shift+N');
    await expect(page.getByTestId('text-content')).toBeVisible();
    await tab(page, 'Textos').click();
    await expect(textItems(page)).toHaveCount(1);
    await page.getByTestId('editor-stage').focus();
    await page.keyboard.press('Alt+Shift+E');
    await expect(page.getByTestId('export-scene')).toBeVisible();
  });

  test('o editor desktop passa na verificação de acessibilidade (claro e escuro)', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await openVersos(page, 'citacao');
      await tab(page, 'Textos').click();
      await textItems(page).first().getByTestId('text-pick').click();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations.map((v) => scheme + ' ' + v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    }
  });
});

// ---------- 29: integração com o Launcher ----------
test.describe('Versos · integração', () => {
  test('29. aparece no catálogo, abre pelo alias /versos/ e a rota canônica segue o padrão /apps/', async ({ page }) => {
    await page.goto('/launcher/#/catalogo');
    const card = page.locator('article.card', { hasText: 'Versos' });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Letras, frases e citações em imagens');
    await expect(card.getByRole('link', { name: 'Abrir o editor de Versos' })).toHaveAttribute('href', '/apps/versos/');
    await page.goto('/versos/');
    await expect(canvas(page)).toBeVisible();
    await page.getByTestId('doc-name').fill('Pelo atalho curto'); // o projeto é criado na primeira alteração
    await expect.poll(() => new URL(page.url()).pathname).toBe('/apps/versos/');
    expect(page.url()).toContain('?doc=');
    await page.goto('/launcher/#/app/versos');
    await expect(page.getByRole('heading', { name: 'Versos' }).first()).toBeVisible();
    await expect(page.getByText('Criação e tipografia').first()).toBeVisible();
    await page.goto('/versoes/versos/');
    await expect(page.getByTestId('versions-title')).toHaveText('Versos');
    await expect(page.getByText('1.0.0').first()).toBeVisible();
  });

  test('o app fica disponível offline por instalação própria e o alias entra no pacote', async ({ request }) => {
    const manifest = (await (await request.get('/offline-manifest.json')).json()) as { apps: Record<string, { page: string; files: { path: string }[] }> };
    const entry = manifest.apps.versos;
    expect(entry).toBeTruthy();
    const paths = entry!.files.map((f) => f.path);
    expect(paths).toContain('/apps/versos/index.html');
    expect(paths).toContain('/versos/index.html');
    expect(paths.filter((p) => p.endsWith('.woff')).length).toBeGreaterThanOrEqual(12);
  });

  test('notices das fontes livres (OFL) acompanham os arquivos', async ({ request }) => {
    for (const family of ['arimo', 'montserrat', 'oswald', 'bebas-neue', 'anton', 'cormorant-garamond', 'great-vibes', 'caveat', 'pacifico', 'playfair-display', 'lora', 'dancing-script']) {
      const res = await request.get('/fonts/versos/' + family + '/OFL.txt');
      expect(res.status(), family).toBe(200);
      expect(await res.text()).toMatch(/SIL Open Font License/i);
    }
  });

  test('sem horizontal scroll em larguras intermediárias do desktop', async ({ page }) => {
    for (const width of [900, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await openVersos(page);
      await noHorizontalScroll(page);
    }
  });
});
