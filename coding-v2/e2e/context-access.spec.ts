import { expect, test } from '@playwright/test';

const apps = [
  { id: 'labels', url: '/apps/etiquetas/' },
  { id: 'texts', url: '/apps/texto/' },
  { id: 'calc', url: '/apps/planilhas/' },
  { id: 'images', url: '/apps/imagens/' },
  { id: 'pdf', url: '/apps/pdf/' },
  { id: 'codes', url: '/apps/qr/' },
  { id: 'sheet-labels', url: '/apps/planilha-etiquetas/' },
  { id: 'draw', url: '/apps/sorteio/' },
  { id: 'split', url: '/apps/racha-conta/' }
];

for (const tool of apps) {
  test('App desativado bloqueia URL direta e permite reativar: ' + tool.id, async ({ page }) => {
    await page.addInitScript((id: string) => {
      const ids = ['labels','texts','calc','images','pdf','codes','sheet-labels','draw','split'];
      localStorage.setItem('coding-v2-apps', JSON.stringify({ v: 2, known: ids, enabled: ids.filter(item => item !== id) }));
    }, tool.id);
    await page.goto(tool.url);
    await expect(page.getByTestId('app-disabled')).toBeVisible();
    await expect(page.getByTestId('editor-stage')).toHaveCount(0);
    await page.getByTestId('enable-app').click();
    await expect(page.getByTestId('app-disabled')).toHaveCount(0);
    await expect(page.locator('#app')).not.toBeEmpty();
  });
}

test('Paletas dos ícones seguem as cores de cada aplicativo', async ({ request }) => {
  const images = await (await request.get('/legacy-icons/images.svg')).text();
  const sheets = await (await request.get('/legacy-icons/sheet.svg')).text();
  expect(images).toContain('#ff8fc8');
  expect(images).toContain('#d1308f');
  expect(sheets).toContain('#4fe0d6');
  expect(sheets).toContain('#0b8fb8');
});

test('PC: Etiquetas e Texto redimensionam, persistem e restauram a largura padrão', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const app of [{ url: '/apps/etiquetas/', initial: 380 }, { url: '/apps/texto/', initial: 356 }]) {
    await page.goto(app.url);
    const handle = page.getByRole('separator', { name: 'Ajustar largura do painel de ferramentas' });
    await expect(handle).toBeVisible();
    const before = Number(await handle.getAttribute('aria-valuenow'));
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(before + 16);
    await page.reload();
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(before + 16);
    await handle.dblclick();
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(app.initial);
  }
});

test('Celular: não aparece redimensionador lateral de desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/apps/etiquetas/', '/apps/texto/', '/apps/imagens/']) {
    await page.goto(url);
    await expect(page.getByRole('separator', { name: 'Ajustar largura do painel de ferramentas' })).toHaveCount(0);
  }
});

test('Clique direito abre menu próprio e atalhos só do aplicativo atual', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/apps/imagens/');
  await page.locator('[data-testid="editor-stage"]').click({ button: 'right', position: { x: 16, y: 30 } });
  const menu = page.getByTestId('coding-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Imagens');
  await menu.getByRole('menuitem', { name: 'Atalhos de Imagens' }).click();
  const dialog = page.getByTestId('context-shortcuts');
  await expect(dialog).toContainText('Adicionar imagem');
  await expect(dialog).not.toContainText('Editar célula');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('Shift + clique direito mantém o menu nativo', async ({ page }) => {
  await page.goto('/apps/qr/');
  const prevented = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="editor-stage"]')!;
    return !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true }));
  });
  expect(prevented).toBe(false);
  await expect(page.getByTestId('coding-context-menu')).toBeHidden();
});

test('Celular: toque longo abre menu; no campo de texto preserva o padrão nativo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apps/qr/');
  await page.locator('[data-testid="editor-stage"]').dispatchEvent('pointerdown', {
    pointerType: 'touch', isPrimary: true, button: 0, clientX: 170, clientY: 250
  });
  await expect(page.getByTestId('coding-context-menu')).toBeVisible({ timeout: 2000 });
  await page.locator('[data-testid="editor-stage"]').dispatchEvent('pointerup', {
    pointerType: 'touch', isPrimary: true, button: 0, clientX: 170, clientY: 250
  });
  await page.keyboard.press('Escape');
  const input = page.locator('input').first();
  const prevented = await input.evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(prevented).toBe(false);
  await expect(page.getByTestId('coding-context-menu')).toBeHidden();
});

test('Atalho do QR cria um novo código, não abre ações de outros apps', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/apps/qr/');
  const select = page.getByTestId('code-select');
  const before = await select.locator('option').count();
  await page.locator('[data-testid="editor-stage"]').focus();
  await page.keyboard.press('Alt+Shift+N');
  await expect(select.locator('option')).toHaveCount(before + 1);
});
