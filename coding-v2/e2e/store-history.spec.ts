import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backupDoc, backupFile, uploadBackup } from './helpers';

test('carrossel do aplicativo mostra oito documentos reais; modal contém o histórico completo', async ({ page }) => {
  await page.goto('/launcher/#/documentos');
  const docs = Array.from({length: 10}, (_, i) => backupDoc('file-' + i, 'Etiqueta ' + String(i + 1).padStart(2,'0'), {type:'labels'}));
  docs.push(backupDoc('other-1', 'Texto paralelo', {type:'texts'}));
  await uploadBackup(page, backupFile(...docs));
  await page.goto('/launcher/#/app/labels');
  await expect(page.getByTestId('recent-docs')).toBeVisible();
  await expect(page.getByTestId('history-tile')).toHaveCount(8);
  await expect(page.getByTestId('recent-docs')).not.toContainText('Texto paralelo');
  await page.getByTestId('open-history').click();
  const dialog = page.getByRole('dialog', {name: 'Histórico de Etiquetas'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('history-list').locator('li')).toHaveCount(10);
  await dialog.getByRole('searchbox', {name: 'Buscar arquivos'}).fill('Etiqueta 03');
  await expect(dialog.getByTestId('history-list').locator('li')).toHaveCount(1);
  await dialog.getByRole('button', {name: 'Fechar histórico'}).click();
  await expect(dialog).toBeHidden();
  expect((await page.evaluate(() => indexedDB.databases())).some(x => x.name === 'coding-db')).toBe(false);
});

test('aba Documentos mantém todas as cópias, organizadas por programa', async ({page}) => {
  const docs = Array.from({length: 28},(_,i) => backupDoc('d-' + i,'Etiqueta ' + i,{type:'labels'}));
  docs.push(backupDoc('other-text','Outro texto',{type:'texts'}));
  await page.goto('/launcher/#/documentos');
  await uploadBackup(page,backupFile(...docs));
  await expect(page.getByTestId('copy-count')).toContainText('29 cópias');
  await page.getByTestId('document-app-tabs').getByRole('button',{name:/Etiquetas/}).click();
  await expect(page.getByTestId('copy-count')).toContainText('28 cópias encontradas');
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(24);
  await page.getByRole('button',{name:'Próxima página'}).click();
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(4);
  await page.getByTestId('document-app-tabs').getByRole('button',{name:/Texto/}).click();
  await expect(page.getByTestId('v2-copies').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('v2-copies')).toContainText('Outro texto');
  await page.getByTestId('document-app-tabs').getByRole('button',{name:/Todos/}).click();
  await expect(page.getByTestId('copy-count')).toContainText('29 cópias');
});

test('histórico vazio não inventa miniaturas e acessibilidade do modal funciona', async ({page}) => {
  await page.goto('/launcher/#/app/texts');
  await expect(page.getByTestId('history-tile')).toHaveCount(0);
  await page.getByTestId('open-history').click();
  await expect(page.getByRole('dialog', {name:'Histórico de Texto'})).toContainText('Nenhum arquivo encontrado');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','best-practice']).analyze();
  expect(result.violations.map(v=>v.id+' '+v.nodes.map(n=>n.target.join(',')).join(';'))).toEqual([]);
});
