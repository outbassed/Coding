import { createRouter, createWebHashHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import MyAppsView from '../views/MyAppsView.vue';
import CatalogView from '../views/CatalogView.vue';
import AppDetailsView from '../views/AppDetailsView.vue';
import DocumentsView from '../views/DocumentsView.vue';
import SettingsView from '../views/SettingsView.vue';
import NotFoundView from '../views/NotFoundView.vue';

const TITLE = 'Coding Launcher';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView, meta: { title: 'Início' } },
  { path: '/meus-apps', name: 'my-apps', component: MyAppsView, meta: { title: 'Meus apps' } },
  { path: '/catalogo', name: 'catalog', component: CatalogView, meta: { title: 'Catálogo' } },
  { path: '/app/:id', name: 'app', component: AppDetailsView, props: true, meta: { title: 'Detalhes do aplicativo' } },
  { path: '/documentos', name: 'docs', component: DocumentsView, meta: { title: 'Documentos' } },
  { path: '/ajustes', name: 'settings', component: SettingsView, meta: { title: 'Ajustes' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { title: 'Página não encontrada' } }
];

/**
 * Roteamento interno por hash, dentro da entrada /launcher/. Os caminhos dos apps
 * (/apps/etiquetas/ …) continuam sendo páginas HTML independentes do Vite.
 */
export function createLauncherRouter(history: RouterHistory = createWebHashHistory('/launcher/')) {
  const router = createRouter({
    history,
    routes,
    // Trocar só a aba de Ajustes (mesma tela, outro ?aba=) não rola a página.
    scrollBehavior: (to, from) => (to.path === from.path ? false : { top: 0 })
  });
  router.afterEach((to) => { document.title = String(to.meta.title ?? '') + ' · ' + TITLE; });
  return router;
}
