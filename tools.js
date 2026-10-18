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
    view: byId("codesView"),
    type: byId("codesType"),
    text: byId("codesText"),
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

  function loadSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { /* ignorado */ }
    if (!s || typeof s !== "object") s = {};
    codes.type.value = ["qr", "code128", "ean13"].includes(s.type) ? s.type : "qr";
    codes.text.value = typeof s.text === "string" ? s.text : "123456789012 ; Exemplo ; 2";
    codes.cols.value = String(clamp(Number(s.cols) || 2, 1, 4));
    codes.orient.value = s.orient === "landscape" ? "landscape" : "portrait";
    codes.size.value = String(clamp(Number(s.size) || 35, 15, 90));
    codes.showText.checked = s.showText !== false;
    codes.cut.checked = s.cut !== false;
  }

  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        type: codes.type.value, text: codes.text.value, cols: Number(codes.cols.value), orient: codes.orient.value,
        size: Number(codes.size.value), showText: codes.showText.checked, cut: codes.cut.checked
      }));
    } catch (_) { /* sem armazenamento */ }
  }

  function parseLines(raw, errors) {
    const items = [];
    raw.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.includes("\t") ? line.split("\t") : line.split(";");
      const content = (parts[0] || "").trim();
      if (!content) return;
      const label = (parts[1] || "").trim();
      const n = parseInt((parts[2] || "").trim(), 10);
      items.push({ line: index + 1, content, label, copies: Number.isFinite(n) ? clamp(n, 1, 200) : 1 });
    });
    return items;
  }

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

  /* Monta as páginas (elementos .codes-page em mm). Devolve { pages, count, errors }. */
  async function buildPages() {
    const type = codes.type.value;
    const items = parseLines(codes.text.value);
    const errors = [];
    const cells = [];
    if (type === "qr" && items.length) { try { await loadQr(); } catch (_) { errors.push("Não foi possível carregar o gerador de QR."); } }

    const cols = Number(codes.cols.value);
    const landscape = codes.orient.value === "landscape";
    const W = landscape ? 297 : 210;
    const H = landscape ? 210 : 297;
    const cw = (W - 2 * MARGIN - (cols - 1) * GAP) / cols;
    const size = Number(codes.size.value);
    const showText = codes.showText.checked;
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

    const truncated = cells.length > MAX_CELLS;
    if (truncated) { cells.length = MAX_CELLS; errors.push("Limite de " + MAX_CELLS + " códigos por impressão; o restante foi ignorado."); }

    const pages = [];
    const total = Math.max(1, Math.ceil(cells.length / perPage));
    for (let p = 0; p < total; p++) {
      const page = el("div", { class: "codes-page" });
      page.style.width = W + "mm";
      page.style.height = H + "mm";
      const grid = el("div", { class: "codes-grid" });
      grid.style.cssText = "left:" + MARGIN + "mm;top:" + MARGIN + "mm;grid-template-columns:repeat(" + cols + "," + cw + "mm);gap:" + GAP + "mm;";
      cells.slice(p * perPage, (p + 1) * perPage).forEach((c) => {
        const cell = el("div", { class: "code-cell" + (codes.cut.checked ? " cut" : "") });
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
  async function renderCodes() {
    const token = ++renderToken;
    codes.sizeVal.textContent = codes.size.value + " mm";
    const r = await buildPages();
    if (token !== renderToken) return;
    codes.preview.replaceChildren(...r.pages);
    codes.msg.textContent = r.errors.slice(0, 4).join("\n") + (r.errors.length > 4 ? "\n… e mais " + (r.errors.length - 4) + "." : "");
    codes.info.textContent = r.count + (r.count === 1 ? " código" : " códigos") + " · " + r.pages.length + (r.pages.length === 1 ? " folha" : " folhas") + " A4 · " + r.perPage + " por folha";
    fitPreview(r.W);
    state.last = r;
  }

  function fitPreview(pageWmm) {
    const px = pageWmm * 96 / 25.4;
    const avail = Math.max(120, codes.box.clientWidth - 32);
    const z = Math.min(1.4, avail / px);
    codes.preview.style.zoom = String(z);
  }

  const state = { last: null };

  function scheduleCodes() {
    saveSettings();
    clearTimeout(timer);
    timer = setTimeout(renderCodes, 120);
  }

  ["input", "change"].forEach((ev) => {
    [codes.type, codes.text, codes.cols, codes.orient, codes.size, codes.showText, codes.cut].forEach((n) => n.addEventListener(ev, scheduleCodes));
  });
  window.addEventListener("resize", () => { if (!codes.view.hidden && state.last) fitPreview(state.last.W); });

  async function printCodes() {
    await renderCodes();
    const r = state.last;
    if (!r || !r.count) { C.toast("Não há códigos válidos para imprimir."); return; }
    let root = byId("codesPrintRoot");
    if (!root) { root = el("div", { id: "codesPrintRoot" }); document.body.append(root); }
    root.replaceChildren(...r.pages.map((p) => p.cloneNode(true)));
    const html = document.documentElement;
    const prevPaper = html.dataset.paper;
    html.dataset.paper = codes.orient.value;
    byId("pageStyle").textContent = "@page { size: A4 " + codes.orient.value + "; margin: 0; }";
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
  byId("codesPrint").addEventListener("click", printCodes);

  /* ============================ Etiquetas por planilha ============================ */

  const sheet = {
    view: byId("sheetView"),
    pick: byId("sheetPick"),
    file: byId("sheetFile"),
    paste: byId("sheetPaste"),
    msg: byId("sheetMsg"),
    step2: byId("sheetStep2"),
    colCode: byId("sheetColCode"),
    colDesc: byId("sheetColDesc"),
    colCopies: byId("sheetColCopies"),
    header: byId("sheetHeader"),
    defCopies: byId("sheetDefCopies"),
    table: byId("sheetTable"),
    info: byId("sheetInfo"),
    create: byId("sheetCreate")
  };
  let rows = [];

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

  async function parseXlsx(buffer) {
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
    const doc = parse(await zip.read(sheetPath));
    const out = [];
    Array.from(doc.getElementsByTagName("row")).forEach((r) => {
      const arr = [];
      Array.from(r.getElementsByTagName("c")).forEach((c) => {
        const idx = colIndex(c.getAttribute("r") || "A");
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s") val = shared[Number(v && v.textContent)] || "";
        else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent).join("");
        else if (v) val = v.textContent;
        arr[idx] = val;
      });
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = "";
      out.push(arr);
    });
    return out.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  async function readFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) return parseXlsx(await file.arrayBuffer());
    if (name.endsWith(".xls")) throw new Error("Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.");
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    return parseDelimited(text);
  }

  const looksNumeric = (v) => /^\d+([.,]\d+)?$/.test(String(v).trim());

  function setData(data) {
    rows = data.map((r) => r.map((c) => String(c === undefined || c === null ? "" : c).trim()));
    if (!rows.length) { sheet.step2.hidden = true; sheet.msg.textContent = "Não encontrei linhas nesse arquivo."; return; }
    sheet.msg.textContent = "";
    const width = Math.max(...rows.map((r) => r.length));
    rows.forEach((r) => { while (r.length < width) r.push(""); });
    const head = rows[0];
    const isHead = rows.length > 1 && head.every((c) => c !== "") && !head.some(looksNumeric) && new Set(head).size === head.length;
    sheet.header.checked = isHead;
    const names = head.map((c, i) => (isHead && c ? c : "Coluna " + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "")));
    const opts = (withNone) => {
      const list = [];
      if (withNone) list.push(["-1", "Sem coluna"]);
      names.forEach((n, i) => list.push([String(i), n]));
      return list;
    };
    const fill = (sel, list, value) => { sel.replaceChildren(...list.map(([v, t]) => { const o = el("option", { value: v }, t); return o; })); sel.value = value; };
    // palpite: código = 1ª coluna, descrição = 2ª, cópias = coluna com nome parecido com qtd/cópias
    const guessCopies = names.findIndex((n, i) => /^(qtd|qtde|quant|copias|cópias|etiquetas|qty)/i.test(isHead ? n : "") && i > 0);
    fill(sheet.colCode, opts(false), "0");
    fill(sheet.colDesc, opts(true), width > 1 ? "1" : "-1");
    fill(sheet.colCopies, opts(true), guessCopies >= 0 ? String(guessCopies) : (width > 2 && rows.slice(isHead ? 1 : 0).every((r) => looksNumeric(r[2])) ? "2" : "-1"));
    sheet.step2.hidden = false;
    refreshSheet();
  }

  function sheetItems() {
    const start = sheet.header.checked ? 1 : 0;
    const ci = Number(sheet.colCode.value);
    const di = Number(sheet.colDesc.value);
    const ki = Number(sheet.colCopies.value);
    const def = clamp(parseInt(sheet.defCopies.value, 10) || 1, 1, 500);
    const items = [];
    rows.slice(start).forEach((r) => {
      const code = (r[ci] || "").trim();
      if (!code) return;
      let copies = def;
      if (ki >= 0) { const n = parseInt(String(r[ki]).replace(",", "."), 10); if (Number.isFinite(n) && n > 0) copies = clamp(n, 1, 500); }
      items.push({ code, description: di >= 0 ? (r[di] || "").trim() : "", copies });
    });
    return items;
  }

  function refreshSheet() {
    const start = sheet.header.checked ? 1 : 0;
    const ci = Number(sheet.colCode.value);
    const di = Number(sheet.colDesc.value);
    const ki = Number(sheet.colCopies.value);
    const marks = new Set([ci, di, ki]);
    sheet.table.replaceChildren();
    const width = rows[0].length;
    const thead = el("tr");
    for (let i = 0; i < width; i++) thead.append(el("th", {}, i === ci ? "Código" : i === di ? "Descrição" : i === ki ? "Cópias" : ""));
    sheet.table.append(thead);
    rows.slice(0, 8).forEach((r, idx) => {
      const tr = el("tr", idx < start ? { class: "is-head" } : {});
      r.forEach((c, i) => { const td = el("td", marks.has(i) ? { style: "color:var(--text)" } : {}, c); td.title = c; tr.append(td); });
      sheet.table.append(tr);
    });
    const items = sheetItems();
    const total = items.reduce((a, b) => a + b.copies, 0);
    const MAX = 200;
    sheet.info.textContent = items.length + (items.length === 1 ? " item" : " itens") + " · " + total + (total === 1 ? " etiqueta" : " etiquetas") + (items.length > MAX ? " — o Coding Etiquetas aceita até " + MAX + " itens por documento; só os primeiros " + MAX + " entram." : "");
    sheet.create.disabled = !items.length;
  }

  [sheet.colCode, sheet.colDesc, sheet.colCopies, sheet.header, sheet.defCopies].forEach((n) => { n.addEventListener("input", () => rows.length && refreshSheet()); n.addEventListener("change", () => rows.length && refreshSheet()); });
  sheet.pick.addEventListener("click", () => sheet.file.click());
  sheet.file.addEventListener("change", async () => {
    const file = sheet.file.files && sheet.file.files[0];
    sheet.file.value = "";
    if (!file) return;
    sheet.msg.textContent = "Lendo o arquivo…";
    try { setData(await readFile(file)); }
    catch (e) { sheet.step2.hidden = true; sheet.msg.textContent = e && /\.xls/.test(e.message) ? e.message : "Não consegui ler esse arquivo. Use .xlsx ou .csv."; }
  });
  sheet.paste.addEventListener("input", () => {
    const text = sheet.paste.value;
    if (!text.trim()) { sheet.step2.hidden = true; sheet.msg.textContent = ""; return; }
    setData(parseDelimited(text));
  });
  sheet.create.addEventListener("click", async () => {
    const items = sheetItems().slice(0, 200);
    if (!items.length) return;
    const mode = C.modes.labels;
    const base = mode.defaults();
    base.items = items.map((it) => ({ id: "", ...it }));
    base.name = "Etiquetas da planilha";
    const ok = await C.createDoc("labels", base);
    if (ok) C.toast(items.length + (items.length === 1 ? " item criado." : " itens criados.") + " Confira e imprima.");
  });

  /* ================================ início ================================ */

  loadSettings();
  window.addEventListener("coding:tool", (e) => {
    if (e.detail === "codes") renderCodes();
  });
})();
