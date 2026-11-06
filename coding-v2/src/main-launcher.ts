import { exposePreviewManifest } from './pwa';
import { installContextMenu } from './shared/contextMenu';
import './shared/contextMenu.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useOfflineStore } from './stores/offline';
import { refreshRecommendation } from './workspace/prefs';
import LauncherApp from './LauncherApp.vue';
import { createLauncherRouter } from './router';
import { installLauncherNavMemory, resumeAtStartup } from './shared/navSession';
import './styles/tokens.css';
import './styles/base.css';

async function start(): Promise<void> {
  // Em PC e celular, abrir sem rota explícita retoma a última tela sem prazo (veja shared/navMemory.ts).
  if (await resumeAtStartup()) return;
  const pinia = createPinia();
  void refreshRecommendation();
  const router = createLauncherRouter();
  createApp(LauncherApp).use(pinia).use(router).mount('#app');
  // Lê o registro de instalações offline (só leitura; não baixa nada e não registra service worker).
  void useOfflineStore(pinia).init();
  installContextMenu('launcher');
  installLauncherNavMemory(router);
}
void start();

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
