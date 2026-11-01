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
  }
];

export const routes: ShotRoute[] = [...launcher, ...editors, ...states];
