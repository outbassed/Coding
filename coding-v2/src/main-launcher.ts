import { exposePreviewManifest } from './pwa';
import { installContextMenu } from './shared/contextMenu';
import './shared/contextMenu.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import LauncherApp from './LauncherApp.vue';
import { createLauncherRouter } from './router';
import './styles/tokens.css';
import './styles/base.css';

createApp(LauncherApp).use(createPinia()).use(createLauncherRouter()).mount('#app');
installContextMenu('launcher');

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
