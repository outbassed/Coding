import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* Sorteio: listas salvas e conferência do histórico sem sortear de novo. */
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
async function reduceMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('coding-v2-motion', 'reduce'));
}

test.describe('Sorteio · listas salvas e histórico', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('salva, carrega, atualiza e exclui listas; tudo persiste ao reabrir', async ({ page }) => {
    await reduceMotion(page);
    await page.goto('/apps/sorteio/');
    await page.getByTestId('presets').locator('summary').click();
    await page.getByTestId('preset-name').fill('Equipe original');
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('preset-select')).toContainText('Equipe original (8)');
    // troca os participantes e sorteia alguém; carregar a lista libera quem já saiu
    await page.getByTestId('names').fill('Xavier\nYara');
    await expect(page.getByText('Participantes (um por linha) · 2')).toBeVisible();
    await page.getByTestId('spin').click();
    await expect(page.getByTestId('draw-result')).toBeVisible();
    await expect(page.getByTestId('reset-drawn')).toContainText('1 já sorteados');
    await page.getByTestId('preset-select').selectOption({ label: 'Equipe original (8)' });
    await page.getByTestId('preset-load').click();
    await expect(page.getByText('Participantes (um por linha) · 8')).toBeVisible();
    await expect(page.getByTestId('reset-drawn')).toContainText('0 já sorteados');
    expect(await page.getByTestId('names').inputValue()).toContain('Hugo');
    // mesmo nome atualiza em vez de duplicar
    await page.getByTestId('names').fill('Ana\nBia\nCarlos');
    await page.getByTestId('preset-name').fill('equipe ORIGINAL');
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('preset-select').locator('option')).toHaveCount(2); // "Escolha…" + 1 lista
    await expect(page.getByTestId('preset-select')).toContainText('(3)');
    await saved(page);
    await page.reload();
    await page.getByTestId('presets').locator('summary').click();
    await expect(page.getByTestId('preset-select')).toContainText('(3)');
    // sem nome ou sem participantes: aviso claro, nada salvo
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('draw-error')).toContainText('Dê um nome');
    await page.getByTestId('preset-select').selectOption({ index: 1 });
    await page.getByTestId('preset-delete').click();
    await expect(page.getByTestId('preset-select')).toHaveCount(0);
    expect(await page.getByTestId('names').inputValue()).toBe('Ana\nBia\nCarlos'); // excluir a lista não mexe nos participantes atuais
  });

  test('histórico: abrir um resultado antigo não sorteia nada de novo', async ({ page }) => {
    await reduceMotion(page);
    await page.goto('/apps/sorteio/');
    await page.getByTestId('spin').click();
    await expect(page.getByTestId('draw-result')).toBeVisible();
    const winner = (await page.getByTestId('draw-result').locator('strong').textContent())!.trim();
    await expect(page.getByTestId('history').locator('li')).toHaveCount(1);
    await page.getByTestId('history-item').first().click();
    await expect(page.getByTestId('history-detail')).toContainText(winner);
    await expect(page.getByTestId('history-detail')).toContainText('nada foi sorteado de novo');
    await expect(page.getByTestId('history').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('reset-drawn')).toContainText('1 já sorteados');
    // equipes aparecem uma por linha
    await tab(page, 'Equipes').click();
    await page.getByTestId('make-teams').click();
    await expect(page.getByTestId('history').locator('li')).toHaveCount(2);
    await page.getByTestId('history-item').first().click();
    await expect(page.getByTestId('history-detail').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('history-detail').locator('li').first()).toContainText('Equipe 1:');
    await page.getByTestId('history-item').first().click(); // clicar de novo fecha
    await expect(page.getByTestId('history-detail')).toHaveCount(0);
  });
});

test.describe('Sorteio · celular', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });
  test('listas salvas abertas, sem rolagem horizontal e sem violações de acessibilidade', async ({ page }) => {
    await page.goto('/apps/sorteio/');
    await page.getByTestId('presets').locator('summary').click();
    await page.getByTestId('preset-name').fill('Teste');
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('preset-select')).toBeVisible();
    await page.getByTestId('spin').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  });
});
