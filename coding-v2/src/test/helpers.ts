import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import axe from 'axe-core';
import LauncherApp from '../LauncherApp.vue';
import EditorApp from '../EditorApp.vue';
import { createLauncherRouter } from '../router';
import type { EditorToolId } from '../editors/model';

export async function mountLauncher(path = '/') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createLauncherRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  const wrapper = mount(LauncherApp, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router };
}

export async function mountEditor(appId: EditorToolId) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(EditorApp, { props: { appId }, global: { plugins: [pinia] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

/** Simula o navegador com largura fixa (media queries min-width). */
export function stubViewport(width: number): void {
  const matchMedia = (query: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : false;
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList;
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });
}

export function clearViewport(): void {
  Reflect.deleteProperty(window, 'matchMedia');
}

/** Regras dependentes de layout real (contraste, páginas inteiras) ficam para o teste em navegador. */
export async function violations(element: Element): Promise<string[]> {
  const result = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'document-title': { enabled: false }, 'html-has-lang': { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } }
  });
  return result.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.html.slice(0, 80)).join(' | '));
}
