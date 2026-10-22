import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewports = [
  { name: '320', width: 320, height: 640 }, { name: '360', width: 360, height: 740 }, { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 }, { name: '768', width: 768, height: 1024 }, { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 }, { name: '1920', width: 1920, height: 1080 }
];
const launcherRoutes = ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/labels', '/launcher/#/app/calc', '/launcher/#/documentos', '/launcher/#/ajustes'];
const editors = ['/apps/etiquetas/', '/apps/texto/'];

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'rolagem horizontal da página').toBeLessThanOrEqual(0);
}

for (const vp of viewports) {
  test.describe('viewport ' + vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of launcherRoutes) {
      test('Launcher ' + route + ' sem rolagem horizontal', async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('h1')).toHaveCount(1);
        await noHorizontalScroll(page);
      });
    }

    for (const route of editors) {
      test('Editor ' + route + ' sem rolagem horizontal e com folha A4', async ({ page }) => {
        await page.goto(route);
        if (route === '/apps/texto/') {
          await expect(page.getByTestId('text-editor')).toBeVisible();
          await expect(page.locator('.paper')).toBeVisible();
        } else {
          await expect(page.getByTestId('sheet')).toBeVisible();
          const box = await page.getByTestId('sheet').boundingBox();
          expect(box).not.toBeNull();
          expect(Math.abs((box!.width / box!.height) - 210 / 297)).toBeLessThan(0.01);
        }
        await noHorizontalScroll(page);
      });
    }

    test('navegação correta para o tamanho da tela', async ({ page }) => {
      await page.goto('/launcher/');
      const bottom = page.getByRole('navigation', { name: 'Navegação móvel' });
      const side = page.getByRole('navigation', { name: 'Navegação principal' });
      if (vp.width < 600) { await expect(bottom).toBeVisible(); await expect(side).toBeHidden(); }
      else { await expect(side).toBeVisible(); await expect(bottom).toBeHidden(); }
    });
  });
}

test.describe('comportamento', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('rotas internas e botão Voltar do navegador', async ({ page }) => {
    await page.goto('/launcher/');
    await page.getByRole('link', { name: 'Catálogo' }).first().click();
    await expect(page).toHaveURL(/#\/catalogo$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seu espaço de criação.');
  });

  test('recarregar mantém a tela (link direto)', async ({ page }) => {
    await page.goto('/launcher/#/ajustes');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');
    await expect(page).toHaveTitle(/Ajustes/);
  });

  test('foco vai para o título ao trocar de tela', async ({ page }) => {
    await page.goto('/launcher/');
    await page.getByRole('link', { name: 'Documentos' }).first().click();
    await expect(page.locator('#page-title')).toBeFocused();
  });

  test('ativação persiste e desativar pede confirmação', async ({ page }) => {
    await page.goto('/launcher/#/meus-apps');
    await page.getByRole('button', { name: 'Desativar Texto no Launcher' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Desativar atalho' }).click();
    await expect(page.locator('article.card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('article.card')).toHaveCount(1);
  });

  test('busca no topo leva ao catálogo filtrado', async ({ page }) => {
    await page.goto('/launcher/');
    await page.getByRole('searchbox', { name: 'Buscar aplicativos' }).fill('sorteio');
    await expect(page).toHaveURL(/#\/catalogo\?q=sorteio/);
    await expect(page.locator('article.card')).toHaveCount(1);
  });

  test('tema escuro salvo é aplicado antes da interface montar', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('coding-v2-theme', 'dark'));
    await page.goto('/launcher/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // O script inline roda antes de qualquer script de módulo: o atributo já existe no primeiro quadro.
    const early = await page.evaluate(async () => {
      const response = await fetch('/launcher/');
      const html = await response.text();
      return html.indexOf('coding-v2-theme') < html.indexOf('type="module"');
    });
    expect(early).toBe(true);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(15, 19, 25)');
  });

  test('editor de Texto: conteúdo editável, ferramentas reais e retorno à biblioteca', async ({ page }) => {
    await page.goto('/apps/texto/');
    await expect(page.getByText('Prévia ilustrativa')).toHaveCount(0);
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Negrito' })).toBeEnabled();
    await page.getByRole('link', { name: 'Voltar à biblioteca' }).click();
    await expect(page).toHaveURL(/\/launcher\/#\/documentos$/);
  });

  test('editor de Etiquetas é funcional (sem aviso de prévia) e Voltar leva à biblioteca', async ({ page }) => {
    await page.goto('/apps/etiquetas/');
    await expect(page.getByText('Prévia ilustrativa')).toHaveCount(0);
    await page.getByRole('link', { name: 'Voltar à biblioteca' }).click();
    await expect(page).toHaveURL(/\/launcher\/#\/documentos$/);
  });

  test('não declara PWA instalável', async ({ page }) => {
    await page.goto('/launcher/');
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });
});

test.describe('celular · editor', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no Texto, folha fica acima da barra de formatação no celular', async ({ page }) => {
    await page.goto('/apps/texto/');
    const stage = await page.locator('.stage').boundingBox();
    const toolbar = await page.locator('.toolbar').boundingBox();
    expect(stage).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(stage!.y + stage!.height).toBeLessThanOrEqual(toolbar!.y + 2);
    await noHorizontalScroll(page);
  });
});

const a11yTargets = [...launcherRoutes, ...editors];
for (const scheme of ['light', 'dark'] as const) {
  test.describe('axe · tema ' + scheme, () => {
    test.use({ colorScheme: scheme });
    for (const width of [390, 1280]) {
      for (const route of a11yTargets) {
        test(route + ' @' + width, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(route);
          await page.waitForSelector('h1');
          const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
          expect(result.violations.map((v) => v.id + ' · ' + v.nodes.map((n) => n.target.join(' ')).join(', '))).toEqual([]);
        });
      }
    }
  });
}
