import { exposePreviewManifest } from './pwa';
import { installContextMenu } from './shared/contextMenu';
import './shared/contextMenu.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { allowApp } from './shared/appAccess';
import './shared/appAccess.css';
import EditorApp from './EditorApp.vue';
import TextApp from './text/TextApp.vue';
import { isEditorToolId } from './editors/model';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
const appId = document.body.dataset.app;
if (root) {
  const pinia = createPinia();
  if (appId === 'texts' && allowApp(root, 'texts', pinia)) { createApp(TextApp).use(pinia).mount(root); installContextMenu('texts'); }
  else if (isEditorToolId(appId) && allowApp(root, appId, pinia)) { createApp(EditorApp, { appId }).use(pinia).mount(root); installContextMenu(appId); }
  else if (appId !== 'texts' && !isEditorToolId(appId)) root.textContent = 'Este editor não existe. Volte ao Launcher em /launcher/.';
}

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
