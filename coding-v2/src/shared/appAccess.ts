import type { Pinia } from 'pinia';
import { watch } from 'vue';
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

/**
 * Acompanha, com o editor já aberto, a ativação do app: se for desativado em outra aba, aparece um aviso
 * por cima (caixa modal nativa) SEM remontar nem alterar o editor — campos e alterações não salvas continuam
 * como estavam. Ao reativar, o aviso some sozinho e o foco volta de onde estava.
 * Devolve uma função que remove o aviso e para de observar (um único observador por página).
 */
export function watchAppAccess(root: HTMLElement, id: ToolId, pinia: Pinia): () => void {
  const apps = useAppsStore(pinia);
  const tool = getTool(id);
  let dialog: HTMLDialogElement | null = null;
  let origin: HTMLElement | null = null;

  function build(): HTMLDialogElement {
    const el = document.createElement('dialog');
    el.className = 'app-live-off';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-labelledby', 'app-live-off-title');
    el.setAttribute('aria-describedby', 'app-live-off-text');
    el.dataset.testid = 'app-live-off';
    const title = document.createElement('h2');
    title.id = 'app-live-off-title';
    title.textContent = 'Aplicativo desativado';
    const text = document.createElement('p');
    text.id = 'app-live-off-text';
    text.textContent = tool.name + ' foi desativado em outra aba do Launcher. Nada foi apagado: o que você já escreveu continua aqui. Reative para continuar editando.';
    const actions = document.createElement('div');
    actions.className = 'app-disabled-actions';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn btn-primary';
    again.textContent = 'Reativar aplicativo';
    again.dataset.testid = 'live-reactivate';
    again.addEventListener('click', () => { apps.toggle(id); });
    const home = document.createElement('a');
    home.className = 'btn';
    home.href = LAUNCHER_PATH + '#/';
    home.textContent = 'Ir para o início';
    home.dataset.testid = 'live-home';
    actions.append(again, home);
    el.append(title, text, actions);
    el.addEventListener('cancel', (event) => event.preventDefault());
    return el;
  }
  function show(): void {
    if (dialog) return;
    origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog = build();
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('[data-testid="live-reactivate"]')?.focus();
    root.setAttribute('aria-hidden', 'true');
  }
  function hide(): void {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.remove();
    dialog = null;
    root.removeAttribute('aria-hidden');
    if (origin && origin.isConnected) origin.focus();
    origin = null;
  }
  const stop = watch(() => apps.isEnabled(id), (on) => { if (on) hide(); else show(); });
  return () => { stop(); hide(); };
}
