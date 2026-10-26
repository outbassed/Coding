import { exposePreviewManifest } from '../pwa';
import { refreshRecommendation } from '../workspace/prefs';
import { installContextMenu } from '../shared/contextMenu';
import '../shared/contextMenu.css';
import { createApp, type Component } from 'vue';
import { createPinia } from 'pinia';
import type { ToolId } from '../shared/catalog';
import '../styles/tokens.css';
import '../styles/base.css';

/**
 * Inicialização comum dos apps. Cada app tem a sua própria entrada (src/entries/<app>.ts) que importa o
 * componente de forma estática: assim o grafo de arquivos de cada página é exato e a instalação offline por
 * app baixa apenas o que aquele app usa (mais os pacotes realmente compartilhados).
 */
export function bootApp(id: ToolId, component: Component): void {
  void refreshRecommendation();
  const root = document.getElementById('app');
  if (!root) return;
  const pinia = createPinia();
  createApp(component).use(pinia).mount(root);
  installContextMenu(id);
  // O manifesto só é publicado em builds opt-in de Preview isolado.
  exposePreviewManifest();
}
