import { expect, test } from '@playwright/test';

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
