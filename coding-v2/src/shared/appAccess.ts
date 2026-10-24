import type { Pinia } from 'pinia';
import { useAppsStore } from '../stores/apps';
import { getTool, type ToolId } from './catalog';
import { LAUNCHER_PATH } from './links';

/**
 * Bloqueio funcional de preferências para entradas HTML independentes.
 * Não é autorização de segurança: todos os arquivos estáticos continuam públicos.
 */
export function allowApp(root: HTMLElement, id: ToolId, pinia: Pinia): boolean {
  const apps = useAppsStore(pinia);
  if (apps.isEnabled(id)) return true;
  const tool = getTool(id);
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'app-disabled';
  main.dataset.testid = 'app-disabled';
  const icon = document.createElement('span');
  icon.className = 'app-disabled-icon';
  icon.textContent = '⊘';
  icon.setAttribute('aria-hidden', 'true');
  const title = document.createElement('h1');
  title.textContent = tool.name + ' está desativado';
  const text = document.createElement('p');
  text.textContent = 'Este aplicativo foi desativado no Launcher deste navegador. Ative-o para continuar.';
  const actions = document.createElement('div');
  actions.className = 'app-disabled-actions';
  const activate = document.createElement('button');
  activate.type = 'button';
  activate.className = 'btn btn-primary';
  activate.textContent = 'Ativar aplicativo';
  activate.dataset.testid = 'enable-app';
  activate.addEventListener('click', () => {
    if (apps.toggle(id)) location.reload();
  });
  const back = document.createElement('a');
  back.className = 'btn';
  back.href = LAUNCHER_PATH + '#/meus-apps';
  back.textContent = 'Voltar ao Launcher';
  actions.append(activate, back);
  main.append(icon, title, text, actions);
  root.append(main);
  document.title = tool.name + ' desativado · Coding 2.0';
  return false;
}
