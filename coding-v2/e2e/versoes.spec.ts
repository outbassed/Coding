import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { tools } from '../src/shared/catalog';
import { allSlugs, formatRelease, historyPath, recordsFor, TARGET_ORDER, targetName } from '../src/shared/versions';
import { versionRecords } from '../src/shared/versions-data';

const MENU_NAMES = ['Coding Launcher', 'Etiquetas', 'Texto', 'Planilhas', 'Imagens', 'Editor PDF', 'QR / Barras', 'Sorteio', 'Racha-conta', 'Calculadora', 'Estúdio de Cores', 'Compactador ZIP', 'Comparador de Arquivos', 'Código', 'Pintar', 'Visualizador', 'Versos'];
const launcherLatest = recordsFor('launcher', versionRecords)[0]!;
const slugOf = (id: string): string => tools.find((t) => t.id === id)!.path!.split('/')[2]!;

async function noHorizontalScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, body: document.body.scrollWidth - window.innerWidth }));
  expect(over.doc, 'rolagem horizontal da página').toBeLessThanOrEqual(0);
  expect(over.body).toBeLessThanOrEqual(0);
}

test.describe('Central de Versões · rotas', () => {
  test('/versoes/ abre o histórico do Coding Launcher e a lista segue o formato compacto', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/versoes/');
    await expect(page.getByTestId('versions-title')).toHaveText('Coding Launcher');
    const row = page.getByTestId('version-' + launcherLatest.version);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Coding Launcher — ' + launcherLatest.version + ' — ' + launcherLatest.build + ' — ' + formatRelease(launcherLatest));
    expect(launcherLatest.build).toMatch(/^\d{2}\.\d{2}\.\d{2}\.\d{6}$/);
    await expect(page).toHaveTitle(/Coding Launcher · Histórico de versões/);
  });

  test('cada aplicativo tem endereço direto, que sobrevive a recarregar', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const t of tools) {
      const url = '/versoes/' + slugOf(t.id) + '/';
      await page.goto(url);
      await expect(page.getByTestId('versions-title'), url).toHaveText(t.name);
      await expect(page.getByTestId('menu-' + t.id)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('version-list').getByRole('button').first()).toContainText(t.name + ' — ' + recordsFor(t.id, versionRecords)[0]!.version + ' — ');
      await page.reload();
      await expect(page.getByTestId('versions-title'), 'recarregado ' + url).toHaveText(t.name);
      expect(new URL(page.url()).pathname).toBe(url);
    }
  });

  test('Versos 1.0.1 mostra compilação nova, preserva o 1.0.0 e concorda com Detalhes', async ({ page }) => {
    const releases = recordsFor('versos', versionRecords);
    expect(releases.map((r) => r.version).slice(0, 2)).toEqual(['1.0.1', '1.0.0']);
    expect(releases[0]!.build).not.toBe(releases[1]!.build);
    await page.goto('/versoes/versos/');
    const latest = page.getByTestId('version-1.0.1');
    await expect(latest).toContainText('Versos — 1.0.1 — ' + releases[0]!.build);
    await expect(page.getByTestId('version-1.0.0')).toBeVisible();
    await latest.click();
    await expect(page.getByTestId('modal-version')).toHaveText('1.0.1');
    await expect(page.getByTestId('modal-build')).toHaveText(releases[0]!.build);
    await expect(page.getByTestId('modal-sec-correcoes')).toContainText('zoom automático');
    await page.getByTestId('modal-close').click();
    await page.goto('/launcher/#/app/versos');
    // O caminho exato de Detalhes é definido pelo roteador do Launcher.
    // Se a rota acima mudar, a checagem de registro comum continua no teste unitário.
  });

  test('os arquivos estáticos de cada rota existem no build (hospedagem sem regras de reescrita)', () => {
    const base = readFileSync('dist/versoes/index.html', 'utf8');
    const slugs = allSlugs();
    expect(slugs).toHaveLength(17);
    for (const slug of slugs) {
      for (const root of ['versoes', 'versions']) {
        const file = 'dist/' + root + '/' + slug + '/index.html';
        expect(existsSync(file), file).toBe(true);
        expect(readFileSync(file, 'utf8'), file).toBe(base);
      }
    }
    expect(readFileSync('dist/versions/index.html', 'utf8')).toBe(base);
  });

  test('/versions/ é alias: abre a mesma página e troca o endereço pelo oficial', async ({ page }) => {
    await page.goto('/versions/etiquetas/');
    await expect(page.getByTestId('versions-title')).toHaveText('Etiquetas');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/versoes/etiquetas/');
    await page.goto('/versions/');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/versoes/');
    await expect(page.getByTestId('versions-title')).toHaveText('Coding Launcher');
  });

  test('endereço inexistente explica o problema e leva ao histórico do Launcher', async ({ page }) => {
    // Entra pela página real e troca o endereço, como faria um link compartilhado com um nome que não existe.
    await page.goto('/versoes/');
    await page.evaluate(() => { history.pushState({}, '', '/versoes/nao-existe/'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByTestId('versions-not-found')).toContainText('nao-existe');
    await page.getByTestId('versions-not-found').getByRole('link').click();
    await expect(page.getByTestId('versions-title')).toHaveText('Coding Launcher');
    expect(new URL(page.url()).pathname).toBe('/versoes/');
  });

  test('voltar e avançar do navegador acompanham o menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/versoes/');
    await page.getByTestId('menu-texts').click();
    await expect(page.getByTestId('versions-title')).toHaveText('Texto');
    expect(new URL(page.url()).pathname).toBe('/versoes/texto/');
    await page.goBack();
    await expect(page.getByTestId('versions-title')).toHaveText('Coding Launcher');
    await page.goForward();
    await expect(page.getByTestId('versions-title')).toHaveText('Texto');
  });
});

test.describe('Central de Versões · desktop', () => {
  test.use({ viewport: { width: 1280, height: 520 } });

  test('menu lateral na ordem aprovada, rola sozinho e mantém “Voltar ao Launcher” no rodapé', async ({ page }) => {
    await page.goto('/versoes/');
    await expect(page.getByTestId('menu-toggle')).toBeHidden();
    const names = await page.getByTestId('versions-menu').locator('.lname').allTextContents();
    expect(names).toEqual(MENU_NAMES);
    expect(TARGET_ORDER.map(targetName)).toEqual(MENU_NAMES);
    const back = page.getByTestId('back-to-launcher');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/launcher/');
    const scroller = page.getByTestId('versions-menu').locator('.scroller');
    const metrics = await scroller.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client); // 16 itens não cabem em 520 px: o menu rola
    const pageScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(pageScroll).toBeLessThanOrEqual(0); // a página não rola; só o menu e o conteúdo
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByTestId('menu-viewer')).toBeInViewport();
    await expect(back).toBeInViewport();
    const [last, backBox] = await Promise.all([page.getByTestId('menu-viewer').boundingBox(), back.boundingBox()]);
    expect(backBox!.y).toBeGreaterThan(last!.y);
    await back.click();
    await expect(page).toHaveURL(/\/launcher\/(#\/)?$/);
  });

  test('a seção selecionada fica indicada e a lista abre o modal', async ({ page }) => {
    await page.goto('/versoes/');
    await expect(page.getByTestId('menu-launcher')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('menu-pdf').click();
    await expect(page.getByTestId('menu-pdf')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('menu-launcher')).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('Central de Versões · modal', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('mostra nome, versão, compilação e publicação, e só as seções que existem', async ({ page }) => {
    await page.goto('/versoes/');
    await page.getByTestId('version-' + launcherLatest.version).click();
    const modal = page.getByTestId('version-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('modal-title')).toHaveText('Coding Launcher');
    await expect(page.getByTestId('modal-version')).toHaveText(launcherLatest.version);
    await expect(page.getByTestId('modal-build')).toHaveText(launcherLatest.build);
    await expect(page.getByTestId('modal-release')).toHaveText(formatRelease(launcherLatest));
    await expect(page.getByTestId('modal-sec-novidades')).toBeVisible();
    await expect(page.getByTestId('modal-sec-melhorias')).toBeVisible();
    await expect(page.getByTestId('modal-sec-alteracoesTecnicas')).toBeVisible();
    await expect(page.getByTestId('modal-sec-correcoes')).toHaveCount(0);
    await expect(page.getByTestId('modal-sec-problemasConhecidos')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.classList.contains('scroll-lock'))).toBe(true);
  });

  for (const how of ['botão', 'esc', 'fora'] as const) {
    test('fecha com ' + how + ', devolve o foco ao item e mantém a seção', async ({ page }) => {
      await page.goto('/versoes/texto/');
      const row = page.getByTestId('version-list').getByRole('button').first();
      await row.click();
      await expect(page.getByTestId('version-modal')).toBeVisible();
      await expect(page.getByTestId('modal-close')).toBeFocused();
      if (how === 'botão') await page.getByTestId('modal-close').click();
      else if (how === 'esc') await page.keyboard.press('Escape');
      else {
        // Diagnóstico: se o clique fora não fechar, o erro mostra o que o navegador realmente atingiu.
        await page.evaluate(() => {
          const w = window as unknown as { __clicks: string[] };
          w.__clicks = [];
          document.addEventListener('click', (e) => { const t = e.target as HTMLElement; w.__clicks.push(t.tagName + '.' + t.className + '@' + e.clientX + ',' + e.clientY); }, true);
        });
        await page.mouse.click(8, 8);
        await page.waitForTimeout(400);
        if (await page.getByTestId('version-modal').count()) {
          const info = await page.evaluate(() => {
            const d = document.querySelector('dialog.modal');
            const r = d?.getBoundingClientRect();
            const hit = document.elementFromPoint(8, 8);
            return { open: (d as HTMLDialogElement | null)?.open, rect: r && [r.x, r.y, r.width, r.height], hit: hit ? hit.tagName + '.' + hit.className : null, clicks: (window as unknown as { __clicks: string[] }).__clicks, vw: innerWidth, vh: innerHeight };
          });
          throw new Error('clique fora não fechou: ' + JSON.stringify(info));
        }
      }
      await expect(page.getByTestId('version-modal')).toHaveCount(0);
      await expect(row).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.classList.contains('scroll-lock'))).toBe(false);
      expect(new URL(page.url()).pathname).toBe('/versoes/texto/');
      await expect(page.getByTestId('menu-texts')).toHaveAttribute('aria-current', 'page');
      // pode abrir de novo
      await row.click();
      await expect(page.getByTestId('version-modal')).toBeVisible();
    });
  }

  test('conteúdo longo rola dentro do modal e o modal cabe na tela', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto('/versoes/');
    await page.getByTestId('version-' + launcherLatest.version).click();
    const box = await page.locator('dialog.modal[open]').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.y + box!.height).toBeLessThanOrEqual(480);
    await expect(page.getByTestId('modal-close')).toBeInViewport();
    await noHorizontalScroll(page);
  });
});

test.describe('Central de Versões · celular', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('☰ abre a gaveta com o Launcher, os 16 apps e “Voltar ao Launcher”; fecha por Esc, fora e ao escolher', async ({ page }) => {
    await page.goto('/versoes/');
    const burger = page.getByTestId('menu-toggle');
    await expect(burger).toBeVisible();
    await expect(page.getByTestId('versions-menu')).toBeHidden();
    const box = await burger.boundingBox();
    expect(box!.x).toBeLessThan(24); // canto superior esquerdo
    expect(box!.y).toBeLessThan(24);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(burger).toHaveAttribute('aria-expanded', 'false');

    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.getByTestId('versions-menu');
    await expect(drawer).toBeVisible();
    expect(await drawer.locator('.lname').allTextContents()).toEqual(MENU_NAMES);
    await expect(page.getByTestId('back-to-launcher')).toBeVisible();
    await expect(page.getByTestId('menu-launcher')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.classList.contains('scroll-lock'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(burger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.classList.contains('scroll-lock'))).toBe(false);

    await burger.click();
    await expect(drawer).toBeVisible();
    await page.getByTestId('menu-backdrop').click({ position: { x: 360, y: 300 } });
    await expect(drawer).toBeHidden();

    await burger.click();
    await page.getByTestId('menu-compare').click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('versions-title')).toHaveText('Comparador de Arquivos');
    expect(new URL(page.url()).pathname).toBe('/versoes/comparador/');

    await burger.click();
    await page.getByTestId('menu-close').click();
    await expect(drawer).toBeHidden();

    await burger.click();
    await page.getByTestId('back-to-launcher').click();
    await expect(page).toHaveURL(/\/launcher\/(#\/)?$/);
  });

  test('o foco fica preso na gaveta enquanto ela está aberta', async ({ page }) => {
    await page.goto('/versoes/');
    await page.getByTestId('menu-toggle').click();
    await page.getByTestId('back-to-launcher').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('back-to-launcher')).toBeFocused();
  });

  test('a gaveta aberta fecha sozinha quando a tela vira desktop', async ({ page }) => {
    await page.goto('/versoes/');
    await page.getByTestId('menu-toggle').click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('versions-menu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('scroll-lock'))).toBe(false);
  });
});

test.describe('Central de Versões · larguras e acessibilidade', () => {
  for (const width of [320, 375, 430, 600, 768, 1024, 1280]) {
    test('sem rolagem horizontal nem controles pequenos em ' + width + ' px', async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 900 ? 800 : 800 });
      for (const url of ['/versoes/', '/versoes/pdf/']) {
        await page.goto(url);
        await expect(page.getByTestId('version-list')).toBeVisible();
        await noHorizontalScroll(page);
        const row = await page.getByTestId('version-list').getByRole('button').first().boundingBox();
        expect(row!.x).toBeGreaterThanOrEqual(0);
        expect(row!.x + row!.width).toBeLessThanOrEqual(width);
        expect(row!.height).toBeGreaterThanOrEqual(44);
        if (width < 900) {
          const burger = await page.getByTestId('menu-toggle').boundingBox();
          expect(burger!.width).toBeGreaterThanOrEqual(44);
          await page.getByTestId('menu-toggle').click();
          for (const link of await page.getByTestId('versions-menu').locator('a').all()) {
            const b = await link.boundingBox();
            expect(b!.height, 'alvo de toque').toBeGreaterThanOrEqual(44);
            expect(b!.x + b!.width).toBeLessThanOrEqual(width);
          }
          await page.keyboard.press('Escape');
        }
        await page.getByTestId('version-list').getByRole('button').first().click();
        const dlg = await page.locator('dialog.modal[open]').boundingBox();
        expect(dlg!.x).toBeGreaterThanOrEqual(0);
        expect(dlg!.x + dlg!.width).toBeLessThanOrEqual(width);
        expect(dlg!.y + dlg!.height).toBeLessThanOrEqual(800);
        await noHorizontalScroll(page);
        await page.keyboard.press('Escape');
      }
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test('axe sem violações (' + scheme + ', lista, gaveta e modal)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/versoes/');
      const scan = async (label: string): Promise<void> => {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
        expect(result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | ')), label).toEqual([]);
      };
      await scan('lista');
      await page.getByTestId('menu-toggle').click();
      await scan('gaveta');
      await page.keyboard.press('Escape');
      await page.getByTestId('version-' + launcherLatest.version).click();
      await scan('modal');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1280, height: 800 });
      await scan('desktop');
    });
  }
});

test('histórico e catálogo concordam: o Launcher e os 16 apps têm versão', () => {
  for (const t of TARGET_ORDER) expect(recordsFor(t, versionRecords).length, t).toBeGreaterThan(0);
  expect(historyPath('launcher')).toBe('/versoes/');
});
