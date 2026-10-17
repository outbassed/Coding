/* Coding v1.0 — sem dependências externas */
(() => {
  "use strict";

  const STORAGE_KEY = "coding-document-v1";
  const FONTS = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS", "Tahoma"];
  const DEFAULTS = Object.freeze({
    name: "Meu documento",
    code: "190847",
    description: "ARVORE NATAL CANADA\n1350TIPS 240CM VERDE\nGRILLO 66439004",
    repeats: 3,
    gap: 8,
    codeFont: "Arial",
    codeSize: 40,
    codeBold: true,
    codeItalic: false,
    codeAlign: "center",
    descFont: "Arial",
    descSize: 34,
    descBold: false,
    descItalic: false,
    descAlign: "center"
  });

  const byId = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : fallback;
  };
  const string = (value, fallback, limit) => typeof value === "string" ? value.slice(0, limit) : fallback;
  const font = (value, fallback) => FONTS.includes(value) ? value : fallback;
  const align = (value, fallback) => ["left", "center", "right"].includes(value) ? value : fallback;

  function normalize(source) {
    const obj = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    return {
      name: string(obj.name, DEFAULTS.name, 80),
      code: string(obj.code, DEFAULTS.code, 160),
      description: string(obj.description, DEFAULTS.description, 6000),
      repeats: number(obj.repeats, DEFAULTS.repeats, 1, 500),
      gap: number(obj.gap, DEFAULTS.gap, 0, 25),
      codeFont: font(obj.codeFont, DEFAULTS.codeFont),
      codeSize: number(obj.codeSize, DEFAULTS.codeSize, 8, 96),
      codeBold: typeof obj.codeBold === "boolean" ? obj.codeBold : DEFAULTS.codeBold,
      codeItalic: typeof obj.codeItalic === "boolean" ? obj.codeItalic : DEFAULTS.codeItalic,
      codeAlign: align(obj.codeAlign, DEFAULTS.codeAlign),
      descFont: font(obj.descFont, DEFAULTS.descFont),
      descSize: number(obj.descSize, DEFAULTS.descSize, 8, 96),
      descBold: typeof obj.descBold === "boolean" ? obj.descBold : DEFAULTS.descBold,
      descItalic: typeof obj.descItalic === "boolean" ? obj.descItalic : DEFAULTS.descItalic,
      descAlign: align(obj.descAlign, DEFAULTS.descAlign)
    };
  }

  let state;
  try {
    state = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULTS);
  } catch (_) {
    state = normalize(DEFAULTS);
  }

  const sheets = byId("pages");
  const area = byId("sheetsArea");
  const measureHost = byId("measureHost");
  const warning = byId("warning");
  const printButton = byId("printButton");
  const mobileQuery = window.matchMedia("(max-width: 700px)");
  const zoomLevels = [0.6, 0.75, 1, 1.25, 1.5, 2];
  let zoomIndex = 2;
  let currentPage = 0;
  let pageCount = 1;
  let printBlocked = false;
  let renderPending = false;
  let saveTimer;
  let toastTimer;

  function setSavedStatus(message) {
    byId("saveStatus").lastChild.textContent = " " + message;
  }

  function scheduleSave() {
    setSavedStatus("Salvando...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSavedStatus("Salvo no navegador");
      } catch (_) {
        setSavedStatus("Armazenamento indisponível");
      }
    }, 300);
  }

  function toast(message) {
    const el = byId("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }

  function refreshFields() {
    const bindings = {
      documentName: state.name, codeInput: state.code,
      descriptionInput: state.description, codeFont: state.codeFont,
      codeSize: state.codeSize, descFont: state.descFont,
      descSize: state.descSize, repeatCount: state.repeats, blockGap: state.gap
    };
    Object.entries(bindings).forEach(([id, value]) => { byId(id).value = value; });
    [["codeBold", "codeBold"], ["codeItalic", "codeItalic"], ["descBold", "descBold"], ["descItalic", "descItalic"]].forEach(([id, key]) => {
      byId(id).classList.toggle("is-active", state[key]);
      byId(id).setAttribute("aria-pressed", String(state[key]));
    });
    [["codeAlignButtons", "codeAlign"], ["descAlignButtons", "descAlign"]].forEach(([id, key]) => {
      byId(id).querySelectorAll("[data-align]").forEach((button) => {
        const active = button.dataset.align === state[key];
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    });
  }

  function setTab(tab) {
    document.querySelectorAll(".tool-tab").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tool-panel").forEach((panel) => {
      const active = panel.dataset.panel === tab;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  function makeEntry() {
    const entry = document.createElement("section");
    entry.className = "product-entry";
    const code = document.createElement("p");
    code.className = "product-code";
    code.textContent = "COD: " + state.code;
    code.style.fontFamily = '"' + state.codeFont + '", Arial, sans-serif';
    code.style.fontSize = state.codeSize + "pt";
    code.style.fontWeight = state.codeBold ? "700" : "400";
    code.style.fontStyle = state.codeItalic ? "italic" : "normal";
    code.style.textAlign = state.codeAlign;

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = state.description;
    description.style.fontFamily = '"' + state.descFont + '", Arial, sans-serif';
    description.style.fontSize = state.descSize + "pt";
    description.style.fontWeight = state.descBold ? "700" : "400";
    description.style.fontStyle = state.descItalic ? "italic" : "normal";
    description.style.textAlign = state.descAlign;
    entry.append(code, description);
    return entry;
  }

  function mmInPixels() {
    const ruler = document.createElement("div");
    ruler.style.cssText = "height:100mm;width:1mm;";
    measureHost.replaceChildren(ruler);
    const height = ruler.getBoundingClientRect().height;
    return height / 100;
  }

  function render() {
    renderPending = false;
    const pxPerMm = mmInPixels();
    measureHost.replaceChildren(makeEntry());
    const entryHeight = measureHost.firstChild.getBoundingClientRect().height;
    // 297 mm menos 15 mm de margem superior e inferior; tolerância evita corte por arredondamento.
    const capacity = 267 * pxPerMm - 3;
    const gap = state.gap * pxPerMm;
    printBlocked = entryHeight > capacity;

    const perPage = printBlocked ? 1 : Math.max(1, Math.floor((capacity + gap) / (entryHeight + gap)));
    pageCount = Math.ceil(state.repeats / perPage);
    currentPage = clamp(currentPage, 0, Math.max(0, pageCount - 1));

    const fragment = document.createDocumentFragment();
    let remaining = state.repeats;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const frame = document.createElement("div");
      frame.className = "page-frame";
      frame.setAttribute("aria-label", "Folha " + (pageIndex + 1));
      const paper = document.createElement("div");
      paper.className = "paper";
      const body = document.createElement("div");
      body.className = "paper-body";
      body.style.gap = state.gap + "mm";
      const count = Math.min(perPage, remaining);
      for (let item = 0; item < count; item++) body.append(makeEntry());
      remaining -= count;
      paper.append(body);
      frame.append(paper);
      fragment.append(frame);
    }
    sheets.replaceChildren(fragment);
    measureHost.replaceChildren();

    warning.hidden = !printBlocked;
    byId("warningText").textContent = printBlocked ?
      "Este bloco é maior que a área imprimível de uma folha A4. Reduza a fonte do código ou da descrição, ou diminua o texto para imprimir sem cortes." : "";
    printButton.disabled = printBlocked;

    byId("pageSummary").textContent = "A4 · " + pageCount + (pageCount === 1 ? " página" : " páginas");
    byId("blockSummary").textContent = state.repeats + (state.repeats === 1 ? " repetição" : " repetições");
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
    const first = sheets.querySelector(".paper");
    if (!first) return;
    const naturalWidth = first.offsetWidth;
    const naturalHeight = first.offsetHeight;
    const available = Math.max(180, area.clientWidth - (mobileQuery.matches ? 18 : 44));
    const fit = Math.min(0.95, available / naturalWidth);
    const scale = fit * zoomLevels[zoomIndex];
    sheets.querySelectorAll(".page-frame").forEach((frame) => {
      frame.style.width = naturalWidth * scale + "px";
      frame.style.height = naturalHeight * scale + "px";
      frame.firstElementChild.style.transform = "scale(" + scale + ")";
    });
    byId("zoomIndicator").textContent = Math.round(scale * 100) + "%";
    byId("zoomOut").disabled = zoomIndex === 0;
    byId("zoomIn").disabled = zoomIndex === zoomLevels.length - 1;
  }

  function updatePages(scrollToPage) {
    sheets.querySelectorAll(".page-frame").forEach((frame, index) => {
      frame.classList.toggle("mobile-inactive", mobileQuery.matches && index !== currentPage);
    });
    byId("pageIndicator").textContent = (currentPage + 1) + " / " + pageCount;
    byId("previousPage").disabled = currentPage === 0;
    byId("nextPage").disabled = currentPage >= pageCount - 1;
    if (scrollToPage) {
      if (mobileQuery.matches) {
        area.scrollTo({ left: 0, top: 0, behavior: "smooth" });
      } else {
        const frame = sheets.children[currentPage];
        if (frame) frame.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
  }

  function bindText(id, key) {
    byId(id).addEventListener("input", (event) => {
      state[key] = event.target.value;
      scheduleRender();
    });
  }

  function bindNumber(id, key, min, max) {
    const input = byId(id);
    const update = () => {
      const n = Number(input.value);
      if (!input.value.trim() || !Number.isFinite(n)) return;
      const next = number(n, state[key], min, max);
      if (state[key] !== next) {
        state[key] = next;
        scheduleRender();
      }
    };
    input.addEventListener("input", update);
    input.addEventListener("change", () => {
      update();
      input.value = state[key];
    });
    input.addEventListener("blur", () => { input.value = state[key]; });
  }

  function init() {
    for (const id of ["codeFont", "descFont"]) {
      const select = byId(id);
      FONTS.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.append(option);
      });
    }
    refreshFields();
    [["documentName", "name"], ["codeInput", "code"], ["descriptionInput", "description"]].forEach(([id, key]) => bindText(id, key));
    [["codeSize", "codeSize", 8, 96], ["descSize", "descSize", 8, 96], ["repeatCount", "repeats", 1, 500], ["blockGap", "gap", 0, 25]].forEach(([id, key, min, max]) => bindNumber(id, key, min, max));
    [["codeFont", "codeFont"], ["descFont", "descFont"]].forEach(([id, key]) => {
      byId(id).addEventListener("change", (event) => {
        state[key] = font(event.target.value, DEFAULTS[key]);
        scheduleRender();
      });
    });
    ["codeBold", "codeItalic", "descBold", "descItalic"].forEach((key) => {
      byId(key).addEventListener("click", () => {
        state[key] = !state[key];
        refreshFields();
        scheduleRender();
      });
    });
    [["codeAlignButtons", "codeAlign"], ["descAlignButtons", "descAlign"]].forEach(([id, key]) => {
      byId(id).addEventListener("click", (event) => {
        const button = event.target.closest("[data-align]");
        if (!button) return;
        state[key] = button.dataset.align;
        refreshFields();
        scheduleRender();
      });
    });
    document.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const [id, amount] = button.dataset.step.split(":");
        const control = byId(id);
        const min = Number(control.min);
        const max = Number(control.max);
        const val = clamp((Number(control.value) || min) + Number(amount), min, max);
        control.value = val;
        control.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    document.querySelectorAll(".tool-tab").forEach((tab) => {
      tab.addEventListener("click", () => setTab(tab.dataset.tab));
    });
    byId("previousPage").addEventListener("click", () => {
      currentPage = Math.max(0, currentPage - 1);
      updatePages(true);
    });
    byId("nextPage").addEventListener("click", () => {
      currentPage = Math.min(pageCount - 1, currentPage + 1);
      updatePages(true);
    });
    byId("zoomOut").addEventListener("click", () => {
      zoomIndex = Math.max(0, zoomIndex - 1);
      applyZoom();
    });
    byId("zoomIn").addEventListener("click", () => {
      zoomIndex = Math.min(zoomLevels.length - 1, zoomIndex + 1);
      applyZoom();
    });

    byId("newButton").addEventListener("click", () => {
      if (!window.confirm("Criar um novo documento? Exporte o atual se quiser guardar uma cópia separada.")) return;
      state = normalize({ ...DEFAULTS, name: "Documento sem título", code: "", description: "", repeats: 1 });
      currentPage = 0;
      refreshFields();
      scheduleRender();
      setTab("codigo");
      toast("Novo documento criado.");
    });

    byId("exportButton").addEventListener("click", () => {
      const content = JSON.stringify({ format: "coding-document", version: 1, ...state }, null, 2);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = (state.name.trim() || "documento").replace(/[\\/:*?"<>|]/g, "-");
      link.download = safeName + ".coding.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Projeto exportado em JSON.");
    });
    byId("importButton").addEventListener("click", () => byId("importInput").click());
    byId("importInput").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > 200000) { toast("Arquivo muito grande. Limite: 200 KB."); return; }
      try {
        const loaded = JSON.parse(await file.text());
        if (!loaded || typeof loaded !== "object" || loaded.format !== "coding-document" || loaded.version !== 1) {
          throw new Error("Formato inválido");
        }
        if (!window.confirm("Substituir o documento atual pelo arquivo selecionado?")) return;
        state = normalize(loaded);
        currentPage = 0;
        refreshFields();
        scheduleRender();
        toast("Projeto aberto com sucesso.");
      } catch (_) {
        toast("Não foi possível abrir este arquivo do Coding.");
      }
    });
    printButton.addEventListener("click", () => {
      if (printBlocked) { toast("Ajuste o tamanho do texto antes de imprimir."); return; }
      window.print();
    });
    window.addEventListener("resize", () => {
      applyZoom();
      updatePages(false);
    });
    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener("change", () => { applyZoom(); updatePages(false); });
    }
    window.addEventListener("beforeunload", () => {
      clearTimeout(saveTimer);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    });
    setTab("codigo");
    render();
  }

  init();
})();