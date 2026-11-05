import { expect, test, type Page } from '@playwright/test';
import { EYE_CENTER, fits } from '../src/components/ui/eyeGeometry';

test.describe('Logo animada do Visualizador nos detalhes do Launcher', () => {
  test('olha à esquerda, à direita e retorna ao centro apenas na página do Visualizador', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/launcher/#/app/viewer');
    await expect(page.getByRole('heading', { name: 'Visualizador' })).toBeVisible();
    await expect(page.getByTestId('viewer-animated-icon')).toBeVisible();

    const positions = await page.getByTestId('viewer-eye-pupil').evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (!animation) throw new Error('Animação do olho não encontrada');
      animation.pause();
      const offset = (time: number): number => {
        animation.currentTime = time;
        return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      };
      // O atraso inicial é de 350ms e o ciclo dura 2800ms.
      const left = offset(350 + 2800 * 0.3);
      const right = offset(350 + 2800 * 0.6);
      const center = offset(350 + 2800);
      return { left, right, center };
    });

    expect(positions.left).toBeLessThan(-2);
    expect(positions.right).toBeGreaterThan(2);
    expect(Math.abs(positions.center)).toBeLessThan(0.01);

    await page.goto('/launcher/#/app/images');
    await expect(page.getByTestId('viewer-animated-icon')).toHaveCount(0);
    await expect(page.getByTestId('app-icon')).toBeVisible();
    await page.goto('/launcher/#/catalogo');
    await expect(page.getByTestId('viewer-animated-icon')).toHaveCount(0);
    await page.goto('/apps/visualizador/');
    await expect(page.getByTestId('viewer-animated-icon')).toHaveCount(0);
  });

  test('prefere reduzir movimento: a logo permanece estática', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/launcher/#/app/viewer');
    const pupil = page.getByTestId('viewer-eye-pupil');
    await expect(pupil).toBeVisible();
    await expect(pupil).toHaveCSS('animation-name', 'none');
    await expect(pupil).toHaveCSS('transform', 'none');
  });

  test('ícone não altera a largura da página de detalhes no celular', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/launcher/#/app/viewer');
    await expect(page.getByTestId('viewer-animated-icon')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/** Deslocamento atual (unidades do viewBox) da íris, lido do estilo real do elemento. */
const offset = (page: Page) => page.getByTestId('viewer-eye-pupil').evaluate((element) => {
  const m = new DOMMatrixReadOnly(getComputedStyle(element).transform);
  return { x: m.m41, y: m.m42 };
});
const eyeBox = async (page: Page) => {
  const box = await page.getByTestId('viewer-animated-icon').locator('svg').boundingBox();
  if (!box) throw new Error('olho sem caixa');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
};

test.describe('Olho do Visualizador · seguir o cursor', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/launcher/#/app/viewer');
    await expect(page.getByTestId('viewer-eye-toggle')).toBeVisible();
    // pula a animação de abertura (já testada acima) para medir só o acompanhamento
    await page.getByTestId('viewer-eye-pupil').evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
  });

  test('só segue o cursor depois do clique; o segundo clique desliga e centraliza', async ({ page }) => {
    const toggle = page.getByTestId('viewer-eye-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const { cx, cy } = await eyeBox(page);
    await page.mouse.move(cx + 300, cy);
    expect(Math.abs((await offset(page)).x)).toBeLessThan(0.5); // sem clique, o cursor não move o olho
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(cx + 320, cy);
    await expect.poll(async () => (await offset(page)).x).toBeGreaterThan(3);
    await page.mouse.move(cx - 320, cy);
    await expect.poll(async () => (await offset(page)).x).toBeLessThan(-3);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => Math.abs((await offset(page)).x) + Math.abs((await offset(page)).y)).toBeLessThan(0.05);
    await page.mouse.move(cx + 300, cy + 50);
    expect(Math.abs((await offset(page)).x)).toBeLessThan(0.05); // desligado: não acompanha mais
  });

  test('íris, pupila e reflexo se movem juntos e a íris nunca sai da parte branca', async ({ page }) => {
    await page.getByTestId('viewer-eye-toggle').click();
    const { cx, cy } = await eyeBox(page);
    const spots: [number, number][] = [[1200, 0], [-1200, 0], [0, -cy + 2], [0, 600], [700, 400], [-700, -cy + 2], [900, -cy + 2], [-900, 500], [3, 2]];
    for (const [dx, dy] of spots) {
      await page.mouse.move(Math.max(1, Math.min(1270, cx + dx)), Math.max(1, Math.min(710, cy + dy)));
      await page.waitForTimeout(450); // a suavização termina bem antes
      const o = await offset(page);
      expect(fits(EYE_CENTER.x + o.x, EYE_CENTER.y + o.y), 'cursor ' + dx + ',' + dy + ' → ' + o.x.toFixed(2) + ',' + o.y.toFixed(2)).toBe(true);
    }
    // as três partes são filhas do mesmo grupo e, portanto, andam juntas
    expect(await page.getByTestId('viewer-eye-pupil').locator('circle').count()).toBe(3);
    // a máscara com o formato do branco existe e protege o grupo
    const masked = await page.getByTestId('viewer-eye-pupil').evaluate((el) => el.parentElement?.getAttribute('mask') ?? '');
    expect(masked).toMatch(/^url\(#viewer-eye-.+-mask\)$/);
    const mask = await page.locator('mask').count();
    expect(mask).toBe(1);
  });

  test('a direção segue o cursor: direita, esquerda, acima e abaixo', async ({ page }) => {
    await page.getByTestId('viewer-eye-toggle').click();
    const { cx, cy } = await eyeBox(page);
    await page.mouse.move(cx + 400, cy);
    await expect.poll(async () => (await offset(page)).x).toBeGreaterThan(3);
    await page.mouse.move(cx, cy + 250);
    await expect.poll(async () => (await offset(page)).y).toBeGreaterThan(1.5);
    await page.mouse.move(cx, Math.max(1, cy - 60));
    await expect.poll(async () => (await offset(page)).y).toBeLessThan(-0.3);
  });

  test('o cursor sair da janela devolve o olho ao centro', async ({ page }) => {
    await page.getByTestId('viewer-eye-toggle').click();
    const { cx, cy } = await eyeBox(page);
    await page.mouse.move(cx + 300, cy);
    await expect.poll(async () => (await offset(page)).x).toBeGreaterThan(3);
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')));
    await expect.poll(async () => Math.abs((await offset(page)).x)).toBeLessThan(0.05);
    // o acompanhamento continua ligado: ao voltar, segue de novo
    await page.mouse.move(cx - 300, cy);
    await expect.poll(async () => (await offset(page)).x).toBeLessThan(-3);
  });

  test('acessível pelo teclado: Tab chega, Enter e Espaço alternam, e o estado é anunciado', async ({ page }) => {
    const toggle = page.getByTestId('viewer-eye-toggle');
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('viewer-eye-status')).toHaveText('O olho agora segue o cursor.');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('viewer-eye-status')).toHaveText('O olho voltou ao centro.');
    await expect(toggle).toHaveAccessibleName(/Visualizador/);
  });

  test('nada do cursor é gravado: os armazenamentos não mudam enquanto o olho segue', async ({ page }) => {
    await page.getByTestId('viewer-eye-toggle').click();
    const snapshot = () => page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    const before = await snapshot();
    const { cx, cy } = await eyeBox(page);
    for (let i = 0; i < 12; i++) await page.mouse.move(cx + 40 * i, cy + 15 * i);
    await page.waitForTimeout(300);
    expect(await snapshot()).toBe(before);
  });

  test('movimento reduzido: sem animação automática, mas o acompanhamento escolhido pela pessoa funciona, sem suavização', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/launcher/#/app/images');
    await page.goto('/launcher/#/app/viewer');
    const pupil = page.getByTestId('viewer-eye-pupil');
    await expect(pupil).toHaveCSS('animation-name', 'none');
    await expect(pupil).toHaveCSS('transform', 'none');
    await page.getByTestId('viewer-eye-toggle').click();
    const { cx, cy } = await eyeBox(page);
    await page.mouse.move(cx + 300, cy);
    await expect.poll(async () => (await offset(page)).x).toBeGreaterThan(3);
  });

  test('exclusivo dos detalhes do Visualizador: nenhum outro lugar tem o olho interativo', async ({ page }) => {
    for (const route of ['/launcher/#/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/images', '/launcher/#/app/paint']) {
      await page.goto(route);
      await expect(page.getByTestId('viewer-eye-toggle')).toHaveCount(0);
      await expect(page.getByTestId('viewer-animated-icon')).toHaveCount(0);
    }
    await page.goto('/apps/visualizador/');
    await expect(page.getByTestId('viewer-eye-toggle')).toHaveCount(0);
  });

  test('celular de 320 e 390 px: sem rolagem horizontal e alvo de toque do tamanho certo', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/launcher/#/app/viewer');
      await page.getByTestId('viewer-eye-toggle').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const box = await page.getByTestId('viewer-eye-toggle').boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
