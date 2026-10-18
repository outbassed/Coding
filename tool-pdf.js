/* Coding — editor de PDF: ver páginas, girar, mover, excluir, juntar, extrair, dividir, anotar e assinar.
   Tudo roda no aparelho. Usa pdf.js (mostrar) e pdf-lib (salvar), carregados só quando preciso. */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const MAX_PAGES = 300;
  const SIG_KEY = "coding-signature-v1";

  const $ = {
    view: byId("pdfView"), bar: byId("pdfBar"), msg: byId("pdfMsg"), main: byId("pdfMain"), empty: byId("pdfEmpty"), grid: byId("pdfGrid"),
    file: byId("pdfFile"), open: byId("pdfOpen"), merge: byId("pdfMerge"), save: byId("pdfSave"),
    selAll: byId("pdfSelAll"), rotL: byId("pdfRotL"), rotR: byId("pdfRotR"), moveL: byId("pdfMoveL"), moveR: byId("pdfMoveR"),
    del: byId("pdfDel"), annot: byId("pdfAnnot"), extract: byId("pdfExtract"), split: byId("pdfSplit"),
    editor: byId("pdfEditor"), stage: byId("pdfStage"), sheet: byId("pdfSheet"), canvas: byId("pdfCanvas"), over: byId("pdfOver"),
    done: byId("pdfEdDone"), color: byId("pdfColor"), bigger: byId("pdfBigger"), smaller: byId("pdfSmaller"), remove: byId("pdfRemove"), hint: byId("pdfHint"),
    sig: byId("sigDialog"), pad: byId("sigPad")
  };

  const files = []; // { name, bytes: Uint8Array, doc: pdf.js document, lib: PDFDocument (sob demanda) }
  let pages = [];   // { id, src, idx, extra, ann: [], canvas }
  let seq = 0;
  const sel = new Set();
  let lastClicked = null;
  let baseName = "documento";

  /* ------------------------------ bibliotecas ------------------------------ */
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("falha " + src));
    document.head.append(s);
  });
  let libsPromise = null;
  function loadLibs() {
    if (!libsPromise) {
      libsPromise = Promise.all([loadScript("vendor/pdf.min.js"), loadScript("vendor/pdf-lib.min.js")]).then(() => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
      }).catch((e) => { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  const say = (t) => { $.msg.textContent = t || ""; };

  /* ------------------------------ abrir arquivos ------------------------------ */
  async function addPdfs(list, append) {
    const picked = Array.from(list || []).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!picked.length) { say("Escolha um arquivo PDF."); return; }
    say("Abrindo…");
    try { await loadLibs(); } catch (_) { say("Não foi possível carregar o leitor de PDF. Verifique a internet e tente de novo."); return; }
    if (!append) { files.length = 0; pages = []; sel.clear(); }
    for (const f of picked) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        if (pages.length + doc.numPages > MAX_PAGES) { say("Limite de " + MAX_PAGES + " páginas."); await doc.destroy(); break; }
        const src = files.push({ name: f.name, bytes, doc, lib: null }) - 1;
        if (!pages.length) baseName = f.name.replace(/\.pdf$/i, "") || "documento";
        for (let i = 0; i < doc.numPages; i++) pages.push({ id: ++seq, src, idx: i, extra: 0, ann: [], canvas: null });
        say("");
      } catch (e) {
        say(e && e.name === "PasswordException" ? "“" + f.name + "” tem senha. Remova a senha antes de abrir." : "Não consegui abrir “" + f.name + "”. O arquivo pode estar danificado.");
      }
    }
    renderGrid();
  }

  /* ------------------------------ grade de páginas ------------------------------ */
  let thumbToken = 0;
  async function drawThumb(page, canvas) {
    const doc = files[page.src].doc;
    const pg = await doc.getPage(page.idx + 1);
    const base = pg.getViewport({ scale: 1, rotation: page.extra });
    const scale = 220 / base.width;
    const vp = pg.getViewport({ scale: scale * Math.min(2, window.devicePixelRatio || 1), rotation: page.extra });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.aspectRatio = base.width + " / " + base.height;
    await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  }

  function updateButtons() {
    const has = pages.length > 0;
    const n = sel.size;
    $.empty.hidden = has;
    $.grid.hidden = !has;
    $.save.disabled = !has;
    $.merge.disabled = !has;
    $.selAll.disabled = !has;
    $.selAll.textContent = n && n === pages.length ? "Limpar seleção" : "Selecionar tudo";
    [$.rotL, $.rotR, $.moveL, $.moveR, $.del, $.extract].forEach((b) => { b.disabled = !n; });
    $.annot.disabled = n !== 1;
    $.split.disabled = !has;
    $.save.querySelector(".btn-label").textContent = n ? "Baixar seleção" : "Baixar PDF";
  }

  function renderGrid() {
    const mine = ++thumbToken;
    $.grid.replaceChildren();
    const todo = [];
    pages.forEach((page, i) => {
      const card = document.createElement("div");
      card.className = "pdf-card" + (sel.has(page.id) ? " sel" : "");
      card.draggable = true;
      card.dataset.id = String(page.id);
      const canvas = document.createElement("canvas");
      canvas.width = 110; canvas.height = 150;
      const pn = document.createElement("span");
      pn.className = "pn";
      pn.textContent = "Página " + (i + 1);
      card.append(canvas, pn);
      if (page.ann.length) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "✎ " + page.ann.length; card.append(b); }
      $.grid.append(card);
      todo.push([page, canvas]);
    });
    updateButtons();
    (async () => {
      for (const [page, canvas] of todo) {
        if (mine !== thumbToken) return;
        try { await drawThumb(page, canvas); } catch (_) { /* miniatura falhou */ }
      }
    })();
  }

  $.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".pdf-card");
    if (!card) return;
    const id = Number(card.dataset.id);
    if (e.shiftKey && lastClicked) {
      const a = pages.findIndex((p) => p.id === lastClicked);
      const b = pages.findIndex((p) => p.id === id);
      pages.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((p) => sel.add(p.id));
    } else if (sel.has(id)) sel.delete(id); else sel.add(id);
    lastClicked = id;
    $.grid.querySelectorAll(".pdf-card").forEach((c) => c.classList.toggle("sel", sel.has(Number(c.dataset.id))));
    updateButtons();
  });
  $.grid.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".pdf-card");
    if (!card) return;
    openEditor(pages.find((p) => p.id === Number(card.dataset.id)));
  });

  // arrastar para reordenar
  let dragId = 0;
  $.grid.addEventListener("dragstart", (e) => { const c = e.target.closest(".pdf-card"); if (!c) return; dragId = Number(c.dataset.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "pagina"); } catch (_) { /* ignorado */ } });
  $.grid.addEventListener("dragover", (e) => { if (!dragId) return; e.preventDefault(); const c = e.target.closest(".pdf-card"); $.grid.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); if (c) c.classList.add("drop"); });
  $.grid.addEventListener("drop", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const c = e.target.closest(".pdf-card");
    const moving = sel.has(dragId) ? pages.filter((p) => sel.has(p.id)) : [pages.find((p) => p.id === dragId)];
    dragId = 0;
    if (!c) { renderGrid(); return; }
    const targetId = Number(c.dataset.id);
    if (moving.some((p) => p.id === targetId)) { renderGrid(); return; }
    const rest = pages.filter((p) => !moving.includes(p));
    const at = rest.findIndex((p) => p.id === targetId);
    rest.splice(at, 0, ...moving);
    pages = rest;
    renderGrid();
  });
  $.grid.addEventListener("dragend", () => { dragId = 0; $.grid.querySelectorAll(".drop").forEach((x) => x.classList.remove("drop")); });

  const selected = () => pages.filter((p) => sel.has(p.id));

  $.selAll.addEventListener("click", () => {
    if (sel.size === pages.length) sel.clear(); else pages.forEach((p) => sel.add(p.id));
    renderGrid();
  });
  function rotate(delta) {
    const list = selected();
    if (list.some((p) => p.ann.length)) { say("Tire as anotações da página antes de girar."); return; }
    say("");
    list.forEach((p) => { p.extra = (p.extra + delta + 360) % 360; });
    renderGrid();
  }
  $.rotL.addEventListener("click", () => rotate(270));
  $.rotR.addEventListener("click", () => rotate(90));
  function move(dir) {
    const arr = pages.slice();
    const idxs = arr.map((p, i) => (sel.has(p.id) ? i : -1)).filter((i) => i >= 0);
    if (dir < 0) { idxs.forEach((i) => { if (i > 0 && !sel.has(arr[i - 1].id)) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }); }
    else { idxs.reverse().forEach((i) => { if (i < arr.length - 1 && !sel.has(arr[i + 1].id)) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; }); }
    pages = arr;
    renderGrid();
  }
  $.moveL.addEventListener("click", () => move(-1));
  $.moveR.addEventListener("click", () => move(1));
  $.del.addEventListener("click", () => {
    const n = sel.size;
    if (!n) return;
    if (n === pages.length && !window.confirm("Excluir todas as páginas?")) return;
    pages = pages.filter((p) => !sel.has(p.id));
    sel.clear();
    renderGrid();
    say(n + (n === 1 ? " página excluída." : " páginas excluídas.") + " O arquivo original não muda.");
  });
  $.annot.addEventListener("click", () => { const p = selected()[0]; if (p) openEditor(p); });

  $.open.addEventListener("click", () => { $.file.dataset.append = ""; $.file.click(); });
  $.merge.addEventListener("click", () => { $.file.dataset.append = "1"; $.file.click(); });
  $.file.addEventListener("change", () => { const list = $.file.files; const append = $.file.dataset.append === "1"; addPdfs(list, append).then(() => { $.file.value = ""; }); });
  ["dragenter", "dragover"].forEach((ev) => $.main.addEventListener(ev, (e) => { if (dragId) return; if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) { e.preventDefault(); $.main.classList.add("drag"); } }));
  ["dragleave", "drop"].forEach((ev) => $.main.addEventListener(ev, () => $.main.classList.remove("drag")));
  $.main.addEventListener("drop", (e) => { if (dragId || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); addPdfs(e.dataTransfer.files, pages.length > 0); });

  /* ------------------------------ exportar (pdf-lib) ------------------------------ */
  const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex) || [0, "111111"]; const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const safeText = (t) => t.replace(/[^\n -~ -ÿ]/g, (ch) => ({ "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "•": "·", "…": "..." }[ch] || "?"));

  async function dataUrlBytes(url) { const r = await fetch(url); return new Uint8Array(await r.arrayBuffer()); }

  async function buildPdf(list) {
    const L = window.PDFLib;
    const out = await L.PDFDocument.create();
    const font = await out.embedFont(L.StandardFonts.Helvetica);
    const imgCache = new Map();
    for (const p of list) {
      const f = files[p.src];
      if (!f.lib) f.lib = await L.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
      const [copied] = await out.copyPages(f.lib, [p.idx]);
      const intrinsic = copied.getRotation().angle || 0;
      const r = ((intrinsic + p.extra) % 360 + 360) % 360;
      if (p.extra) copied.setRotation(L.degrees(r));
      const page = out.addPage(copied);
      if (!p.ann.length) continue;
      const { width: w, height: h } = page.getSize();
      const vw = r % 180 ? h : w;
      const vh = r % 180 ? w : h;
      // (u,v) em fração da página como se vê (canto superior esquerdo) → espaço do PDF
      const map = (u, v) => {
        if (r === 0) return [u * w, (1 - v) * h];
        if (r === 90) return [v * w, u * h];
        if (r === 180) return [(1 - u) * w, v * h];
        return [(1 - v) * w, (1 - u) * h];
      };
      for (const a of p.ann) {
        if (a.type === "text") {
          const size = a.size * vw;
          const lines = safeText(a.text).split("\n");
          const [cr, cg, cb] = hexRgb(a.color);
          lines.forEach((line, li) => {
            const topV = a.v + (li * size * 1.2) / vh;
            const [x, y] = map(a.u, topV + (size * 0.95) / vh);
            page.drawText(line, { x, y, size, font, color: L.rgb(cr, cg, cb), rotate: L.degrees(r) });
          });
        } else if (a.type === "rect") {
          const [x, y] = map(a.u, a.v + a.h);
          const common = { x, y, width: a.w * vw, height: a.h * vh, rotate: L.degrees(r) };
          if (a.kind === "hl") page.drawRectangle({ ...common, color: L.rgb(1, 0.9, 0.2), opacity: 0.4 });
          else page.drawRectangle({ ...common, color: L.rgb(1, 1, 1), opacity: 1 });
        } else if (a.type === "image") {
          let img = imgCache.get(a.src);
          if (!img) { img = await out.embedPng(await dataUrlBytes(a.src)); imgCache.set(a.src, img); }
          const [x, y] = map(a.u, a.v + a.h);
          page.drawImage(img, { x, y, width: a.w * vw, height: a.h * vh, rotate: L.degrees(r) });
        }
      }
    }
    return out.save();
  }

  const asBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });
  async function guarded(fn) {
    say("Gerando…");
    [$.save, $.extract, $.split].forEach((b) => { b.disabled = true; });
    try { await fn(); say(""); }
    catch (e) { console.error(e); say("Não foi possível gerar o PDF. Se o arquivo tem senha ou proteção, ele não pode ser editado aqui."); }
    finally { updateButtons(); }
  }
  $.save.addEventListener("click", () => guarded(async () => {
    const list = sel.size ? selected() : pages;
    C.saveBlob(asBlob(await buildPdf(list)), baseName + (sel.size ? "-selecao" : "-editado") + ".pdf");
  }));
  $.extract.addEventListener("click", () => guarded(async () => {
    C.saveBlob(asBlob(await buildPdf(selected())), baseName + "-extraido.pdf");
  }));
  $.split.addEventListener("click", () => guarded(async () => {
    const list = sel.size ? selected() : pages;
    if (list.length === 1) { C.saveBlob(asBlob(await buildPdf(list)), baseName + "-pagina.pdf"); return; }
    const out = [];
    const digits = String(pages.length).length;
    for (const p of list) out.push({ name: baseName + "-pagina-" + String(pages.indexOf(p) + 1).padStart(digits, "0") + ".pdf", blob: asBlob(await buildPdf([p])) });
    C.saveBlob(await C.makeZip(out), baseName + "-paginas.zip");
  }));

  /* ------------------------------ editor de página ------------------------------ */
  let cur = null;         // página em edição
  let tool = "";          // "", text, hl, cover
  let selAnn = null;
  let viewW = 0;          // largura em px da folha na tela
  let renderTok = 0;

  function setTool(name) {
    tool = tool === name ? "" : name;
    $.editor.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool));
    $.sheet.classList.toggle("drawing", tool === "hl" || tool === "cover" || tool === "text");
    $.hint.textContent = tool === "text" ? "Toque na página onde quer escrever." : tool === "hl" || tool === "cover" ? "Arraste sobre a página para marcar a área." : "Escolha uma ferramenta. Arraste para mover; toque duas vezes no texto para editar.";
  }

  async function openEditor(page) {
    if (!page) return;
    cur = page; selAnn = null; tool = "";
    $.editor.hidden = false;
    setTool("");
    await drawEditorPage();
  }

  async function drawEditorPage() {
    const tok = ++renderTok;
    const pg = await files[cur.src].doc.getPage(cur.idx + 1);
    const base = pg.getViewport({ scale: 1, rotation: cur.extra });
    const avail = Math.max(240, Math.min($.stage.clientWidth - 24, 900));
    const fit = (($.stage.clientHeight || 700) - 40) * base.width / base.height;
    viewW = Math.max(240, Math.min(avail, Math.max(fit, 320)));
    const css = viewW / base.width;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = pg.getViewport({ scale: css * dpr, rotation: cur.extra });
    $.canvas.width = Math.round(vp.width);
    $.canvas.height = Math.round(vp.height);
    $.sheet.style.width = viewW + "px";
    $.sheet.style.height = Math.round(viewW * base.height / base.width) + "px";
    await pg.render({ canvasContext: $.canvas.getContext("2d"), viewport: vp }).promise;
    if (tok !== renderTok) return;
    renderAnns();
  }

  function renderAnns() {
    $.over.replaceChildren();
    cur.ann.forEach((a) => $.over.append(annEl(a)));
    if (selAnn) { const el = $.over.querySelector('[data-aid="' + selAnn.id + '"]'); if (el) el.classList.add("sel"); }
  }

  const sheetH = () => $.sheet.clientHeight;

  function place(el, a) {
    el.style.left = a.u * 100 + "%";
    el.style.top = a.v * 100 + "%";
    if (a.type === "text") el.style.fontSize = a.size * viewW + "px";
    else { el.style.width = a.w * 100 + "%"; el.style.height = a.h * 100 + "%"; }
  }

  function annEl(a) {
    const el = document.createElement("div");
    el.dataset.aid = a.id;
    if (a.type === "text") {
      el.className = "ann ann-text";
      el.textContent = a.text;
      el.style.color = a.color;
    } else if (a.type === "rect") {
      el.className = "ann ann-rect " + a.kind;
    } else {
      el.className = "ann ann-img";
      const img = document.createElement("img");
      img.src = a.src;
      img.alt = "";
      el.append(img);
    }
    if (a.type !== "text") { const g = document.createElement("span"); g.className = "grip"; el.append(g); }
    place(el, a);
    return el;
  }

  function select(a) {
    selAnn = a;
    $.over.querySelectorAll(".ann").forEach((n) => n.classList.toggle("sel", Boolean(a) && n.dataset.aid === String(a.id)));
    if (a && a.type === "text") $.color.value = a.color;
  }

  const posIn = (e) => { const r = $.over.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  let aseq = 0;
  const addAnn = (a) => { a.id = ++aseq; cur.ann.push(a); return a; };

  function startTextEdit(el, a) {
    el.contentEditable = "true";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    const finish = () => {
      el.removeEventListener("blur", finish);
      el.contentEditable = "false";
      const t = el.innerText.replace(/\n+$/, "");
      if (!t.trim()) { cur.ann = cur.ann.filter((x) => x !== a); selAnn = null; el.remove(); return; }
      a.text = t;
    };
    el.addEventListener("blur", finish);
  }

  let gesture = null;
  $.over.addEventListener("pointerdown", (e) => {
    const target = e.target.closest(".ann");
    if (target && target.contentEditable === "true") return;
    const a = target && cur.ann.find((x) => String(x.id) === target.dataset.aid);
    if (a) {
      e.preventDefault();
      select(a);
      const [px, py] = posIn(e);
      gesture = e.target.classList.contains("grip")
        ? { kind: "resize", a, el: target, ratio: a.type === "image" ? a.w * viewW / (a.h * sheetH()) : 0 }
        : { kind: "move", a, el: target, dx: px - a.u, dy: py - a.v };
      $.over.setPointerCapture(e.pointerId);
      return;
    }
    select(null);
    if (tool === "text") {
      e.preventDefault();
      const [u, v] = posIn(e);
      const t = addAnn({ type: "text", u, v: Math.max(0, v - 0.01), text: "Texto", size: 0.026, color: $.color.value });
      const el = annEl(t);
      $.over.append(el);
      select(t);
      setTool("");
      startTextEdit(el, t);
    } else if (tool === "hl" || tool === "cover") {
      e.preventDefault();
      const [u, v] = posIn(e);
      const a2 = { type: "rect", kind: tool, u, v, w: 0, h: 0, id: 0 };
      const el = annEl(a2);
      $.over.append(el);
      gesture = { kind: "draw", a: a2, el, u0: u, v0: v };
      $.over.setPointerCapture(e.pointerId);
    }
  });

  $.over.addEventListener("pointermove", (e) => {
    if (!gesture) return;
    const [px, py] = posIn(e);
    const g = gesture;
    if (g.kind === "move") {
      g.a.u = clamp(px - g.dx, 0, 1 - 0.02);
      g.a.v = clamp(py - g.dy, 0, 1 - 0.01);
      place(g.el, g.a);
    } else if (g.kind === "resize") {
      const a = g.a;
      let w = clamp(px - a.u, 0.03, 1 - a.u);
      let h = clamp(py - a.v, 0.02, 1 - a.v);
      if (g.ratio) { h = (w * viewW) / g.ratio / sheetH(); if (a.v + h > 1) { h = 1 - a.v; w = (h * sheetH() * g.ratio) / viewW; } }
      a.w = w; a.h = h;
      place(g.el, a);
    } else if (g.kind === "draw") {
      const a = g.a;
      a.u = Math.min(g.u0, px); a.v = Math.min(g.v0, py);
      a.w = Math.abs(px - g.u0); a.h = Math.abs(py - g.v0);
      place(g.el, a);
    }
  });
  const endGesture = () => {
    const g = gesture;
    gesture = null;
    if (!g || g.kind !== "draw") return;
    if (g.a.w < 0.01 || g.a.h < 0.005) { g.el.remove(); return; }
    cur.ann.push(g.a);
    g.a.id = ++aseq;
    g.el.dataset.aid = g.a.id;
    select(g.a);
  };
  $.over.addEventListener("pointerup", endGesture);
  $.over.addEventListener("pointercancel", endGesture);
  $.over.addEventListener("dblclick", (e) => {
    const target = e.target.closest(".ann-text");
    if (!target) return;
    const a = cur.ann.find((x) => String(x.id) === target.dataset.aid);
    if (a) startTextEdit(target, a);
  });

  function removeSelected() {
    if (!selAnn) return;
    cur.ann = cur.ann.filter((x) => x !== selAnn);
    selAnn = null;
    renderAnns();
  }
  $.remove.addEventListener("click", removeSelected);
  function scaleSelected(f) {
    const a = selAnn;
    if (!a) return;
    if (a.type === "text") a.size = clamp(a.size * f, 0.008, 0.2);
    else { const ratio = a.w * viewW / (a.h * sheetH()); a.w = clamp(a.w * f, 0.03, 1 - a.u); a.h = a.type === "image" ? a.w * viewW / ratio / sheetH() : clamp(a.h * f, 0.01, 1 - a.v); }
    renderAnns();
  }
  $.bigger.addEventListener("click", () => scaleSelected(1.15));
  $.smaller.addEventListener("click", () => scaleSelected(1 / 1.15));
  $.color.addEventListener("input", () => { if (selAnn && selAnn.type === "text") { selAnn.color = $.color.value; const el = $.over.querySelector('[data-aid="' + selAnn.id + '"]'); if (el) el.style.color = selAnn.color; } });
  document.addEventListener("keydown", (e) => {
    if ($.editor.hidden) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selAnn && !(e.target.isContentEditable)) { e.preventDefault(); removeSelected(); }
    else if (e.key === "Escape" && !$.sig.open) { e.stopPropagation(); if (e.target.isContentEditable) e.target.blur(); else closeEditor(); }
  }, true);

  function closeEditor() {
    if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
    $.editor.hidden = true;
    cur = null; selAnn = null;
    renderGrid();
  }
  $.done.addEventListener("click", closeEditor);
  window.addEventListener("resize", () => { if (!$.editor.hidden && cur) drawEditorPage(); });

  /* ---- imagem e assinatura ---- */
  function addImageAnn(dataUrl, widthFrac) {
    const img = new Image();
    img.onload = () => {
      const w = widthFrac;
      const h = (w * viewW * img.naturalHeight / img.naturalWidth) / sheetH();
      const a = addAnn({ type: "image", src: dataUrl, u: clamp(0.5 - w / 2, 0, 1 - w), v: clamp(0.5 - h / 2, 0, 1 - h), w, h: Math.min(h, 0.9) });
      renderAnns();
      select(a);
    };
    img.src = dataUrl;
  }

  $.editor.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tool]");
    if (!b) return;
    const t = b.dataset.tool;
    if (t === "text" || t === "hl" || t === "cover") setTool(t);
    else if (t === "sign") openSignature();
    else if (t === "image") pickImage();
  });

  function pickImage() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        addImageAnn(c.toDataURL("image/png"), 0.4);
      } catch (_) { say("Não consegui abrir essa imagem."); }
    });
    input.click();
  }

  const pad = $.pad;
  const pctx = pad.getContext("2d");
  let drawing = false;
  let hasInk = false;
  function padPoint(e) { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; }
  function clearPad() { pctx.clearRect(0, 0, pad.width, pad.height); hasInk = false; }
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); drawing = true; pad.setPointerCapture(e.pointerId); const [x, y] = padPoint(e); pctx.lineWidth = 5; pctx.lineCap = "round"; pctx.lineJoin = "round"; pctx.strokeStyle = "#101820"; pctx.beginPath(); pctx.moveTo(x, y); pctx.lineTo(x + 0.01, y + 0.01); pctx.stroke(); hasInk = true; });
  pad.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = padPoint(e); pctx.lineTo(x, y); pctx.stroke(); });
  ["pointerup", "pointercancel"].forEach((ev) => pad.addEventListener(ev, () => { drawing = false; }));
  byId("sigClear").addEventListener("click", clearPad);
  byId("sigCancel").addEventListener("click", () => $.sig.close());
  byId("sigUse").addEventListener("click", () => {
    if (!hasInk) { $.sig.close(); return; }
    // recorta a margem em branco da assinatura
    const d = pctx.getImageData(0, 0, pad.width, pad.height).data;
    let x0 = pad.width, y0 = pad.height, x1 = 0, y1 = 0;
    for (let y = 0; y < pad.height; y++) for (let x = 0; x < pad.width; x++) if (d[(y * pad.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const m = 8;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(pad.width - 1, x1 + m); y1 = Math.min(pad.height - 1, y1 + m);
    const c = document.createElement("canvas");
    c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext("2d").drawImage(pad, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    try { localStorage.setItem(SIG_KEY, url); } catch (_) { /* sem armazenamento */ }
    $.sig.close();
    addImageAnn(url, 0.28);
  });
  function openSignature() {
    clearPad();
    let saved = "";
    try { saved = localStorage.getItem(SIG_KEY) || ""; } catch (_) { /* ignorado */ }
    $.sig.showModal();
    if (saved) {
      const img = new Image();
      img.onload = () => { const k = Math.min(pad.width * 0.9 / img.width, pad.height * 0.9 / img.height); const w = img.width * k, h = img.height * k; pctx.drawImage(img, (pad.width - w) / 2, (pad.height - h) / 2, w, h); hasInk = true; };
      img.src = saved;
    }
  }

  window.addEventListener("coding:tool", (e) => { if (e.detail === "pdf") updateButtons(); });
  updateButtons();
})();
