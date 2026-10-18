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
    ["Imprimir / PDF", "Ctrl+P"],
    ["Salvar projeto (.json)", "Ctrl+S"],
    ["Novo documento", "Alt+N"],
    ["Tela inicial", "Alt+H"],
    ["Mostrar esta lista", "?"],
    ["Textos: negrito", "Ctrl+B"],
    ["Textos: itálico", "Ctrl+I"],
    ["Textos: sublinhado", "Ctrl+U"],
    ["Textos: desfazer", "Ctrl+Z"],
    ["Textos: refazer", "Ctrl+Y"],
    ["Textos: colar sem formatação", "Ctrl+V"],
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

  function close(restoreFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    const target = opener;
    opener = null;
    if (restoreFocus && target && document.contains(target) && typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  function focusable() { return Array.from(menu.querySelectorAll('[role^="menuitem"]:not(:disabled)')); }

  function open(list, x, y, touch) {
    close(false);
    const items = clean(list);
    if (!items.length) return;
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    menu.classList.toggle("touch", Boolean(touch));
    items.forEach((item) => {
      if (item.sep) {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        sep.setAttribute("role", "separator");
        menu.append(sep);
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
      menu.append(button);
    });
    openedAt = performance.now();
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.maxHeight = window.innerHeight - 16 + "px";
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    const first = focusable()[0];
    if (first) first.focus({ preventScroll: true });
  }

  menu.addEventListener("keydown", (e) => {
    const items = focusable();
    const index = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(index + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(index - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") { e.preventDefault(); close(true); }
  });

  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(false); }, true);
  document.addEventListener("scroll", (e) => { if (!menu.hidden && !menu.contains(e.target) && performance.now() - openedAt > 400) close(false); }, true);
  window.addEventListener("wheel", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(false); }, { passive: true });
  window.addEventListener("resize", () => close(false));
  window.addEventListener("blur", () => close(false));

  /* ---------- Conteúdo ---------- */

  function generalItems(onHome) {
    const doc = C.cur();
    if (onHome) {
      return [
        { label: "Nova etiqueta", run: () => C.newDoc("labels") },
        { label: "Novo texto", run: () => C.newDoc("texts") },
        { label: "Abrir arquivo (.json)…", run: C.openImport },
        { sep: true },
        { label: "Atalhos do teclado", shortcut: "?", run: openShortcuts }
      ];
    }
    const items = [
      { label: "Novo documento", shortcut: "Alt+N", run: newOfCurrent },
      { label: "Tela inicial", shortcut: "Alt+H", run: C.goHome },
      { sep: true },
      { label: "Imprimir / PDF", shortcut: "Ctrl+P", run: C.print, disabled: !doc },
      { label: "Copiar link do documento", run: C.copyShareLink, disabled: !doc },
      { label: "Salvar projeto (.json)", shortcut: "Ctrl+S", run: C.exportProject, disabled: !doc },
      { label: "Abrir arquivo (.json)…", run: C.openImport },
      { sep: true }
    ];
    const mode = C.curMode();
    if (mode && mode.viewItems) items.push(...mode.viewItems(), { sep: true });
    items.push({ label: "Atalhos do teclado", shortcut: "?", run: openShortcuts });
    return items;
  }

  function newOfCurrent() {
    const doc = C.cur();
    return C.newDoc(doc ? doc.type : "labels");
  }

  function showFor(target, x, y, touch) {
    const onHome = !byId("home").hidden;
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
    if (target.closest("#ctxMenu")) { e.preventDefault(); return; }
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
    if (!(target instanceof Element) || target.closest("dialog, #ctxMenu") || isField(target)) return;
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

    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyP") { e.preventDefault(); C.print(); return; }
    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyS") { e.preventDefault(); if (byId("home").hidden && C.cur()) C.exportProject(); return; }
    if (e.altKey && !mod && !e.shiftKey && e.code === "KeyN") { e.preventDefault(); if (!dialogOpen) newOfCurrent(); return; }
    if (e.altKey && !mod && !e.shiftKey && e.code === "KeyH") { e.preventDefault(); if (!dialogOpen) C.goHome(); return; }
    if (e.key === "?" && !mod && !e.altKey && !dialogOpen && !isEditable(e.target)) { e.preventDefault(); openShortcuts(); }
  });
})();
