import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { tools } from '../src/shared/catalog';
import { latestOf } from '../src/shared/versions';
import { versionRecords } from '../src/shared/versions-data';
import { APP_COUNT } from './helpers';

const WIDTHS = [320, 375, 430, 600, 768, 1280];
const launcher = latestOf('launcher', versionRecords)!;
const slugOf = (id: string): string => tools.find((t) => t.id === id)!.path!.split('/')[2]!;

async function noHorizontalScroll(page: Page, where: string): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'rolagem horizontal em ' + where).toBeLessThanOrEqual(0);
}
async function axeClean(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
}

test.describe('Identidade pública', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const FORBIDDEN = /Coding Preview|Coding Antigo|Coding 1\.0|Coding 2\.0|Novo Coding|Antigo Launcher|Coding atual|Prévia técnica|Versão de demonstração|Prévia ilustrativa/i;

  test('as telas do Launcher e da Central de Versões só falam “Coding” e “Coding Launcher”', async ({ page }) => {
    const routes = ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/texts', '/launcher/#/documentos',
      ...['geral', 'aparencia', 'projetos', 'offline', 'atalhos', 'avancado', 'sobre'].map((a) => '/launcher/#/ajustes?aba=' + a), '/versoes/', '/versoes/etiquetas/'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await page.locator('body').innerText(), route).not.toMatch(FORBIDDEN);
      expect(await page.title(), route).not.toMatch(FORBIDDEN);
    }
  });

  test('o título do Launcher e o do Início são “Coding Launcher”', async ({ page }) => {
    await page.goto('/launcher/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coding Launcher');
    await expect(page).toHaveTitle(/Coding Launcher/);
  });
});

test.describe('Início como acesso rápido', () => {
  test('computador: identidade, busca e os 16 apps, sem estatísticas no topo nem botões repetidos', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/');
    await expect(page.getByRole('searchbox', { name: 'Buscar aplicativos' })).toBeVisible();
    await expect(page.locator('article.card')).toHaveCount(APP_COUNT);
    await expect(page.getByTestId('home-stats')).toHaveCount(0);
    await expect(page.getByTestId('home-actions')).toHaveCount(0);
    // cada destino aparece só uma vez na navegação lateral
    for (const name of ['Meus apps', 'Catálogo', 'Documentos', 'Ajustes']) await expect(page.locator('main').getByRole('link', { name, exact: true })).toHaveCount(0);
  });

  test('a busca filtra e a grade volta ao limpar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/');
    const box = page.getByRole('searchbox', { name: 'Buscar aplicativos' });
    await box.fill('cores');
    await expect(page.locator('article.card h3')).toHaveText(['Estúdio de Cores']);
    await box.fill('');
    await expect(page.locator('article.card')).toHaveCount(APP_COUNT);
  });

  test('celular: os aplicativos começam logo abaixo da busca, dentro da primeira tela', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/launcher/');
    const firstCard = await page.locator('article.card').first().boundingBox();
    expect(firstCard).not.toBeNull();
    expect(firstCard!.y).toBeLessThan(420);
    expect(firstCard!.y + 60).toBeLessThan(700);
  });

  test('favoritos continuam no começo da grade depois de recarregar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/');
    await page.locator('article.card[data-tool="paint"]').getByTestId('favorite').click();
    await page.reload();
    await expect(page.locator('article.card h3').first()).toHaveText('Pintar');
  });
});

test.describe('Ajustes em abas', () => {
  test('computador: categorias à esquerda, só a atual à direita, link direto e recarregar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes');
    const tabs = page.getByTestId('settings-tabs');
    await expect(tabs).toBeVisible();
    await expect(page.getByTestId('settings-picker')).toBeHidden();
    await expect(tabs.getByRole('tab')).toHaveText(['Geral', 'Aparência', 'Projetos', 'Offline', 'Atalhos', 'Avançado', 'Sobre']);
    await expect(page.getByTestId('general-summary')).toBeVisible();
    await expect(page.getByTestId('about-panel')).toHaveCount(0);
    await page.getByTestId('settings-tab-offline').click();
    await expect(page).toHaveURL(/#\/ajustes\?aba=offline$/);
    await expect(page.getByTestId('offline-manager')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('settings-tab-offline')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('offline-manager')).toBeVisible();
    await page.goBack();
    await page.goto('/launcher/#/ajustes?aba=sobre');
    await expect(page.getByTestId('about-panel')).toBeVisible();
  });

  test('teclado: setas e Home/End trocam a categoria e mantêm o foco na aba', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes');
    await page.getByTestId('settings-tab-geral').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('settings-tab-aparencia')).toBeFocused();
    await expect(page.getByTestId('settings-tab-aparencia')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByTestId('settings-tab-sobre')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('settings-tab-geral')).toBeFocused();
  });

  test('celular: um seletor compacto troca a categoria', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/launcher/#/ajustes');
    await expect(page.getByTestId('settings-tabs')).toBeHidden();
    await page.getByTestId('settings-picker').selectOption('projetos');
    await expect(page).toHaveURL(/aba=projetos$/);
    await expect(page.getByTestId('doc-counts')).toBeVisible();
    await noHorizontalScroll(page, 'Ajustes celular');
  });

  test('as preferências mantêm o valor ao trocar de aba e ao recarregar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes?aba=aparencia');
    await page.getByRole('button', { name: 'Escuro', exact: true }).click();
    await page.getByRole('button', { name: 'Reduzir sempre' }).click();
    await page.getByTestId('settings-tab-sobre').click();
    await page.getByTestId('settings-tab-aparencia').click();
    await expect(page.getByRole('button', { name: 'Escuro', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Escuro', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Reduzir sempre' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('coding-v2-theme'))).toBe('dark');
  });

  test('Geral resume apps, documentos e armazenamento (as estatísticas saíram do Início)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes?aba=geral');
    await expect(page.getByTestId('stat-apps')).toContainText(String(APP_COUNT));
    await expect(page.getByTestId('stat-docs')).toHaveText('0');
    await expect(page.getByTestId('stat-version')).toContainText(launcher.version);
  });

  test('Sobre mostra Coding, versão, compilação e o link do histórico, e o link abre a Central', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes?aba=sobre');
    await expect(page.getByTestId('about-name')).toHaveText('Coding');
    await expect(page.getByTestId('about-version')).toHaveText('Versão ' + launcher.version);
    await expect(page.getByTestId('about-build')).toHaveText(launcher.build);
    expect(launcher.build).toMatch(/^\d{2}\.\d{2}\.\d{2}\.\d{6}$/);
    await expect(page.getByTestId('credits')).toBeVisible();
    await page.getByTestId('about-history').click();
    await expect(page).toHaveURL(/\/versoes\/$/);
    await expect(page.getByTestId('versions-title')).toHaveText('Coding Launcher');
  });

  test('Avançado lista só diagnósticos reais e permite copiá-los', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/launcher/#/ajustes?aba=avancado');
    await expect(page.getByTestId('diagnostics')).toContainText(launcher.build);
    await page.getByTestId('copy-diagnostics').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(launcher.build);
  });
});

test.describe('Detalhes: versão, compilação e histórico', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('todo app mostra a versão e a compilação do registro e leva ao próprio histórico', async ({ page }) => {
    test.setTimeout(90_000);
    for (const t of tools) {
      await page.goto('/launcher/#/app/' + t.id);
      const rec = latestOf(t.id, versionRecords)!;
      await expect(page.getByTestId('app-version'), t.id).toHaveText(rec.version);
      await expect(page.getByTestId('app-build'), t.id).toHaveText(rec.build);
      await expect(page.getByTestId('app-history-link'), t.id).toHaveAttribute('href', '/versoes/' + slugOf(t.id) + '/');
      await expect(page.getByTestId('open-editor'), t.id).toHaveAttribute('href', t.path!);
    }
    await page.goto('/launcher/#/app/zip');
    await page.getByTestId('app-history-link').click();
    await expect(page).toHaveURL(/\/versoes\/zip\/$/);
    await expect(page.getByTestId('versions-title')).toHaveText('Compactador ZIP');
  });
});

test.describe('Todos os apps estão sempre disponíveis', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('sem “Ativar/Desativar”, sem aviso de “desativado” e todo editor abre', async ({ page }) => {
    test.setTimeout(120_000);
    for (const route of ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/texts']) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^(Ativar|Desativar)/ })).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/desativado|não ativado|Ativado/i);
    }
    for (const t of tools) {
      const res = await page.request.get(t.path!);
      expect(res.status(), t.path!).toBe(200);
    }
  });
});

test.describe('Responsividade e acessibilidade', () => {
  for (const width of WIDTHS) {
    test('sem rolagem horizontal em ' + width + ' px (Início, Ajustes, Detalhes, Versões)', async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 800 });
      const routes = ['/launcher/', '/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/labels', '/launcher/#/documentos',
        ...['geral', 'aparencia', 'projetos', 'offline', 'atalhos', 'avancado', 'sobre'].map((a) => '/launcher/#/ajustes?aba=' + a), '/versoes/', '/versoes/planilhas/'];
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('h1').first()).toBeVisible();
        await noHorizontalScroll(page, route + ' @' + width);
      }
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test('axe (' + scheme + ') em Início e em todas as abas de Ajustes', async ({ page }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      for (const route of ['/launcher/', ...['geral', 'aparencia', 'projetos', 'offline', 'atalhos', 'avancado', 'sobre'].map((a) => '/launcher/#/ajustes?aba=' + a)]) {
        await page.goto(route);
        await expect(page.locator('h1')).toHaveCount(1);
        await axeClean(page);
      }
    });
  }
});
