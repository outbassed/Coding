import { exposePreviewManifest } from './pwa';
import { createApp, type Component } from 'vue';
import { createPinia } from 'pinia';
import './styles/tokens.css';
import './styles/base.css';

/** Uma entrada para os apps 2.0; cada app é carregado sob demanda (um pacote por app). */
const loaders: Record<string, () => Promise<{ default: Component }>> = {
  calc: () => import('./apps/calc/CalcApp.vue'),
  images: () => import('./apps/images/ImagesApp.vue'),
  pdf: () => import('./apps/pdf/PdfApp.vue'),
  codes: () => import('./apps/codes/CodesApp.vue'),
  'sheet-labels': () => import('./apps/sheet-labels/SheetLabelsApp.vue'),
  draw: () => import('./apps/draw/DrawApp.vue'),
  split: () => import('./apps/split/SplitApp.vue')
};
const root = document.getElementById('app');
const id = document.body.dataset.app ?? '';
const load = Object.hasOwn(loaders, id) ? loaders[id] : undefined;
if (root) {
  if (!load) root.textContent = 'Este app não existe. Volte ao Launcher em /launcher/.';
  else load().then((m) => createApp(m.default).use(createPinia()).mount(root)).catch(() => {
    root.innerHTML = '<p style="padding:24px;font:16px system-ui">Não foi possível carregar o app. Verifique a conexão e recarregue a página. <a href="/launcher/">Voltar ao Launcher</a></p>';
  });
}

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
