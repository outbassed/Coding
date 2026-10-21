import { createApp } from 'vue';
import { createPinia } from 'pinia';
import LauncherApp from './LauncherApp.vue';
import './styles.css';
createApp(LauncherApp).use(createPinia()).mount('#app');
