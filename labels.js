/* Coding — modo Etiquetas */
(() => {
  "use strict";

  const C = window.Coding;
  const { byId, clamp, uid, toInt, toText, toFont, toAlign, toBool, FONTS } = C.util;
  const scheduleSave = C.scheduleSave;
  const toast = C.toast;
  const PANEL_KEY = C.PANEL_KEY;
  const MAX_ITEMS = 200;
  const MAX_COPIES = 500;
  const MAX_BLOCKS = 2000;
  const PAPER = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  const MARGIN_X_MM = 14;
  const MARGIN_Y_MM = 15;

  function defaults() {
    return {
      name: "Documento sem título",
      items: [{ id: uid(), code: "123", description: "Sua descrição aqui", copies: 3 }],
      prefix: "COD: ",
      orientation: "portrait",
      cols: 1,
      gap: 1,
      border: true,
      codeFont: "Arial", codeSize: 40, codeBold: true, codeItalic: false, codeAlign: "center",
      descFont: "Arial", descSize: 34, descBold: false, descItalic: false, descAlign: "center"
    };
  }

  function normalizeItem(raw) {
    const o = raw && typeof raw === "object" ? raw : {};
    return {
      id: uid(),
      code: toText(o.code, "", 160),
      description: toText(o.description, "", 2000),
      copies: toInt(o.copies, 1, 1, MAX_COPIES)
    };
  }

  function normalize(source) {
    const base = defaults();
    const o = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const legacy = !Array.isArray(o.items);
    let items;
    if (Array.isArray(o.items)) {
      items = o.items.slice(0, MAX_ITEMS).map(normalizeItem);
    } else if ("code" in o || "description" in o) {
      // Projeto da versão 1: um único código com N repetições.
      items = [normalizeItem({ code: o.code, description: o.description, copies: o.repeats })];
    } else {
      items = base.items;
    }
    if (!items.length) items = [normalizeItem({})];
    return {
      name: toText(o.name, base.name, 80),
      items,
      prefix: toText(o.prefix, base.prefix, 30),
      orientation: o.orientation === "landscape" ? "landscape" : "portrait",
      cols: toInt(o.cols, base.cols, 1, 3),
      gap: toInt(o.gap, base.gap, 0, 25),
      border: toBool(o.border, legacy ? false : base.border),
      codeFont: toFont(o.codeFont, base.codeFont),
      codeSize: toInt(o.codeSize, base.codeSize, 8, 96),
      codeBold: toBool(o.codeBold, base.codeBold),
      codeItalic: toBool(o.codeItalic, base.codeItalic),
      codeAlign: toAlign(o.codeAlign, base.codeAlign),
      descFont: toFont(o.descFont, base.descFont),
      descSize: toInt(o.descSize, base.descSize, 8, 96),
      descBold: toBool(o.descBold, base.descBold),
      descItalic: toBool(o.descItalic, base.descItalic),
      descAlign: toAlign(o.descAlign, base.descAlign)
    };
  }

  let state = normalize(defaults());
  const root = byId("labelsWs");
  const pagesEl = byId("pages");
  const area = byId("sheetsArea");
  const measureHost = byId("measureHost");
  const warning = byId("warning");
  const printButton = byId("printButton");
  const panel = byId("panel");
  const itemList = byId("itemList");
  const mobileQuery = window.matchMedia("(max-width: 899px)");
  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let zoomIndex = 2;
  let fitMode = mobileQuery.matches ? "width" : "page"; // "page" = folha inteira visível
  let currentPage = 0;
  let pageCount = 1;
  let printBlockedReason = "";
  let renderPending = false;

  let curTab = "itens";
  function setTab(tab) {
    curTab = tab;
    if (C.shell && C.shell.mq.matches && document.querySelector("#labelsWs.sh-on")) return; // no celular, quem troca de aba é a folha inferior
    document.querySelectorAll(".tab").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".pane").forEach((pane) => {
      const active = pane.dataset.pane === tab;
      pane.hidden = !active;
      pane.classList.toggle("is-active", active);
    });
    byId("panelBody").scrollTop = 0;
  }

  function setCollapsed(collapsed) {
    panel.classList.toggle("collapsed", collapsed);
    byId("sheetHandle").setAttribute("aria-expanded", String(!collapsed));
  }

  /* ---------- Formato (código / descrição) ---------- */

  function buildFormat(containerId, p) {
    const label = p === "code" ? "código" : "descrição";
    byId(containerId).innerHTML =
      '<div class="field span-2"><label for="' + p + 'Font">Fonte</label><select id="' + p + 'Font"></select></div>' +
      '<div class="field"><label for="' + p + 'Size">Tamanho (pt)</label><div class="stepper-box">' +
        '<button class="step" type="button" data-step="' + p + 'Size:-1" aria-label="Diminuir tamanho do ' + label + '"><svg class="icon"><use href="#ic-minus"/></svg></button>' +
        '<input id="' + p + 'Size" type="number" min="8" max="96" step="1" inputmode="numeric">' +
        '<button class="step" type="button" data-step="' + p + 'Size:1" aria-label="Aumentar tamanho do ' + label + '"><svg class="icon"><use href="#ic-plus"/></svg></button>' +
      '</div></div>' +
      '<div class="field"><span class="field-label">Estilo</span><div class="toggle-group">' +
        '<button id="' + p + 'Bold" class="toggle-bold" type="button" aria-pressed="false" title="Negrito">B</button>' +
        '<button id="' + p + 'Italic" class="toggle-italic" type="button" aria-pressed="false" title="Itálico">I</button>' +
      '</div></div>' +
      '<div class="field span-2"><span class="field-label">Alinhamento</span><div class="toggle-group" id="' + p + 'AlignButtons">' +
        '<button data-align="left" type="button" title="À esquerda" aria-label="À esquerda"><svg class="icon"><use href="#ic-alignleft"/></svg></button>' +
        '<button data-align="center" type="button" title="Centralizado" aria-label="Centralizado"><svg class="icon"><use href="#ic-center"/></svg></button>' +
        '<button data-align="right" type="button" title="À direita" aria-label="À direita"><svg class="icon"><use href="#ic-alignright"/></svg></button>' +
      '</div></div>';
    const select = byId(p + "Font");
    FONTS.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    });
  }

  function applyOrientation() {
    document.documentElement.dataset.paper = state.orientation;
    byId("pageStyle").textContent = "@page { size: A4 " + state.orientation + "; margin: 0; }";
  }

  function refreshFields() {
    byId("documentName").value = state.name;
    byId("prefixInput").value = state.prefix;
    byId("blockGap").value = state.gap;
    byId("borderToggle").checked = state.border;
    ["code", "desc"].forEach((p) => {
      byId(p + "Font").value = state[p + "Font"];
      byId(p + "Size").value = state[p + "Size"];
      ["Bold", "Italic"].forEach((s) => {
        const on = state[p + s];
        byId(p + s).classList.toggle("is-active", on);
        byId(p + s).setAttribute("aria-pressed", String(on));
      });
      byId(p + "AlignButtons").querySelectorAll("[data-align]").forEach((button) => {
        const on = button.dataset.align === state[p + "Align"];
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", String(on));
      });
    });
    byId("colsGroup").querySelectorAll("[data-cols]").forEach((button) => {
      const on = Number(button.dataset.cols) === state.cols;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    byId("orientGroup").querySelectorAll("[data-orient]").forEach((button) => {
      const on = button.dataset.orient === state.orientation;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    byId("paperDims").textContent = state.orientation === "landscape" ? "A4 · 297 × 210 mm" : "A4 · 210 × 297 mm";
    applyOrientation();
    renderItemList();
  }

  /* ---------- Lista de itens ---------- */

  function renderItemList(focusId) {
    const fragment = document.createDocumentFragment();
    state.items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "item-card";
      li.dataset.id = item.id;
      const key = item.id;
      li.innerHTML =
        '<div class="item-head"><span class="item-number">Item ' + (index + 1) + '</span>' +
          '<button class="icon-btn" type="button" data-act="up" aria-label="Subir item" title="Subir"><svg class="icon"><use href="#ic-up"/></svg></button>' +
          '<button class="icon-btn" type="button" data-act="down" aria-label="Descer item" title="Descer"><svg class="icon"><use href="#ic-down"/></svg></button>' +
          '<button class="icon-btn" type="button" data-act="dup" aria-label="Duplicar item" title="Duplicar"><svg class="icon"><use href="#ic-copy"/></svg></button>' +
          '<button class="icon-btn danger" type="button" data-act="del" aria-label="Excluir item" title="Excluir"><svg class="icon"><use href="#ic-trash"/></svg></button>' +
        '</div>' +
        '<div class="item-fields">' +
          '<div class="field"><label for="c-' + key + '">Código</label><input id="c-' + key + '" type="text" data-f="code" maxlength="160" autocomplete="off" spellcheck="false" placeholder="Ex.: 190847"></div>' +
          '<div class="field"><label for="n-' + key + '">Cópias</label><div class="stepper-box">' +
            '<button class="step" type="button" data-act="dec" aria-label="Menos uma cópia"><svg class="icon"><use href="#ic-minus"/></svg></button>' +
            '<input id="n-' + key + '" type="number" data-f="copies" min="1" max="' + MAX_COPIES + '" step="1" inputmode="numeric">' +
            '<button class="step" type="button" data-act="inc" aria-label="Mais uma cópia"><svg class="icon"><use href="#ic-plus"/></svg></button>' +
          '</div></div>' +
          '<div class="field full"><label for="d-' + key + '">Descrição</label><textarea id="d-' + key + '" data-f="description" rows="2" maxlength="2000" spellcheck="false" placeholder="Descrição do produto (pode usar várias linhas)"></textarea></div>' +
        '</div>';
      li.querySelector('[data-f="code"]').value = item.code;
      li.querySelector('[data-f="copies"]').value = item.copies;
      li.querySelector('[data-f="description"]').value = item.description;
      li.querySelector('[data-act="up"]').disabled = index === 0;
      li.querySelector('[data-act="down"]').disabled = index === state.items.length - 1;
      fragment.append(li);
    });
    itemList.replaceChildren(fragment);
    byId("itemCount").textContent = String(state.items.length);
    if (focusId) {
      const card = itemList.querySelector('[data-id="' + focusId + '"]');
      if (card) {
        card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const input = card.querySelector('[data-f="code"]');
        if (input) input.focus({ preventScroll: true });
      }
    }
  }

  function findItem(el) {
    const card = el.closest(".item-card");
    if (!card) return null;
    const index = state.items.findIndex((item) => item.id === card.dataset.id);
    return index < 0 ? null : { card, index, item: state.items[index] };
  }

  function addItem(source) {
    if (state.items.length >= MAX_ITEMS) { toast("Limite de " + MAX_ITEMS + " itens por documento."); return null; }
    const item = source ? { ...source, id: uid() } : normalizeItem({});
    return item;
  }

  function onItemAction(button) {
    const found = findItem(button);
    if (!found) return;
    const { card, index, item } = found;
    const act = button.dataset.act;
    if (act === "inc" || act === "dec") {
      item.copies = clamp(item.copies + (act === "inc" ? 1 : -1), 1, MAX_COPIES);
      card.querySelector('[data-f="copies"]').value = item.copies;
      scheduleRender();
      return;
    }
    if (act === "up" && index > 0) {
      [state.items[index - 1], state.items[index]] = [state.items[index], state.items[index - 1]];
    } else if (act === "down" && index < state.items.length - 1) {
      [state.items[index + 1], state.items[index]] = [state.items[index], state.items[index + 1]];
    } else if (act === "dup") {
      const copy = addItem(item);
      if (!copy) return;
      state.items.splice(index + 1, 0, copy);
      renderItemList(copy.id);
      scheduleRender();
      return;
    } else if (act === "del") {
      if (state.items.length === 1) {
        Object.assign(item, { code: "", description: "", copies: 1 });
        toast("Item limpo. O documento mantém ao menos um item.");
      } else {
        state.items.splice(index, 1);
        toast("Item excluído.");
      }
    } else {
      return;
    }
    renderItemList();
    scheduleRender();
  }

  function parseBulk(text) {
    return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
      let parts;
      if (line.includes("\t")) parts = line.split("\t");
      else if (line.includes(";")) parts = line.split(";");
      else parts = [line];
      parts = parts.map((s) => s.trim());
      return normalizeItem({ code: parts[0], description: parts[1], copies: parts[2] ? parseInt(parts[2], 10) : 1 });
    });
  }

  function applyBulk(replace) {
    const parsed = parseBulk(byId("bulkText").value);
    if (!parsed.length) { toast("Cole ao menos uma linha."); return; }
    const base = replace ? [] : state.items.filter((item) => item.code.trim() || item.description.trim());
    let merged = base.concat(parsed);
    let trimmed = false;
    if (merged.length > MAX_ITEMS) { merged = merged.slice(0, MAX_ITEMS); trimmed = true; }
    state.items = merged;
    byId("bulkDialog").close();
    byId("bulkText").value = "";
    renderItemList();
    scheduleRender();
    setTab("itens");
    toast(parsed.length + (parsed.length === 1 ? " item adicionado." : " itens adicionados.") + (trimmed ? " Lista limitada a " + MAX_ITEMS + "." : ""));
  }

  /* ---------- Etiquetas e paginação ---------- */

  const hasContent = (item) => item.code.trim() !== "" || item.description.trim() !== "";

  function makeEntry(item) {
    const entry = document.createElement("section");
    entry.className = "entry" + (state.border ? " bordered" : "");
    if (item.code.trim()) {
      const code = document.createElement("p");
      code.className = "code";
      code.textContent = state.prefix + item.code;
      styleText(code, "code");
      entry.append(code);
    }
    if (item.description.trim()) {
      const desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = item.description;
      styleText(desc, "desc");
      entry.append(desc);
    }
    return entry;
  }

  function styleText(el, p) {
    el.style.fontFamily = '"' + state[p + "Font"] + '", Arial, sans-serif';
    el.style.fontSize = state[p + "Size"] + "pt";
    el.style.fontWeight = state[p + "Bold"] ? "700" : "400";
    el.style.fontStyle = state[p + "Italic"] ? "italic" : "normal";
    el.style.textAlign = state[p + "Align"];
  }

  function mmInPixels() {
    const ruler = document.createElement("div");
    ruler.style.cssText = "height:100mm;width:1mm;";
    measureHost.replaceChildren(ruler);
    return ruler.getBoundingClientRect().height / 100;
  }

  function render() {
    renderPending = false;
    applyOrientation();
    const cols = state.cols;
    const gapMm = state.gap;
    const pxPerMm = mmInPixels();
    const contentWidth = PAPER[state.orientation].w - 2 * MARGIN_X_MM;
    const contentHeight = PAPER[state.orientation].h - 2 * MARGIN_Y_MM;
    const colWidth = cols === 1 ? contentWidth : (contentWidth - gapMm * (cols - 1)) / cols;
    measureHost.style.width = colWidth + "mm";

    const active = state.items.filter(hasContent);
    const probes = active.map(makeEntry);
    measureHost.replaceChildren(...probes);
    const heights = probes.map((el) => el.getBoundingClientRect().height);
    measureHost.replaceChildren();

    const capacity = contentHeight * pxPerMm - 3; // tolerância contra arredondamento
    const gap = gapMm * pxPerMm;

    let total = 0;
    active.forEach((item) => { total += item.copies; });
    const sequence = [];
    active.forEach((item, idx) => {
      for (let k = 0; k < item.copies && sequence.length < MAX_BLOCKS; k++) sequence.push(idx);
    });

    const oversized = [];
    active.forEach((item, idx) => {
      if (heights[idx] > capacity) oversized.push(state.items.indexOf(item) + 1);
    });

    // Agrupa em linhas e distribui nas folhas sem separar uma etiqueta.
    const pages = [];
    let current = [];
    let used = 0;
    for (let i = 0; i < sequence.length; i += cols) {
      const row = sequence.slice(i, i + cols);
      const rowHeight = Math.max(...row.map((idx) => heights[idx]));
      const need = (current.length ? gap : 0) + rowHeight;
      if (current.length && used + need > capacity) {
        pages.push(current);
        current = [];
        used = 0;
      }
      used += (current.length ? gap : 0) + rowHeight;
      current.push(row);
    }
    if (current.length) pages.push(current);
    if (!pages.length) pages.push([]);

    pageCount = pages.length;
    currentPage = clamp(currentPage, 0, pageCount - 1);

    const fragment = document.createDocumentFragment();
    pages.forEach((rows, pageIndex) => {
      const frame = document.createElement("div");
      frame.className = "page-frame";
      frame.setAttribute("aria-label", "Folha " + (pageIndex + 1));
      const paper = document.createElement("div");
      paper.className = "paper";
      const body = document.createElement("div");
      body.className = "paper-body";
      body.style.gap = gapMm + "mm";
      rows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "row";
        rowEl.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
        rowEl.style.columnGap = gapMm + "mm";
        row.forEach((idx) => rowEl.append(makeEntry(active[idx])));
        body.append(rowEl);
      });
      paper.append(body);
      frame.append(paper);
      fragment.append(frame);
    });
    pagesEl.replaceChildren(fragment);

    let message = "";
    printBlockedReason = "";
    if (!active.length) {
      printBlockedReason = message = "Preencha o código ou a descrição de ao menos um item para imprimir.";
    } else if (oversized.length) {
      printBlockedReason = message = (oversized.length === 1 ? "A etiqueta do item " : "As etiquetas dos itens ") + oversized.join(", ") +
        (oversized.length === 1 ? " é maior" : " são maiores") + " que a área imprimível. Reduza a fonte ou o texto" + (cols > 1 ? ", ou use menos colunas" : "") + ".";
    } else if (total > MAX_BLOCKS) {
      printBlockedReason = message = "O documento tem " + total + " etiquetas. O limite é " + MAX_BLOCKS + "; reduza as cópias.";
    }
    warning.hidden = !message;
    byId("warningText").textContent = message;
    printButton.disabled = Boolean(printBlockedReason);

    byId("blockSummary").textContent = sequence.length + (sequence.length === 1 ? " etiqueta" : " etiquetas") + " · " + active.length + (active.length === 1 ? " item" : " itens");
    applyZoom();
    updatePages(false);
  }

  function scheduleRender() {
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(render);
    }
    scheduleSave();
  }

  function applyZoom() {
    const first = pagesEl.querySelector(".paper");
    if (!first) return;
    const naturalWidth = first.offsetWidth;
    const naturalHeight = first.offsetHeight;
    const fitWidth = Math.max(180, area.clientWidth - (mobileQuery.matches ? 16 : 28)) / naturalWidth;
    const fitHeight = Math.max(180, area.clientHeight - 26) / naturalHeight;
    const fit = Math.min(1.8, fitMode === "page" ? Math.min(fitWidth, fitHeight) : fitWidth);
    const scale = fit * zoomLevels[zoomIndex];
    pagesEl.querySelectorAll(".page-frame").forEach((frame) => {
      frame.style.width = naturalWidth * scale + "px";
      frame.style.height = naturalHeight * scale + "px";
      frame.firstElementChild.style.transform = "scale(" + scale + ")";
    });
    byId("zoomIndicator").textContent = Math.round(scale * 100) + "%";
    byId("zoomIndicator").title = fitMode === "page" ? "Página inteira. Clique para ajustar à largura" : "Ajustado à largura. Clique para ver a página inteira";
    byId("zoomOut").disabled = zoomIndex === 0;
    byId("zoomIn").disabled = zoomIndex === zoomLevels.length - 1;
  }

  function updatePages(scrollToPage) {
    pagesEl.querySelectorAll(".page-frame").forEach((frame, index) => {
      frame.classList.toggle("mobile-inactive", mobileQuery.matches && index !== currentPage);
    });
    byId("pageIndicator").textContent = "Página " + (currentPage + 1) + " de " + pageCount;
    byId("previousPage").disabled = currentPage === 0;
    byId("nextPage").disabled = currentPage >= pageCount - 1;
    if (scrollToPage) {
      if (mobileQuery.matches) {
        area.scrollTo({ left: 0, top: 0, behavior: "smooth" });
      } else {
        const frame = pagesEl.children[currentPage];
        if (frame) frame.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
  }
  function bindStepper(inputId, key, min, max) {
    const input = byId(inputId);
    const update = () => {
      if (!input.value.trim()) return;
      const next = toInt(input.value, state[key], min, max);
      if (state[key] !== next) { state[key] = next; scheduleRender(); }
    };
    input.addEventListener("input", update);
    input.addEventListener("change", () => { update(); input.value = state[key]; });
    input.addEventListener("blur", () => { input.value = state[key]; });
  }

  /* ---------- Integração com o núcleo ---------- */

  const hasItemContent = hasContent;

  function payload(doc) {
    const s = doc.state;
    return { format: "coding-document", version: 2, type: "labels", ...s, items: s.items.map(({ code, description, copies }) => ({ code, description, copies })) };
  }

  function info(doc) {
    let labels = 0;
    doc.state.items.forEach((item) => { if (hasItemContent(item)) labels += item.copies; });
    return labels + (labels === 1 ? " etiqueta" : " etiquetas");
  }

  function open(doc) {
    state = doc.state;
    currentPage = 0;
    refreshFields();
    setTab("itens");
    render();
    byId("labelsWs").scrollTop = 0;
  }

  function print() {
    if (renderPending) render();
    if (printBlockedReason) { toast(printBlockedReason); return; }
    window.print();
  }

  function togglePanelHidden(force) {
    const app = document.querySelector(".app");
    const hide = typeof force === "boolean" ? force : !app.classList.contains("panel-hidden");
    app.classList.toggle("panel-hidden", hide);
    const toggle = byId("panelToggle");
    toggle.classList.toggle("is-on", !hide);
    toggle.setAttribute("aria-pressed", String(!hide));
    try { localStorage.setItem(PANEL_KEY, hide ? "1" : "0"); } catch (_) { /* ignorado */ }
    requestAnimationFrame(applyZoom);
  }

  function zoomBy(delta) { zoomIndex = clamp(zoomIndex + delta, 0, zoomLevels.length - 1); applyZoom(); }
  function fitPage() { fitMode = "page"; zoomIndex = 2; applyZoom(); }

  function addItemAndFocus() {
    const item = addItem();
    if (!item) return;
    state.items.push(item);
    renderItemList(item.id);
    scheduleRender();
  }

  function menuItems(target) {
    const card = target.closest && target.closest(".item-card");
    if (card && root.contains(card)) {
      const found = findItem(card);
      const act = (name) => () => { const button = card.querySelector('[data-act="' + name + '"]'); if (button && !button.disabled) onItemAction(button); };
      return [
        { label: "Adicionar item", run: addItemAndFocus },
        { label: "Duplicar item", run: act("dup") },
        { sep: true },
        { label: "Subir item", run: act("up"), disabled: !found || found.index === 0 },
        { label: "Descer item", run: act("down"), disabled: !found || found.index === state.items.length - 1 },
        { sep: true },
        { label: "Excluir item", run: act("del"), danger: true }
      ];
    }
    if (target.closest && target.closest("#sheetsArea") && root.contains(target)) {
      const setCols = (n) => () => { state.cols = n; refreshFields(); scheduleRender(); };
      return [
        { label: state.orientation === "portrait" ? "Folha na horizontal (paisagem)" : "Folha na vertical (retrato)", run: () => { state.orientation = state.orientation === "portrait" ? "landscape" : "portrait"; refreshFields(); scheduleRender(); } },
        { label: "1 coluna", check: state.cols === 1, run: setCols(1) },
        { label: "2 colunas", check: state.cols === 2, run: setCols(2) },
        { label: "3 colunas", check: state.cols === 3, run: setCols(3) },
        { label: "Linha de corte", check: state.border, run: () => { state.border = !state.border; refreshFields(); scheduleRender(); } },
        { sep: true },
        { label: "Adicionar item", run: addItemAndFocus },
        { label: "Imprimir / PDF", shortcut: "Ctrl+P", run: print }
      ];
    }
    return null;
  }

  function viewItems() {
    const hidden = document.querySelector(".app").classList.contains("panel-hidden");
    const items = [];
    if (!mobileQuery.matches) items.push({ label: hidden ? "Mostrar o editor" : "Ocultar o editor", run: () => togglePanelHidden() });
    items.push({ label: "Aumentar zoom", run: () => zoomBy(1) }, { label: "Diminuir zoom", run: () => zoomBy(-1) }, { label: "Página inteira", run: fitPage });
    return items;
  }

  function init() {
    buildFormat("codeFormat", "code");
    buildFormat("descFormat", "desc");
    refreshFields();

    byId("prefixInput").addEventListener("input", (e) => { state.prefix = e.target.value; scheduleRender(); });
    bindStepper("blockGap", "gap", 0, 25);
    bindStepper("codeSize", "codeSize", 8, 96);
    bindStepper("descSize", "descSize", 8, 96);

    ["code", "desc"].forEach((p) => {
      byId(p + "Font").addEventListener("change", (e) => { state[p + "Font"] = toFont(e.target.value, state[p + "Font"]); scheduleRender(); });
      ["Bold", "Italic"].forEach((s) => {
        byId(p + s).addEventListener("click", () => { state[p + s] = !state[p + s]; refreshFields(); scheduleRender(); });
      });
      byId(p + "AlignButtons").addEventListener("click", (e) => {
        const button = e.target.closest("[data-align]");
        if (!button) return;
        state[p + "Align"] = button.dataset.align;
        refreshFields();
        scheduleRender();
      });
    });

    byId("colsGroup").addEventListener("click", (e) => {
      const button = e.target.closest("[data-cols]");
      if (!button) return;
      state.cols = toInt(button.dataset.cols, 1, 1, 3);
      refreshFields();
      scheduleRender();
    });
    byId("orientGroup").addEventListener("click", (e) => {
      const button = e.target.closest("[data-orient]");
      if (!button) return;
      state.orientation = button.dataset.orient === "landscape" ? "landscape" : "portrait";
      refreshFields();
      scheduleRender();
    });
    byId("borderToggle").addEventListener("change", (e) => { state.border = e.target.checked; scheduleRender(); });

    root.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const [id, amount] = button.dataset.step.split(":");
        const control = byId(id);
        const min = Number(control.min);
        const max = Number(control.max);
        control.value = clamp((Number(control.value) || min) + Number(amount), min, max);
        control.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    // Itens (delegação, para não perder o foco ao digitar)
    itemList.addEventListener("input", (e) => {
      const field = e.target.dataset.f;
      const found = findItem(e.target);
      if (!field || !found) return;
      if (field === "copies") {
        if (!e.target.value.trim()) return;
        found.item.copies = toInt(e.target.value, found.item.copies, 1, MAX_COPIES);
      } else {
        found.item[field] = e.target.value;
      }
      scheduleRender();
    });
    itemList.addEventListener("focusout", (e) => {
      if (e.target.dataset.f !== "copies") return;
      const found = findItem(e.target);
      if (found) e.target.value = found.item.copies;
    });
    itemList.addEventListener("click", (e) => {
      const button = e.target.closest("[data-act]");
      if (button) onItemAction(button);
    });
    byId("addItem").addEventListener("click", addItemAndFocus);

    // Colar lista
    const dialog = byId("bulkDialog");
    byId("bulkButton").addEventListener("click", () => { dialog.showModal(); byId("bulkText").focus(); });
    byId("bulkCancel").addEventListener("click", () => dialog.close());
    byId("bulkAppend").addEventListener("click", () => applyBulk(false));
    byId("bulkReplace").addEventListener("click", () => {
      if (state.items.some(hasContent) && !window.confirm("Substituir todos os itens atuais pela lista colada?")) return;
      applyBulk(true);
    });

    // Abas, painel e navegação
    root.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => { setCollapsed(false); setTab(tab.dataset.tab); });
    });
    byId("sheetHandle").addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));
    byId("previousPage").addEventListener("click", () => { currentPage = Math.max(0, currentPage - 1); updatePages(true); });
    byId("nextPage").addEventListener("click", () => { currentPage = Math.min(pageCount - 1, currentPage + 1); updatePages(true); });
    byId("zoomOut").addEventListener("click", () => zoomBy(-1));
    byId("zoomIn").addEventListener("click", () => zoomBy(1));

    window.addEventListener("beforeprint", () => { if (!root.hidden && renderPending) render(); });

    byId("zoomIndicator").addEventListener("click", () => {
      fitMode = fitMode === "page" ? "width" : "page";
      zoomIndex = 2;
      applyZoom();
      toast(fitMode === "page" ? "Mostrando a página inteira." : "Ajustado à largura da tela.");
    });
    byId("panelToggle").addEventListener("click", () => togglePanelHidden());
    try { if (localStorage.getItem(PANEL_KEY) === "1") togglePanelHidden(true); } catch (_) { /* ignorado */ }
    if ("ResizeObserver" in window) new ResizeObserver(() => { if (!root.hidden) applyZoom(); }).observe(area);
    window.addEventListener("resize", () => { if (root.hidden) return; applyZoom(); updatePages(false); });
    window.addEventListener("coding:shown", () => { if (!root.hidden) requestAnimationFrame(applyZoom); });
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", () => { if (root.hidden) return; applyZoom(); updatePages(false); });

    setTab("itens");
    // Celular: os controles vão para a folha inferior compartilhada (Itens / Formato / Página / Imprimir-PDF)
    const printPane = document.createElement("div");
    printPane.className = "lb-print";
    printPane.innerHTML =
      '<p class="hint" id="lbPrintInfo">Confira a pré-visualização acima. A impressão usa o tamanho real das etiquetas.</p>' +
      '<button id="lbPrintM" class="btn primary" type="button"><svg class="icon" aria-hidden="true"><use href="#ic-print"/></svg><span>Imprimir ou salvar em PDF</span></button>' +
      '<p class="hint">No diálogo de impressão do celular, escolha "Salvar como PDF" para gerar o arquivo.</p>';
    printPane.querySelector("#lbPrintM").addEventListener("click", () => byId("printButton").click());
    // na folha, cada seção fica sempre "visível" (quem esconde é a aba); no desktop volta ao normal
    const sec = (name) => { const el = root.querySelector('.pane[data-pane="' + name + '"]'); el.hidden = false; return el; };
    C.shell.mq.addEventListener("change", () => { if (!C.shell.mq.matches) setTab(curTab); });
    C.shell.create({
      ws: root, id: "etiquetas", host: root, label: "Controles das etiquetas",
      tabs: [
        { key: "itens", label: "Itens", icon: "ic-list", nodes: () => [sec("itens")] },
        { key: "formato", label: "Formato", icon: "ic-type", nodes: () => [sec("formato")] },
        { key: "pagina", label: "Página", icon: "ic-page", nodes: () => [sec("pagina")] },
        { key: "imprimir", label: "Imprimir / PDF", icon: "ic-print", nodes: () => [printPane] }
      ]
    });
    C.register({
      type: "labels",
      defaults, normalize, payload, info, open, print, menuItems, viewItems,
      close() {},
      zoomBy, fitPage
    });
  }

  init();
})();
