/* Coding — ferramentas: QR e código de barras (A4) e etiquetas a partir de planilha */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const SVGNS = "http://www.w3.org/2000/svg";
  const KEY = "coding-tool-codes";
  const MAX_CELLS = 600;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error("falha ao carregar " + src));
    document.head.append(el);
  });
  let qrPromise = null;
  function loadQr() {
    if (window.qrcode && window.qrcode.stringToBytesFuncs) return Promise.resolve();
    if (!qrPromise) {
      qrPromise = loadScript("vendor/qrcode.js").then(() => {
        window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
      }).catch((e) => { qrPromise = null; throw e; });
    }
    return qrPromise;
  }

  const el = (tag, attrs, text) => {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  };

  /* =============================== QR e barras =============================== */

  const codes = {
    ws: byId("codesWs"),
    type: byId("codesType"),
    rows: byId("codesRows"),
    add: byId("codesAdd"),
    cols: byId("codesCols"),
    orient: byId("codesOrient"),
    size: byId("codesSize"),
    sizeVal: byId("codesSizeVal"),
    showText: byId("codesShowText"),
    cut: byId("codesCut"),
    msg: byId("codesMsg"),
    info: byId("codesInfo"),
    preview: byId("codesPreview"),
    box: byId("codesPreviewBox")
  };
  const MARGIN = 10;
  const GAP = 2;
  let timer = 0;
  let cstate = codesDefaults();
  let cDocId = null;

  // Exemplos válidos e editáveis para cada tipo (todos fictícios).
  function allSamples() {
    return {
    qr: [{ content: "https://exemplo.com.br", label: "Nosso site", copies: 1 }, { content: "Mesa 12 · Cardápio do dia", label: "Mesa 12", copies: 1 }, { content: "WIFI:T:WPA;S:CasaWifi;P:senha1234;;", label: "Wi-Fi da casa", copies: 1 }],
    code128: [{ content: "PROD-001", label: "Caneta azul", copies: 2 }, { content: "PROD-002", label: "Caderno 96 folhas", copies: 2 }, { content: "LOTE2026-10", label: "Lote de outubro", copies: 1 }],
    ean13: [{ content: "7891000100103", label: "Produto A", copies: 2 }, { content: "7892000200282", label: "Produto B", copies: 2 }, { content: "7893000300354", label: "Produto C", copies: 1 }]
    };
  }
  function sampleOf(kind) { const s = allSamples(); return (s[kind] || s.qr).map((i) => ({ ...i })); }
  function sameItems(a, b) { return a.length === b.length && a.every((x, i) => x.content === b[i].content && x.label === b[i].label && x.copies === b[i].copies); }
  function codesDefaults() {
    return { name: "Códigos sem título", kind: "qr", items: sampleOf("qr"), cols: 2, orient: "portrait", size: 35, showText: true, cut: true };
  }
  const MAX_CODE_ROWS = 300;
  function normalizeItems(o) {
    let list = [];
    if (Array.isArray(o.items)) list = o.items;
    else if (typeof o.text === "string") list = legacyLines(o.text);
    else list = codesDefaults().items;
    return list.slice(0, MAX_CODE_ROWS).filter((i) => i && typeof i === "object").map((i) => ({
      content: C.util.toText(i.content, "", 300),
      label: C.util.toText(i.label, "", 200),
      copies: C.util.toInt(i.copies, 1, 1, 200)
    }));
  }
  function legacyLines(raw) {
    return raw.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
      const parts = line.includes("\t") ? line.split("\t") : line.split(";");
      const n = parseInt((parts[2] || "").trim(), 10);
      return { content: (parts[0] || "").trim(), label: (parts[1] || "").trim(), copies: Number.isFinite(n) ? n : 1 };
    });
  }

  function codesNormalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = codesDefaults();
    return {
      name: C.util.toText(o.name, d.name, 80),
      kind: ["qr", "code128", "ean13"].includes(o.kind) ? o.kind : (["qr", "code128", "ean13"].includes(o.type) ? o.type : d.kind),
      items: normalizeItems(o),
      cols: C.util.toInt(o.cols, d.cols, 1, 4),
      orient: o.orient === "landscape" ? "landscape" : "portrait",
      size: C.util.toInt(o.size, d.size, 15, 90),
      showText: o.showText !== false,
      cut: o.cut !== false
    };
  }

  function fillCodesForm() {
    codes.type.value = cstate.kind;
    codes.cols.value = String(cstate.cols);
    codes.orient.value = cstate.orient;
    codes.size.value = String(cstate.size);
    codes.showText.checked = cstate.showText;
    codes.cut.checked = cstate.cut;
  }

  function readCodesForm() {
    // Trocar o tipo com os exemplos ainda intactos troca também os exemplos (assim nunca sobra um código inválido para o novo tipo).
    if (codes.type.value !== cstate.kind && sameItems(cstate.items, sampleOf(cstate.kind))) { cstate.items = sampleOf(codes.type.value); renderRows(); }
    cstate.kind = codes.type.value;
    cstate.cols = Number(codes.cols.value);
    cstate.orient = codes.orient.value;
    cstate.size = Number(codes.size.value);
    cstate.showText = codes.showText.checked;
    cstate.cut = codes.cut.checked;
  }

  function parseLines(list) {
    const items = [];
    list.forEach((it, index) => {
      const content = (it.content || "").trim();
      if (!content) return;
      items.push({ line: index + 1, content, label: (it.label || "").trim(), copies: clamp(it.copies || 1, 1, 200) });
    });
    return items;
  }

  /* Editor de linhas: conteúdo, legenda e cópias (sem sintaxe nenhuma) */
  let rt = 0;
  function renderCodesSoon() { clearTimeout(rt); rt = setTimeout(renderCodes, 150); }
  let rowsFocus = -1;
  function renderRows() {
    const box = codes.rows;
    const items = cstate.items;
    box.replaceChildren(...items.map((it, i) => {
      const row = el("div", { class: "row-item", "data-i": String(i) });
      const c = el("input", { class: "ri-content", type: "text", placeholder: "Conteúdo (ex.: 7891234567890)", "aria-label": "Conteúdo do código " + (i + 1), autocomplete: "off", spellcheck: "false" });
      c.value = it.content;
      const l = el("input", { class: "ri-label", type: "text", placeholder: "Legenda (opcional)", "aria-label": "Legenda do código " + (i + 1), autocomplete: "off" });
      l.value = it.label;
      const n = el("input", { class: "ri-copies", type: "number", min: "1", max: "200", inputmode: "numeric", title: "Quantas cópias", "aria-label": "Cópias do código " + (i + 1) });
      n.value = String(it.copies);
      const x = el("button", { class: "icon-btn ri-del", type: "button", title: "Remover", "aria-label": "Remover código " + (i + 1) });
      x.innerHTML = '<svg class="icon"><use href="#ic-trash"/></svg>';
      row.append(c, l, n, x);
      return row;
    }));
    if (rowsFocus >= 0) { const r = box.children[rowsFocus]; if (r) r.querySelector(".ri-content").focus(); rowsFocus = -1; }
  }
  function addRow(at, focus) {
    if (cstate.items.length >= MAX_CODE_ROWS) { C.toast("Limite de " + MAX_CODE_ROWS + " códigos por documento."); return; }
    cstate.items.splice(at === undefined ? cstate.items.length : at, 0, { content: "", label: "", copies: 1 });
    if (focus !== false) rowsFocus = at === undefined ? cstate.items.length - 1 : at;
    renderRows();
    C.scheduleSave();
  }
  codes.add.addEventListener("click", () => addRow());
  codes.rows.addEventListener("input", (e) => {
    const row = e.target.closest(".row-item");
    if (!row) return;
    const it = cstate.items[Number(row.dataset.i)];
    if (!it) return;
    if (e.target.classList.contains("ri-content")) it.content = e.target.value;
    else if (e.target.classList.contains("ri-label")) it.label = e.target.value;
    else if (e.target.classList.contains("ri-copies")) it.copies = clamp(parseInt(e.target.value, 10) || 1, 1, 200);
    C.scheduleSave();
    renderCodesSoon();
  });
  codes.rows.addEventListener("click", (e) => {
    const del = e.target.closest(".ri-del");
    if (!del) return;
    const i = Number(del.closest(".row-item").dataset.i);
    cstate.items.splice(i, 1);
    if (!cstate.items.length) cstate.items.push({ content: "", label: "", copies: 1 });
    renderRows();
    C.scheduleSave();
    renderCodesSoon();
  });
  codes.rows.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("input")) return;
    e.preventDefault();
    const i = Number(e.target.closest(".row-item").dataset.i);
    if (i === cstate.items.length - 1) addRow(); else { const nx = codes.rows.children[i + 1]; if (nx) nx.querySelector(".ri-content").focus(); }
  });
  codes.rows.addEventListener("paste", (e) => {
    const input = e.target.closest(".ri-content");
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (!input || !text || !/[\r\n]/.test(text.trim())) return;
    e.preventDefault();
    const i = Number(input.closest(".row-item").dataset.i);
    const added = legacyLines(text).filter((x) => x.content);
    if (!added.length) return;
    const room = MAX_CODE_ROWS - cstate.items.length + 1;
    const cur = cstate.items[i];
    const blank = !cur.content && !cur.label;
    cstate.items.splice(i, blank ? 1 : 0, ...added.slice(0, room + (blank ? 0 : -1)).map((x) => ({ ...x, copies: clamp(x.copies, 1, 200) })));
    renderRows();
    C.scheduleSave();
    renderCodesSoon();
    C.toast(added.length + (added.length === 1 ? " código colado." : " códigos colados."));
  });

  function pathFromRuns(rects) {
    return rects.map(([x, y, w, h]) => "M" + x + " " + y + "h" + w + "v" + h + "h-" + w + "z").join("");
  }

  function barSvg(modules, widthMm, heightMm) {
    const quiet = 10;
    const total = modules.length + quiet * 2;
    const rects = [];
    let i = 0;
    while (i < modules.length) {
      if (modules[i]) {
        let j = i;
        while (j < modules.length && modules[j]) j++;
        rects.push([quiet + i, 0, j - i, 10]);
        i = j;
      } else i++;
    }
    const svg = svgEl("svg", { viewBox: "0 0 " + total + " 10", preserveAspectRatio: "none", width: widthMm + "mm", height: heightMm + "mm", "shape-rendering": "crispEdges" });
    svg.append(svgEl("path", { d: pathFromRuns(rects), fill: "#000" }));
    return svg;
  }

  function qrSvg(text, sizeMm) {
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2;
    const rects = [];
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          let d = c;
          while (d < n && qr.isDark(r, d)) d++;
          rects.push([quiet + c, quiet + r, d - c, 1]);
          c = d;
        } else c++;
      }
    }
    const total = n + quiet * 2;
    const svg = svgEl("svg", { viewBox: "0 0 " + total + " " + total, width: sizeMm + "mm", height: sizeMm + "mm", "shape-rendering": "crispEdges" });
    svg.append(svgEl("path", { d: pathFromRuns(rects), fill: "#000" }));
    return svg;
  }

  /* Monta as páginas (elementos .codes-page em mm). */
  async function buildPages(s) {
    const type = s.kind;
    const items = parseLines(s.items);
    const errors = [];
    const cells = [];
    if (type === "qr" && items.length) { try { await loadQr(); } catch (_) { errors.push("Não foi possível carregar o gerador de QR."); } }

    const cols = s.cols;
    const landscape = s.orient === "landscape";
    const W = landscape ? 297 : 210;
    const H = landscape ? 210 : 297;
    const cw = (W - 2 * MARGIN - (cols - 1) * GAP) / cols;
    const size = s.size;
    const showText = s.showText;
    const anyLabel = items.some((it) => it.label);
    const barcode = type !== "qr";
    const lines = !showText ? 0 : barcode ? (anyLabel ? 2 : 1) : 1;
    const codeH = barcode ? size : Math.min(size, cw - 4);
    const textH = lines * 4;
    const ch = codeH + textH + 4;
    const rows = Math.max(1, Math.floor((H - 2 * MARGIN + GAP) / (ch + GAP)));
    const perPage = rows * cols;

    items.forEach((it) => {
      let node = null;
      let digits = it.content;
      try {
        if (type === "qr") {
          if (!window.qrcode) throw new Error("QR indisponível");
          node = qrSvg(it.content, codeH);
        } else if (type === "code128") {
          const r = window.CodingBarcodes.code128(it.content);
          if (r.error) throw new Error(r.error);
          node = barSvg(r.modules, Math.min(cw - 4, Math.max(codeH * 1.6, 30)), codeH);
        } else {
          const r = window.CodingBarcodes.ean13(it.content);
          if (r.error) throw new Error(r.error);
          digits = r.digits;
          node = barSvg(r.modules, Math.min(cw - 4, Math.max(codeH * 1.4, 30)), codeH);
        }
      } catch (e) {
        errors.push("Linha " + it.line + ": " + (e && e.message && !/qrcode|code length|overflow/i.test(e.message) ? e.message : "conteúdo longo demais para este tipo."));
        return;
      }
      for (let i = 0; i < it.copies; i++) cells.push({ node, digits, it });
    });

    if (cells.length > MAX_CELLS) { cells.length = MAX_CELLS; errors.push("Limite de " + MAX_CELLS + " códigos por impressão; o restante foi ignorado."); }

    const pages = [];
    const total = Math.max(1, Math.ceil(cells.length / perPage));
    for (let p = 0; p < total; p++) {
      const page = el("div", { class: "codes-page" });
      page.style.width = W + "mm";
      page.style.height = H + "mm";
      const grid = el("div", { class: "codes-grid" });
      grid.style.cssText = "left:" + MARGIN + "mm;top:" + MARGIN + "mm;grid-template-columns:repeat(" + cols + "," + cw + "mm);gap:" + GAP + "mm;";
      cells.slice(p * perPage, (p + 1) * perPage).forEach((c) => {
        const cell = el("div", { class: "code-cell" + (s.cut ? " cut" : "") });
        cell.style.width = cw + "mm";
        cell.style.height = ch + "mm";
        cell.append(c.node.cloneNode(true));
        if (showText) {
          if (barcode) {
            cell.append(el("div", { class: "ct" }, c.digits));
            if (anyLabel) cell.append(el("div", { class: "ct l2" }, c.it.label));
          } else {
            cell.append(el("div", { class: "ct" }, c.it.label || c.it.content));
          }
        }
        grid.append(cell);
      });
      page.append(grid);
      pages.push(page);
    }
    return { pages, count: cells.length, errors, W, H, perPage };
  }

  let renderToken = 0;
  const lastPages = { r: null };
  async function renderCodes() {
    const token = ++renderToken;
    codes.sizeVal.textContent = cstate.size + " mm";
    const r = await buildPages(cstate);
    if (token !== renderToken) return;
    codes.preview.replaceChildren(...r.pages);
    codes.msg.textContent = r.errors.slice(0, 4).join("\n") + (r.errors.length > 4 ? "\n… e mais " + (r.errors.length - 4) + "." : "");
    codes.info.textContent = r.count + (r.count === 1 ? " código" : " códigos") + " · " + r.pages.length + (r.pages.length === 1 ? " folha" : " folhas") + " A4 · " + r.perPage + " por folha";
    fitPreview(r.W);
    lastPages.r = r;
  }

  function fitPreview(pageWmm) {
    const px = pageWmm * 96 / 25.4;
    const avail = Math.max(120, codes.box.clientWidth - 32);
    codes.preview.style.zoom = String(Math.min(1.4, avail / px));
  }

  function scheduleCodes() {
    readCodesForm();
    C.scheduleSave();
    clearTimeout(timer);
    timer = setTimeout(renderCodes, 120);
  }

  [codes.type, codes.cols, codes.orient, codes.size, codes.showText, codes.cut].forEach((n) => {
    n.addEventListener("input", scheduleCodes);
    n.addEventListener("change", scheduleCodes);
  });
  window.addEventListener("resize", () => { if (!codes.ws.hidden && lastPages.r) fitPreview(lastPages.r.W); });
  window.addEventListener("coding:shown", () => { if (!codes.ws.hidden && lastPages.r) fitPreview(lastPages.r.W); });

  async function printCodes() {
    await renderCodes();
    const r = lastPages.r;
    if (!r || !r.count) { C.toast("Não há códigos válidos para imprimir."); return; }
    let root = byId("codesPrintRoot");
    if (!root) { root = el("div", { id: "codesPrintRoot" }); document.body.append(root); }
    root.replaceChildren(...r.pages.map((p) => p.cloneNode(true)));
    const html = document.documentElement;
    const prevPaper = html.dataset.paper;
    html.dataset.paper = cstate.orient;
    byId("pageStyle").textContent = "@page { size: A4 " + cstate.orient + "; margin: 0; }";
    document.body.classList.add("print-codes");
    const done = () => {
      document.body.classList.remove("print-codes");
      if (prevPaper === undefined) delete html.dataset.paper; else html.dataset.paper = prevPaper;
      root.replaceChildren();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 50);
  }

  function setCodes(patch) {
    Object.assign(cstate, patch);
    fillCodesForm();
    C.scheduleSave();
    renderCodes();
  }

  function codesMenu(target) {
    if (!codes.ws.contains(target)) return null;
    const kindItem = (label, k) => ({ label, check: cstate.kind === k, run: () => setCodes({ kind: k }) });
    return [
      { label: "Imprimir / PDF", shortcut: "Ctrl+P", run: printCodes },
      { sep: true },
      { label: "Tipo de código", sub: [kindItem("QR Code", "qr"), kindItem("Code 128 (barras)", "code128"), kindItem("EAN-13 (barras)", "ean13")] },
      { label: "Colunas", sub: [1, 2, 3, 4].map((n) => ({ label: String(n), check: cstate.cols === n, run: () => setCodes({ cols: n }) })) },
      { label: "Folha", sub: [{ label: "Retrato", check: cstate.orient === "portrait", run: () => setCodes({ orient: "portrait" }) }, { label: "Paisagem", check: cstate.orient === "landscape", run: () => setCodes({ orient: "landscape" }) }] },
      { label: "Tamanho do código", sub: [
        { label: "Maior (+5 mm)", run: () => setCodes({ size: clamp(cstate.size + 5, 15, 90) }), disabled: cstate.size >= 90 },
        { label: "Menor (−5 mm)", run: () => setCodes({ size: clamp(cstate.size - 5, 15, 90) }), disabled: cstate.size <= 15 }
      ] },
      { sep: true },
      { label: "Mostrar o texto embaixo", check: cstate.showText, run: () => setCodes({ showText: !cstate.showText }) },
      { label: "Linha de corte", check: cstate.cut, run: () => setCodes({ cut: !cstate.cut }) }
    ];
  }

  function codesInfo(doc) {
    const n = parseLines(doc.state.items).reduce((a, b) => a + b.copies, 0);
    return n + (n === 1 ? " código" : " códigos");
  }

  C.register({
    type: "codes",
    defaults: codesDefaults,
    normalize: codesNormalize,
    payload(doc) { return { format: "coding-document", version: 3, type: "codes", ...doc.state }; },
    info: codesInfo,
    async open(doc) {
      cDocId = doc.id;
      cstate = doc.state;
      fillCodesForm();
      renderRows();
      await renderCodes();
    },
    close() {},
    print: printCodes,
    menuItems: codesMenu
  });

  /* ============================ Planilha → Etiquetas ============================ */

  const sheet = {
    ws: byId("sheetWs"),
    pick: byId("sheetPick"),
    file: byId("sheetFile"),
    fromCalc: byId("sheetFromCalc"),
    msg: byId("sheetMsg"),
    step2: byId("sheetStep2"),
    colCode: byId("sheetColCode"),
    colDesc: byId("sheetColDesc"),
    colCopies: byId("sheetColCopies"),
    header: byId("sheetHeader"),
    defCopies: byId("sheetDefCopies"),
    table: byId("sheetTable"),
    info: byId("sheetInfo"), manual: byId("sheetManual"), addRow: byId("sheetAddRow"), shown: byId("sheetShown"),
    create: byId("sheetCreate")
  };
  const MAX_ROWS = 3000;
  const MAX_COLS = 30;
  let sstate = sheetDefaults();

  // Tabela de exemplo (fictícia) para testar sem importar arquivo.
  function SHEET_SAMPLE() { return [["Código", "Descrição", "Cópias"], ["190847", "ÁRVORE DE NATAL 240CM", "4"], ["250311", "PISCA-PISCA 100 LEDS", "2"], ["300512", "BOLA VERMELHA 8CM", "12"], ["410233", "GUIRLANDA DOURADA 2M", "3"], ["520874", "LAÇO DE CETIM VERDE", "6"]]; }
  function sheetDefaults() {
    return { name: "Planilha sem título", rows: SHEET_SAMPLE(), header: true, colCode: 0, colDesc: 1, colCopies: 2, defCopies: 1 };
  }
  function sheetNormalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = sheetDefaults();
    const rows = Array.isArray(o.rows) ? o.rows.slice(0, MAX_ROWS).map((r) => (Array.isArray(r) ? r.slice(0, MAX_COLS).map((c) => C.util.toText(c, "", 300)) : [])) : [];
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    rows.forEach((r) => { while (r.length < width) r.push(""); });
    return {
      name: C.util.toText(o.name, d.name, 80),
      rows,
      header: o.header === true,
      colCode: C.util.toInt(o.colCode, 0, 0, Math.max(0, width - 1)),
      colDesc: C.util.toInt(o.colDesc, -1, -1, Math.max(-1, width - 1)),
      colCopies: C.util.toInt(o.colCopies, -1, -1, Math.max(-1, width - 1)),
      defCopies: C.util.toInt(o.defCopies, 1, 1, 500)
    };
  }

  function parseDelimited(text) {
    const t = text.replace(/^﻿/, "");
    const first = t.split(/\r?\n/, 1)[0] || "";
    const count = (ch) => first.split(ch).length - 1;
    const delim = [["\t", count("\t")], [";", count(";")], [",", count(",")]].sort((a, b) => b[1] - a[1])[0];
    const sep = delim[1] > 0 ? delim[0] : ",";
    const out = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (quoted) {
        if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
      } else if (ch === '"' && cell === "") quoted = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && t[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        out.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); out.push(row); }
    return out.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  /* Leitor mínimo de .xlsx (zip + XML), sem bibliotecas. */
  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, lho };
      p += 46 + nlen + elen + clen;
    }
    return {
      names: Object.keys(files),
      async read(name) {
        const f = files[name];
        if (!f) return null;
        const nlen = dv.getUint16(f.lho + 26, true);
        const elen = dv.getUint16(f.lho + 28, true);
        const start = f.lho + 30 + nlen + elen;
        const data = u8.subarray(start, start + f.csize);
        const raw = f.method === 0 ? data : f.method === 8 ? await inflateRaw(data) : null;
        if (raw && raw.length > 80000000) throw new Error("arquivo descompactado grande demais");
        return raw ? dec.decode(raw) : null;
      }
    };
  }

  const colIndex = (ref) => {
    const letters = (ref.match(/^[A-Z]+/) || ["A"])[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  };

  async function parseXlsx(buffer, withFormulas) {
    const zip = await unzip(buffer);
    const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
    let sheetPath = "xl/worksheets/sheet1.xml";
    try {
      const wb = parse(await zip.read("xl/workbook.xml"));
      const rels = parse(await zip.read("xl/_rels/workbook.xml.rels"));
      const first = wb.getElementsByTagName("sheet")[0];
      const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
      const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
      if (rel) { const t = rel.getAttribute("Target"); sheetPath = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.?\//, ""); }
    } catch (_) { /* usa a primeira planilha */ }
    if (!zip.names.includes(sheetPath)) sheetPath = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetPath) throw new Error("sem planilha");
    const shared = [];
    const ssXml = await zip.read("xl/sharedStrings.xml");
    if (ssXml) {
      Array.from(parse(ssXml).getElementsByTagName("si")).forEach((si) => {
        shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent).join(""));
      });
    }
    const xmlText = await zip.read(sheetPath);
    if (!xmlText || xmlText.length > 60000000) throw new Error("planilha grande demais");
    const doc = parse(xmlText);
    const out = [];
    let lastRow = 0;
    Array.from(doc.getElementsByTagName("row")).forEach((r) => {
      // respeita o número da linha do arquivo (<row r="3">): linhas vazias no meio continuam no lugar
      let rn = parseInt(r.getAttribute("r"), 10);
      if (!(rn >= 1)) rn = lastRow + 1;
      lastRow = rn;
      if (rn > 20000) return;
      const arr = [];
      let nextCol = 0;
      Array.from(r.getElementsByTagName("c")).forEach((c) => {
        const ref = c.getAttribute("r");
        const idx = ref ? colIndex(ref) : nextCol;
        nextCol = idx + 1;
        if (idx > 300) return;
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s") val = shared[Number(v && v.textContent)] || "";
        else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent).join("");
        else if (v) val = v.textContent;
        if (withFormulas) { const f = c.getElementsByTagName("f")[0]; if (f && f.textContent) val = "=" + f.textContent; }
        arr[idx] = val;
      });
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = "";
      out[rn - 1] = arr;
    });
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    while (out.length && !out[out.length - 1].some((c) => String(c).trim() !== "")) out.pop();
    // Planilha → Etiquetas ignora linhas vazias (depois de já estarem na posição certa); Planilhas mantém tudo
    return withFormulas ? out : out.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  async function readFile(file, withFormulas) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) return parseXlsx(await file.arrayBuffer(), withFormulas);
    if (name.endsWith(".xls")) throw new Error("Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.");
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    return parseDelimited(text);
  }

  C.readSpreadsheet = (file) => readFile(file, true);

  const looksNumeric = (v) => /^\d+([.,]\d+)?$/.test(String(v).trim());

  function fillSelects() {
    const rows = sstate.rows;
    const width = rows.length ? rows[0].length : 0;
    const head = rows[0] || [];
    const names = head.map((c, i) => (sstate.header && c ? c : "Coluna " + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "")));
    const fill = (sel, withNone, value) => {
      const list = [];
      if (withNone) list.push(["-1", "Sem coluna"]);
      names.forEach((n, i) => list.push([String(i), n]));
      sel.replaceChildren(...list.map(([v, t]) => el("option", { value: v }, t)));
      sel.value = String(value);
    };
    fill(sheet.colCode, false, sstate.colCode);
    fill(sheet.colDesc, true, sstate.colDesc);
    fill(sheet.colCopies, true, sstate.colCopies);
    sheet.header.checked = sstate.header;
    sheet.defCopies.value = String(sstate.defCopies);
    return width;
  }

  function setData(data) {
    const rows = data.map((r) => r.slice(0, MAX_COLS).map((c) => String(c === undefined || c === null ? "" : c).trim().slice(0, 300))).slice(0, MAX_ROWS);
    if (!rows.length) { sstate.rows = []; sheet.step2.hidden = true; sheet.msg.textContent = "Não encontrei linhas nesse arquivo."; C.scheduleSave(); return; }
    const width = Math.max(...rows.map((r) => r.length));
    rows.forEach((r) => { while (r.length < width) r.push(""); });
    const head = rows[0];
    const isHead = rows.length > 1 && head.every((c) => c !== "") && !head.some(looksNumeric) && new Set(head).size === head.length;
    sstate.rows = rows;
    sstate.header = isHead;
    sstate.colCode = 0;
    sstate.colDesc = width > 1 ? 1 : -1;
    const guess = head.findIndex((n, i) => isHead && i > 0 && /^(qtd|qtde|quant|copias|cópias|etiquetas|qty)/i.test(n));
    sstate.colCopies = guess >= 0 ? guess : (width > 2 && rows.slice(isHead ? 1 : 0).every((r) => looksNumeric(r[2])) ? 2 : -1);
    sheet.msg.textContent = data.length > MAX_ROWS ? "Só as primeiras " + MAX_ROWS + " linhas entram." : "";
    showSheet();
    C.scheduleSave();
  }

  function sheetItems() {
    const start = sstate.header ? 1 : 0;
    const ci = sstate.colCode, di = sstate.colDesc, ki = sstate.colCopies;
    const def = clamp(sstate.defCopies || 1, 1, 500);
    const items = [];
    sstate.rows.slice(start).forEach((r) => {
      const code = (r[ci] || "").trim();
      if (!code) return;
      let copies = def;
      if (ki >= 0) { const n = parseInt(String(r[ki]).replace(",", "."), 10); if (Number.isFinite(n) && n > 0) copies = clamp(n, 1, 500); }
      items.push({ code, description: di >= 0 ? (r[di] || "").trim() : "", copies });
    });
    return items;
  }

  function showSheet() {
    sheet.step2.hidden = !sstate.rows.length;
    if (!sstate.rows.length) return;
    fillSelects();
    refreshSheet();
  }

  const EDIT_ROWS = 200; // linhas editáveis na tela (o Etiquetas aceita até 200 itens)
  function refreshSheet() {
    const rows = sstate.rows;
    const start = sstate.header ? 1 : 0;
    const marks = new Set([sstate.colCode, sstate.colDesc, sstate.colCopies]);
    sheet.table.replaceChildren();
    const width = rows[0].length;
    const thead = el("tr");
    for (let i = 0; i < width; i++) thead.append(el("th", {}, i === sstate.colCode ? "Código" : i === sstate.colDesc ? "Descrição" : i === sstate.colCopies ? "Cópias" : ""));
    thead.append(el("th", { "aria-label": "Apagar linha" }, ""));
    sheet.table.append(thead);
    rows.slice(0, EDIT_ROWS).forEach((r, idx) => {
      const tr = el("tr", idx < start ? { class: "is-head" } : {});
      for (let i = 0; i < width; i++) {
        const td = el("td", marks.has(i) ? { class: "is-key" } : {});
        const inp = el("input", { type: "text", value: r[i] || "", maxlength: "300", "aria-label": "Linha " + (idx + 1) + ", coluna " + (i + 1) });
        inp.addEventListener("input", () => { sstate.rows[idx][i] = inp.value.trim(); updateSheetInfo(); C.scheduleSave(); });
        td.append(inp); tr.append(td);
      }
      const del = el("button", { type: "button", class: "tv-rowdel", title: "Apagar esta linha", "aria-label": "Apagar a linha " + (idx + 1) });
      del.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#ic-close"/></svg>';
      del.addEventListener("click", () => { if (rows.length <= 1) { rows[0] = rows[0].map(() => ""); } else rows.splice(idx, 1); refreshSheet(); C.scheduleSave(); });
      const tdd = el("td", { class: "tv-rowdel-td" }); tdd.append(del); tr.append(tdd);
      sheet.table.append(tr);
    });
    sheet.shown.textContent = rows.length > EDIT_ROWS ? "Mostrando as primeiras " + EDIT_ROWS + " de " + rows.length + " linhas." : "";
    updateSheetInfo();
  }
  function updateSheetInfo() {
    const items = sheetItems();
    const total = items.reduce((a, b) => a + b.copies, 0);
    const MAX = 200;
    sheet.info.textContent = items.length + (items.length === 1 ? " item" : " itens") + " · " + total + (total === 1 ? " etiqueta" : " etiquetas") + (items.length > MAX ? " — o Etiquetas aceita até " + MAX + " itens por documento; só os primeiros " + MAX + " entram." : "");
    sheet.create.disabled = !items.length;
    C.setPrimary(undefined, !items.length);
  }
  function addSheetRow() {
    if (!sstate.rows.length) return;
    if (sstate.rows.length >= MAX_ROWS) { C.toast("Limite de " + MAX_ROWS + " linhas."); return; }
    sstate.rows.push(sstate.rows[0].map(() => ""));
    refreshSheet(); C.scheduleSave();
    const last = sheet.table.querySelector("tr:last-child input"); if (last) last.focus();
  }
  function startManual() {
    if (sstate.rows.length && !window.confirm("Começar uma lista nova? A tabela atual será substituída.")) return;
    sstate.rows = [["Código", "Descrição", "Cópias"], ["", "", "1"], ["", "", "1"], ["", "", "1"]];
    sstate.header = true; sstate.colCode = 0; sstate.colDesc = 1; sstate.colCopies = 2;
    sheet.msg.textContent = "Preencha a tabela. A primeira linha é o título das colunas.";
    showSheet(); C.scheduleSave();
    const first = sheet.table.querySelector("tr.is-head + tr input"); if (first) first.focus();
  }
  function useSheetSample() {
    const ex = SHEET_SAMPLE();
    const same = JSON.stringify(sstate.rows) === JSON.stringify(ex);
    const hasWork = sstate.rows.some((r) => r.some((c) => String(c).trim()));
    if (!same && hasWork && !window.confirm("Trocar a tabela atual pelo exemplo?")) return;
    sstate.rows = ex; sstate.header = true; sstate.colCode = 0; sstate.colDesc = 1; sstate.colCopies = 2;
    sheet.msg.textContent = "Exemplo carregado: mude qualquer célula, apague ou adicione linhas.";
    showSheet(); C.scheduleSave();
  }
  byId("sheetSample").addEventListener("click", useSheetSample);
  sheet.addRow.addEventListener("click", addSheetRow);
  sheet.manual.addEventListener("click", startManual);

  function readSheetForm() {
    sstate.colCode = Number(sheet.colCode.value);
    sstate.colDesc = Number(sheet.colDesc.value);
    sstate.colCopies = Number(sheet.colCopies.value);
    sstate.header = sheet.header.checked;
    sstate.defCopies = clamp(parseInt(sheet.defCopies.value, 10) || 1, 1, 500);
  }
  [sheet.colCode, sheet.colDesc, sheet.colCopies, sheet.header, sheet.defCopies].forEach((n) => {
    const h = () => { if (!sstate.rows.length) return; readSheetForm(); refreshSheet(); C.scheduleSave(); };
    n.addEventListener("input", h);
    n.addEventListener("change", h);
  });
  sheet.pick.addEventListener("click", () => sheet.file.click());
  sheet.file.addEventListener("change", async () => {
    const file = sheet.file.files && sheet.file.files[0];
    sheet.file.value = "";
    if (!file) return;
    sheet.msg.textContent = "Lendo o arquivo…";
    try { setData(await readFile(file)); }
    catch (e) { sheet.step2.hidden = true; sheet.msg.textContent = e && /\.xls/.test(e.message) ? e.message : "Não consegui ler esse arquivo. Use .xlsx ou .csv."; }
  });
  function calcDocs() { return Object.values(C.lib.docs).filter((d) => d.type === "calc").sort((a, b) => b.updatedAt - a.updatedAt); }
  function fillCalcList() {
    const docs = calcDocs();
    sheet.fromCalc.replaceChildren(...[["", docs.length ? "Escolher uma planilha…" : "Você ainda não tem planilhas"]].concat(docs.map((d) => [d.id, d.state.name.trim() || "Planilha sem título"])).map(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; return o; }));
    sheet.fromCalc.disabled = !docs.length;
  }
  sheet.fromCalc.addEventListener("change", () => {
    const doc = C.lib.docs[sheet.fromCalc.value];
    sheet.fromCalc.value = "";
    const X = window.CodingCalc;
    if (!doc || !X) return;
    const cx = X.makeCx(doc.state.cells);
    let maxR = -1, maxC = -1;
    Object.entries(doc.state.cells).forEach(([k, c]) => { if (!c.v) return; const [r, cc] = k.split(",").map(Number); if (r > maxR) maxR = r; if (cc > maxC) maxC = cc; });
    if (maxR < 0) { sheet.msg.textContent = "Essa planilha está vazia."; return; }
    const rows = [];
    for (let r = 0; r <= maxR; r++) { const row = []; for (let c = 0; c <= maxC; c++) { const cell = doc.state.cells[r + "," + c]; row.push(X.showValue(cx.get(r, c), cell && cell.n)); } rows.push(row); }
    sstate.name = doc.state.name;
    setData(rows);
  });

  async function createLabels() {
    const items = sheetItems().slice(0, 200);
    if (!items.length) { C.toast("Escolha um arquivo ou uma planilha primeiro."); return; }
    const base = C.modes.labels.defaults();
    base.items = items.map((it) => ({ id: "", ...it }));
    base.name = sstate.name && !/sem título/i.test(sstate.name) ? sstate.name : "Etiquetas da planilha";
    const ok = await C.createDoc("labels", base);
    if (ok) C.toast(items.length + (items.length === 1 ? " item criado." : " itens criados.") + " Confira e imprima.");
  }
  sheet.create.addEventListener("click", createLabels);

  function sheetMenu(target) {
    if (!sheet.ws.contains(target)) return null;
    return [
      { label: "Criar etiquetas", run: createLabels, disabled: !sstate.rows.length },
      { sep: true },
      { label: "Escolher arquivo…", run: () => sheet.file.click() },
      { label: "Limpar a planilha", run: () => { sstate.rows = []; showSheet(); C.setPrimary(undefined, true); C.scheduleSave(); }, disabled: !sstate.rows.length }
    ];
  }

  C.register({
    type: "sheet",
    defaults: sheetDefaults,
    normalize: sheetNormalize,
    payload(doc) { return { format: "coding-document", version: 3, type: "sheet", ...doc.state }; },
    info(doc) { const n = doc.state.rows.length - (doc.state.header ? 1 : 0); return Math.max(0, n) + " linhas"; },
    async open(doc) {
      sstate = doc.state;
      sheet.msg.textContent = "";
      fillCalcList();
      showSheet();
      if (!sstate.rows.length) C.setPrimary(undefined, true);
    },
    close() {},
    print: createLabels,
    primaryIsPrint: false,
    menuItems: sheetMenu
  });


  /* ============================ Celular: folha inferior (shell.js) ============================ */
  if (C.shell) {
    const kids = (ws, sel) => [...ws.querySelectorAll(sel)];
    const CF = kids(codes.ws, ".tv-form > *"); // 0 tipo, 1 códigos, 2 aviso, 3 colunas/folha, 4 tamanho, 5 texto, 6 corte, 7 info
    const exp = document.createElement("div");
    exp.className = "sh-export";
    exp.innerHTML = '<button class="btn primary" type="button" id="codesPrintM"><svg class="icon" aria-hidden="true"><use href="#ic-print"/></svg> Imprimir / salvar PDF</button><p class="tv-info">Na janela de impressão escolha "Salvar como PDF". O tamanho no papel não depende do zoom da tela.</p>';
    exp.querySelector("button").addEventListener("click", () => C.print());
    C.shell.create({
      ws: codes.ws, id: "codigos", host: codes.ws.querySelector(".tv-body"), label: "Controles dos códigos",
      tabs: [
        { key: "cod", label: "Códigos", icon: "ic-qr", nodes: () => [CF[0], CF[1], CF[2]] },
        { key: "apa", label: "Aparência", icon: "ic-sliders", nodes: () => [CF[4], CF[5], CF[6]] },
        { key: "pag", label: "Página", icon: "ic-page", nodes: () => [CF[3], CF[7]] },
        { key: "exp", label: "Exportar", icon: "ic-download", nodes: () => [exp] }
      ]
    });
    const SF = [kids(sheet.ws, ".tv-form > p.tv-info")[0], sheet.pick.parentNode, sheet.fromCalc.closest("label"), sheet.msg];
    C.shell.create({
      ws: sheet.ws, id: "planilha-etiquetas", host: sheet.ws.querySelector(".tv-body"), label: "Controles de planilha para etiquetas", defaultState: "collapsed",
      tabs: [
        { key: "prod", label: "Produtos", icon: "ic-list", nodes: () => SF },
        { key: "col", label: "Colunas", icon: "ic-viewgrid", nodes: () => [sheet.step2.querySelector(".tv-grid3"), sheet.header.closest(".tv-row")] }
      ]
    });
  }
  /* ================================ início ================================ */
})();
