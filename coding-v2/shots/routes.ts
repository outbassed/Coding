import type { Page } from '@playwright/test';
import { tools } from '../src/shared/catalog';
import { seedInstalledApps } from './seed';

/**
 * Telas que o robô de capturas fotografa. Para fotografar algo novo, basta acrescentar uma linha em `routes`
 * (os aplicativos do catálogo entram sozinhos). Veja coding-v2/DESENVOLVIMENTO.md.
 */
export interface ShotRoute {
  /** Nome do arquivo (sem extensão); também serve de filtro. */
  name: string;
  path: string;
  /** Roda antes de abrir `path` (ex.: preparar dados de teste). */
  before?: (page: Page) => Promise<void>;
  /** Roda depois de abrir (ex.: preencher itens). */
  after?: (page: Page) => Promise<void>;
  /** Fotografa a página inteira (telas do Launcher rolam); editores ocupam só a janela. */
  fullPage?: boolean;
  /** Editores não devem rolar a página na vertical: se rolar, o robô avisa. */
  noVerticalScroll?: boolean;
}

const launcher: ShotRoute[] = [
  { name: 'launcher-inicio', path: '/launcher/', fullPage: true },
  {
    name: 'launcher-inicio-cheio', path: '/launcher/', fullPage: true,
    before: async (page) => {
      await seedInstalledApps(page, ['labels', 'texts', 'calc', 'codes']);
      await page.addInitScript(() => localStorage.setItem('coding-v2-favorites', JSON.stringify(['labels', 'texts', 'paint', 'calc'])));
    }
  },
  { name: 'launcher-inicio-busca', path: '/launcher/', fullPage: true, after: async (page) => { await page.getByRole('searchbox', { name: 'Buscar aplicativos' }).fill('co'); } },
  { name: 'launcher-meus-apps', path: '/launcher/#/meus-apps', fullPage: true, before: (page) => seedInstalledApps(page, 'all') },
  { name: 'launcher-meus-apps-vazio', path: '/launcher/#/meus-apps', fullPage: true },
  { name: 'launcher-catalogo', path: '/launcher/#/catalogo', fullPage: true },
  { name: 'launcher-detalhes-etiquetas', path: '/launcher/#/app/labels', fullPage: true },
  { name: 'launcher-documentos', path: '/launcher/#/documentos', fullPage: true },
  { name: 'launcher-ajustes', path: '/launcher/#/ajustes', fullPage: true },
  { name: 'versoes', path: '/versoes/', fullPage: true }
];

/** Um editor por aplicativo do catálogo: aplicativos novos entram aqui sem editar este arquivo. */
const editors: ShotRoute[] = tools
  .filter((t): t is typeof t & { path: string } => typeof t.path === 'string')
  .map((t) => ({ name: 'app-' + t.id, path: t.path, noVerticalScroll: true }));

/** Estados que costumam quebrar o layout (muito conteúdo, listas longas). */
const states: ShotRoute[] = [
  {
    name: 'estado-etiquetas-5-itens', path: '/apps/etiquetas/', noVerticalScroll: true,
    after: async (page) => {
      const add = page.getByRole('button', { name: 'Adicionar item' });
      if (!(await add.isVisible().catch(() => false))) return; // celular: a lista fica na gaveta
      for (let i = 2; i <= 5; i++) await add.click();
      for (let i = 1; i <= 5; i++) {
        await page.getByLabel('Código do item ' + i, { exact: true }).fill('10000' + i);
        await page.getByLabel('Descrição do item ' + i, { exact: true }).fill('POTE PREMIUM 10L ITEM ' + i + ' UZ');
        await page.getByLabel('Cópias do item ' + i, { exact: true }).fill(String(i < 4 ? 10 : 14));
      }
    }
  },
  {
    name: 'estado-visualizador-biblioteca', path: '/apps/visualizador/', noVerticalScroll: true,
    after: async (page) => { await seedViewer(page); }
  },
  {
    name: 'estado-visualizador-texto', path: '/apps/visualizador/', noVerticalScroll: true,
    after: async (page) => { await seedViewer(page); await pickViewerFile(page, /notas\.txt/); }
  },
  {
    name: 'estado-visualizador-menu', path: '/apps/visualizador/', noVerticalScroll: true,
    after: async (page) => { await seedViewer(page); await page.getByTestId('viewer-stage').click({ button: 'right', position: { x: 80, y: 80 } }); }
  },
  {
    name: 'estado-visualizador-limpo', path: '/apps/visualizador/', noVerticalScroll: true,
    after: async (page) => { await seedViewer(page); await page.keyboard.press('c'); }
  }
];

/** Abre no Visualizador três imagens geradas na hora, um texto e um modelo 3D (nada de dados reais). */
async function seedViewer(page: Page): Promise<void> {
  const png = async (color: string, w: number, h: number): Promise<Buffer> => Buffer.from(await page.evaluate(({ color, w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, color); grad.addColorStop(1, '#101828');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(w * 0.62, h * 0.4, h * 0.18, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png').split(',')[1]!;
  }, { color, w, h }), 'base64');
  const cube = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';
  await page.getByTestId('viewer-input').setInputFiles([
    { name: 'praia.png', mimeType: 'image/png', buffer: await png('#2b8cbe', 640, 400) },
    { name: 'montanha.png', mimeType: 'image/png', buffer: await png('#6a994e', 600, 450) },
    { name: 'retrato.png', mimeType: 'image/png', buffer: await png('#e8538f', 360, 520) },
    { name: 'cubo.obj', mimeType: 'text/plain', buffer: Buffer.from(cube) },
    { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from(Array.from({ length: 60 }, (_, i) => 'Linha ' + (i + 1) + ': texto de exemplo para a captura do Visualizador.').join('\n')) }
  ]);
  await pickViewerFile(page, /praia\.png/);
  await page.waitForTimeout(600);
}
/** No celular a biblioteca é uma gaveta: abre, escolhe o arquivo (a gaveta fecha sozinha). */
async function pickViewerFile(page: Page, name: RegExp): Promise<void> {
  if (!(await page.getByTestId('viewer-files').isVisible().catch(() => false))) await page.getByTestId('toggle-library').click();
  await page.getByTestId('viewer-files').getByRole('button', { name }).click();
}

export const routes: ShotRoute[] = [...launcher, ...editors, ...states];
