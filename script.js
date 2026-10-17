/* Coding v2.0 — sem dependências externas */
(() => {
  "use strict";

  const LIB_KEY = "coding-library-v1";
  const PANEL_KEY = "coding-panel-hidden";
  const FONTS = ["Arial", "Arial Black", "Impact", "Verdana", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS", "Tahoma"];
  const MAX_ITEMS = 200;
  const MAX_COPIES = 500;
  const MAX_BLOCKS = 2000;
  const MAX_DOCS = 30;
  const PAPER = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  const MARGIN_X_MM = 14;
  const MARGIN_Y_MM = 15;

  const byId = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const toInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : fallback;
  };
  const toText = (value, fallback, limit) => typeof value === "string" ? value.slice(0, limit) : fallback;
  const toFont = (value, fallback) => FONTS.includes(value) ? value : fallback;
  const toAlign = (value, fallback) => ["left", "center", "right"].includes(value) ? value : fallback;
  const toBool = (value, fallback) => typeof value === "boolean" ? value : fallback;

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

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(LIB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.docs && typeof parsed.docs === "object") {
          const docs = {};
          Object.values(parsed.docs).slice(0, MAX_DOCS).forEach((d) => {
            if (d && typeof d.id === "string") docs[d.id] = { id: d.id, updatedAt: Number(d.updatedAt) || Date.now(), state: normalize(d.state) };
          });
          const newest = Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt)[0];
          return { currentId: docs[parsed.currentId] ? parsed.currentId : (newest ? newest.id : null), docs };
        }
      }
      // Migra o documento único das versões anteriores.
      const old = localStorage.getItem("coding-document-v2") || localStorage.getItem("coding-document-v1");
      if (old) {
        const id = uid();
        return { currentId: id, docs: { [id]: { id, updatedAt: Date.now(), state: normalize(JSON.parse(old)) } } };
      }
    } catch (_) { /* biblioteca vazia */ }
    return { currentId: null, docs: {} };
  }

  const lib = loadLibrary();
  let currentId = lib.currentId;
  let state = currentId ? lib.docs[currentId].state : normalize(defaults());

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
  let saveTimer;
  let toastTimer;
  let dirty = false;

  /* ---------- Utilidades de interface ---------- */

  function setSaved(message) { byId("saveText").textContent = message; }

  function persist() {
    if (!currentId || !lib.docs[currentId]) return;
    if (dirty) { lib.docs[currentId].updatedAt = Date.now(); dirty = false; }
    lib.currentId = currentId;
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(lib));
      setSaved("Salvo neste aparelho");
    } catch (_) {
      setSaved("Armazenamento indisponível");
    }
  }

  function flushSave() { clearTimeout(saveTimer); persist(); }

  function scheduleSave() {
    dirty = true;
    setSaved("Salvando...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  function toast(message) {
    const el = byId("toast");
    el.textContent = message;
    el.classList.toggle("sheet-collapsed", panel.classList.contains("collapsed"));
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function setTab(tab) {
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

  /* ---------- Projeto: novo, salvar, abrir ---------- */

  function exportProject() {
    const payload = { format: "coding-document", version: 2, ...state, items: state.items.map(({ code, description, copies }) => ({ code, description, copies })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (state.name.trim() || "documento").replace(/[\\/:*?"<>|]/g, "-") + ".coding.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Projeto salvo em arquivo .json.");
  }

  async function importProject(file) {
    if (file.size > 1000000) { toast("Arquivo muito grande. Limite: 1 MB."); return; }
    try {
      const loaded = JSON.parse(await file.text());
      if (!loaded || typeof loaded !== "object" || loaded.format !== "coding-document" || ![1, 2].includes(loaded.version)) {
        throw new Error("Formato inválido");
      }
      if (createDoc(loaded)) toast("Projeto aberto como um novo documento.");
    } catch (_) {
      toast("Não foi possível abrir este arquivo do Coding.");
    }
  }

  /* ---------- Documentos salvos e tela inicial ---------- */

  function openDoc(id) {
    if (!lib.docs[id]) return;
    flushSave();
    currentId = id;
    state = lib.docs[id].state;
    currentPage = 0;
    refreshFields();
    render();
    persist();
    hideHome();
    setTab("itens");
  }

  function createDoc(source) {
    if (Object.keys(lib.docs).length >= MAX_DOCS) {
      toast("Limite de " + MAX_DOCS + " documentos. Exclua algum na tela inicial.");
      return false;
    }
    flushSave();
    const id = uid();
    lib.docs[id] = { id, updatedAt: Date.now(), state: normalize(source) };
    openDoc(id);
    return true;
  }

  const homeEl = byId("home");
  const appEl = document.querySelector(".app");

  function docInfo(doc) {
    let labels = 0;
    doc.state.items.forEach((item) => { if (hasContent(item)) labels += item.copies; });
    const when = new Date(doc.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return labels + (labels === 1 ? " etiqueta" : " etiquetas") + " · " + when;
  }

  function showHome() {
    flushSave();
    const current = currentId ? lib.docs[currentId] : null;
    byId("homeContinue").hidden = !current;
    if (current) {
      byId("homeContinueName").textContent = current.state.name.trim() || "Documento sem título";
      byId("homeContinueInfo").textContent = docInfo(current);
    }
    const others = Object.values(lib.docs).filter((d) => d.id !== currentId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
    byId("homeRecent").hidden = others.length === 0;
    byId("recentList").replaceChildren(...others.map((d) => {
      const name = d.state.name.trim() || "Documento sem título";
      const li = document.createElement("li");
      li.className = "recent-item";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "recent-open";
      open.dataset.open = d.id;
      const title = document.createElement("strong");
      title.textContent = name;
      const info = document.createElement("small");
      info.textContent = docInfo(d);
      open.append(title, info);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn danger";
      del.dataset.del = d.id;
      del.setAttribute("aria-label", "Excluir " + name);
      del.title = "Excluir";
      del.innerHTML = '<svg class="icon"><use href="#ic-trash"/></svg>';
      li.append(open, del);
      return li;
    }));
    homeEl.hidden = false;
    appEl.inert = true;
    appEl.setAttribute("aria-hidden", "true");
    (current ? byId("homeContinue") : byId("homeNew")).focus({ preventScroll: true });
  }

  function hideHome() {
    homeEl.hidden = true;
    appEl.inert = false;
    appEl.removeAttribute("aria-hidden");
    requestAnimationFrame(applyZoom);
  }

  /* ---------- Ligações dos controles ---------- */

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

  function init() {
    buildFormat("codeFormat", "code");
    buildFormat("descFormat", "desc");
    refreshFields();

    byId("documentName").addEventListener("input", (e) => { state.name = e.target.value; scheduleSave(); });
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

    document.querySelectorAll("[data-step]").forEach((button) => {
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
    byId("addItem").addEventListener("click", () => {
      const item = addItem();
      if (!item) return;
      state.items.push(item);
      renderItemList(item.id);
      scheduleRender();
    });

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
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => { setCollapsed(false); setTab(tab.dataset.tab); });
    });
    byId("sheetHandle").addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));
    byId("previousPage").addEventListener("click", () => { currentPage = Math.max(0, currentPage - 1); updatePages(true); });
    byId("nextPage").addEventListener("click", () => { currentPage = Math.min(pageCount - 1, currentPage + 1); updatePages(true); });
    byId("zoomOut").addEventListener("click", () => { zoomIndex = Math.max(0, zoomIndex - 1); applyZoom(); });
    byId("zoomIn").addEventListener("click", () => { zoomIndex = Math.min(zoomLevels.length - 1, zoomIndex + 1); applyZoom(); });

    // Documento
    byId("newButton").addEventListener("click", () => { if (createDoc(defaults())) toast("Novo documento criado. O anterior continua salvo."); });
    byId("homeButton").addEventListener("click", showHome);
    byId("homeContinue").addEventListener("click", hideHome);
    byId("homeNew").addEventListener("click", () => createDoc(defaults()));
    byId("homeImport").addEventListener("click", () => byId("importInput").click());
    byId("recentList").addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      const del = e.target.closest("[data-del]");
      if (open) { openDoc(open.dataset.open); return; }
      if (del) {
        const doc = lib.docs[del.dataset.del];
        if (!doc || !window.confirm("Excluir o documento “" + (doc.state.name.trim() || "Documento sem título") + "”? Esta ação não pode ser desfeita.")) return;
        delete lib.docs[del.dataset.del];
        flushSave();
        showHome();
      }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !homeEl.hidden && currentId) hideHome(); });
    byId("exportButton").addEventListener("click", exportProject);
    byId("importButton").addEventListener("click", () => byId("importInput").click());
    byId("importInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (file) importProject(file);
    });
    printButton.addEventListener("click", () => {
      if (renderPending) render();
      if (printBlockedReason) { toast(printBlockedReason); return; }
      window.print();
    });
    window.addEventListener("beforeprint", () => { if (renderPending) render(); });

    byId("zoomIndicator").addEventListener("click", () => {
      fitMode = fitMode === "page" ? "width" : "page";
      zoomIndex = 2;
      applyZoom();
      toast(fitMode === "page" ? "Mostrando a página inteira." : "Ajustado à largura da tela.");
    });
    const togglePanel = (hide) => {
      document.querySelector(".app").classList.toggle("panel-hidden", hide);
      const toggle = byId("panelToggle");
      toggle.classList.toggle("is-on", !hide);
      toggle.setAttribute("aria-pressed", String(!hide));
      try { localStorage.setItem(PANEL_KEY, hide ? "1" : "0"); } catch (_) { /* ignorado */ }
    };
    byId("panelToggle").addEventListener("click", () => togglePanel(!document.querySelector(".app").classList.contains("panel-hidden")));
    try { if (localStorage.getItem(PANEL_KEY) === "1") togglePanel(true); } catch (_) { /* ignorado */ }
    if ("ResizeObserver" in window) new ResizeObserver(() => applyZoom()).observe(area);
    window.addEventListener("resize", () => { applyZoom(); updatePages(false); });
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", () => { applyZoom(); updatePages(false); });
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });

    setupInstall();
    setTab("itens");
    render();
    persist();
    showHome();
  }

  /* ---------- PWA ---------- */

  function setupInstall() {
    const button = byId("installButton");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let promptEvent = null;

    if (isIos && !standalone) button.hidden = false;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      promptEvent = event;
      button.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      promptEvent = null;
      button.hidden = true;
      toast("Aplicativo instalado.");
    });
    button.addEventListener("click", async () => {
      if (promptEvent) {
        promptEvent.prompt();
        try { await promptEvent.userChoice; } catch (_) { /* ignorado */ }
        promptEvent = null;
        button.hidden = true;
      } else {
        toast("No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.");
      }
    });

    const secure = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
    if ("serviceWorker" in navigator && secure) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => { /* sem suporte offline */ });
      });
    }
  }

  init();
})();
