import { findTool, type ToolId } from './catalog';
import { LAUNCHER_PATH } from './links';

type AppId = ToolId | 'launcher';
type Action = { label: string; shortcut?: string; selector?: string; tab?: string; run?: () => void; id?: string };
type HelpKey = readonly [description: string, shortcut: string];

const APP_ACTIONS: Record<ToolId, Action[]> = {
  labels: [
    { label: 'Adicionar item', selector: '[data-testid="add-item"]', tab: 'Itens', shortcut: 'Alt+Shift+N' },
    { label: 'Colar lista de itens', selector: '[data-testid="open-bulk"]', tab: 'Itens' },
    { label: 'Importar planilha', selector: '[data-testid="open-table-import"]', tab: 'Itens' }
  ],
  texts: [
    { label: 'Salvar documento', selector: '[data-testid="text-save"]', shortcut: 'Ctrl+S' },
    { label: 'Inserir tabela', selector: '[data-testid="text-table"]', tab: 'Inserir', shortcut: 'Alt+Shift+N' },
    { label: 'Exportar PDF', selector: '[data-testid="export-pdf"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Exportar DOCX', selector: '[data-testid="export-docx"]', tab: 'Arquivo' }
  ],
  calc: [
    { label: 'Nova aba', selector: '[data-testid="add-sheet"]', tab: 'Linhas e abas', shortcut: 'Alt+Shift+N' },
    { label: 'Preencher para baixo', selector: '[data-testid="fill-down"]', tab: 'Início' },
    { label: 'Exportar XLSX', selector: '[data-testid="export-xlsx"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ],
  images: [
    { label: 'Adicionar imagem', selector: '[data-testid="add-image"]', tab: 'Camadas', shortcut: 'Alt+Shift+N' },
    { label: 'Adicionar texto', selector: '[data-testid="add-text"]', tab: 'Camadas' },
    { label: 'Adicionar retângulo', selector: '[data-testid="add-rect"]', tab: 'Camadas' }
  ],
  pdf: [
    { label: 'Abrir ou juntar PDF', selector: '[data-testid="open-pdf"]', tab: 'Arquivo', shortcut: 'Alt+Shift+N' },
    { label: 'Girar página', selector: '[data-testid="rotate-page"]', tab: 'Páginas' },
    { label: 'Duplicar página', selector: '[data-testid="duplicate-page"]', tab: 'Páginas' }
  ],
  codes: [
    { label: 'Novo código', selector: '[data-testid="add-code"]', tab: 'Código', shortcut: 'Alt+Shift+N' },
    { label: 'Baixar PNG', selector: '[data-testid="export-png"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Baixar SVG', selector: '[data-testid="export-svg"]', tab: 'Arquivo' }
  ],
  'sheet-labels': [
    { label: 'Adicionar linha', selector: '[data-testid="add-row"]', tab: 'Dados', shortcut: 'Alt+Shift+N' },
    { label: 'Importar CSV ou XLSX', selector: '[data-testid="import-table"]', tab: 'Dados' },
    { label: 'Criar documento de Etiquetas', selector: '[data-testid="create-labels"]', tab: 'Gerar', shortcut: 'Alt+Shift+E' }
  ],
  draw: [
    { label: 'Girar roleta', selector: '[data-testid="spin"]', tab: 'Roleta', shortcut: 'Alt+Shift+N' },
    { label: 'Sortear números', selector: '[data-testid="draw-numbers"]', tab: 'Números' },
    { label: 'Rolar dados', selector: '[data-testid="roll"]', tab: 'Dados' }
  ],
  split: [
    { label: 'Nova despesa', selector: '[data-testid="add-expense"]', tab: 'Despesas', shortcut: 'Alt+Shift+N' },
    { label: 'Adicionar pessoa', selector: '[data-testid="add-person"]', tab: 'Pessoas' },
    { label: 'Exportar CSV', selector: '[data-testid="export-csv"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ]
};

// Somente comandos efetivamente executados pelo próprio editor ou pelo menu deste app.
const NATIVE_KEYS: Partial<Record<ToolId, HelpKey[]>> = {
  labels: [['Desfazer', 'Ctrl+Z'], ['Refazer', 'Ctrl+Shift+Z / Ctrl+Y'], ['Salvar agora', 'Ctrl+S'], ['Imprimir', 'Ctrl+P']],
  texts: [['Desfazer documento', 'Ctrl+Z'], ['Refazer documento', 'Ctrl+Shift+Z / Ctrl+Y'], ['Salvar documento', 'Ctrl+S'], ['Negrito na seleção', 'Ctrl+B'], ['Itálico na seleção', 'Ctrl+I'], ['Sublinhar seleção', 'Ctrl+U']],
  calc: [['Editar célula', 'F2'], ['Confirmar', 'Enter'], ['Navegar', 'Setas / Tab'], ['Negrito', 'Ctrl+B'], ['Preencher para baixo', 'Ctrl+D']]
};

function isTyping(el: Element): boolean {
  return !!el.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="textbox"],[role="combobox"]');
}
function getTab(name: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="editor-tabs"] [role="tab"],.text-bottom-tabs [role="tab"],.side .tabs [role="tab"]')]
    .find(el => el.textContent?.trim().toLowerCase() === name.toLowerCase()) ?? null;
}
function findControl(action: Action): HTMLButtonElement | null {
  return action.selector ? document.querySelector<HTMLButtonElement>(action.selector) : null;
}
function available(action: Action): boolean {
  if (!action.selector) return true;
  const button = findControl(action);
  if (button && !button.disabled && button.getClientRects().length > 0) return true;
  return !!(action.tab && getTab(action.tab));
}
function runControl(action: Action): void {
  if (action.run) { action.run(); return; }
  const click = () => {
    const button = findControl(action);
    if (button && !button.disabled && button.getClientRects().length) button.click();
  };
  const button = findControl(action);
  if (button && !button.disabled && button.getClientRects().length) { button.click(); return; }
  const tab = action.tab && getTab(action.tab);
  if (!tab) return;
  // No celular a aba ativa pode estar recolhida; nesse caso, reabre a gaveta.
  const selected = tab.getAttribute('aria-selected') === 'true';
  const collapsed = tab.getAttribute('aria-expanded') === 'false';
  if (!selected || collapsed) tab.click();
  requestAnimationFrame(click);
}

function menuEntries(app: AppId): Action[] {
  if (app === 'launcher') return [
    { label: 'Início', run: () => { location.hash = '#/'; } },
    { label: 'Meus aplicativos', run: () => { location.hash = '#/meus-apps'; } },
    { label: 'Catálogo', run: () => { location.hash = '#/catalogo'; } },
    { label: 'Biblioteca de documentos', run: () => { location.hash = '#/documentos'; } },
    { label: 'Ajustes', run: () => { location.hash = '#/ajustes'; } }
  ];
  return APP_ACTIONS[app].filter(available);
}

/** Menu local ao aplicativo. Mantém inputs, seleção de texto e Shift+clique direito nativos. */
export function installContextMenu(app: AppId): void {
  const name = app === 'launcher' ? 'Launcher' : findTool(app)?.name ?? app;
  const menu = document.createElement('div');
  menu.className = 'coding-context-menu';
  menu.dataset.testid = 'coding-context-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Ações de ' + name);
  document.body.append(menu);
  let opener: HTMLElement | null = null;
  let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let lastTouchOpen = 0;

  function close(restoreFocus = false): void {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  function header(text: string): void {
    const div = document.createElement('div');
    div.className = 'coding-context-heading';
    div.textContent = text;
    menu.append(div);
  }
  function item(action: Action): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'coding-context-action';
    button.setAttribute('role', 'menuitem');
    const label = document.createElement('span');
    label.textContent = action.label;
    button.append(label);
    if (action.shortcut) {
      const key = document.createElement('kbd');
      key.textContent = action.shortcut;
      button.append(key);
    }
    button.addEventListener('click', () => { close(); runControl(action); });
    menu.append(button);
  }
  function shortcuts(): HelpKey[] {
    const keys: HelpKey[] = app === 'launcher' ? [['Abrir o menu', 'Shift+F10']] : [...(NATIVE_KEYS[app] ?? [])];
    if (app !== 'launcher') {
      for (const action of APP_ACTIONS[app]) {
        if (action.shortcut && !keys.some((k) => k[1] === action.shortcut)) keys.push([action.label, action.shortcut]);
      }
    }
    keys.push(['Abrir menu de contexto', 'Shift+F10']);
    keys.push(['Mostrar estes atalhos', '?']);
    keys.push(['Menu original do navegador', 'Shift + botão direito']);
    return keys;
  }
  function help(): void {
    close();
    const backdrop = document.createElement('div');
    backdrop.className = 'coding-context-overlay';
    backdrop.dataset.testid = 'context-shortcuts';
    backdrop.setAttribute('role', 'presentation');
    const dialog = document.createElement('section');
    dialog.className = 'coding-context-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2');
    h.id = 'coding-context-title';
    h.textContent = 'Atalhos · ' + name;
    dialog.setAttribute('aria-labelledby', h.id);
    const list = document.createElement('dl');
    for (const [description, key] of shortcuts()) {
      const dt = document.createElement('dt'); dt.textContent = description;
      const dd = document.createElement('dd');
      const kbd = document.createElement('kbd'); kbd.textContent = key;
      dd.append(kbd); list.append(dt, dd);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'btn btn-primary';
    done.textContent = 'Fechar';
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function dispose(): void { backdrop.remove(); document.removeEventListener('keydown', onKey, true); previous?.focus({ preventScroll: true }); }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dispose(); }
      if (e.key === 'Tab') { e.preventDefault(); done.focus(); }
    }
    done.addEventListener('click', dispose);
    backdrop.addEventListener('pointerdown', e => { if (e.target === backdrop) dispose(); });
    document.addEventListener('keydown', onKey, true);
    dialog.append(h, list, done); backdrop.append(dialog); document.body.append(backdrop); done.focus();
  }
  function open(x: number, y: number, fromTouch = false): void {
    close();
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const actions = menuEntries(app);
    if (actions.length) { header('Ferramentas · ' + name); actions.forEach(item); }
    if (app !== 'launcher') {
      const sep = document.createElement('div'); sep.className = 'coding-context-separator'; sep.setAttribute('role', 'separator'); menu.append(sep);
      item({ label: 'Voltar ao Launcher', run: () => { location.assign(LAUNCHER_PATH); } });
    }
    item({ label: 'Atalhos de ' + name, shortcut: '?', run: help });
    menu.hidden = false;
    const width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, innerWidth - width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - height - 8)) + 'px';
    menu.dataset.touch = String(fromTouch);
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }
  function cancelPress(): void {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }
  function eligible(target: Element): boolean {
    return !isTyping(target) && !target.closest('dialog,[role="dialog"],.coding-context-menu,.coding-context-overlay,[data-context-native],[data-testid="img-handle"],[role="separator"],input,textarea,select');
  }
  document.addEventListener('contextmenu', e => {
    const target = e.target;
    if (!(target instanceof Element) || !eligible(target)) return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (Date.now() - lastTouchOpen < 850) return;
    open(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !menu.contains(e.target as Node)) close();
    cancelPress();
    if (e.pointerType !== 'touch' || !e.isPrimary || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element) || !eligible(target) || target.closest('button,a,summary,[role="button"],[draggable="true"]')) return;
    const { clientX: x, clientY: y } = e;
    press = { x, y, timer: setTimeout(() => {
      press = null;
      lastTouchOpen = Date.now();
      open(x, y, true);
    }, 550) };
  }, true);
  document.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); }, true);
  document.addEventListener('pointerup', cancelPress, true);
  document.addEventListener('pointercancel', cancelPress, true);
  document.addEventListener('scroll', cancelPress, true);
  document.addEventListener('keydown', e => {
    if (!menu.hidden) {
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(current + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); return; }
    }
    if (e.defaultPrevented) return;
    const active = e.target;
    if (!(active instanceof Element) || isTyping(active) || active.closest('dialog,[role="dialog"]')) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
      const rect = target.getBoundingClientRect();
      open(rect.left + 12, rect.bottom + 4);
      return;
    }
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey && !active.closest('[data-testid="grid"]')) { e.preventDefault(); help(); return; }
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && app !== 'launcher') {
      const code = e.code;
      if (code !== 'KeyN' && code !== 'KeyE') return;
      const action = APP_ACTIONS[app].find(a => a.shortcut === (code === 'KeyN' ? 'Alt+Shift+N' : 'Alt+Shift+E'));
      if (action && available(action)) { e.preventDefault(); runControl(action); }
    }
  }, true);
  window.addEventListener('blur', () => { close(); cancelPress(); });
  window.addEventListener('resize', () => close());
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target as Node)) close(); });
}
