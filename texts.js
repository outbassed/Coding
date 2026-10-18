/* Coding — modo Texts: editor de texto básico com imagens */
(() => {
  "use strict";

  const C = window.Coding;
  const { byId, clamp, uid, toInt, toText, FONTS } = C.util;
  const toast = C.toast;

  const MAX_IMAGES = 30;
  const MAX_HTML = 1500000;
  const MAX_IMAGE_FILE = 40 * 1024 * 1024;
  const IMAGE_SIDE = 1600;
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const PAPER = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  const MARGIN_X = 18;
  const MARGIN_Y = 20;
  const PX_MM = 96 / 25.4;
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const ID_RE = /^[a-z0-9]{4,24}$/;
  const EMPTY = "<p><br></p>";

  const root = byId("textsWs");
  const editor = byId("txEditor");
  const sheet = byId("txSheet");
  const wrap = byId("txWrap");
  const scroll = byId("txScroll");
  const markers = byId("txMarkers");
  const overlay = byId("imgOverlay");
  const imgBar = byId("imgBar");
  const toolbar = byId("txToolbar");

  let state = defaults();
  let docId = null;
  let openToken = 0;
  const urls = new Map();   // id da imagem -> object URL
  const metas = new Map();  // id da imagem -> { w, h }
  let selImg = null;
  let savedRange = null;
  let zoomIndex = 2;
  let scale = 1;
  let histTimer = null;
  let statsTimer = null;
  let toolbarFrame = 0;
  let internalDrag = false;
  let replaceTarget = null;
  let drag = null;
  const hist = { items: [], idx: -1 };

  function defaults() {
    return { name: "Texto sem título", orientation: "portrait", html: EMPTY };
  }

  /* ---------- Sanitização (links e arquivos importados são dados não confiáveis) ---------- */

  const SKIP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "LINK", "META", "HEAD", "TITLE", "CANVAS", "VIDEO", "AUDIO", "TEXTAREA", "SELECT", "INPUT", "BUTTON", "FORM", "OPTION"]);
  const BLOCKISH = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "TBODY", "THEAD", "TFOOT", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE", "NAV", "FIGURE", "FIGCAPTION", "HR"]);
  const FONT_TAG_SIZES = [0, 8, 10, 12, 14, 18, 24, 36];

  function cleanColor(value) {
    const v = String(value).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(v);
    return m ? "rgb(" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n))).join(",") + ")" : "";
  }

  function cleanFamily(value) {
    const first = String(value).split(",")[0].trim().replace(/^["']|["']$/g, "");
    return FONTS.includes(first) ? first : "";
  }

  function cleanStyle(text, isBlock) {
    const out = [];
    String(text || "").split(";").forEach((part) => {
      const i = part.indexOf(":");
      if (i < 0) return;
      const key = part.slice(0, i).trim().toLowerCase();
      const value = part.slice(i + 1).trim();
      if (key === "font-weight") { if (/^(bold|bolder|[6-9]00)$/.test(value)) out.push("font-weight:bold"); }
      else if (key === "font-style") { if (value === "italic" || value === "oblique") out.push("font-style:italic"); }
      else if (key === "text-decoration" || key === "text-decoration-line") { if (/underline/.test(value)) out.push("text-decoration:underline"); }
      else if (key === "font-family") { const f = cleanFamily(value); if (f) out.push('font-family:"' + f + '"'); }
      else if (key === "font-size") {
        const m = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value);
        if (m) out.push("font-size:" + clamp(Math.round((m[2] === "px" ? Number(m[1]) * 0.75 : Number(m[1])) * 2) / 2, 6, 200) + "pt");
      }
      else if (key === "color") { const c = cleanColor(value); if (c) out.push("color:" + c); }
      else if (key === "text-align") { if (isBlock && /^(left|center|right|justify)$/.test(value)) out.push("text-align:" + value); }
    });
    return out.join(";");
  }

  function hasBlockChild(node) {
    return Boolean(node.querySelector && node.querySelector("p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,pre"));
  }

  // ctx: "root" | "block" (parágrafo/título) | "inline" | "li"
  function build(source, target, ctx, depth) {
    source.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        if ((ctx === "root" || ctx === "list") && !node.nodeValue.trim()) return;
        target.appendChild(document.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      if (depth > 24) { target.appendChild(document.createTextNode(node.textContent || "")); return; }
      const blockCtx = ctx === "root";

      if (tag === "BR") { target.appendChild(document.createElement("br")); return; }

      if (tag === "IMG") {
        const id = node.getAttribute("data-img") || "";
        if (!ID_RE.test(id)) return;
        const img = document.createElement("img");
        img.setAttribute("data-img", id);
        img.setAttribute("data-w", String(Math.round(clamp(parseFloat(node.getAttribute("data-w")) || 50, 5, 100))));
        img.setAttribute("data-ratio", clamp(parseFloat(node.getAttribute("data-ratio")) || 1.5, 0.05, 20).toFixed(3));
        target.appendChild(img);
        return;
      }

      if (tag === "B" || tag === "STRONG" || tag === "I" || tag === "EM" || tag === "U") {
        const el = document.createElement(tag === "B" || tag === "STRONG" ? "strong" : tag === "U" ? "u" : "em");
        build(node, el, "inline", depth + 1);
        target.appendChild(el);
        return;
      }

      if (tag === "SPAN" || tag === "FONT") {
        const el = document.createElement("span");
        let style = cleanStyle(node.getAttribute("style"), false);
        if (tag === "FONT") {
          const face = cleanFamily(node.getAttribute("face") || "");
          const color = cleanColor(node.getAttribute("color") || "");
          const size = FONT_TAG_SIZES[Number(node.getAttribute("size"))] || 0;
          style = [style, face && 'font-family:"' + face + '"', color && "color:" + color, size && "font-size:" + size + "pt"].filter(Boolean).join(";");
        }
        if (style) el.setAttribute("style", style);
        build(node, el, "inline", depth + 1);
        target.appendChild(el);
        return;
      }

      if (tag === "UL" || tag === "OL") {
        if (ctx === "inline") { build(node, target, ctx, depth + 1); return; }
        const list = document.createElement(tag.toLowerCase());
        build(node, list, "list", depth + 1);
        Array.from(list.childNodes).forEach((child) => {
          if (child.nodeType === 1 && child.tagName === "LI") return;
          const li = document.createElement("li");
          list.replaceChild(li, child);
          li.appendChild(child);
        });
        target.appendChild(list);
        return;
      }

      if (tag === "LI") {
        if (ctx === "list") {
          const li = document.createElement("li");
          const style = cleanStyle(node.getAttribute("style"), true);
          if (style) li.setAttribute("style", style);
          build(node, li, "li", depth + 1);
          target.appendChild(li);
        } else {
          build(node, target, ctx, depth + 1);
          target.appendChild(document.createElement("br"));
        }
        return;
      }

      if (BLOCKISH.has(tag)) {
        const heading = /^H[1-6]$/.test(tag);
        // Blocos dentro de itens de lista ou de texto corrido viram quebras de linha.
        if (ctx === "inline" || ctx === "li" || ctx === "list") {
          build(node, target, ctx === "list" ? "li" : ctx, depth + 1);
          if (node.nextSibling) target.appendChild(document.createElement("br"));
          return;
        }
        if (tag === "UL" || tag === "OL") return;
        if (blockCtx && !heading && tag !== "P" && hasBlockChild(node)) { build(node, target, ctx, depth + 1); return; }
        const el = document.createElement(tag === "H1" ? "h1" : heading ? "h2" : "p");
        const style = cleanStyle(node.getAttribute("style"), true);
        if (style) el.setAttribute("style", style);
        build(node, el, "inline", depth + 1);
        target.appendChild(el);
        return;
      }

      // Qualquer outra marcação (links, tabelas...) perde a tag e mantém o conteúdo.
      build(node, target, ctx, depth + 1);
    });
  }

  function finishBlocks(el) {
    // Agrupa conteúdo solto na raiz em parágrafos e garante que nenhum bloco fique vazio.
    const out = document.createElement("div");
    let run = null;
    Array.from(el.childNodes).forEach((node) => {
      const isBlock = node.nodeType === 1 && /^(P|H1|H2|UL|OL)$/.test(node.tagName);
      if (isBlock) { run = null; out.appendChild(node); return; }
      if (node.nodeType === 3 && !node.nodeValue.trim() && !run) return;
      if (!run) { run = document.createElement("p"); out.appendChild(run); }
      run.appendChild(node);
    });
    out.querySelectorAll("p,h1,h2,li").forEach((block) => { if (!block.firstChild) block.appendChild(document.createElement("br")); });
    out.querySelectorAll("ul,ol").forEach((list) => { if (!list.firstChild) list.remove(); });
    if (!out.firstChild) out.innerHTML = EMPTY;
    return out.innerHTML;
  }

  function sanitize(html) {
    if (typeof html !== "string" || !html.trim() || html.length > MAX_HTML) return EMPTY;
    const parsed = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    const out = document.createElement("div");
    build(parsed.body, out, "root", 0);
    return finishBlocks(out);
  }

  function normalize(source) {
    const o = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    return {
      name: toText(o.name, "Texto sem título", 80),
      orientation: o.orientation === "landscape" ? "landscape" : "portrait",
      html: sanitize(o.html)
    };
  }

  /* ---------- Imagens ---------- */

  const MISSING_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><g fill="none" stroke="#8793a6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><rect x="162" y="82" width="76" height="62" rx="8"/><circle cx="184" cy="104" r="6"/><path d="m162 134 22-20 16 14 12-9 26 22"/></g><text x="200" y="196" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#5c677a">Imagem indisponível</text></svg>');
  const BLANK_SVG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>');

  function imageIds(html) {
    const ids = new Set();
    String(html).replace(/data-img="([a-z0-9]+)"/g, (_, id) => { ids.add(id); return ""; });
    return ids;
  }

  function hydrate(container, printMode) {
    container.querySelectorAll("img").forEach((img) => {
      const id = img.getAttribute("data-img");
      if (!id) { img.remove(); return; }
      const w = clamp(parseFloat(img.dataset.w) || 50, 5, 100);
      const ratio = clamp(parseFloat(img.dataset.ratio) || 1.5, 0.05, 20);
      img.style.width = w + "%";
      img.style.aspectRatio = String(ratio);
      img.draggable = true;
      const url = urls.get(id);
      if (url) {
        img.removeAttribute("data-missing");
        if (img.getAttribute("src") !== url) img.setAttribute("src", url);
        img.alt = "Imagem";
      } else {
        img.setAttribute("data-missing", "1");
        const wanted = printMode ? BLANK_SVG : MISSING_SVG;
        if (img.getAttribute("src") !== wanted) img.setAttribute("src", wanted);
        img.alt = "Imagem indisponível";
      }
    });
  }

  function missingCount() {
    return Array.from(editor.querySelectorAll("img")).filter((img) => !urls.has(img.dataset.img)).length;
  }

  function releaseUrls() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
    metas.clear();
  }

  function loadBitmap(file) {
    if ("createImageBitmap" in window) {
      return createImageBitmap(file).catch(() => loadWithElement(file));
    }
    return loadWithElement(file);
  }

  function loadWithElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
      img.src = url;
    });
  }

  const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  async function processImage(file) {
    const bitmap = await loadBitmap(file);
    const w0 = bitmap.width || bitmap.naturalWidth;
    const h0 = bitmap.height || bitmap.naturalHeight;
    if (!w0 || !h0) throw new Error("imagem vazia");
    const k = Math.min(1, IMAGE_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    let blob = await canvasBlob(canvas, "image/webp", 0.86);
    if (!blob || blob.type !== "image/webp") {
      // Sem WebP neste navegador: JPEG sobre fundo branco.
      const flat = document.createElement("canvas");
      flat.width = w;
      flat.height = h;
      const ctx = flat.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0);
      blob = await canvasBlob(flat, "image/jpeg", 0.88);
    }
    if (!blob) throw new Error("falha ao comprimir");
    return { blob, w, h };
  }

  const imageCountNow = () => new Set(Array.from(editor.querySelectorAll("img[data-img]")).map((i) => i.dataset.img)).size;
  const contentWidthPx = () => editor.clientWidth || (PAPER[state.orientation].w - 2 * MARGIN_X) * PX_MM;

  async function ingestImage(file, opts = {}) {
    if (!C.store.images) { toast("Este navegador não permite guardar imagens. Elas ficam desativadas."); return; }
    if (!file || !/^image\//.test(file.type)) { toast("Escolha um arquivo de imagem (PNG, JPG ou WebP)."); return; }
    if (file.size > MAX_IMAGE_FILE) { toast("Imagem muito grande. Limite: 40 MB."); return; }
    const replace = opts.replace && editor.contains(opts.replace) ? opts.replace : null;
    if (!replace && imageCountNow() >= MAX_IMAGES) { toast("Limite de " + MAX_IMAGES + " imagens por documento."); return; }
    const token = openToken;
    const release = C.busy("Processando a imagem…");
    let processed;
    const id = (uid() + uid()).replace(/[^a-z0-9]/g, "").slice(0, 14);
    try {
      processed = await processImage(file);
      await C.store.putImage({ id, docId, blob: processed.blob, w: processed.w, h: processed.h, mime: processed.blob.type });
    } catch (_) {
      release();
      toast("Não foi possível usar esta imagem. Tente outro arquivo.");
      return;
    }
    release();
    if (token !== openToken) return;
    urls.set(id, URL.createObjectURL(processed.blob));
    metas.set(id, { w: processed.w, h: processed.h });
    focusEditor();
    flushHistory();
    if (replace) {
      // Mesmo quadro: largura, proporção do quadro e alinhamento ficam como estavam.
      replace.setAttribute("data-img", id);
      hydrate(replace.parentElement || editor);
      afterChange(true);
      selectImage(replace);
      toast("Imagem substituída.");
      return;
    }
    const img = document.createElement("img");
    img.setAttribute("data-img", id);
    img.setAttribute("data-ratio", (processed.w / processed.h).toFixed(3));
    img.setAttribute("data-w", String(Math.min(60, clamp(Math.round(processed.w / contentWidthPx() * 100), 5, 100))));
    const block = document.createElement("p");
    block.appendChild(img);
    insertBlock(block, opts.at);
    hydrate(block);
    ensureTrailingBlock();
    afterChange(true);
    selectImage(img);
    img.scrollIntoView({ block: "nearest" });
  }

  function currentTopBlock(range) {
    let node = range ? range.startContainer : null;
    while (node && node.parentNode !== editor) node = node.parentNode;
    return node && node.parentNode === editor ? node : null;
  }

  function insertBlock(block, atRange) {
    const sel = window.getSelection();
    let range = atRange || (sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0) : null);
    if (range && !editor.contains(range.startContainer)) range = null;
    const top = currentTopBlock(range);
    const empty = top && top.tagName === "P" && !top.querySelector("img") && !top.textContent.replace(/​/g, "").trim();
    if (!top) editor.appendChild(block);
    else if (empty) top.replaceWith(block);
    else top.after(block);
  }

  function ensureTrailingBlock() {
    const last = editor.lastElementChild;
    if (!last || last.tagName !== "P" || last.querySelector("img") || last.textContent.trim()) {
      const p = document.createElement("p");
      p.appendChild(document.createElement("br"));
      editor.appendChild(p);
    }
  }

  /* ---------- Seleção de imagem, alças e barra ---------- */

  function selectImage(img) {
    selImg = img;
    const range = document.createRange();
    range.selectNode(img);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
    syncImageBar();
    imgBar.hidden = false;
    overlay.hidden = false;
    positionOverlay();
    layoutSoon();
  }

  function deselect() {
    if (!selImg && overlay.hidden) return;
    selImg = null;
    overlay.hidden = true;
    imgBar.hidden = true;
    layoutSoon();
  }

  function syncImageBar() {
    if (!selImg) return;
    const w = Math.round(clamp(parseFloat(selImg.dataset.w) || 50, 5, 100));
    byId("imgWidth").value = w;
    byId("imgWidthOut").textContent = w + "%";
    const align = (selImg.parentElement && selImg.parentElement.style.textAlign) || "left";
    byId("imgLeft").classList.toggle("is-active", align === "left" || align === "justify" || align === "");
    byId("imgCenter").classList.toggle("is-active", align === "center");
    byId("imgRight").classList.toggle("is-active", align === "right");
  }

  function positionOverlay() {
    if (!selImg || !editor.contains(selImg)) { deselect(); return; }
    const s = sheet.getBoundingClientRect();
    const i = selImg.getBoundingClientRect();
    overlay.style.left = (i.left - s.left) / scale + "px";
    overlay.style.top = (i.top - s.top) / scale + "px";
    overlay.style.width = i.width / scale + "px";
    overlay.style.height = i.height / scale + "px";
  }

  function setImageWidth(pct) {
    if (!selImg) return;
    selImg.dataset.w = String(Math.round(clamp(pct, 5, 100)));
    hydrate(selImg.parentElement || editor);
    syncImageBar();
    positionOverlay();
    updateStats();
    layoutSoon();
  }

  function setImageAlign(align) {
    if (!selImg || !selImg.parentElement || selImg.parentElement === editor) return;
    flushHistory();
    selImg.parentElement.style.textAlign = align;
    afterChange(true);
    syncImageBar();
    positionOverlay();
  }

  function removeImage() {
    if (!selImg) return;
    flushHistory();
    const parent = selImg.parentElement;
    selImg.remove();
    if (parent && parent !== editor && !parent.firstChild) parent.appendChild(document.createElement("br"));
    deselect();
    afterChange(true);
  }

  function startImagePick(img, camera) {
    replaceTarget = img || null;
    const input = byId(camera ? "cameraInput" : "imageInput");
    input.value = "";
    input.click();
  }

  async function copyImage() {
    if (!selImg) return;
    const url = urls.get(selImg.dataset.img);
    if (!url) { toast("Esta imagem está indisponível."); return; }
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const png = await canvasBlob(canvas, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast("Imagem copiada.");
    } catch (_) {
      toast("O navegador não permitiu copiar a imagem.");
    }
  }

  /* ---------- Histórico (desfazer / refazer) ---------- */

  function serialize() {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll("img").forEach((img) => {
      ["src", "style", "alt", "class", "draggable", "data-missing", "width", "height"].forEach((a) => img.removeAttribute(a));
    });
    return clone.innerHTML;
  }

  function getCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString().length;
  }

  function setCaret(offset) {
    if (offset == null) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let left = offset;
    let node;
    while ((node = walker.nextNode())) {
      if (left <= node.nodeValue.length) {
        const r = document.createRange();
        r.setStart(node, left);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        savedRange = r.cloneRange();
        return;
      }
      left -= node.nodeValue.length;
    }
  }

  function snap() { return { html: serialize(), caret: getCaret() }; }
  function resetHistory() { clearTimeout(histTimer); histTimer = null; hist.items = [snap()]; hist.idx = 0; updateHistoryButtons(); }

  function commitHistory() {
    clearTimeout(histTimer);
    histTimer = null;
    const s = snap();
    const last = hist.items[hist.idx];
    if (last && last.html === s.html) { last.caret = s.caret; return false; }
    hist.items.splice(hist.idx + 1);
    hist.items.push(s);
    if (hist.items.length > 300) hist.items.shift();
    hist.idx = hist.items.length - 1;
    updateHistoryButtons();
    return true;
  }

  function flushHistory() { if (histTimer) commitHistory(); }

  function queueHistory() {
    clearTimeout(histTimer);
    histTimer = setTimeout(commitHistory, 500);
  }

  function restore(s) {
    deselect();
    editor.innerHTML = s.html;
    hydrate(editor);
    focusEditor(true);
    setCaret(s.caret);
    C.scheduleSave();
    updateAll();
  }

  function undo() {
    flushHistory();
    if (hist.idx <= 0) return;
    hist.idx--;
    restore(hist.items[hist.idx]);
    updateHistoryButtons();
  }

  function redo() {
    flushHistory();
    if (hist.idx >= hist.items.length - 1) return;
    hist.idx++;
    restore(hist.items[hist.idx]);
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    byId("txUndo").disabled = hist.idx <= 0;
    byId("txRedo").disabled = hist.idx >= hist.items.length - 1;
  }

  /* ---------- Edição ---------- */

  function focusEditor(skipRestore) {
    if (document.activeElement !== editor) editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!skipRestore && savedRange && (!sel.rangeCount || !editor.contains(sel.anchorNode)) && editor.contains(savedRange.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function fixRoot() {
    // Listas criadas dentro de um parágrafo (comportamento do navegador) sobem para a raiz.
    const nested = editor.querySelectorAll("p > ul, p > ol, h1 > ul, h1 > ol, h2 > ul, h2 > ol");
    if (nested.length) {
      const sel = window.getSelection();
      const keep = sel.rangeCount ? { a: sel.anchorNode, ao: sel.anchorOffset, f: sel.focusNode, fo: sel.focusOffset } : null;
      nested.forEach((list) => {
        const host = list.parentElement;
        if (host.parentElement !== editor) return;
        host.after(list);
        if (!host.textContent.replace(/\u200b/g, "").trim() && !host.querySelector("img")) host.remove();
      });
      if (keep && keep.a && keep.a.isConnected && keep.f.isConnected) {
        try { sel.setBaseAndExtent(keep.a, keep.ao, keep.f, keep.fo); } catch (_) { /* ignorado */ }
      }
    }
    // Texto digitado direto na raiz (editor vazio) vira parágrafo.
    const loose = Array.from(editor.childNodes).some((n) => !(n.nodeType === 1 && /^(P|H1|H2|UL|OL)$/.test(n.tagName)));
    if (!editor.firstChild || loose) {
      const caret = getCaret();
      const parts = finishBlocksKeep();
      editor.innerHTML = parts;
      hydrate(editor);
      if (caret != null) setCaret(caret);
      else setCaret(0);
    }
  }

  function finishBlocksKeep() {
    const copy = document.createElement("div");
    copy.innerHTML = editor.innerHTML;
    return finishBlocks(copy);
  }

  function afterChange(immediate) {
    fixRoot();
    if (immediate) commitHistory(); else queueHistory();
    C.scheduleSave();
    updateAll();
  }

  function run(fn) {
    focusEditor();
    flushHistory();
    fn();
    afterChange(true);
  }

  const cmd = (name, value) => document.execCommand(name, false, value);

  function selectionOffsets() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const a = document.createRange();
    a.selectNodeContents(editor);
    a.setEnd(range.startContainer, range.startOffset);
    return { start: a.toString().length, end: a.toString().length + range.toString().length };
  }

  function restoreOffsets(o) {
    if (!o) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let node;
    const range = document.createRange();
    let startSet = false;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (!startSet && o.start <= pos + len) { range.setStart(node, o.start - pos); startSet = true; }
      if (startSet && o.end <= pos + len) { range.setEnd(node, o.end - pos); break; }
      pos += len;
    }
    if (!startSet) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
  }

  function setFontSize(pt) {
    run(() => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        const span = document.createElement("span");
        span.style.fontSize = pt + "pt";
        const mark = document.createTextNode("​");
        span.appendChild(mark);
        range.insertNode(span);
        const r = document.createRange();
        r.setStart(mark, 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      const offsets = selectionOffsets();
      cmd("styleWithCSS", false);
      cmd("fontSize", "7");
      editor.querySelectorAll('font[size="7"]').forEach((font) => {
        const span = document.createElement("span");
        span.style.fontSize = pt + "pt";
        while (font.firstChild) span.appendChild(font.firstChild);
        span.querySelectorAll("span[style*='font-size']").forEach((inner) => { inner.style.fontSize = ""; if (!inner.getAttribute("style")) inner.removeAttribute("style"); });
        font.replaceWith(span);
      });
      restoreOffsets(offsets);
    });
  }

  function format(command) {
    run(() => { cmd("styleWithCSS", false); cmd(command); });
  }

  function setBlock(tag) {
    run(() => { cmd("formatBlock", "<" + tag + ">"); });
  }

  function setFont(name) { run(() => { cmd("styleWithCSS", false); cmd("fontName", name); }); }
  function setColor(color) { run(() => { cmd("styleWithCSS", false); cmd("foreColor", color); }); }

  function insertPlain(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n").slice(0, 20000);
    if (!lines.join("")) { if (lines.length > 1) lines.forEach((_, i) => { if (i) cmd("insertParagraph"); }); return; }
    lines.forEach((line, i) => {
      if (i) cmd("insertParagraph");
      if (line) cmd("insertText", line);
    });
  }

  function pasteText(text) {
    run(() => insertPlain(text));
  }

  function handleImageFiles(files, opts) {
    const images = Array.from(files).filter((f) => /^image\//.test(f.type));
    if (!images.length) return false;
    if (opts && opts.replace) ingestImage(images[0], opts);
    else images.reduce((chain, file) => chain.then(() => ingestImage(file, opts || {})), Promise.resolve());
    return true;
  }

  async function pasteFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            handleImageFiles([new File([blob], "colada", { type: imageType })], selImg ? { replace: selImg } : {});
            return;
          }
          if (item.types.includes("text/plain")) {
            pasteText(await (await item.getType("text/plain")).text());
            return;
          }
        }
        return;
      }
      pasteText(await navigator.clipboard.readText());
    } catch (_) {
      toast("O navegador não permitiu colar pelo menu. Use Ctrl+V.");
    }
  }

  /* ---------- Barra de ferramentas ---------- */

  function setPressed(id, on) {
    const el = byId(id);
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-pressed", String(on));
  }

  function toHex(color) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
    return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "#000000";
  }

  function updateToolbar() {
    toolbarFrame = 0;
    if (root.hidden) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const q = (name) => { try { return document.queryCommandState(name); } catch (_) { return false; } };
    setPressed("txBold", q("bold"));
    setPressed("txItalic", q("italic"));
    setPressed("txUnderline", q("underline"));
    setPressed("txAlignLeft", q("justifyLeft"));
    setPressed("txAlignCenter", q("justifyCenter"));
    setPressed("txAlignRight", q("justifyRight"));
    setPressed("txAlignJustify", q("justifyFull"));
    setPressed("txBullets", q("insertUnorderedList"));
    setPressed("txNumbers", q("insertOrderedList"));
    let el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (!el || !editor.contains(el)) return;
    const top = currentTopBlock(sel.getRangeAt(0));
    const tag = top ? top.tagName.toLowerCase() : "p";
    byId("txBlock").value = tag === "h1" || tag === "h2" ? tag : "p";
    const style = getComputedStyle(el);
    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const font = byId("txFont");
    font.value = FONTS.includes(family) ? family : "Arial";
    const pt = Math.round(parseFloat(style.fontSize) * 0.75 * 2) / 2;
    const size = byId("txSize");
    if (!Array.from(size.options).some((o) => Number(o.value) === pt)) {
      const option = document.createElement("option");
      option.value = String(pt);
      option.textContent = String(pt);
      option.dataset.temp = "1";
      size.querySelectorAll("[data-temp]").forEach((o) => o.remove());
      size.append(option);
    }
    size.value = String(pt);
    const hex = toHex(style.color);
    byId("txColor").value = hex;
    byId("txColorSwatch").style.borderBottomColor = hex;
  }

  function scheduleToolbar() {
    if (!toolbarFrame) toolbarFrame = requestAnimationFrame(updateToolbar);
  }

  /* ---------- Folha, zoom, contadores e marcas de página ---------- */

  function applyOrientation() {
    document.documentElement.dataset.paper = state.orientation;
    byId("pageStyle").textContent = "@page { size: A4 " + state.orientation + "; margin: " + MARGIN_Y + "mm " + MARGIN_X + "mm; }";
    byId("txOrient").value = state.orientation;
  }

  let layoutFrame = 0;
  function layoutSoon() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(layout);
  }

  function layout() {
    layoutFrame = 0;
    if (root.hidden) return;
    const p = PAPER[state.orientation];
    sheet.style.setProperty("--tw", p.w + "mm");
    sheet.style.setProperty("--th", p.h + "mm");
    sheet.style.setProperty("--tmx", MARGIN_X + "mm");
    sheet.style.setProperty("--tmy", MARGIN_Y + "mm");
    const natural = p.w * PX_MM;
    const narrow = window.matchMedia("(max-width: 700px)").matches;
    const avail = Math.max(200, scroll.clientWidth - (narrow ? 16 : 44));
    const fit = Math.min(1, avail / natural);
    scale = fit * ZOOMS[zoomIndex];
    sheet.style.transform = "scale(" + scale + ")";
    sheet.style.setProperty("--inv", String(1 / scale));
    wrap.style.width = natural * scale + "px";
    wrap.style.height = sheet.offsetHeight * scale + "px";
    byId("txZoomIndicator").textContent = Math.round(scale * 100) + "%";
    byId("txZoomOut").disabled = zoomIndex === 0;
    byId("txZoomIn").disabled = zoomIndex === ZOOMS.length - 1;
    updateMarkers();
    if (selImg) positionOverlay();
  }

  function updateMarkers() {
    const p = PAPER[state.orientation];
    const pageH = (p.h - 2 * MARGIN_Y) * PX_MM;
    const pages = Math.max(1, Math.ceil((editor.offsetHeight - 2) / pageH));
    markers.replaceChildren();
    for (let k = 1; k < pages; k++) {
      const line = document.createElement("div");
      line.className = "tx-marker";
      line.style.top = MARGIN_Y * PX_MM + k * pageH + "px";
      const label = document.createElement("span");
      label.textContent = "Fim da página " + k;
      line.append(label);
      markers.append(line);
    }
    byId("txPages").textContent = pages + (pages === 1 ? " página" : " páginas");
    return pages;
  }

  function countWords() {
    const text = (editor.innerText || "").replace(/​/g, "").trim();
    return text ? text.split(/\s+/).length : 0;
  }

  function updateStats() {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
      const n = countWords();
      byId("txWords").textContent = n + (n === 1 ? " palavra" : " palavras");
      editor.dataset.empty = String(n === 0 && !editor.querySelector("img") && editor.querySelectorAll("p,h1,h2,li").length <= 1);
    }, 120);
    layoutSoon();
  }

  function updateAll() {
    updateStats();
    scheduleToolbar();
    syncImageBarSoon();
  }

  function syncImageBarSoon() { if (selImg) { syncImageBar(); positionOverlay(); } }

  function zoomBy(delta) { zoomIndex = clamp(zoomIndex + delta, 0, ZOOMS.length - 1); layout(); }
  function fitWidth() { zoomIndex = 2; layout(); }

  /* ---------- Integração com o núcleo ---------- */

  function collect(doc) {
    if (doc.id === docId && doc.state === state) state.html = serialize();
  }

  function payload(doc) {
    collect(doc);
    return { format: "coding-document", version: 3, type: "texts", name: doc.state.name, orientation: doc.state.orientation, html: doc.state.html };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function exportPayload(doc) {
    const data = payload(doc);
    const ids = imageIds(data.html);
    const records = (await C.store.getImages(doc.id)).filter((r) => ids.has(r.id));
    data.images = [];
    for (const r of records) data.images.push({ id: r.id, mime: r.mime || r.blob.type, w: r.w, h: r.h, data: await blobToBase64(r.blob) });
    return data;
  }

  async function prepareImport(data) {
    const state0 = normalize(data);
    const images = [];
    let html = state0.html;
    const list = Array.isArray(data.images) ? data.images.slice(0, MAX_IMAGES) : [];
    for (const item of list) {
      if (!item || typeof item.id !== "string" || !ID_RE.test(item.id) || typeof item.data !== "string") continue;
      const mime = /^image\/(png|jpeg|webp|gif)$/.test(item.mime) ? item.mime : "";
      if (!mime || item.data.length > 40000000) continue;
      try {
        const binary = atob(item.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const fresh = (uid() + uid()).replace(/[^a-z0-9]/g, "").slice(0, 14);
        html = html.split('data-img="' + item.id + '"').join('data-img="' + fresh + '"');
        images.push({ id: fresh, blob: new Blob([bytes], { type: mime }), w: toInt(item.w, 1, 1, 20000), h: toInt(item.h, 1, 1, 20000), mime });
      } catch (_) { /* imagem inválida vira "indisponível" */ }
    }
    return { state: { ...state0, html }, images };
  }

  function words(doc) {
    const text = String(doc.state.html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/​/g, "").trim();
    return text ? text.split(/\s+/).length : 0;
  }

  function info(doc) {
    const n = words(doc);
    return n + (n === 1 ? " palavra" : " palavras");
  }

  function imageCount(doc) {
    collect(doc);
    return imageIds(doc.state.html).size;
  }

  async function open(doc) {
    const token = ++openToken;
    deselect();
    clearTimeout(histTimer);
    histTimer = null;
    docId = doc.id;
    state = doc.state;
    releaseUrls();
    let records = [];
    try { records = await C.store.getImages(doc.id); } catch (_) { records = []; }
    if (token !== openToken) return;
    records.forEach((r) => { urls.set(r.id, URL.createObjectURL(r.blob)); metas.set(r.id, { w: r.w, h: r.h }); });
    editor.innerHTML = state.html;
    hydrate(editor);
    // Remove do armazenamento as imagens que não aparecem mais no texto.
    const used = imageIds(state.html);
    const orphans = records.filter((r) => !used.has(r.id)).map((r) => r.id);
    if (orphans.length) {
      C.store.deleteImages(orphans).catch(() => {});
      orphans.forEach((id) => { URL.revokeObjectURL(urls.get(id)); urls.delete(id); metas.delete(id); });
    }
    applyOrientation();
    resetHistory();
    scroll.scrollTop = 0;
    zoomIndex = 2;
    layout();
    updateStats();
    updateToolbar();
    byId("txImage").disabled = !C.store.images;
    byId("txCamera").disabled = !C.store.images;
  }

  function printDoc() {
    flushHistory();
    const missing = missingCount();
    if (missing && !window.confirm("Há " + missing + (missing === 1 ? " imagem indisponível" : " imagens indisponíveis") + ". No PDF elas saem como quadros vazios, só com a borda fina. Imprimir mesmo assim?")) return;
    window.print();
  }

  /* ---------- Menu de contexto ---------- */

  function hasSelection() { const sel = window.getSelection(); return sel.rangeCount > 0 && !sel.isCollapsed && editor.contains(sel.anchorNode); }

  function menuItems(target) {
    if (!root.contains(target) || !(target.closest && target.closest("#txScroll"))) return null;
    if (target.tagName === "IMG" && editor.contains(target)) {
      selectImage(target);
      const missing = !urls.has(target.dataset.img);
      const on = (fn) => () => { if (editor.contains(target)) { selectImage(target); fn(); } };
      return [
        { label: "Substituir imagem…", run: on(() => startImagePick(selImg)) },
        { sep: true },
        { label: "Tamanho", sub: [
          { label: "Pequena (25%)", run: on(() => { flushHistory(); setImageWidth(25); afterChange(true); }) },
          { label: "Média (50%)", run: on(() => { flushHistory(); setImageWidth(50); afterChange(true); }) },
          { label: "Grande (75%)", run: on(() => { flushHistory(); setImageWidth(75); afterChange(true); }) },
          { label: "Largura total (100%)", run: on(() => { flushHistory(); setImageWidth(100); afterChange(true); }) }
        ] },
        { label: "Alinhamento", sub: [
          { label: "À esquerda", run: on(() => setImageAlign("left")) },
          { label: "Centralizado", run: on(() => setImageAlign("center")) },
          { label: "À direita", run: on(() => setImageAlign("right")) }
        ] },
        { sep: true },
        { label: "Copiar imagem", run: on(copyImage), disabled: missing },
        { label: "Remover imagem", shortcut: "Delete", run: on(removeImage), danger: true }
      ];
    }
    const sel = hasSelection();
    return [
      { label: "Desfazer", shortcut: "Ctrl+Z", run: undo, disabled: hist.idx <= 0 },
      { label: "Refazer", shortcut: "Ctrl+Y", run: redo, disabled: hist.idx >= hist.items.length - 1 },
      { sep: true },
      { label: "Cortar", shortcut: "Ctrl+X", run: () => { focusEditor(); document.execCommand("cut"); afterChange(true); }, disabled: !sel },
      { label: "Copiar", shortcut: "Ctrl+C", run: () => { focusEditor(); document.execCommand("copy"); }, disabled: !sel },
      { label: "Colar", shortcut: "Ctrl+V", run: pasteFromClipboard },
      { label: "Colar sem formatação", shortcut: "Ctrl+Shift+V", run: pasteFromClipboard },
      { label: "Selecionar tudo", shortcut: "Ctrl+A", run: () => { focusEditor(); cmd("selectAll"); scheduleToolbar(); } },
      { sep: true },
      { label: "Formatar", sub: [
        { label: "Negrito", shortcut: "Ctrl+B", run: () => format("bold"), check: byId("txBold").classList.contains("is-active") },
        { label: "Itálico", shortcut: "Ctrl+I", run: () => format("italic"), check: byId("txItalic").classList.contains("is-active") },
        { label: "Sublinhado", shortcut: "Ctrl+U", run: () => format("underline"), check: byId("txUnderline").classList.contains("is-active") }
      ] },
      { label: "Alinhamento", sub: [
        { label: "À esquerda", run: () => format("justifyLeft") },
        { label: "Centralizar", run: () => format("justifyCenter") },
        { label: "À direita", run: () => format("justifyRight") },
        { label: "Justificar", run: () => format("justifyFull") }
      ] },
      { label: "Parágrafo", sub: [
        { label: "Lista com marcadores", run: () => format("insertUnorderedList") },
        { label: "Lista numerada", run: () => format("insertOrderedList") },
        { sep: true },
        { label: "Título 1", run: () => setBlock("h1") },
        { label: "Título 2", run: () => setBlock("h2") },
        { label: "Texto normal", run: () => setBlock("p") }
      ] },
      { sep: true },
      { label: "Inserir imagem…", run: () => startImagePick(null), disabled: !C.store.images }
    ];
  }

  function viewItems() {
    return [
      { label: "Aumentar zoom", run: () => zoomBy(1) },
      { label: "Diminuir zoom", run: () => zoomBy(-1) },
      { label: "Ajustar à largura", run: fitWidth }
    ];
  }

  /* ---------- Ligações dos controles ---------- */

  function init() {
    const fontSelect = byId("txFont");
    FONTS.forEach((name) => { const o = document.createElement("option"); o.value = name; o.textContent = name; fontSelect.append(o); });
    const sizeSelect = byId("txSize");
    SIZES.forEach((n) => { const o = document.createElement("option"); o.value = String(n); o.textContent = String(n); sizeSelect.append(o); });
    try { cmd("defaultParagraphSeparator", "p"); cmd("enableObjectResizing", false); } catch (_) { /* ignorado */ }

    toolbar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
    imgBar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });

    byId("txUndo").addEventListener("click", () => { focusEditor(); undo(); });
    byId("txRedo").addEventListener("click", () => { focusEditor(); redo(); });
    byId("txBold").addEventListener("click", () => format("bold"));
    byId("txItalic").addEventListener("click", () => format("italic"));
    byId("txUnderline").addEventListener("click", () => format("underline"));
    byId("txAlignLeft").addEventListener("click", () => format("justifyLeft"));
    byId("txAlignCenter").addEventListener("click", () => format("justifyCenter"));
    byId("txAlignRight").addEventListener("click", () => format("justifyRight"));
    byId("txAlignJustify").addEventListener("click", () => format("justifyFull"));
    byId("txBullets").addEventListener("click", () => format("insertUnorderedList"));
    byId("txNumbers").addEventListener("click", () => format("insertOrderedList"));
    byId("txBlock").addEventListener("change", (e) => setBlock(e.target.value));
    fontSelect.addEventListener("change", (e) => setFont(e.target.value));
    sizeSelect.addEventListener("change", (e) => setFontSize(Number(e.target.value)));
    byId("txColor").addEventListener("input", (e) => { byId("txColorSwatch").style.borderBottomColor = e.target.value; });
    byId("txColor").addEventListener("change", (e) => setColor(e.target.value));
    byId("txOrient").addEventListener("change", (e) => {
      state.orientation = e.target.value === "landscape" ? "landscape" : "portrait";
      applyOrientation();
      C.scheduleSave();
      layout();
    });
    byId("txImage").addEventListener("click", () => startImagePick(null, false));
    byId("txCamera").addEventListener("click", () => startImagePick(null, true));
    ["imageInput", "cameraInput"].forEach((id) => {
      byId(id).addEventListener("change", (e) => {
        const files = e.target.files;
        const target = replaceTarget;
        replaceTarget = null;
        if (files && files.length) handleImageFiles(files, target ? { replace: target } : {});
        e.target.value = "";
      });
    });

    byId("imgWidth").addEventListener("input", (e) => { if (!drag) flushHistory(); setImageWidth(Number(e.target.value)); });
    byId("imgWidth").addEventListener("change", () => afterChange(true));
    byId("imgLeft").addEventListener("click", () => setImageAlign("left"));
    byId("imgCenter").addEventListener("click", () => setImageAlign("center"));
    byId("imgRight").addEventListener("click", () => setImageAlign("right"));
    byId("imgReplace").addEventListener("click", () => startImagePick(selImg));
    byId("imgRemove").addEventListener("click", () => { removeImage(); focusEditor(); });

    byId("txZoomOut").addEventListener("click", () => zoomBy(-1));
    byId("txZoomIn").addEventListener("click", () => zoomBy(1));
    byId("txZoomIndicator").addEventListener("click", fitWidth);

    // Alças de redimensionamento (mantêm a proporção do quadro)
    overlay.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".tx-handle");
      if (!handle || !selImg) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      flushHistory();
      const align = (selImg.parentElement && selImg.parentElement.style.textAlign) || "left";
      drag = { x: e.clientX, startW: selImg.getBoundingClientRect().width / scale, west: handle.dataset.h.includes("w"), factor: align === "center" ? 2 : 1, contentW: contentWidthPx() };
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / scale * (drag.west ? -1 : 1) * drag.factor;
      setImageWidth((drag.startW + dx) / drag.contentW * 100);
    });
    const endDrag = () => { if (!drag) return; drag = null; afterChange(true); };
    overlay.addEventListener("pointerup", endDrag);
    overlay.addEventListener("pointercancel", endDrag);

    // Editor
    editor.addEventListener("input", () => {
      if (!editor.dataset.composing) afterChange(false);
    });
    editor.addEventListener("compositionstart", () => { editor.dataset.composing = "1"; });
    editor.addEventListener("compositionend", () => { delete editor.dataset.composing; afterChange(false); });
    editor.addEventListener("beforeinput", (e) => {
      if (e.inputType === "historyUndo") { e.preventDefault(); undo(); }
      else if (e.inputType === "historyRedo") { e.preventDefault(); redo(); }
    });
    editor.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey) {
        if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
        if (key === "b") { e.preventDefault(); format("bold"); return; }
        if (key === "i") { e.preventDefault(); format("italic"); return; }
        if (key === "u") { e.preventDefault(); format("underline"); return; }
      }
      if (selImg && (e.key === "Delete" || e.key === "Backspace")) {
        const sel = window.getSelection();
        if (sel.rangeCount && !sel.isCollapsed && sel.getRangeAt(0).intersectsNode(selImg)) { e.preventDefault(); removeImage(); return; }
      }
      if (e.key === "Escape" && selImg) { e.preventDefault(); deselect(); }
    });
    editor.addEventListener("pointerdown", (e) => {
      if (selImg && e.target.tagName !== "IMG") deselect();
    });
    editor.addEventListener("click", (e) => {
      if (e.target.tagName === "IMG" && editor.contains(e.target)) selectImage(e.target);
    });
    editor.addEventListener("dragstart", () => { internalDrag = true; });
    editor.addEventListener("dragend", () => { internalDrag = false; setTimeout(() => { fixRoot(); afterChange(true); }, 0); });
    editor.addEventListener("paste", (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const files = Array.from(cd.files || []).filter((f) => /^image\//.test(f.type));
      if (files.length) { handleImageFiles(files, selImg ? { replace: selImg } : {}); return; }
      const text = cd.getData("text/plain");
      if (text) pasteText(text);
    });
    editor.addEventListener("copy", () => { /* cópia nativa */ });
    editor.addEventListener("dragover", (e) => { e.preventDefault(); });
    editor.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const files = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
      if (files.length) {
        e.preventDefault();
        if (e.target.tagName === "IMG" && editor.contains(e.target)) { handleImageFiles(files, { replace: e.target }); return; }
        const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        handleImageFiles(files, { at: range && editor.contains(range.startContainer) ? range : null });
        return;
      }
      if (internalDrag) return;
      e.preventDefault();
      const text = dt.getData("text/plain");
      if (text) {
        const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (range && editor.contains(range.startContainer)) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
        pasteText(text);
      }
    });
    editor.addEventListener("error", (e) => {
      const img = e.target;
      if (img && img.tagName === "IMG" && img.dataset.img && !img.hasAttribute("data-missing")) {
        urls.delete(img.dataset.img);
        hydrate(img.parentElement || editor);
        layoutSoon();
      }
    }, true);
    editor.addEventListener("load", () => layoutSoon(), true);
    sheet.addEventListener("mousedown", (e) => {
      if (e.target !== sheet && e.target !== wrap) return;
      e.preventDefault();
      editor.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });

    document.addEventListener("selectionchange", () => {
      if (root.hidden) return;
      const sel = window.getSelection();
      if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
      savedRange = sel.getRangeAt(0).cloneRange();
      if (selImg && !(sel.getRangeAt(0).intersectsNode(selImg) && !sel.isCollapsed)) deselect();
      scheduleToolbar();
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => layoutSoon()).observe(scroll);
      new ResizeObserver(() => { updateStats(); }).observe(editor);
    }
    window.addEventListener("resize", layoutSoon);
    window.addEventListener("coding:shown", () => { if (!root.hidden) layoutSoon(); });
    window.addEventListener("beforeprint", () => { if (!root.hidden) hydrate(editor, true); });
    window.addEventListener("afterprint", () => { if (!root.hidden) hydrate(editor, false); });

    C.register({
      type: "texts",
      defaults, normalize, payload, exportPayload, prepareImport, info, imageCount, open, collect,
      print: printDoc, menuItems, viewItems, close() { deselect(); flushHistory(); },
      zoomBy, fitPage: fitWidth,
      // usados pelo menu.js e pelos testes
      editor: () => editor
    });
  }

  init();
})();
