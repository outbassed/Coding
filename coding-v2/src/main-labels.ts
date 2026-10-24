import { exposePreviewManifest } from './pwa';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import LabelsApp from './labels/LabelsApp.vue';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
if (root) createApp(LabelsApp).use(createPinia()).mount(root);

// O manifesto só é publicado em builds opt-in de Preview isolado.
exposePreviewManifest();
