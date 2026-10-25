import { exposePreviewManifest } from '../pwa';
import { installContextMenu } from '../shared/contextMenu';
import '../shared/contextMenu.css';
import { createApp, type Component } from 'vue';
import { createPinia } from 'pinia';
import { allowApp, watchAppAccess } from '../shared/appAccess';
import type { ToolId } from '../shared/catalog';
import '../shared/appAccess.css';
import '../styles/tokens.css';
import '../styles/base.css';

/**
 * Inicialização comum dos apps 2.0. Cada app tem a sua própria entrada (src/entries/<app>.ts) que importa o
 * componente de forma estática: assim o grafo de arquivos de cada página é exato e a instalação offline por
 * app baixa apenas o que aquele app usa (mais os pacotes realmente compartilhados).
 */
export function bootApp(id: ToolId, component: Component): void {
  const root = document.getElementById('app');
  if (!root) return;
  const pinia = createPinia();
  if (allowApp(root, id, pinia)) {
    createApp(component).use(pinia).mount(root);
    installContextMenu(id);
    watchAppAccess(root, id, pinia);
  }
  // O manifesto só é publicado em builds opt-in de Preview isolado.
  exposePreviewManifest();
}
