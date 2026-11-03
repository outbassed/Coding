import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho', { timeout: 10000 });
const tab = (page: Page, name: string) => page.getByTestId('editor-tabs').getByRole('tab', { name, exact: true });
const key = (page: Page, id: string) => page.getByTestId('key-' + id);
async function press(page: Page, ids: string[]): Promise<void> { for (const id of ids) await key(page, id).click(); }
async function axeClean(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
}
async function proMode(page: Page): Promise<void> {
  await page.getByTestId('mode-pro').check();
  await expect(page.getByTestId('sci-keys')).toBeVisible();
}
const expr = (page: Page) => page.getByTestId('calc-expr');
const result = (page: Page) => page.getByTestId('calc-result');

test.describe('Calculadora · Básica', () => {
  test('teclado: conta, histórico, salva e reabre com tudo no lugar', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await press(page, ['1', '2', 'add', '3', '0']);
    await expect(expr(page)).toHaveValue('12+30');
    await expect(result(page)).toHaveText('42'); // resultado ao vivo
    await key(page, 'eq').click();
    await expect(result(page)).toHaveText('42');
    await tab(page, 'Histórico').click();
    await expect(page.getByTestId('calc-history').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('calc-history')).toContainText('12+30 = 42');
    await saved(page);
    await page.reload();
    await expect(expr(page)).toHaveValue('12+30');
    await expect(result(page)).toHaveText('42');
    await tab(page, 'Histórico').click();
    await expect(page.getByTestId('calc-history')).toContainText('12+30 = 42');
  });

  test('porcentagem, troca de sinal, vírgula, apagar e limpar', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await press(page, ['2', '0', '0', 'add', '1', '0', 'pct', 'eq']);
    await expect(result(page)).toHaveText('220');
    await key(page, 'clear').click();
    await press(page, ['5', 'neg']);
    await expect(expr(page)).toHaveValue('−5');
    await key(page, 'back').click();
    await key(page, 'back').click();
    await expect(expr(page)).toHaveValue('');
    await press(page, ['1', 'dec', '5', 'dec', '2', 'add', '2', 'dec', '5', 'eq']);
    await expect(expr(page)).toHaveValue('1,52+2,5');
    await expect(result(page)).toHaveText('4,02');
  });

  test('erro claro e sem quebrar: divisão por zero', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await press(page, ['5', 'div', '0', 'eq']);
    await expect(page.getByTestId('calc-error')).toHaveText('Divisão por zero.');
    await expect(page.getByTestId('calc-error')).toHaveAttribute('role', 'alert');
    await key(page, 'back').click();
    await press(page, ['2', 'eq']);
    await expect(page.getByTestId('calc-error')).toHaveCount(0);
    await expect(result(page)).toHaveText('2,5');
  });

  test('teclado do computador e continuar do resultado', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await expr(page).focus();
    await page.keyboard.type('7*6');
    await page.keyboard.press('Enter');
    await expect(result(page)).toHaveText('42');
    await page.keyboard.type('+8');
    await expect(expr(page)).toHaveValue('42+8');
    await page.keyboard.press('Enter');
    await expect(result(page)).toHaveText('50');
    await page.keyboard.press('Escape');
    await expect(expr(page)).toHaveValue('');
    // letras não entram no modo Básico
    await page.keyboard.type('abc');
    await expect(expr(page)).toHaveValue('');
  });

  test('memória, casas decimais e copiar o resultado', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/apps/calculadora/');
    await press(page, ['5', 'add', '5', 'm+']);
    await expect(page.getByTestId('mem-flag')).toBeVisible();
    await key(page, 'clear').click();
    await press(page, ['mr', 'mul', '2', 'eq']);
    await expect(expr(page)).toHaveValue('10×2');
    await expect(result(page)).toHaveText('20');
    await page.getByTestId('calc-decimals').selectOption('2');
    await expect(result(page)).toHaveText('20,00');
    await page.getByTestId('copy-result').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('20,00');
    await key(page, 'mc').click();
    await expect(page.getByTestId('mem-flag')).toHaveCount(0);
  });

  test('modelo "Desconto e acréscimo" abre pronto', async ({ page }) => {
    await page.goto('/apps/calculadora/?modelo=desconto');
    await expect(expr(page)).toHaveValue('200−15%');
    await expect(result(page)).toHaveText('170,00');
  });
});

test.describe('Calculadora · Pro', () => {
  test('parênteses, funções, graus e radianos', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await proMode(page);
    await expr(page).fill('2*(3+4');
    await expect(result(page)).toHaveText('14'); // parêntese fechado automaticamente na prévia
    await expr(page).fill('');
    await press(page, ['sin', '9', '0', 'rp', 'eq']);
    await expect(expr(page)).toHaveValue('sin(90)');
    await expect(result(page)).toHaveText('1');
    await page.getByTestId('angle-rad').check();
    await expr(page).fill('sin(pi/2)');
    await expect(result(page)).toHaveText('1');
    await expr(page).fill('sqrt(144)+log(1000)+5!');
    await expect(result(page)).toHaveText('135');
    await expr(page).fill('max(2;7;4)');
    await expect(result(page)).toHaveText('7');
  });

  test('teclas científicas inserem no cursor', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await proMode(page);
    await expr(page).fill('2+3');
    await expr(page).evaluate((el) => (el as HTMLInputElement).setSelectionRange(2, 2));
    await key(page, 'sqrt').click();
    await expect(expr(page)).toHaveValue('2+√(3');
    await key(page, 'pi').click();
    await expect(expr(page)).toHaveValue('2+√(pi3');
  });

  test('variáveis: criar, usar, recusar nomes ruins e remover', async ({ page }) => {
    await page.goto('/apps/calculadora/');
    await proMode(page);
    await tab(page, 'Variáveis').click();
    await page.getByTestId('var-name').fill('taxa');
    await page.getByTestId('var-value').fill('1/4');
    await page.getByTestId('var-add').click();
    await expect(page.getByTestId('var-list')).toContainText('taxa');
    await page.getByTestId('var-name').fill('sin');
    await page.getByTestId('var-value').fill('2');
    await page.getByTestId('var-add').click();
    await expect(page.getByTestId('var-error')).toContainText('já é uma função');
    await page.getByTestId('var-name').fill('x');
    await page.getByTestId('var-value').fill('1/0');
    await page.getByTestId('var-add').click();
    await expect(page.getByTestId('var-error')).toContainText('Divisão por zero');
    await expr(page).fill('100*taxa');
    await expect(result(page)).toHaveText('25');
    await saved(page);
    await page.reload();
    await expect(page.getByTestId('mode-pro')).toBeChecked();
    await tab(page, 'Variáveis').click();
    await expect(page.getByTestId('var-list')).toContainText('taxa');
    await expect(result(page)).toHaveText('25');
    await page.getByRole('button', { name: 'Remover a variável taxa' }).click();
    await expect(page.getByTestId('var-list')).toHaveCount(0);
    await expect(result(page)).toHaveText('0'); // taxa deixou de existir: sem resultado
  });

  test('texto nunca é executado como código', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/apps/calculadora/');
    await proMode(page);
    for (const hostile of ['window.__pwned=1', 'alert(1)', 'constructor', '(()=>{window.__pwned=1})()', 'document.cookie', "fetch('/')"]) {
      await expr(page).fill(hostile);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('calc-error')).toBeVisible();
      await expect(result(page)).toHaveText('0');
    }
    expect(await page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('modelo Juros compostos já vem com variáveis e conta', async ({ page }) => {
    await page.goto('/apps/calculadora/?modelo=juros');
    await expect(page.getByTestId('mode-pro')).toBeChecked();
    await expect(expr(page)).toHaveValue('capital*(1+taxa)^meses');
    await expect(result(page)).toHaveText('1.126,83');
  });
});

test.describe('Calculadora · interface', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test('acessível no tema ' + scheme + ' (Básico e Pro)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/apps/calculadora/');
      await expect(page.getByTestId('calculator')).toBeVisible();
      await axeClean(page, 'básico ' + scheme);
      await proMode(page);
      await axeClean(page, 'pro ' + scheme);
    });
  }

  for (const width of [320, 390]) {
    test('celular ' + width + ' px: sem rolagem horizontal e teclas com 44 px', async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/apps/calculadora/');
      await proMode(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      for (const testId of ['key-7', 'key-eq', 'key-sin', 'key-ln', 'key-mc']) {
        const box = (await page.getByTestId(testId).boundingBox())!;
        expect(box.height, testId).toBeGreaterThanOrEqual(44);
        expect(box.width, testId).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, testId).toBeLessThanOrEqual(width);
      }
    });
  }
});
