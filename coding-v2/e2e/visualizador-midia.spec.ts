import { test, expect, type Page } from '@playwright/test';

/* Visualizador: áudio e vídeo de verdade (arquivos gerados no próprio teste) e aviso honesto para o que o navegador não toca. */
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });

/** WAV PCM 8 bits, mono, 8 kHz, tom de 440 Hz — o navegador lê em qualquer plataforma. */
function wav(seconds: number): Buffer {
  const rate = 8000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return buf;
}

test.describe('Visualizador · áudio e vídeo', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('áudio WAV: toca no player nativo, mostra a duração real, velocidade e repetição', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await page.getByTestId('viewer-input').setInputFiles({ name: 'tom.wav', mimeType: 'audio/wav', buffer: wav(2) });
    const player = page.getByTestId('media-player');
    await expect(player).toBeVisible();
    await expect(page.getByTestId('viewer-props')).toContainText('Áudio');
    await expect(page.getByTestId('viewer-props')).toContainText('0:02'); // duração lida do arquivo, não inventada
    await expect(page.getByTestId('viewer-props')).toContainText('bytes');
    await tab(page, 'Exibição').click();
    await page.getByTestId('rate').selectOption('1.5');
    expect(await player.evaluate((el) => (el as HTMLMediaElement).playbackRate)).toBe(1.5);
    await page.getByTestId('loop').check();
    expect(await player.evaluate((el) => (el as HTMLMediaElement).loop)).toBe(true);
    await expect(page.getByTestId('viewer-error')).toHaveCount(0);
  });

  test('vídeo WebM gravado no navegador: abre, mostra dimensões e aceita velocidade', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    const supported = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm'));
    test.skip(!supported, 'Este navegador de teste não grava WebM; o vídeo não pôde ser gerado.');
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d')!;
      const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
      rec.start();
      for (let i = 0; i < 12; i++) { g.fillStyle = 'hsl(' + i * 30 + ',80%,50%)'; g.fillRect(0, 0, 64, 48); await new Promise((r) => setTimeout(r, 80)); }
      rec.stop(); await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    await page.getByTestId('viewer-input').setInputFiles({ name: 'gravacao.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') });
    await expect(page.getByTestId('media-player')).toBeVisible();
    await expect(page.getByTestId('viewer-props')).toContainText('Vídeo');
    await expect(page.getByTestId('viewer-props')).toContainText('64 × 48 px');
    await tab(page, 'Exibição').click();
    await page.getByTestId('rate').selectOption('2');
    expect(await page.getByTestId('media-player').evaluate((el) => (el as HTMLMediaElement).playbackRate)).toBe(2);
  });

  test('vídeo que o navegador não toca: aviso honesto e o original continua disponível', async ({ page }) => {
    await page.goto('/apps/visualizador/');
    await page.getByTestId('viewer-input').setInputFiles({ name: 'quebrado.mp4', mimeType: 'video/mp4', buffer: Buffer.from('isto não é um vídeo de verdade'.repeat(40)) });
    await expect(page.getByTestId('viewer-error')).toContainText('não consegue reproduzir');
    await tab(page, 'Arquivo').click();
    await expect(page.getByTestId('download-original')).toBeEnabled();
  });
});
