import { createApp } from 'vue';
import VersionsApp from '../versoes/VersionsApp.vue';
import '../styles/tokens.css';
import '../styles/base.css';

/** Central de Versões: página própria (caminhos reais em /versoes/…), sem Pinia nem roteador do Launcher. */
createApp(VersionsApp).mount('#app');
