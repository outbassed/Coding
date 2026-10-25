import { findTool, type ToolId } from './catalog';

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
    { label: 'Selecionar coluna', selector: '[data-testid="select-column"]', tab: 'Início' },
    { label: 'Selecionar linha', selector: '[data-testid="select-row"]', tab: 'Início' },
    { label: 'Exportar XLSX', selector: '[data-testid="export-xlsx"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ],
  images: [
    { label: 'Adicionar imagem', selector: '[data-testid="add-image"]', tab: 'Camadas', shortcut: 'Alt+Shift+N' },
    { label: 'Adicionar texto', selector: '[data-testid="add-text"]', tab: 'Camadas' },
    { label: 'Adicionar retângulo', selector: '[data-testid="add-rect"]', tab: 'Camadas' },
    { label: 'Colar imagem', selector: '[data-testid="paste-image"]', tab: 'Camadas' },
    { label: 'Girar camada 90°', selector: '[data-testid="rotate90"]', tab: 'Ajustar' },
    { label: 'Exportar PNG', selector: '[data-testid="export-png"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Exportar WebP', selector: '[data-testid="export-webp"]', tab: 'Arquivo' }
  ],
  pdf: [
    { label: 'Abrir ou juntar PDF', selector: '[data-testid="open-pdf"]', tab: 'Arquivo', shortcut: 'Alt+Shift+N' },
    { label: 'Girar página', selector: '[data-testid="rotate-page"]', tab: 'Páginas' },
    { label: 'Duplicar página', selector: '[data-testid="duplicate-page"]', tab: 'Páginas' },
    { label: 'Adicionar texto', selector: '[data-testid="add-note-text"]', tab: 'Anotar' },
    { label: 'Adicionar linha', selector: '[data-testid="add-line"]', tab: 'Anotar' },
    { label: 'Desenhar assinatura', selector: '[data-testid="ink-toggle"]', tab: 'Anotar' },
    { label: 'Inserir imagem', selector: '[data-testid="add-image"]', tab: 'Anotar' },
    { label: 'Exportar PDF', selector: '[data-testid="export-pdf"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ],
  codes: [
    { label: 'Novo código', selector: '[data-testid="add-code"]', tab: 'Código', shortcut: 'Alt+Shift+N' },
    { label: 'Baixar PNG', selector: '[data-testid="export-png"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Baixar SVG', selector: '[data-testid="export-svg"]', tab: 'Arquivo' }
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
  ],
  calculator: [
    { label: 'Limpar entrada', selector: '[data-testid="key-clear"]', shortcut: 'Esc' },
    { label: 'Copiar resultado', selector: '[data-testid="copy-result"]' },
    { label: 'Exportar histórico', selector: '[data-testid="export-history"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ],
  colors: [
    { label: 'Adicionar cor à paleta', selector: '[data-testid="add-base"]', tab: 'Cor' },
    { label: 'Ver contraste', selector: '[data-testid="contrast-ratio"]', tab: 'Contraste' },
    { label: 'Exportar CSS', selector: '[data-testid="export-css"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Exportar JSON', selector: '[data-testid="export-json"]', tab: 'Arquivo' },
    { label: 'Importar imagem para extrair cores', selector: '[data-testid="image-input"]', tab: 'Imagem' }
  ],
  zip: [
    { label: 'Criar e baixar o ZIP', selector: '[data-testid="create-zip"]', tab: 'Compactar' },
    { label: 'Abrir um ZIP', selector: '[data-testid="zip-open-input"]', tab: 'Abrir ZIP' },
    { label: 'Verificar ZIP', selector: '[data-testid="verify-zip"]', tab: 'Abrir ZIP' },
    { label: 'Esvaziar projeto', selector: '[data-testid="clear-project"]', tab: 'Arquivos' }
  ],
  compare: [
    { label: 'Próxima diferença', selector: '[data-testid="next-diff"]' },
    { label: 'Trocar A e B', selector: '[data-testid="swap-sides"]', tab: 'Arquivos' },
    { label: 'Diferença anterior', selector: '[data-testid="prev-diff"]' },
    { label: 'Copiar diferenças', selector: '[data-testid="copy-diff"]', tab: 'Arquivo' },
    { label: 'Exportar diferenças', selector: '[data-testid="export-diff"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' }
  ],
  code: [
    { label: 'Novo arquivo', selector: '[data-testid="new-file"]', tab: 'Explorador', shortcut: 'Alt+Shift+N' },
    { label: 'Nova pasta', selector: '[data-testid="new-folder"]', tab: 'Explorador' },
    { label: 'Executar', selector: '[data-testid="run-code"]', tab: 'Executar', shortcut: 'Ctrl+Enter' },
    { label: 'Baixar ZIP do projeto', selector: '[data-testid="download-zip"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Baixar página única', selector: '[data-testid="download-html"]', tab: 'Arquivo' }
  ],
  paint: [
    { label: 'Nova camada', selector: '[data-testid="add-layer"]', tab: 'Camadas' },
    { label: 'Baixar PNG', selector: '[data-testid="export-png"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Importar imagem como camada', selector: '[data-testid="import-layer"]', tab: 'Tela' },
    { label: 'Copiar seleção', selector: '[data-testid="sel-copy"]', tab: 'Ferramentas' },
    { label: 'Colar seleção', selector: '[data-testid="sel-paste"]', tab: 'Ferramentas' },
    { label: 'Mesclar camada abaixo', selector: '[data-testid="merge-down"]', tab: 'Camadas' },
    { label: 'Exportar WebP', selector: '[data-testid="export-webp"]', tab: 'Arquivo' }
  ],
  viewer: [
    { label: 'Abrir arquivos', selector: '[data-testid="open-files"]', tab: 'Arquivos', shortcut: 'Alt+Shift+N' },
    { label: 'Baixar o arquivo atual', selector: '[data-testid="download-original"]', tab: 'Arquivo', shortcut: 'Alt+Shift+E' },
    { label: 'Redefinir vista 3D', selector: '[data-testid="reset-3d"]', tab: 'Exibição' },
    { label: 'Arquivo anterior', selector: '[data-testid="viewer-prev"]' },
    { label: 'Próximo arquivo', selector: '[data-testid="viewer-next"]' },
    { label: 'Apresentação de imagens', selector: '[data-testid="slideshow"]', tab: 'Arquivos' },
    { label: 'Tela cheia', selector: '[data-testid="viewer-fullscreen"]' }
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
function available(action: Action, allowSwitchTab = false): boolean {
  if (!action.selector) return true;
  const button = findControl(action);
  if (button?.disabled) return false;
  if (button && button.getClientRects().length > 0) return true;
  return !!(allowSwitchTab && action.tab && getTab(action.tab));
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

/** Operações específicas do elemento, sem misturar navegação com edição. */
function contextualEntries(app: AppId, target?: Element): { title: string; actions: Action[] } | null {
  if (!target || app === 'launcher') return null;
  if (app === 'calc') {
    const el = target.closest<HTMLElement>('[data-col],[data-row],[data-cell]');
    if (!el) return null;
    const col = el.dataset.col;
    const row = el.dataset.row;
    const cell = el.dataset.cell;
    const act = (command: string, label: string): Action => ({
      label, run: () => document.dispatchEvent(new CustomEvent('coding:sheet-context-action', { detail: { command } }))
    });
    if (col) return { title: 'Coluna ' + col, actions: [
      act('copy', 'Copiar coluna ' + col), act('cut', 'Recortar coluna ' + col), act('paste', 'Colar na coluna ' + col),
      act('duplicate-column', 'Duplicar coluna'), act('insert-column-left', 'Inserir coluna à esquerda'),
      act('insert-column-right', 'Inserir coluna à direita'), act('delete-column', 'Excluir coluna')
    ] };
    if (row) return { title: 'Linha ' + row, actions: [
      act('copy', 'Copiar linha ' + row), act('cut', 'Recortar linha ' + row), act('paste', 'Colar na linha ' + row),
      act('duplicate-row', 'Duplicar linha'), act('insert-row-above', 'Inserir linha acima'),
      act('insert-row-below', 'Inserir linha abaixo'), act('delete-row', 'Excluir linha')
    ] };
    if (cell) return { title: 'Célula ' + cell, actions: [
      act('copy', 'Copiar seleção'), act('cut', 'Recortar seleção'), act('paste', 'Colar na seleção'),
      act('clear', 'Limpar conteúdo')
    ] };
  }
  if (app === 'labels') {
    const itemElement = target.closest<HTMLElement>('[data-item]');
    if (itemElement) {
      const duplicate = itemElement.querySelector<HTMLButtonElement>('button[aria-label^="Duplicar item"]');
      const remove = itemElement.querySelector<HTMLButtonElement>('button[aria-label^="Excluir item"]');
      const actions: Action[] = [];
      if (duplicate && !duplicate.disabled) actions.push({ label: 'Duplicar item', run: () => duplicate.click() });
      if (remove && !remove.disabled) actions.push({ label: 'Excluir item', run: () => remove.click() });
      return actions.length ? { title: 'Item de etiqueta', actions } : null;
    }
  }
  return null;
}
function menuEntries(app: AppId): Action[] {
  if (app === 'launcher') return [
    { label: 'Início', run: () => { location.hash = '#/'; } },
    { label: 'Meus aplicativos', run: () => { location.hash = '#/meus-apps'; } },
    { label: 'Catálogo', run: () => { location.hash = '#/catalogo'; } },
    { label: 'Biblioteca de documentos', run: () => { location.hash = '#/documentos'; } },
    { label: 'Ajustes', run: () => { location.hash = '#/ajustes'; } }
  ];
  return APP_ACTIONS[app].filter(action => available(action, true));
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
    const keys: HelpKey[] = app === 'launcher' ? [['Abrir o menu', 'Shift+F10']] : [...(NATIVE_KEYS[app] ?? [['Salvar projeto', 'Ctrl+S'], ['Desfazer', 'Ctrl+Z'], ['Refazer', 'Ctrl+Shift+Z / Ctrl+Y']])];
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
  function open(x: number, y: number, fromTouch = false, target?: Element): void {
    close();
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focused = contextualEntries(app, target);
    if (focused?.actions.length) {
      header(focused.title);
      focused.actions.forEach(item);
    }
    const actions = menuEntries(app);
    if (actions.length) {
      if (focused?.actions.length) {
        const sep = document.createElement('div'); sep.className = 'coding-context-separator'; sep.setAttribute('role', 'separator'); menu.append(sep);
      }
      header('Ferramentas · ' + name);
      actions.forEach(item);
    }
    if (!actions.length && !focused?.actions.length) header('Ações · ' + name);
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
    open(e.clientX, e.clientY, false, target);
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
      open(x, y, true, target);
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
      open(rect.left + 12, rect.bottom + 4, false, target);
      return;
    }
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey && !active.closest('[data-testid="grid"]')) { e.preventDefault(); help(); return; }
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && app !== 'launcher') {
      const code = e.code;
      if (code !== 'KeyN' && code !== 'KeyE') return;
      const action = APP_ACTIONS[app].find(a => a.shortcut === (code === 'KeyN' ? 'Alt+Shift+N' : 'Alt+Shift+E'));
      if (action && available(action, true)) { e.preventDefault(); runControl(action); }
    }
  }, true);
  window.addEventListener('blur', () => { close(); cancelPress(); });
  window.addEventListener('resize', () => close());
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target as Node)) close(); });
}
