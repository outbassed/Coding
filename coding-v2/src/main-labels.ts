import { exposePreviewManifest } from './pwa';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { allowApp } from './shared/appAccess';
import './shared/appAccess.css';
import LabelsApp from './labels/LabelsApp.vue';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
if (root) {
  const pinia = createPinia();
  if (allowApp(root, 'labels', pinia)) createApp(LabelsApp).use(pinia).mount(root);
}

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
