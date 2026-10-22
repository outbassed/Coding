import { test, expect, type Page } from '@playwright/test';
const EDITOR = '/apps/texto/';
async function copies(page: Page) {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name);
    if (!names.includes('coding-v2-documents')) return [] as Array<{ id: string; revision: number; label: string; type: string; html: string }>;
    const db = await new Promise<IDBDatabase>((resolve,reject)=>{
      const req = indexedDB.open('coding-v2-documents');
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    try {
      const request = db.transaction('copies','readonly').objectStore('copies').getAll();
      const data = await new Promise<Array<{ id: string; revision: number; label: string; snapshot: { doc: { type: string; state: { html: string } } } }>>((resolve,reject)=>{
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      return data.map(c=>({id:c.id,revision:c.revision,label:c.label,type:c.snapshot.doc.type,html:c.snapshot.doc.state.html}));
    } finally { db.close(); }
  });
}
test('Texto cria documento real, salva automaticamente e abre pela biblioteca', async ({ page }) => {
  await page.goto(EDITOR);
  await expect(page.getByTestId('text-editor')).toContainText('Carta de apresentação');
  await expect(page.getByTestId('save-status')).toHaveText('Novo · ainda não salvo');
  await page.waitForTimeout(1200);
  expect(await copies(page)).toHaveLength(0);
  await page.getByLabel('Nome do documento').fill('Carta da empresa');
  await page.getByRole('textbox',{name:'Conteúdo do documento'}).fill('Uma mensagem realmente editável');
  await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho',{timeout:10000});
  await expect(page).toHaveURL(/\?doc=/);
  const saved=await copies(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({label:'Carta da empresa',type:'texts'});
  expect(saved[0]?.html).toContain('Uma mensagem realmente editável');
  await page.reload();
  await expect(page.getByRole('textbox',{name:'Conteúdo do documento'})).toContainText('Uma mensagem realmente editável');
  await expect(page.getByLabel('Nome do documento')).toHaveValue('Carta da empresa');
  await page.goto('/launcher/');
  const recent=page.getByTestId('recent-docs');
  await expect(recent).toContainText('Carta da empresa');
  await recent.getByRole('link',{name:'Abrir Carta da empresa no editor'}).click();
  await expect(page).toHaveURL(/\/apps\/texto\/\?doc=/);
  await expect(page.getByTestId('text-editor')).toContainText('Uma mensagem realmente editável');
});
test('Texto exporta HTML e TXT de dados reais e permite imagens',async({page})=>{
  await page.goto(EDITOR);
  const editor=page.getByTestId('text-editor');
  await editor.fill('Primeiro parágrafo editado');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await page.getByLabel('Selecionar imagem para o texto').setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:png});
  await expect(editor.locator('img')).toHaveCount(1);
  await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho',{timeout:10000});
  const [htmlDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar HTML'}).click()]);
  expect(htmlDownload.suggestedFilename()).toMatch(/\.html$/);
  const html=await htmlDownload.path();
  expect(html).toBeTruthy();
  const [textDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar TXT'}).click()]);
  expect(textDownload.suggestedFilename()).toMatch(/\.txt$/);
  await page.reload();
  await expect(page.getByTestId('text-editor').locator('img')).toHaveCount(1);
});
test('Texto evita sobrescrever revisão feita por outra aba',async({page})=>{
  await page.goto(EDITOR);
  await page.getByRole('textbox',{name:'Conteúdo do documento'}).fill('Estado inicial');
  await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho',{timeout:10000});
  const url=page.url();
  const other=await page.context().newPage();
  try {
    await other.goto(url);
    await expect(other.getByTestId('text-editor')).toContainText('Estado inicial');
    await page.getByTestId('text-editor').fill('Mudança da primeira aba');
    await expect(page.getByTestId('save-status')).toHaveText('Salvo neste aparelho',{timeout:10000});
    await other.getByTestId('text-editor').fill('Mudança concorrente');
    await expect(other.getByTestId('text-conflict')).toBeVisible({timeout:10000});
    await expect(other.getByTestId('save-status')).toHaveText('Conflito · não salvo');
    await other.getByRole('button',{name:'Salvar como nova cópia'}).click();
    await expect(other.getByTestId('save-status')).toHaveText('Salvo neste aparelho',{timeout:10000});
    expect(await copies(page)).toHaveLength(2);
  } finally { await other.close({runBeforeUnload:false}); }
});
test('Texto mobile mantém a página acima da barra de ferramentas',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(EDITOR);
  const stage=await page.locator('.stage').boundingBox();
  const toolbar=await page.locator('.toolbar').boundingBox();
  expect(stage).not.toBeNull();expect(toolbar).not.toBeNull();
  expect(stage!.y+stage!.height).toBeLessThanOrEqual(toolbar!.y+2);
  await expect(page.getByRole('button',{name:'Negrito'})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
