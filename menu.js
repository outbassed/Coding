/* Coding — menu de clique direito personalizado e atalhos do aplicativo */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const menu = byId("ctxMenu");
  let opener = null;
  let lastLongPress = 0;
  let suppressContext = false;
  let openedAt = 0;

  const SHORTCUTS = [
    ["Imprimir / PDF (etiquetas, textos, códigos)", "Ctrl+P"],
    ["Salvar projeto (.json)", "Ctrl+S"],
    ["Novo documento", "Alt+N"],
    ["Tela inicial", "Alt+H"],
    ["Mostrar esta lista", "?"],
    ["Texto: negrito", "Ctrl+B"],
    ["Texto: itálico", "Ctrl+I"],
    ["Texto: sublinhado", "Ctrl+U"],
    ["Texto: desfazer", "Ctrl+Z"],
    ["Texto: refazer", "Ctrl+Y"],
    ["Texto: colar sem formatação", "Ctrl+V"],
    ["Planilhas: editar a célula / confirmar", "F2 / Enter"],
    ["Planilhas: copiar, recortar, colar", "Ctrl+C / X / V"],
    ["Planilhas: negrito, itálico, sublinhado", "Ctrl+B / I / U"],
    ["Planilhas: desfazer / refazer", "Ctrl+Z / Ctrl+Y"],
    ["Planilhas: preencher para baixo / direita", "Ctrl+D / Ctrl+R"],
    ["Planilhas: AutoSoma", "Alt+="],
    ["Planilhas: imprimir", "Ctrl+P"],
    ["PDF: excluir páginas selecionadas", "Delete"],
    ["PDF: selecionar todas as páginas", "Ctrl+A"],
    ["PDF: fechar a anotação", "Esc"],
    ["Menu pelo teclado", "Menu ou Shift+F10"],
    ["Menu normal do navegador", "Shift + botão direito"]
  ];

  /* ---------- Componente de menu ---------- */

  function clean(list) {
    const out = [];
    list.forEach((item) => {
      if (item.sep && (!out.length || out[out.length - 1].sep)) return;
      out.push(item);
    });
    while (out.length && out[out.length - 1].sep) out.pop();
    return out;
  }

  const sub = document.createElement("div");
  sub.className = "ctx-menu ctx-sub";
  sub.setAttribute("role", "menu");
  sub.hidden = true;
  document.body.append(sub);
  let subOwner = null;
  let subTimer = 0;

  function closeSub(focusOwner) {
    clearTimeout(subTimer);
    if (sub.hidden) return;
    sub.hidden = true;
    sub.replaceChildren();
    if (subOwner) { subOwner.setAttribute("aria-expanded", "false"); subOwner.classList.remove("open"); }
    const owner = subOwner;
    subOwner = null;
    if (focusOwner && owner) owner.focus({ preventScroll: true });
  }

  function close(restoreFocus) {
    closeSub(false);
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    const target = opener;
    opener = null;
    if (restoreFocus && target && document.contains(target) && typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  function focusable(scope) { return Array.from((scope || menu).querySelectorAll('[role^="menuitem"]:not(:disabled)')); }

  function build(container, items, touch, level) {
    items.forEach((item) => {
      if (item.sep) {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        sep.setAttribute("role", "separator");
        container.append(sep);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ctx-item" + (item.danger ? " danger" : "");
      button.setAttribute("role", item.check === undefined ? "menuitem" : "menuitemcheckbox");
      if (item.check !== undefined) button.setAttribute("aria-checked", String(Boolean(item.check)));
      button.tabIndex = -1;
      button.disabled = Boolean(item.disabled);
      const mark = document.createElement("span");
      mark.className = "ctx-mark";
      mark.textContent = item.check ? "✓" : "";
      const label = document.createElement("span");
      label.className = "ctx-label";
      label.textContent = item.label;
      button.append(mark, label);
      if (item.sub) {
        const arrow = document.createElement("span");
        arrow.className = "ctx-arrow";
        arrow.textContent = "›";
        arrow.setAttribute("aria-hidden", "true");
        button.append(arrow);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        if (touch) {
          // toque: o grupo abre por baixo, sem janela lateral
          const group = document.createElement("div");
          group.className = "ctx-group";
          group.hidden = true;
          build(group, clean(item.sub), touch, level + 1);
          button.addEventListener("click", () => {
            group.hidden = !group.hidden;
            button.setAttribute("aria-expanded", String(!group.hidden));
            button.classList.toggle("open", !group.hidden);
          });
          container.append(button, group);
        } else {
          button.addEventListener("click", () => openSub(button, item.sub, true));
          button.addEventListener("mouseenter", () => {
            if (container !== menu) return;
            clearTimeout(subTimer);
            subTimer = setTimeout(() => openSub(button, item.sub, false), 140);
          });
          container.append(button);
        }
        return;
      }
      if (!touch && container === menu) {
        button.addEventListener("mouseenter", () => { clearTimeout(subTimer); subTimer = setTimeout(() => closeSub(false), 140); });
      }
      if (item.shortcut) {
        const key = document.createElement("kbd");
        key.className = "ctx-key";
        key.textContent = item.shortcut;
        button.append(key);
      }
      button.addEventListener("click", () => {
        close(true);
        setTimeout(() => item.run && item.run(), 0);
      });
      container.append(button);
    });
  }

  function openSub(button, list, focusFirst) {
    clearTimeout(subTimer);
    if (subOwner === button && !sub.hidden) { if (focusFirst) { const f = focusable(sub)[0]; if (f) f.focus(); } return; }
    closeSub(false);
    const items = clean(list);
    if (!items.length) return;
    build(sub, items, false, 1);
    subOwner = button;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("open");
    sub.hidden = false;
    sub.style.left = "0px";
    sub.style.top = "0px";
    sub.style.maxHeight = window.innerHeight - 16 + "px";
    const r = button.getBoundingClientRect();
    const box = sub.getBoundingClientRect();
    let left = r.right + 2;
    if (left + box.width > window.innerWidth - 8) left = Math.max(8, r.left - box.width - 2);
    const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - box.height - 8));
    sub.style.left = left + "px";
    sub.style.top = top + "px";
    if (focusFirst) { const f = focusable(sub)[0]; if (f) f.focus({ preventScroll: true }); }
  }

  function open(list, x, y, touch, above) {
    close(false);
    const items = clean(list);
    if (!items.length) return;
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    menu.classList.toggle("touch", Boolean(touch));
    build(menu, items, Boolean(touch), 0);
    openedAt = performance.now();
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.maxHeight = window.innerHeight - 16 + "px";
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(above ? y - rect.height : y, window.innerHeight - rect.height - 8));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    const first = focusable()[0];
    if (first) first.focus({ preventScroll: true });
  }

  function onKey(e) {
    const inSub = sub.contains(document.activeElement);
    const scope = inSub ? sub : menu;
    const items = focusable(scope).filter((el) => !el.closest("[hidden]"));
    const index = items.indexOf(document.activeElement);
    const current = document.activeElement;
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); items[(index + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(index - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === "ArrowRight" && current && current.getAttribute("aria-haspopup")) { e.preventDefault(); current.click(); }
    else if (e.key === "ArrowLeft" && inSub) { e.preventDefault(); closeSub(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (inSub) closeSub(true); else close(true); }
    else if (e.key === "Tab") { e.preventDefault(); close(true); }
  }
  menu.addEventListener("keydown", onKey);
  sub.addEventListener("keydown", onKey);

  let outsideTarget = null;
  document.addEventListener("pointerdown", (e) => {
    outsideTarget = null;
    if (!menu.hidden && !menu.contains(e.target) && !sub.contains(e.target)) { outsideTarget = e.target; close(false); }
  }, true);
  document.addEventListener("scroll", (e) => { if (!menu.hidden && !menu.contains(e.target) && !sub.contains(e.target) && performance.now() - openedAt > 400) close(false); }, true);
  window.addEventListener("wheel", (e) => { if (!menu.hidden && !menu.contains(e.target) && !sub.contains(e.target)) close(false); }, { passive: true });
  window.addEventListener("resize", () => close(false));
  window.addEventListener("blur", () => close(false));

  /* ---------- Menu do celular (botão de três risquinhos) ---------- */

  const menuButton = byId("menuButton");
  const navMenu = document.querySelector('#mainNav [data-nav="menu"]');
  function mainMenu(anchor, above) {
    const doc = C.cur();
    const install = byId("installButton");
    const onHome = !doc || !document.body.classList.contains("in-doc");
    const items = onHome ? [
      { label: "Abrir arquivo (.json)…", run: C.openImport }
    ] : [
      { label: "Tela inicial", run: C.goHome },
      { label: "Novo documento", run: newOfCurrent },
      { label: C.isFav() ? "Remover dos favoritos" : "Adicionar aos favoritos", run: () => C.toggleFav(), disabled: !doc },
      { sep: true },
      { label: C.primaryLabel(), run: C.print, disabled: !doc },
      { label: "Copiar link do documento", run: C.copyShareLink, disabled: !doc },
      { label: "Salvar projeto (.json)", run: C.exportProject, disabled: !doc },
      { label: "Abrir arquivo (.json)…", run: C.openImport }
    ];
    items.push({ sep: true });
    if (!install.hidden) items.push({ label: "Instalar aplicativo", run: () => install.click() });
    items.push({ label: "Atalhos do teclado", run: openShortcuts });
    const box = anchor.getBoundingClientRect();
    if (above) open(items, window.innerWidth, box.top - 6, true, true);
    else open(items, window.innerWidth, box.bottom + 6, true);
  }
  [[menuButton, false], [navMenu, true]].forEach(([button, above]) => {
    button.addEventListener("click", () => {
      if (outsideTarget && button.contains(outsideTarget)) { outsideTarget = null; return; } // segundo toque fecha
      mainMenu(button, above);
    });
  });
  document.querySelector('#mainNav [data-nav="keys"]').addEventListener("click", openShortcuts);

  /* ---------- Conteúdo ---------- */

  function generalItems(onHome) {
    const doc = C.cur();
    if (onHome) {
      return [
        { label: "Novo documento", sub: C.programs.map((p) => ({ label: p.name, run: () => C.newDoc(p.id) })) },
        { label: "Abrir arquivo (.json)…", run: C.openImport },
        { sep: true },
        { label: "Atalhos do teclado", shortcut: "?", run: openShortcuts }
      ];
    }
    const items = [
      { label: "Novo documento", shortcut: "Alt+N", run: newOfCurrent },
      { label: "Tela inicial", shortcut: "Alt+H", run: C.goHome },
      { label: C.isFav() ? "Remover dos favoritos" : "Adicionar aos favoritos", run: () => C.toggleFav(), disabled: !doc },
      { sep: true },
      { label: C.primaryLabel(), shortcut: printable() ? "Ctrl+P" : undefined, run: C.print, disabled: !doc },
      { label: "Arquivo", sub: [
        { label: "Copiar link do documento", run: C.copyShareLink, disabled: !doc },
        { label: "Salvar projeto (.json)", shortcut: "Ctrl+S", run: C.exportProject, disabled: !doc },
        { label: "Abrir arquivo (.json)…", run: C.openImport }
      ] },
      { sep: true }
    ];
    const mode = C.curMode();
    if (mode && mode.viewItems) items.push({ label: "Exibir", sub: mode.viewItems() }, { sep: true });
    items.push({ label: "Atalhos do teclado", shortcut: "?", run: openShortcuts });
    return items;
  }

  function printable() { const mode = C.curMode(); return !mode || mode.primaryIsPrint !== false; }

  function newOfCurrent() {
    const doc = C.cur();
    return C.newDoc(doc ? doc.type : "labels");
  }

  function showFor(target, x, y, touch) {
    const onHome = !document.body.classList.contains("in-doc");
    const doc = C.cur();
    let list = null;
    if (!onHome && doc) {
      const mode = C.modes[doc.type];
      if (mode && mode.menuItems) list = mode.menuItems(target);
    }
    open(list || generalItems(onHome), x, y, touch);
  }

  const isField = (el) => Boolean(el.closest && el.closest("input, textarea, select"));
  const isEditable = (el) => isField(el) || (el.isContentEditable === true);

  document.addEventListener("contextmenu", (e) => {
    if (suppressContext) { e.preventDefault(); return; }
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#ctxMenu, .ctx-sub")) { e.preventDefault(); return; }
    if (e.shiftKey) return; // menu nativo do navegador
    if (target.closest("dialog") || isField(target)) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && target.closest("#txEditor") && target.tagName !== "IMG") return; // seleção nativa de texto no toque
    e.preventDefault();
    showFor(target, e.clientX, e.clientY, coarse);
  });

  /* ---------- Toque longo ---------- */

  let press = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    const target = e.target;
    if (!(target instanceof Element) || target.closest("dialog, #ctxMenu, .ctx-sub") || isField(target)) return;
    if (target.closest("#txEditor") && target.tagName !== "IMG") return;
    const x = e.clientX;
    const y = e.clientY;
    clearTimeout(press && press.timer);
    press = {
      x, y,
      timer: setTimeout(() => {
        press = null;
        lastLongPress = Date.now();
        suppressContext = true;
        setTimeout(() => { suppressContext = false; }, 900);
        showFor(target, x, y, true);
      }, 550)
    };
  }, true);
  const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
  document.addEventListener("pointermove", (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); }, true);
  document.addEventListener("pointerup", cancelPress, true);
  document.addEventListener("pointercancel", cancelPress, true);
  document.addEventListener("click", (e) => {
    if (Date.now() - lastLongPress < 700) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- Atalhos de teclado ---------- */

  function openShortcuts() {
    const dialog = byId("shortcutsDialog");
    const list = byId("shortcutList");
    if (!list.firstChild) {
      SHORTCUTS.forEach(([name, keys]) => {
        const row = document.createElement("div");
        row.className = "shortcut-row";
        const label = document.createElement("span");
        label.textContent = name;
        const key = document.createElement("kbd");
        key.className = "ctx-key";
        key.textContent = keys;
        row.append(label, key);
        list.append(row);
      });
    }
    if (!dialog.open) dialog.showModal();
  }

  byId("shortcutsClose").addEventListener("click", () => byId("shortcutsDialog").close());

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));

    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      if (dialogOpen) return;
      e.preventDefault();
      let target = document.activeElement || document.body;
      let x;
      let y;
      const sel = window.getSelection();
      if (target.isContentEditable && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (!range.collapsed && range.endOffset - range.startOffset === 1) {
          const node = range.startContainer.childNodes && range.startContainer.childNodes[range.startOffset];
          if (node && node.tagName === "IMG") target = node;
        }
        const box = range.getBoundingClientRect();
        if (box && (box.width || box.height)) { x = box.left; y = box.bottom; }
      }
      if (x === undefined) { const box = target.getBoundingClientRect(); x = box.left + 12; y = box.bottom - 4; }
      showFor(target, x, y, false);
      return;
    }

    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyP") { if (!printable()) { const m = C.curMode(); if (m && m.printKey && document.body.classList.contains("in-doc")) { e.preventDefault(); m.printKey(); } return; } e.preventDefault(); C.print(); return; }
    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyS") { e.preventDefault(); if (byId("home").hidden && C.cur()) C.exportProject(); return; }
    if (e.altKey && !mod && !e.shiftKey && e.code === "KeyN") { e.preventDefault(); if (!dialogOpen) newOfCurrent(); return; }
    if (e.altKey && !mod && !e.shiftKey && e.code === "KeyH") { e.preventDefault(); if (!dialogOpen) C.goHome(); return; }
    if (e.key === "?" && !mod && !e.altKey && !dialogOpen && !isEditable(e.target)) { e.preventDefault(); openShortcuts(); }
  });
})();
