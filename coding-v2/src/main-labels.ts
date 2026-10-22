import { createApp } from 'vue';
import { createPinia } from 'pinia';
import LabelsApp from './labels/LabelsApp.vue';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
if (root) createApp(LabelsApp).use(createPinia()).mount(root);
