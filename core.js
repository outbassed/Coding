/* Coding — núcleo: armazenamento (IndexedDB), biblioteca, rotas, tela inicial, carregamento */
(() => {
  "use strict";

  const LS_KEY = "coding-library-v1";
  const PANEL_KEY = "coding-panel-hidden";
  const MAX_DOCS = 30;
  const FONTS = ["Arial", "Arial Black", "Impact", "Verdana", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS", "Tahoma"];

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

  const modes = {};
  const lib = { docs: {}, currentId: null };
  let toastTimer;

  /* ---------- Tela de carregamento (HTML/CSS inline no index.html) ---------- */

  const bootEl = byId("boot");
  const bootStart = performance.now();
  let busyCount = 0;

  function bootMessage(text) {
    const el = byId("bootMsg");
    if (el) el.textContent = text || "";
  }

  function hideBootNow() {
    if (!bootEl) return;
    bootEl.classList.add("hide");
    bootEl.classList.remove("busy");
    setTimeout(() => { if (bootEl.classList.contains("hide")) bootEl.hidden = true; }, 320);
  }

  function finishBoot() {
    window.__codingReady = true;
    const wait = () => {
      // Espera o CSS (carregado sem bloquear a tela de carregamento).
      if (!window.__cssReady && performance.now() - bootStart < 7000) { setTimeout(wait, 40); return; }
      const remaining = Math.max(0, 260 - (performance.now() - bootStart));
      setTimeout(hideBootNow, remaining);
    };
    wait();
  }

  function busy(message) {
    if (!bootEl) return () => {};
    busyCount++;
    bootEl.hidden = false;
    bootEl.classList.remove("hide");
    bootEl.classList.add("busy");
    bootMessage(message || "Carregando…");
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      busyCount = Math.max(0, busyCount - 1);
      if (busyCount === 0) { bootMessage(""); hideBootNow(); }
    };
  }

  /* ---------- Armazenamento: IndexedDB com reserva em localStorage ---------- */

  const store = (() => {
    let db = null;
    let useIdb = false;

    const wrap = (request) => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const done = (tx) => new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("abortado"));
    });

    async function init() {
      if (!("indexedDB" in window)) return;
      db = await Promise.race([
        new Promise((resolve, reject) => {
          const open = indexedDB.open("coding-db", 1);
          open.onupgradeneeded = () => {
            const d = open.result;
            d.createObjectStore("docs", { keyPath: "id" });
            d.createObjectStore("meta");
            d.createObjectStore("images", { keyPath: "id" }).createIndex("docId", "docId");
          };
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
          open.onblocked = () => reject(new Error("bloqueado"));
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("tempo esgotado")), 5000))
      ]);
      useIdb = true;
    }

    function lsRead() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && parsed.docs && typeof parsed.docs === "object") {
            return { currentId: parsed.currentId || null, docs: Object.values(parsed.docs).filter((d) => d && typeof d.id === "string") };
          }
        }
        const old = localStorage.getItem("coding-document-v2") || localStorage.getItem("coding-document-v1");
        if (old) {
          const id = uid();
          return { currentId: id, docs: [{ id, type: "labels", updatedAt: Date.now(), state: JSON.parse(old) }] };
        }
      } catch (_) { /* vazio */ }
      return { currentId: null, docs: [] };
    }

    function lsWrite() {
      localStorage.setItem(LS_KEY, JSON.stringify({ currentId: lib.currentId, docs: lib.docs }));
    }

    async function loadAll() {
      if (!useIdb) {
        const data = lsRead();
        return data;
      }
      let migrated = await wrap(db.transaction("meta").objectStore("meta").get("migrated"));
      if (!migrated) {
        // Migra a biblioteca antiga (localStorage) para o IndexedDB, sem perder nada.
        const legacy = lsRead();
        if (legacy.docs.length) {
          const tx = db.transaction(["docs", "meta"], "readwrite");
          legacy.docs.forEach((d) => tx.objectStore("docs").put({ ...d, type: d.type === "texts" ? "texts" : "labels" }));
          if (legacy.currentId) tx.objectStore("meta").put(legacy.currentId, "currentId");
          tx.objectStore("meta").put(true, "migrated");
          await done(tx);
          const count = await wrap(db.transaction("docs").objectStore("docs").count());
          if (count >= legacy.docs.length) {
            try { ["coding-library-v1", "coding-document-v2", "coding-document-v1"].forEach((k) => localStorage.removeItem(k)); } catch (_) { /* ignorado */ }
          }
        } else {
          await wrap(db.transaction("meta", "readwrite").objectStore("meta").put(true, "migrated"));
        }
      }
      const docs = await wrap(db.transaction("docs").objectStore("docs").getAll());
      const currentId = await wrap(db.transaction("meta").objectStore("meta").get("currentId"));
      return { currentId: currentId || null, docs };
    }

    async function putDoc(doc) {
      if (!useIdb) { lsWrite(); return; }
      const tx = db.transaction("docs", "readwrite");
      tx.objectStore("docs").put(doc);
      await done(tx);
    }

    async function putMeta(key, value) {
      if (!useIdb) return;
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(value, key);
      await done(tx);
    }

    async function deleteDoc(id) {
      if (!useIdb) { lsWrite(); return; }
      const tx = db.transaction(["docs", "images"], "readwrite");
      tx.objectStore("docs").delete(id);
      const images = tx.objectStore("images");
      const cursor = images.index("docId").openKeyCursor(IDBKeyRange.only(id));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) { images.delete(c.primaryKey); c.continue(); }
      };
      await done(tx);
    }

    async function putImage(record) {
      if (!useIdb) throw new Error("sem armazenamento de imagens");
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(record);
      await done(tx);
    }

    async function getImages(docId) {
      if (!useIdb) return [];
      return wrap(db.transaction("images").objectStore("images").index("docId").getAll(IDBKeyRange.only(docId)));
    }

    async function deleteImages(ids) {
      if (!useIdb || !ids.length) return;
      const tx = db.transaction("images", "readwrite");
      ids.forEach((id) => tx.objectStore("images").delete(id));
      await done(tx);
    }

    return { init, loadAll, putDoc, putMeta, deleteDoc, putImage, getImages, deleteImages, get images() { return useIdb; } };
  })();

  /* ---------- Interface comum ---------- */

  const panelForToast = () => document.querySelector("#labelsWs:not([hidden]) #panel");

  function setSaved(message) { byId("saveText").textContent = message; }

  function toast(message) {
    const el = byId("toast");
    el.textContent = message;
    const panel = panelForToast();
    el.classList.toggle("sheet-collapsed", Boolean(panel && panel.classList.contains("collapsed")));
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  const cur = () => (lib.currentId ? lib.docs[lib.currentId] || null : null);
  const curMode = () => { const d = cur(); return d ? modes[d.type] : null; };

  /* ---------- Salvamento ---------- */

  let dirty = false;
  let saveTimer;
  let warnedStorage = false;

  function persist() {
    const doc = cur();
    if (!doc) return;
    const mode = modes[doc.type];
    if (mode && mode.collect) mode.collect(doc);
    if (dirty) { doc.updatedAt = Date.now(); dirty = false; }
    store.putDoc(doc)
      .then(() => store.putMeta("currentId", doc.id))
      .then(() => setSaved("Salvo neste aparelho"))
      .catch(() => {
        setSaved("Armazenamento indisponível");
        if (!warnedStorage) { warnedStorage = true; toast("Sem espaço para salvar neste aparelho. Use Salvar (.json) para guardar uma cópia."); }
      });
  }

  function flushSave() { clearTimeout(saveTimer); persist(); }

  function scheduleSave() {
    dirty = true;
    setSaved("Salvando...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  /* ---------- Rotas ---------- */

  let handledHash = null;
  let openToken = 0;

  function setRoute(hash, replace) {
    handledHash = hash;
    if (location.hash === hash) return;
    try { history[replace ? "replaceState" : "pushState"](null, "", hash); } catch (_) { /* sem histórico */ }
  }

  const slug = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function findDocId(arg) {
    if (lib.docs[arg]) return arg;
    const wanted = slug(arg);
    if (!wanted) return null;
    const hit = Object.values(lib.docs).sort((a, b) => b.updatedAt - a.updatedAt).find((d) => slug(d.state.name) === wanted);
    return hit ? hit.id : null;
  }

  /* ---------- Documentos ---------- */

  const homeEl = byId("home");
  const appEl = document.querySelector(".app");
  const toolsEl = byId("tools");
  const navEl = byId("mainNav");
  const TYPES = ["labels", "texts", "calc", "codes", "sheet", "pdf", "images"];
  const ROUTE_ALIASES = {
    labels: ["label", "labels", "etiqueta", "etiquetas"],
    texts: ["texts", "text", "texto", "textos"],
    codes: ["qr", "codigos", "codigo", "barras", "codes"],
    calc: ["planilhas", "calc", "tabela", "excel"],
    sheet: ["planilha", "sheet", "planilha-etiquetas", "etiquetas-planilha"],
    pdf: ["pdf"],
    images: ["imagens", "imagem", "images"]
  };
  const ROUTE_NAME = { labels: "label", texts: "texts", calc: "planilhas", codes: "qr", sheet: "planilha", pdf: "pdf", images: "imagens" };
  const typeFromRoute = (name) => TYPES.find((t) => ROUTE_ALIASES[t].includes(name)) || null;
  const asType = (t) => (TYPES.includes(t) ? t : "labels");
  const PROGRAMS = [
    { id: "labels", group: "editors", short: "Etiquetas", name: "Etiquetas", desc: "Códigos e descrições em A4, prontos para colar nas caixas", primary: ["Imprimir / PDF", "#ic-print"] },
    { id: "texts", group: "editors", short: "Texto", name: "Texto", desc: "Textos e imagens, como no Word", primary: ["Imprimir / PDF", "#ic-print"] },
    { id: "calc", group: "editors", short: "Planilhas", name: "Planilhas", desc: "Tabelas com fórmulas, como no Excel", primary: ["Baixar planilha", "#ic-download"] },
    { id: "codes", group: "tools", short: "QR e barras", name: "QR e código de barras", desc: "Em folha A4, vários por página", primary: ["Imprimir / PDF", "#ic-print"] },
    { id: "sheet", group: "tools", short: "Planilha → Etiquetas", name: "Planilha → Etiquetas", desc: "Uma etiqueta por linha do CSV ou Excel", primary: ["Criar etiquetas", "#ic-tag"] },
    { id: "pdf", group: "tools", short: "PDF", name: "Editor de PDF", desc: "Anotar, assinar, juntar, dividir e reordenar", primary: ["Baixar PDF", "#ic-download"] },
    { id: "images", group: "tools", short: "Imagens", name: "Imagens", desc: "Redimensionar, cortar, comprimir e converter", primary: ["Baixar tudo", "#ic-download"] }
  ];
  const NAV_KEY = "coding-nav-v1";
  const navPrefs = (() => {
    const base = { labels: true, texts: true, calc: true, codes: false, sheet: false, pdf: false, images: false };
    try { const s = JSON.parse(localStorage.getItem(NAV_KEY) || "null"); if (s && typeof s === "object") PROGRAMS.forEach((p) => { if (typeof s[p.id] === "boolean") base[p.id] = s[p.id]; }); } catch (_) { /* padrão */ }
    return base;
  })();
  const saveNavPrefs = () => { try { localStorage.setItem(NAV_KEY, JSON.stringify(navPrefs)); } catch (_) { /* sem armazenamento */ } };
  const piIcon = (id) => '<svg class="pi" aria-hidden="true"><use href="#pi-' + id + '"/></svg>';

  function renderNavPrograms() {
    const box = byId("navPrograms");
    box.replaceChildren();
    PROGRAMS.filter((p) => navPrefs[p.id]).forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nav-item nav-prog";
      b.dataset.nav = p.id;
      b.title = p.name;
      b.innerHTML = piIcon(p.id) + '<span class="nav-label"></span>';
      b.lastChild.textContent = p.short;
      box.append(b);
    });
    updateNav();
  }

  function renderToolsPage() {
    const list = byId("toolsList");
    list.replaceChildren();
    [["editors", "Editores"], ["tools", "Ferramentas"]].forEach(([group, title]) => {
      const h = document.createElement("h2");
      h.className = "home-sub tools-sub";
      h.textContent = title;
      const grid = document.createElement("div");
      grid.className = "tools-grid";
      PROGRAMS.filter((p) => p.group === group).forEach((p) => {
        const card = document.createElement("div");
        card.className = "prog-card";
        card.innerHTML = '<button class="prog-open" type="button" data-open="' + p.id + '"><span class="pi-wrap">' + piIcon(p.id) + '</span><span class="home-txt"><strong></strong><small></small></span><svg class="icon home-go"><use href="#ic-right"/></svg></button>' +
          '<label class="switch" title="Mostrar na barra lateral"><input type="checkbox" role="switch" data-switch="' + p.id + '"><span class="sw" aria-hidden="true"></span><span class="sw-text">Na barra</span></label>';
        card.querySelector("strong").textContent = p.name;
        card.querySelector("small").textContent = p.desc;
        card.querySelector("input").checked = navPrefs[p.id];
        grid.append(card);
      });
      list.append(h, grid);
    });
  }
  const TYPE_META = {};
  PROGRAMS.forEach((p) => { TYPE_META[p.id] = { icon: "#pi-" + p.id, name: p.name, short: p.short, sub: p.short, title: p.name, primary: p.primary }; });

  function showWorkspace(type) {
    TYPES.forEach((t) => { byId(t + "Ws").hidden = t !== type; });
    document.documentElement.dataset.mode = type || "";
    const meta = TYPE_META[type];
    if (meta) {
      byId("brandSub").textContent = meta.sub;
      document.title = meta.title;
      const btn = byId("printButton");
      btn.querySelector(".btn-label").textContent = meta.primary[0];
      btn.title = meta.primary[0];
      btn.querySelector("use").setAttribute("href", meta.primary[1]);
      btn.disabled = false;
    }
    byId("shareButton").hidden = !type;
  }

  function setPrimary(label, disabled) {
    const btn = byId("printButton");
    if (typeof label === "string") { btn.querySelector(".btn-label").textContent = label; btn.title = label; }
    if (typeof disabled === "boolean") btn.disabled = disabled;
  }

  async function openDoc(id, opts = {}) {
    const doc = lib.docs[id];
    if (!doc || !modes[doc.type]) return false;
    flushSave();
    const token = ++openToken;
    const mode = modes[doc.type];
    const previous = cur();
    if (previous && modes[previous.type] && modes[previous.type].close) modes[previous.type].close();
    lib.currentId = id;
    showWorkspace(doc.type);
    byId("documentName").value = doc.state.name;
    let release = null;
    const timer = setTimeout(() => { release = busy("Abrindo documento…"); }, 160);
    try {
      await mode.open(doc);
    } catch (_) {
      toast("Não foi possível abrir este documento.");
    } finally {
      clearTimeout(timer);
      if (release) release();
    }
    if (token !== openToken) return false;
    hideHome();
    persist();
    setRoute(docHash(id), opts.replace);
    return true;
  }

  function docHash(id) {
    const d = lib.docs && lib.docs[id];
    const t = d ? d.type : (cur() && cur().id === id ? cur().type : "labels");
    return "#/" + ROUTE_NAME[asType(t)] + "/" + id;
  }

  async function createDoc(type, source, opts = {}) {
    const mode = modes[type];
    if (!mode) return false;
    if (Object.keys(lib.docs).length >= MAX_DOCS) {
      toast("Limite de " + MAX_DOCS + " documentos. Exclua algum na tela inicial.");
      return false;
    }
    flushSave();
    const id = uid();
    const doc = { id, type, updatedAt: Date.now(), state: mode.normalize(source || mode.defaults()) };
    try {
      for (const image of opts.images || []) await store.putImage({ ...image, docId: id });
      lib.docs[id] = doc;
      await store.putDoc(doc);
    } catch (_) {
      lib.docs[id] = doc;
      toast("Não foi possível guardar todas as imagens neste aparelho.");
    }
    return openDoc(id, opts);
  }

  async function removeDoc(id) {
    delete lib.docs[id];
    try { await store.deleteDoc(id); } catch (_) { /* ignorado */ }
  }

  function docInfo(doc) {
    const mode = modes[doc.type];
    const when = new Date(doc.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return (mode && mode.info ? mode.info(doc) + " · " : "") + when;
  }

  /* ---------- Tela inicial (estilo Google Docs) ---------- */

  const HOME_KEY = "coding-home-v1";
  const homePrefs = (() => {
    const base = { view: "grid", sort: "recent", filter: "all" };
    try {
      const saved = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (saved.view === "list" || saved.view === "grid") base.view = saved.view;
        if (saved.sort === "name" || saved.sort === "recent") base.sort = saved.sort;
        if (typeof saved.filter === "string") base.filter = saved.filter;
      }
    } catch (_) { /* padrão */ }
    return base;
  })();
  const saveHomePrefs = () => { try { localStorage.setItem(HOME_KEY, JSON.stringify(homePrefs)); } catch (_) { /* sem armazenamento */ } };
  let searchTerm = "";
  const fold = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const clip = (text, n) => { const t = String(text || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

  function snippetOf(doc) {
    const mode = modes[doc.type];
    const st = doc.state;
    let lines = [];
    try {
      if (mode && mode.snippet) lines = mode.snippet(doc);
      else if (doc.type === "labels") lines = st.items.map((i) => [i.code, i.description].filter(Boolean).join("  "));
      else if (doc.type === "texts") {
        const t = document.createElement("template");
        t.innerHTML = String(st.html || "").replace(/<\/(p|div|h[1-6]|li|tr)>|<br\s*\/?>/gi, "\n");
        lines = t.content.textContent.split("\n");
      } else if (doc.type === "codes") lines = (st.items || []).map((i) => [i.content, i.label].filter(Boolean).join("  "));
      else if (doc.type === "sheet") lines = (st.rows || []).slice(0, 8).map((r) => (Array.isArray(r) ? r.join(" · ") : ""));
      else if (doc.type === "pdf") lines = (st.files || []).map((f) => f.name);
      else if (doc.type === "images") lines = (st.items || []).map((i) => i.name);
    } catch (_) { lines = []; }
    return lines.map((l) => clip(l, 34)).filter(Boolean).slice(0, 7);
  }

  function visibleDocs() {
    const q = fold(searchTerm.trim());
    let list = Object.values(lib.docs);
    if (homePrefs.filter === "favs") list = list.filter((d) => d.fav);
    else if (TYPES.includes(homePrefs.filter)) list = list.filter((d) => d.type === homePrefs.filter);
    if (q) list = list.filter((d) => fold(d.state.name).includes(q) || fold(TYPE_META[d.type].name).includes(q) || fold(snippetOf(d).join(" ")).includes(q));
    if (homePrefs.sort === "name") list.sort((a, b) => fold(a.state.name).localeCompare(fold(b.state.name), "pt-BR"));
    else list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }

  function renderFilter() {
    const sel = byId("homeFilter");
    const all = Object.values(lib.docs);
    if (homePrefs.filter !== "all" && homePrefs.filter !== "favs" && !TYPES.includes(homePrefs.filter)) homePrefs.filter = "all";
    const opts = [["all", "Todos os tipos (" + all.length + ")"], ["favs", "Favoritos (" + all.filter((d) => d.fav).length + ")"]]
      .concat(PROGRAMS.map((p) => [p.id, p.short + " (" + all.filter((d) => d.type === p.id).length + ")"]));
    sel.replaceChildren(...opts.map(([value, label]) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; }));
    sel.value = homePrefs.filter;
  }

  function docCard(d) {
    const name = d.state.name.trim() || "Documento sem título";
    const meta = TYPE_META[d.type];
    const li = document.createElement("li");
    li.className = "doc-card t-" + d.type + (d.id === lib.currentId ? " is-current" : "");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "doc-open";
    open.dataset.open = d.id;
    open.title = name;
    const thumb = document.createElement("span");
    thumb.className = "doc-thumb";
    const page = document.createElement("span");
    page.className = "thumb-page";
    const lines = snippetOf(d);
    if (lines.length) lines.forEach((l) => { const row = document.createElement("span"); row.textContent = l; page.append(row); });
    else page.classList.add("is-blank");
    thumb.append(page);
    const badge = document.createElement("span");
    badge.className = "thumb-type";
    badge.innerHTML = '<svg class="pi"><use href="' + meta.icon + '"/></svg>';
    thumb.append(badge);
    if (d.id === lib.currentId) { const cur = document.createElement("span"); cur.className = "thumb-open"; cur.textContent = "Aberto"; thumb.append(cur); }
    const text = document.createElement("span");
    text.className = "doc-text";
    const title = document.createElement("strong");
    title.textContent = name;
    const info = document.createElement("small");
    info.textContent = meta.short + " · " + docInfo(d);
    text.append(title, info);
    open.append(thumb, text);
    const star = document.createElement("button");
    star.type = "button";
    star.className = "icon-btn fav-btn" + (d.fav ? " is-on" : "");
    star.dataset.fav = d.id;
    star.setAttribute("aria-pressed", String(Boolean(d.fav)));
    star.setAttribute("aria-label", (d.fav ? "Remover dos favoritos: " : "Adicionar aos favoritos: ") + name);
    star.title = d.fav ? "Remover dos favoritos" : "Adicionar aos favoritos";
    star.innerHTML = '<svg class="icon"><use href="#ic-star"/></svg>';
    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn danger";
    del.dataset.del = d.id;
    del.setAttribute("aria-label", "Excluir " + name);
    del.title = "Excluir";
    del.innerHTML = '<svg class="icon"><use href="#ic-trash"/></svg>';
    const actions = document.createElement("span");
    actions.className = "doc-actions";
    actions.append(star, del);
    li.append(open, actions);
    return li;
  }

  function renderHome() {
    renderFilter();
    const grid = byId("docGrid");
    grid.className = "doc-grid" + (homePrefs.view === "list" ? " is-list" : "");
    const list = visibleDocs();
    grid.replaceChildren(...list.map(docCard));
    const empty = byId("docEmpty");
    const total = Object.keys(lib.docs).length;
    empty.hidden = list.length > 0;
    empty.textContent = !total ? "Nenhum documento ainda. Escolha um programa acima para começar."
      : searchTerm.trim() ? "Nada encontrado para “" + searchTerm.trim() + "”."
      : homePrefs.filter === "favs" ? "Nenhum favorito ainda. Toque na estrela de um documento." : "Nenhum documento deste tipo.";
    byId("docsTitle").textContent = homePrefs.filter === "favs" ? "Favoritos" : searchTerm.trim() ? "Resultados" : "Documentos recentes";
    byId("homeView").querySelector("use").setAttribute("href", homePrefs.view === "list" ? "#ic-viewgrid" : "#ic-list");
    byId("homeView").title = homePrefs.view === "list" ? "Ver em grade" : "Ver em lista";
    byId("homeSort").title = homePrefs.sort === "name" ? "Ordenado de A a Z (tocar: mais recentes)" : "Mais recentes primeiro (tocar: ordenar de A a Z)";
  }

  function toggleFav(id) {
    const doc = lib.docs[id || lib.currentId];
    if (!doc) return;
    doc.fav = !doc.fav;
    store.putDoc(doc).catch(() => setSaved("Armazenamento indisponível"));
    toast(doc.fav ? "Adicionado aos favoritos." : "Removido dos favoritos.");
    if (!homeEl.hidden) renderHome();
  }

  const isFav = () => Boolean(cur() && cur().fav);

  function showHome(opts = {}) {
    flushSave();
    setRoute("#/", opts.replace);
    if (!opts.keepSearch) { searchTerm = ""; byId("homeSearch").value = ""; }
    renderHome();
    toolsEl.hidden = true;
    homeEl.hidden = false;
    appEl.inert = true;
    appEl.setAttribute("aria-hidden", "true");
    updateNav();
    homeEl.scrollTop = 0;
    byId("homeTypes").querySelector("button").focus({ preventScroll: true });
  }

  function updateNav() {
    const inDoc = homeEl.hidden && toolsEl.hidden;
    document.body.classList.toggle("in-doc", inDoc);
    const doc = cur();
    let active = !homeEl.hidden ? "home" : !toolsEl.hidden ? "tools" : (doc ? doc.type : "home");
    if (active !== "home" && active !== "tools" && !navPrefs[active]) active = "tools";
    navEl.querySelectorAll("[data-nav]").forEach((b) => {
      if (b.dataset.nav === active && b.dataset.nav !== "menu" && b.dataset.nav !== "new") b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function showTools(opts = {}) {
    flushSave();
    setRoute("#/ferramentas", opts.replace);
    homeEl.hidden = true;
    toolsEl.hidden = false;
    appEl.inert = true;
    appEl.setAttribute("aria-hidden", "true");
    updateNav();
    byId("toolsTitle").focus({ preventScroll: true });
  }

  function openLatest(type, opts) {
    const latest = Object.values(lib.docs).filter((d) => d.type === type).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) return openDoc(latest.id, opts || {});
    return createDoc(type, null, opts || {});
  }

  function hideHome() {
    toolsEl.hidden = true;
    homeEl.hidden = true;
    appEl.inert = false;
    appEl.removeAttribute("aria-hidden");
    updateNav();
    window.dispatchEvent(new Event("coding:shown"));
  }

  function continueEditing() {
    const doc = cur();
    if (!doc) return;
    const wsVisible = !byId(asType(doc.type) + "Ws").hidden;
    if (wsVisible) { hideHome(); setRoute(docHash(doc.id)); return; }
    openDoc(doc.id);
  }

  const newDoc = (type) => createDoc(type, null);

  /* ---------- Exportar, importar e compartilhar ---------- */

  const b64uEncode = (bytes) => {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64uDecode = (token) => {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  };

  async function gzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzip(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3000000) { reader.cancel(); throw new Error("Conteúdo grande demais"); }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
    return out;
  }

  async function exportProject() {
    const doc = cur();
    if (!doc) return;
    flushSave();
    const mode = modes[doc.type];
    const release = busy("Preparando o arquivo…");
    try {
      const payload = mode.exportPayload ? await mode.exportPayload(doc) : mode.payload(doc);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (doc.state.name.trim() || "documento").replace(/[\\/:*?"<>|]/g, "-") + ".coding.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Projeto salvo em arquivo .json.");
    } catch (_) {
      toast("Não foi possível salvar o arquivo.");
    } finally {
      release();
    }
  }

  async function importData(data, opts = {}) {
    if (!data || typeof data !== "object" || data.format !== "coding-document" || ![1, 2, 3].includes(data.version)) throw new Error("Formato inválido");
    const type = asType(data.type);
    const mode = modes[type];
    const prepared = mode.prepareImport ? await mode.prepareImport(data) : { state: data, images: [] };
    return createDoc(type, prepared.state, { images: prepared.images, replace: Boolean(opts.replace) });
  }

  async function importProject(file) {
    if (file.size > 90000000) { toast("Arquivo muito grande. Limite: 90 MB."); return; }
    const release = busy("Abrindo arquivo…");
    try {
      const data = JSON.parse(await file.text());
      if (await importData(data)) toast("Projeto aberto como um novo documento.");
    } catch (_) {
      toast("Não foi possível abrir este arquivo do Coding.");
    } finally {
      release();
    }
  }

  async function buildShareUrl() {
    const doc = cur();
    const payload = modes[doc.type].payload(doc);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const token = "CompressionStream" in window ? "z." + b64uEncode(await gzip(bytes)) : "j." + b64uEncode(bytes);
    return location.origin + location.pathname + "#/importar/" + token;
  }

  async function decodeShare(token) {
    if (token.length > 40000) throw new Error("Link grande demais");
    const bytes = b64uDecode(token.slice(2));
    let raw;
    if (token.startsWith("z.") && "DecompressionStream" in window) raw = await gunzip(bytes);
    else if (token.startsWith("j.")) raw = bytes;
    else throw new Error("Formato desconhecido");
    return JSON.parse(new TextDecoder().decode(raw));
  }

  async function importFromLink(token) {
    const release = busy("Abrindo o link…");
    try {
      const data = await decodeShare(token);
      if (!data || typeof data !== "object" || data.format !== "coding-document") throw new Error("Formato inválido");
      const name = toText(data.name, "Documento", 80).trim() || "Documento";
      release();
      if (window.confirm("Abrir o documento compartilhado “" + name + "”? Ele será salvo como um novo documento neste aparelho.")) {
        data.version = 3;
        if (await importData(data, { replace: true })) return;
      }
    } catch (_) {
      release();
      toast("Este link do Coding está incompleto ou inválido.");
    }
    release();
    showHome({ replace: true });
  }

  async function copyShareLink() {
    const doc = cur();
    if (!doc) return;
    flushSave();
    const mode = modes[doc.type];
    if (mode.shareable === false) {
      const local = location.origin + location.pathname + docHash(doc.id);
      try {
        await navigator.clipboard.writeText(local);
        toast("Link copiado. Ele abre este documento só neste aparelho; para enviar a outra pessoa, use Salvar (.json).");
      } catch (_) {
        window.prompt("Copie o link do documento (abre só neste aparelho):", local);
      }
      return;
    }
    const images = mode.imageCount ? mode.imageCount(doc) : 0;
    if (images > 0 && !window.confirm("Este documento tem " + images + (images === 1 ? " imagem" : " imagens") + ". O link não leva imagens (elas aparecem como “Imagem indisponível” para quem abrir). Para levar as imagens, use Salvar (.json).\n\nCopiar o link mesmo assim?")) return;
    try {
      const url = await buildShareUrl();
      if (url.length > 16000) { toast("Documento grande demais para virar link. Use Salvar (.json)."); return; }
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copiado. Quem abrir recebe uma cópia deste documento.");
      } catch (_) {
        window.prompt("Copie o link do documento:", url);
      }
    } catch (_) {
      toast("Não foi possível gerar o link.");
    }
  }

  async function handleRoute() {
    const hash = location.hash;
    if (hash === handledHash) return;
    handledHash = hash;
    try {
      const parts = hash.replace(/^#\/?/, "").split("/");
      const name = parts[0];
      const arg = decodeURIComponent(parts.slice(1).join("/"));
      if (name === "novo") {
        await createDoc(typeFromRoute(slug(arg)) || "labels", null, { replace: true });
      } else if (name === "continuar") {
        if (cur()) await openDoc(lib.currentId, { replace: true }); else showHome({ replace: true });
      } else if (name === "doc" || typeFromRoute(name)) {
        const id = findDocId(arg);
        if (id) await openDoc(id, { replace: true });
        else { showHome({ replace: true }); toast("Documento não encontrado neste aparelho."); }
      } else if (name === "ferramentas") {
        const type = typeFromRoute(slug(arg));
        if (type) await openLatest(type, { replace: true }); else showTools({ replace: true });
      } else if (name === "importar") {
        await importFromLink(arg);
      } else {
        showHome({ replace: true });
      }
    } catch (_) {
      showHome({ replace: true });
    }
  }

  /* ---------- Impressão e atalhos do aplicativo ---------- */

  function print() {
    if (!homeEl.hidden) return;
    const mode = curMode();
    if (mode && mode.print) mode.print();
  }

  function goHome() { showHome(); }

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

  /* ---------- Início ---------- */

  function bindShell() {
    byId("documentName").addEventListener("input", (e) => {
      const doc = cur();
      if (!doc) return;
      doc.state.name = e.target.value;
      scheduleSave();
    });
    byId("newButton").addEventListener("click", async () => {
      const doc = cur();
      if (await newDoc(doc ? doc.type : "labels")) toast("Novo documento criado. O anterior continua salvo.");
    });
    byId("homeButton").addEventListener("click", goHome);
    renderToolsPage();
    renderNavPrograms();
    toolsEl.addEventListener("click", (e) => {
      const t = e.target.closest("[data-open]");
      if (!t) return;
      const k = t.dataset.open;
      openLatest(k);
    });
    toolsEl.addEventListener("change", (e) => {
      const sw = e.target.closest("[data-switch]");
      if (!sw) return;
      navPrefs[sw.dataset.switch] = sw.checked;
      saveNavPrefs();
      renderNavPrograms();
    });
    const sheet = byId("newSheet");
    const closeSheet = () => { sheet.hidden = true; };
    navEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-nav]");
      if (!b) return;
      const k = b.dataset.nav;
      if (k === "home") goHome();
      else if (k === "tools") showTools();
      else if (TYPES.includes(k)) openLatest(k);
      else if (k === "new") { sheet.hidden = false; const f = sheet.querySelector("[data-new]"); if (f) f.focus({ preventScroll: true }); }
    });
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) { closeSheet(); return; }
      const b = e.target.closest("[data-new]");
      if (!b) return;
      closeSheet();
      if (TYPES.includes(b.dataset.new)) newDoc(b.dataset.new);
      else if (b.dataset.new === "file") byId("importInput").click();
    });
    sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeSheet(); } });
    const typeButtons = (host, attr, tile) => {
      host.replaceChildren(...PROGRAMS.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute(attr, p.id);
        b.title = p.desc;
        if (tile) {
          b.className = "start-tile";
          b.innerHTML = '<span class="start-card"><svg class="pi"><use href="#pi-' + p.id + '"/></svg><span class="start-plus" aria-hidden="true">+</span></span><span class="start-name"></span>';
          b.querySelector(".start-name").textContent = p.short;
        } else {
          b.className = "home-option";
          b.innerHTML = '<span class="home-ic pi-wrap">' + piIcon(p.id) + '</span><span class="home-txt"><strong></strong><small></small></span>';
          b.querySelector("strong").textContent = p.name;
          b.querySelector("small").textContent = p.desc;
        }
        return b;
      }));
    };
    typeButtons(byId("homeTypes"), "data-newtype", true);
    byId("homeTypes").addEventListener("click", (e) => { const b = e.target.closest("[data-newtype]"); if (b) newDoc(b.dataset.newtype); });
    typeButtons(byId("newSheetList"), "data-new");
    const fileOpt = document.createElement("button");
    fileOpt.type = "button"; fileOpt.className = "home-option"; fileOpt.dataset.new = "file";
    fileOpt.innerHTML = '<span class="home-ic"><svg class="icon"><use href="#ic-upload"/></svg></span><span class="home-txt"><strong>Abrir arquivo .json</strong><small>Projeto salvo antes</small></span>';
    byId("newSheetList").append(fileOpt);
    byId("homeImport").addEventListener("click", () => byId("importInput").click());
    byId("docGrid").addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      const del = e.target.closest("[data-del]");
      const fav = e.target.closest("[data-fav]");
      if (fav) { toggleFav(fav.dataset.fav); return; }
      if (del) {
        const doc = lib.docs[del.dataset.del];
        if (!doc || !window.confirm("Excluir o documento “" + (doc.state.name.trim() || "Documento sem título") + "”? Esta ação não pode ser desfeita.")) return;
        removeDoc(del.dataset.del).then(() => { if (lib.currentId === del.dataset.del) { lib.currentId = null; persist(); } renderHome(); });
        return;
      }
      if (open) openDoc(open.dataset.open);
    });
    byId("homeSearch").addEventListener("input", (e) => { searchTerm = e.target.value; renderHome(); });
    byId("homeSearch").addEventListener("keydown", (e) => {
      if (e.key === "Escape" && e.target.value) { e.stopPropagation(); e.target.value = ""; searchTerm = ""; renderHome(); }
    });
    byId("homeFilter").addEventListener("change", (e) => { homePrefs.filter = e.target.value; saveHomePrefs(); renderHome(); });
    byId("homeSort").addEventListener("click", () => { homePrefs.sort = homePrefs.sort === "name" ? "recent" : "name"; saveHomePrefs(); renderHome(); toast(homePrefs.sort === "name" ? "Ordenado de A a Z." : "Mais recentes primeiro."); });
    byId("homeView").addEventListener("click", () => { homePrefs.view = homePrefs.view === "list" ? "grid" : "list"; saveHomePrefs(); renderHome(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (!homeEl.hidden || !toolsEl.hidden) && cur() && !document.querySelector("dialog[open]")) continueEditing(); });
    byId("exportButton").addEventListener("click", exportProject);
    byId("shareButton").addEventListener("click", copyShareLink);
    byId("importButton").addEventListener("click", () => byId("importInput").click());
    byId("importInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (file) importProject(file);
    });
    byId("printButton").addEventListener("click", print);
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("popstate", handleRoute);
  }

  async function boot() {
    setupInstall();
    bindShell();
    let loaded;
    try {
      await store.init();
      loaded = await store.loadAll();
    } catch (_) {
      try { loaded = await store.loadAll(); } catch (e) { loaded = { currentId: null, docs: [] }; }
    }
    const docs = {};
    loaded.docs.slice(0, MAX_DOCS).forEach((d) => {
      if (!d || typeof d.id !== "string") return;
      const type = asType(d.type);
      if (!modes[type]) return;
      try {
        docs[d.id] = { id: d.id, type, fav: d.fav === true, updatedAt: Number(d.updatedAt) || Date.now(), state: modes[type].normalize(d.state) };
      } catch (_) { /* documento corrompido é ignorado */ }
    });
    lib.docs = docs;
    const newest = Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    lib.currentId = docs[loaded.currentId] ? loaded.currentId : (newest ? newest.id : null);
    if (!store.images) document.documentElement.dataset.noImages = "1";
    await handleRoute();
    finishBoot();
  }

  window.Coding = {
    util: { byId, clamp, uid, toInt, toText, toFont, toAlign, toBool, FONTS },
    lib, store, modes,
    register(mode) { modes[mode.type] = mode; },
    toast, setSaved, scheduleSave, flushSave, busy,
    setPrimary, asType, programs: PROGRAMS, primaryLabel() { const d = cur(); return d ? TYPE_META[d.type].primary[0] : "Imprimir / PDF"; }, cur, curMode, toggleFav, isFav, openDoc, createDoc, newDoc, goHome, print, exportProject, copyShareLink,
    openImport() { byId("importInput").click(); },
    PANEL_KEY
  };

  const start = () => { boot().catch((error) => { console.error(error); bootMessage("Não foi possível iniciar o aplicativo."); const retry = byId("bootRetry"); if (retry) retry.hidden = false; }); };
  if (document.readyState === "complete") start(); else document.addEventListener("DOMContentLoaded", start);
})();
