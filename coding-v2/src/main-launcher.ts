import { exposePreviewManifest } from './pwa';
import { installContextMenu } from './shared/contextMenu';
import './shared/contextMenu.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useOfflineStore } from './stores/offline';
import LauncherApp from './LauncherApp.vue';
import { createLauncherRouter } from './router';
import './styles/tokens.css';
import './styles/base.css';

const pinia = createPinia();
createApp(LauncherApp).use(pinia).use(createLauncherRouter()).mount('#app');
// Lê o registro de instalações offline (só leitura; não baixa nada e não registra service worker).
void useOfflineStore(pinia).init();
installContextMenu('launcher');

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
