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
  const TYPE_META = {
    labels: { icon: "#ic-tag", name: "Coding Etiquetas", sub: "Etiquetas A4", title: "Coding Etiquetas" },
    texts: { icon: "#ic-text", name: "Coding Textos", sub: "Textos", title: "Coding Textos" }
  };

  function showWorkspace(type) {
    byId("labelsWs").hidden = type !== "labels";
    byId("textsWs").hidden = type !== "texts";
    document.documentElement.dataset.mode = type || "";
    const meta = TYPE_META[type];
    if (meta) {
      byId("brandSub").textContent = meta.sub;
      document.title = meta.title;
    }
    byId("shareButton").hidden = !type;
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
    setRoute("#/doc/" + id, opts.replace);
    return true;
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

  const HISTORY_LIMIT = 10;
  let showAllHistory = false;

  function docRow(d) {
    const name = d.state.name.trim() || "Documento sem título";
    const li = document.createElement("li");
    li.className = "recent-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "recent-open";
    open.dataset.open = d.id;
    const typeIcon = document.createElement("span");
    typeIcon.className = "recent-type";
    typeIcon.title = TYPE_META[d.type].name;
    typeIcon.innerHTML = '<svg class="icon"><use href="' + TYPE_META[d.type].icon + '"/></svg>';
    const text = document.createElement("span");
    text.className = "recent-text";
    const title = document.createElement("strong");
    title.textContent = name;
    const info = document.createElement("small");
    info.textContent = TYPE_META[d.type].name + " · " + docInfo(d);
    text.append(title, info);
    open.append(typeIcon, text);
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
    li.append(open, star, del);
    return li;
  }

  function toggleFav(id) {
    const doc = lib.docs[id || lib.currentId];
    if (!doc) return;
    doc.fav = !doc.fav;
    store.putDoc(doc).catch(() => setSaved("Armazenamento indisponível"));
    toast(doc.fav ? "Adicionado aos favoritos." : "Removido dos favoritos.");
    if (!homeEl.hidden) showHome({ keep: true, replace: true });
  }

  const isFav = () => Boolean(cur() && cur().fav);

  function showHome(opts = {}) {
    if (!opts.keep) showAllHistory = false;
    flushSave();
    setRoute("#/", opts.replace);
    const current = cur();
    byId("homeContinue").hidden = !current;
    if (current) {
      byId("homeContinueName").textContent = current.state.name.trim() || "Documento sem título";
      byId("homeContinueInfo").textContent = TYPE_META[current.type].name + " · " + docInfo(current);
      byId("homeContinueIcon").innerHTML = '<svg class="icon"><use href="' + TYPE_META[current.type].icon + '"/></svg>';
    }
    const all = Object.values(lib.docs).sort((a, b) => b.updatedAt - a.updatedAt);
    const favs = all.filter((d) => d.fav);
    const history = all.filter((d) => d.id !== lib.currentId && !d.fav);
    byId("homeFavs").hidden = favs.length === 0;
    byId("favList").replaceChildren(...favs.map(docRow));
    const visible = showAllHistory ? history : history.slice(0, HISTORY_LIMIT);
    byId("homeRecent").hidden = history.length === 0;
    byId("recentList").replaceChildren(...visible.map(docRow));
    const more = byId("moreRecent");
    more.hidden = history.length <= HISTORY_LIMIT;
    more.textContent = showAllHistory ? "Ver menos" : "Ver mais (" + (history.length - HISTORY_LIMIT) + ")";
    more.setAttribute("aria-expanded", String(showAllHistory));
    homeEl.hidden = false;
    appEl.inert = true;
    appEl.setAttribute("aria-hidden", "true");
    (current ? byId("homeContinue") : byId("homeNewLabels")).focus({ preventScroll: true });
  }

  function hideHome() {
    homeEl.hidden = true;
    appEl.inert = false;
    appEl.removeAttribute("aria-hidden");
    window.dispatchEvent(new Event("coding:shown"));
  }

  function continueEditing() {
    const doc = cur();
    if (!doc) return;
    const wsVisible = !byId(doc.type === "texts" ? "textsWs" : "labelsWs").hidden;
    if (wsVisible) { hideHome(); setRoute("#/doc/" + doc.id); return; }
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
    const type = data.type === "texts" ? "texts" : "labels";
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
        const kind = slug(arg);
        await createDoc(["texts", "text", "texto", "textos"].includes(kind) ? "texts" : "labels", null, { replace: true });
      } else if (name === "continuar") {
        if (cur()) await openDoc(lib.currentId, { replace: true }); else showHome({ replace: true });
      } else if (name === "doc") {
        const id = findDocId(arg);
        if (id) await openDoc(id, { replace: true });
        else { showHome({ replace: true }); toast("Documento não encontrado neste aparelho."); }
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
    byId("homeContinue").addEventListener("click", continueEditing);
    byId("homeNewLabels").addEventListener("click", () => newDoc("labels"));
    byId("homeNewTexts").addEventListener("click", () => newDoc("texts"));
    byId("homeImport").addEventListener("click", () => byId("importInput").click());
    const rowClick = (e) => {
      const open = e.target.closest("[data-open]");
      const del = e.target.closest("[data-del]");
      const fav = e.target.closest("[data-fav]");
      if (open) { openDoc(open.dataset.open); return; }
      if (fav) { toggleFav(fav.dataset.fav); return; }
      if (del) {
        const doc = lib.docs[del.dataset.del];
        if (!doc || !window.confirm("Excluir o documento “" + (doc.state.name.trim() || "Documento sem título") + "”? Esta ação não pode ser desfeita.")) return;
        removeDoc(del.dataset.del).then(() => showHome());
      }
    };
    byId("recentList").addEventListener("click", rowClick);
    byId("favList").addEventListener("click", rowClick);
    byId("moreRecent").addEventListener("click", () => { showAllHistory = !showAllHistory; showHome({ keep: true, replace: true }); byId("moreRecent").focus({ preventScroll: true }); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !homeEl.hidden && cur() && !document.querySelector("dialog[open]")) continueEditing(); });
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
      const type = d.type === "texts" ? "texts" : "labels";
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
    cur, curMode, toggleFav, isFav, openDoc, createDoc, newDoc, goHome, print, exportProject, copyShareLink,
    openImport() { byId("importInput").click(); },
    PANEL_KEY
  };

  const start = () => { boot().catch((error) => { console.error(error); bootMessage("Não foi possível iniciar o aplicativo."); const retry = byId("bootRetry"); if (retry) retry.hidden = false; }); };
  if (document.readyState === "complete") start(); else document.addEventListener("DOMContentLoaded", start);
})();
