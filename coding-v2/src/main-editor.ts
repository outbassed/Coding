import { exposePreviewManifest } from './pwa';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import EditorApp from './EditorApp.vue';
import TextApp from './text/TextApp.vue';
import { isEditorToolId } from './editors/model';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
const appId = document.body.dataset.app;
if (root) {
  if (appId === 'texts') createApp(TextApp).use(createPinia()).mount(root);
  else if (isEditorToolId(appId)) createApp(EditorApp, { appId }).use(createPinia()).mount(root);
  else root.textContent = 'Este editor não existe. Volte ao Launcher em /launcher/.';
}

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
