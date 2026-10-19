/* Coding — Planilhas: grade com fórmulas, formatação, CSV e Excel (documento salvo no aparelho) */
(() => {
  "use strict";

  const C = window.Coding;
  const X = window.CodingCalc;
  const U = C.util;
  const byId = U.byId;
  const clamp = U.clamp;

  const MAXR = X.MAXR, MAXC = X.MAXC;
  const DEFR = 100, DEFC = 26, DEFW = 96, MINW = 36, MAXW = 480, ROWH = 24, HEADW = 46;
  const MAXCELLS = 20000, MAXLEN = 2000, HIST = 60;
  const FMTS = ["num", "brl", "pct"];
  const colorOk = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

  const ui = {
    ws: byId("calcWs"), tools: document.querySelector("#calcWs .calc-tools"), scroll: byId("calcScroll"), host: byId("calcHost"), table: byId("calcTable"),
    sel: byId("calcSel"), act: byId("calcAct"), editor: byId("calcEditor"), name: byId("calcCell"), formula: byId("calcFormula"),
    status: byId("calcStatus"), fmt: byId("calcFmt"), bgSw: byId("calcBgSw"), fgSw: byId("calcFgSw"), file: byId("calcFile"), pop: byId("calcPop"), hint: byId("calcHint"), fx: byId("calcFx")
  };

  /* ---------------- Estado ---------------- */

  function defaults() { return { name: "Planilha sem título", rows: DEFR, cols: DEFC, widths: {}, cells: {} }; }

  function normalize(src) {
    const o = src && typeof src === "object" && !Array.isArray(src) ? src : {};
    const d = defaults();
    const cells = {};
    let maxR = 0, maxC = 0, count = 0;
    if (o.cells && typeof o.cells === "object") {
      for (const [k, raw] of Object.entries(o.cells)) {
        const m = /^(\d{1,3}),(\d{1,2})$/.exec(k);
        if (!m || !raw || typeof raw !== "object") continue;
        const r = Number(m[1]), c = Number(m[2]);
        if (r >= MAXR || c >= MAXC || count >= MAXCELLS) continue;
        const cell = {};
        if (typeof raw.v === "string" && raw.v !== "") cell.v = raw.v.slice(0, MAXLEN);
        else if (typeof raw.v === "number" && Number.isFinite(raw.v)) cell.v = String(raw.v).replace(".", ",");
        if (raw.b === true) cell.b = true;
        if (raw.i === true) cell.i = true;
        if (raw.u === true) cell.u = true;
        if (["l", "c", "r"].includes(raw.a)) cell.a = raw.a;
        if (colorOk(raw.bg)) cell.bg = raw.bg.toLowerCase();
        if (colorOk(raw.fg)) cell.fg = raw.fg.toLowerCase();
        if (FMTS.includes(raw.n)) cell.n = raw.n;
        if (!Object.keys(cell).length) continue;
        cells[k] = cell;
        count++;
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      }
    }
    const rows = Math.max(U.toInt(o.rows, d.rows, 1, MAXR), maxR + 1);
    const cols = Math.max(U.toInt(o.cols, d.cols, 1, MAXC), maxC + 1);
    const widths = {};
    if (o.widths && typeof o.widths === "object") {
      for (const [k, v] of Object.entries(o.widths)) {
        const c = Number(k);
        if (Number.isInteger(c) && c >= 0 && c < cols && Number.isFinite(Number(v))) widths[c] = clamp(Math.round(Number(v)), MINW, MAXW);
      }
    }
    return { name: U.toText(o.name, d.name, 80), rows, cols, widths, cells };
  }

  let state = defaults();
  let docId = null;
  let sel = { ar: 0, ac: 0, fr: 0, fc: 0 };
  let editing = null;
  let lastPoint = null;
  let hist = [];
  let redoStack = [];
  let cx = X.makeCx(state.cells);
  let painted = new Set();
  let internal = null;
  let hlEls = [];
  let dragging = false;
  let wasActive = false;
  let tabAnchor = null;

  const key = (r, c) => r + "," + c;
  const getCell = (r, c) => state.cells[key(r, c)];
  const rawOf = (r, c) => { const x = getCell(r, c); return x && x.v ? x.v : ""; };
  const filled = (r, c) => rawOf(r, c) !== "";
  const refOf = (r, c) => X.colName(c) + (r + 1);
  const rect = () => ({ r0: Math.min(sel.ar, sel.fr), r1: Math.max(sel.ar, sel.fr), c0: Math.min(sel.ac, sel.fc), c1: Math.max(sel.ac, sel.fc) });
  const inb = (r, c) => r >= 0 && c >= 0 && r < state.rows && c < state.cols;
  const cellCount = () => Object.keys(state.cells).length;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const widthOf = (c) => state.widths[c] || DEFW;

  function setCell(r, c, patch) {
    const k = key(r, c);
    const cell = { ...(state.cells[k] || {}), ...patch };
    Object.keys(cell).forEach((p) => { if (cell[p] === undefined || cell[p] === false || cell[p] === "" || cell[p] === null) delete cell[p]; });
    if (!Object.keys(cell).length) delete state.cells[k];
    else if (!state.cells[k] && cellCount() >= MAXCELLS) { C.toast("Limite de " + MAXCELLS + " células preenchidas."); return false; }
    else state.cells[k] = cell;
    return true;
  }

  /* ---------------- Histórico ---------------- */

  const snap = () => JSON.stringify({ rows: state.rows, cols: state.cols, widths: state.widths, cells: state.cells });
  function pushHist() { hist.push(snap()); if (hist.length > HIST) hist.shift(); redoStack = []; }
  function restore(text) {
    const o = JSON.parse(text);
    state.rows = o.rows; state.cols = o.cols; state.widths = o.widths; state.cells = o.cells;
  }
  function undo() {
    if (editing) cancelEdit();
    if (!hist.length) return;
    redoStack.push(snap());
    restore(hist.pop());
    afterRestore();
  }
  function redo() {
    if (editing) cancelEdit();
    if (!redoStack.length) return;
    hist.push(snap());
    restore(redoStack.pop());
    afterRestore();
  }
  function afterRestore() {
    sel.ar = clamp(sel.ar, 0, state.rows - 1); sel.fr = clamp(sel.fr, 0, state.rows - 1);
    sel.ac = clamp(sel.ac, 0, state.cols - 1); sel.fc = clamp(sel.fc, 0, state.cols - 1);
    C.scheduleSave();
    renderGrid();
  }

  function mutate(fn, structural) {
    pushHist();
    fn();
    C.scheduleSave();
    if (structural) renderGrid(); else { repaint(); drawSel(); syncBar(); updateStatus(); }
  }

  /* ---------------- Desenho da grade ---------------- */

  const ALIGN = { l: "left", c: "center", r: "right" };
  function styleOf(cell, v) {
    let st = "";
    if (cell) {
      if (cell.b) st += "font-weight:700;";
      if (cell.i) st += "font-style:italic;";
      if (cell.u) st += "text-decoration:underline;";
      if (cell.bg) st += "background:" + cell.bg + ";";
      if (cell.fg) st += "color:" + cell.fg + ";";
    }
    const a = (cell && cell.a) || (typeof v === "number" ? "r" : typeof v === "boolean" || v instanceof X.XErr ? "c" : "l");
    return st + "text-align:" + ALIGN[a] + ";";
  }

  function renderGrid() {
    cx = X.makeCx(state.cells);
    let total = HEADW;
    let h = '<colgroup><col style="width:' + HEADW + 'px">';
    for (let c = 0; c < state.cols; c++) { const w = widthOf(c); total += w; h += '<col style="width:' + w + 'px">'; }
    h += '</colgroup><thead><tr><th class="corner" aria-label="Selecionar tudo"></th>';
    for (let c = 0; c < state.cols; c++) h += "<th>" + X.colName(c) + '<i class="rz"></i></th>';
    h += "</tr></thead><tbody>";
    for (let r = 0; r < state.rows; r++) {
      h += "<tr><th>" + (r + 1) + "</th>";
      for (let c = 0; c < state.cols; c++) {
        const cell = state.cells[r + "," + c];
        if (!cell) { h += "<td></td>"; continue; }
        const v = cx.get(r, c);
        h += '<td style="' + styleOf(cell, v) + '"' + (v instanceof X.XErr ? ' class="err"' : "") + ">" + esc(X.showValue(v, cell.n)) + "</td>";
      }
      h += "</tr>";
    }
    h += "</tbody>";
    ui.table.innerHTML = '<table class="calc-table" style="width:' + total + 'px">' + h + "</table>";
    painted = new Set(Object.keys(state.cells));
    hlEls = [];
    drawSel();
    syncBar();
    updateStatus();
  }

  const tbl = () => ui.table.firstElementChild;
  function tdAt(r, c) { const t = tbl(); const row = t && t.rows[r + 1]; return row ? row.cells[c + 1] : null; }

  function repaint() {
    cx = X.makeCx(state.cells);
    const keys = new Set([...painted, ...Object.keys(state.cells)]);
    keys.forEach((k) => {
      const [r, c] = k.split(",").map(Number);
      const td = tdAt(r, c);
      if (!td) return;
      const cell = state.cells[k];
      const v = cx.get(r, c);
      td.textContent = cell ? X.showValue(v, cell.n) : "";
      td.style.cssText = cell ? styleOf(cell, v) : "";
      td.className = v instanceof X.XErr ? "err" : "";
    });
    painted = new Set(Object.keys(state.cells));
  }

  function place(el, r0, c0, r1, c1) {
    const a = tdAt(r0, c0), b = tdAt(r1, c1);
    if (!a || !b) { el.hidden = true; return; }
    const host = ui.host.getBoundingClientRect();
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    el.style.left = ra.left - host.left + "px";
    el.style.top = ra.top - host.top + "px";
    el.style.width = rb.right - ra.left + "px";
    el.style.height = rb.bottom - ra.top + "px";
    el.hidden = false;
  }

  function drawSel() {
    const R = rect();
    place(ui.act, sel.ar, sel.ac, sel.ar, sel.ac);
    if (R.r0 === R.r1 && R.c0 === R.c1) ui.sel.hidden = true; else place(ui.sel, R.r0, R.c0, R.r1, R.c1);
    hlEls.forEach((el) => el.classList.remove("hl"));
    hlEls = [];
    const t = tbl();
    if (!t) return;
    for (let c = R.c0; c <= R.c1; c++) { const th = t.rows[0].cells[c + 1]; if (th) { th.classList.add("hl"); hlEls.push(th); } }
    for (let r = R.r0; r <= R.r1; r++) { const th = t.rows[r + 1] && t.rows[r + 1].cells[0]; if (th) { th.classList.add("hl"); hlEls.push(th); } }
  }

  function reveal(r, c) {
    const td = tdAt(r, c);
    if (!td) return;
    const s = ui.scroll;
    const sr = s.getBoundingClientRect(), tr = td.getBoundingClientRect();
    if (tr.left < sr.left + HEADW) s.scrollLeft -= sr.left + HEADW - tr.left;
    else if (tr.right > sr.right - 12) s.scrollLeft += tr.right - sr.right + 12;
    if (tr.top < sr.top + ROWH) s.scrollTop -= sr.top + ROWH - tr.top;
    else if (tr.bottom > sr.bottom - 12) s.scrollTop += tr.bottom - sr.bottom + 12;
  }

  function syncBar() {
    const R = rect();
    ui.name.value = R.r0 === R.r1 && R.c0 === R.c1 ? refOf(sel.ar, sel.ac) : refOf(R.r0, R.c0) + ":" + refOf(R.r1, R.c1);
    if (!editing) ui.formula.value = rawOf(sel.ar, sel.ac);
    const cell = getCell(sel.ar, sel.ac) || {};
    ui.ws.querySelector('[data-act="bold"]').setAttribute("aria-pressed", String(!!cell.b));
    ui.ws.querySelector('[data-act="italic"]').setAttribute("aria-pressed", String(!!cell.i));
    ui.ws.querySelector('[data-act="underline"]').setAttribute("aria-pressed", String(!!cell.u));
    ui.fmt.value = cell.n || "";
    ui.bgSw.style.setProperty("--c", cell.bg || "#ffffff");
    ui.fgSw.style.setProperty("--c", cell.fg || "#e8edf6");
    ui.ws.querySelector('[data-act="undo"]').disabled = !hist.length;
    ui.ws.querySelector('[data-act="redo"]').disabled = !redoStack.length;
  }

  function updateStatus() {
    const R = rect();
    const multi = R.r0 !== R.r1 || R.c0 !== R.c1;
    if (!multi) { ui.status.textContent = cellCount() ? "" : "Dica: clique numa célula e digite. Para contas, selecione os números e use Σ ou o botão Funções."; return; }
    let sum = 0, n = 0, any = 0;
    const scan = (r, c) => { const v = cx.get(r, c); if (v !== null) any++; if (typeof v === "number") { sum += v; n++; } };
    if ((R.r1 - R.r0 + 1) * (R.c1 - R.c0 + 1) > 5000) Object.keys(state.cells).forEach((k) => { const [r, c] = k.split(",").map(Number); if (r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1) scan(r, c); });
    else for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) scan(r, c);
    ui.status.textContent = n ? "Soma: " + X.generalNum(Math.round(sum * 1e9) / 1e9) + "  ·  Média: " + X.generalNum(Math.round((sum / n) * 1e9) / 1e9) + "  ·  Contagem: " + any : "Contagem: " + any;
  }

  /* ---------------- Seleção e navegação ---------------- */

  function select(ar, ac, fr, fc, keepReveal) {
    tabAnchor = null;
    sel = { ar, ac, fr: fr === undefined ? ar : fr, fc: fc === undefined ? ac : fc };
    drawSel();
    syncBar();
    updateStatus();
    if (!keepReveal) reveal(sel.fr, sel.fc);
    if (typeof fxOpen === "function" && fxOpen() && fxField && fxField.dataset.pick && fxItem) { fxField.value = rangeStr(); fxPreview(); }
  }

  function growTo(r, c) {
    let grew = false;
    if (r >= state.rows && state.rows < MAXR) { state.rows = Math.min(MAXR, Math.max(r + 1, state.rows + 20)); grew = true; }
    if (c >= state.cols && state.cols < MAXC) { state.cols = Math.min(MAXC, c + 1); grew = true; }
    if (grew) { C.scheduleSave(); renderGrid(); }
  }

  function tabMove(dir) { const a = tabAnchor === null ? sel.ac : tabAnchor; moveBy(0, dir); tabAnchor = a; }
  function enterMove(dir) { const a = tabAnchor; moveBy(dir, 0); if (a !== null && a !== sel.ac) select(sel.ar, a); }

  function moveBy(dr, dc, extend) {
    const baseR = extend ? sel.fr : sel.ar, baseC = extend ? sel.fc : sel.ac;
    let r = baseR + dr, c = baseC + dc;
    if (r >= state.rows || c >= state.cols) growTo(r, c);
    r = clamp(r, 0, state.rows - 1); c = clamp(c, 0, state.cols - 1);
    if (extend) select(sel.ar, sel.ac, r, c); else select(r, c);
  }

  function jump(r, c, dr, dc) {
    let nr = r + dr, nc = c + dc;
    if (!inb(nr, nc)) return [r, c];
    if (filled(r, c) && filled(nr, nc)) {
      while (inb(nr + dr, nc + dc) && filled(nr + dr, nc + dc)) { nr += dr; nc += dc; }
      return [nr, nc];
    }
    while (inb(nr, nc) && !filled(nr, nc)) { nr += dr; nc += dc; }
    if (!inb(nr, nc)) return [clamp(nr, 0, state.rows - 1), clamp(nc, 0, state.cols - 1)];
    return [nr, nc];
  }

  function usedRect() {
    let r1 = -1, c1 = -1;
    Object.entries(state.cells).forEach(([k, cell]) => {
      if (!cell.v && !cell.bg) return;
      const [r, c] = k.split(",").map(Number);
      if (r > r1) r1 = r;
      if (c > c1) c1 = c;
    });
    return r1 < 0 ? null : { r0: 0, c0: 0, r1, c1 };
  }

  function focusGrid() { try { ui.scroll.focus({ preventScroll: true }); } catch (_) { /* ignorado */ } }

  /* ---------------- Edição ---------------- */

  function startEdit(initial) {
    if (editing) return;
    const r = sel.ar, c = sel.ac;
    const td = tdAt(r, c);
    if (!td) return;
    const orig = rawOf(r, c);
    const cell = getCell(r, c) || {};
    const host = ui.host.getBoundingClientRect();
    const box = td.getBoundingClientRect();
    const ed = ui.editor;
    ed.style.left = box.left - host.left + "px";
    ed.style.top = box.top - host.top + "px";
    ed.style.minWidth = box.width + "px";
    ed.style.height = box.height + "px";
    ed.style.fontWeight = cell.b ? "700" : "400";
    ed.style.fontStyle = cell.i ? "italic" : "normal";
    ed.style.textAlign = ALIGN[cell.a || "l"];
    ed.hidden = false;
    ed.value = initial !== undefined ? initial : orig;
    editing = { r, c, orig, via: "cell" };
    lastPoint = null;
    ed.focus({ preventScroll: true });
    if (initial === undefined) ed.setSelectionRange(ed.value.length, ed.value.length);
    ui.formula.value = ed.value;
  }

  function commitEdit(move) {
    if (!editing) return;
    const { r, c, orig, via } = editing;
    const val = (via === "cell" ? ui.editor.value : ui.formula.value).slice(0, MAXLEN);
    editing = null;
    lastPoint = null;
    ui.editor.hidden = true;
    ui.editor.value = "";
    if (val !== orig) mutate(() => { if (!setCell(r, c, { v: val })) return; }); else syncBar();
    if (move) { if (move.dc) tabMove(move.dc); else enterMove(move.dr); }
    focusGrid();
  }

  function cancelEdit() {
    if (!editing) return;
    editing = null;
    lastPoint = null;
    ui.editor.hidden = true;
    ui.editor.value = "";
    syncBar();
    focusGrid();
  }

  const editorEl = () => (editing && editing.via === "bar" ? ui.formula : ui.editor);

  function pointing() {
    if (!editing) return false;
    const ed = editorEl();
    const v = ed.value;
    if (v[0] !== "=") return false;
    const pos = ed.selectionStart === null ? v.length : ed.selectionStart;
    if (lastPoint && pos === lastPoint.end && v.slice(lastPoint.start, lastPoint.end) === lastPoint.text) return true;
    return /[=(;,+\-*/^&<>:%]$/.test(v.slice(0, pos));
  }

  function pointRef(r, c, extend) {
    const ed = editorEl();
    const v = ed.value;
    let start, end, text;
    if (extend && lastPoint) {
      text = refOf(lastPoint.r, lastPoint.c) + ":" + refOf(r, c);
      start = lastPoint.start; end = lastPoint.end;
      lastPoint = { ...lastPoint, text, end: start + text.length };
    } else {
      const pos = lastPoint && ed.selectionStart === lastPoint.end ? lastPoint.start : (ed.selectionStart === null ? v.length : ed.selectionStart);
      start = pos; end = lastPoint && ed.selectionStart === lastPoint.end ? lastPoint.end : pos;
      text = refOf(r, c);
      lastPoint = { r, c, start, text, end: start + text.length };
    }
    ed.value = v.slice(0, start) + text + v.slice(end);
    ed.setSelectionRange(lastPoint.end, lastPoint.end);
    if (editing.via === "cell") ui.formula.value = ed.value; else ui.editor.value = ed.value;
  }

  ui.editor.addEventListener("input", () => { ui.formula.value = ui.editor.value; });
  ui.editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit({ dr: e.shiftKey ? -1 : 1, dc: 0 }); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
  });
  ui.editor.addEventListener("blur", () => { if (editing && editing.via === "cell") commitEdit(); });

  ui.formula.addEventListener("focus", () => {
    if (editing) return;
    editing = { r: sel.ar, c: sel.ac, orig: rawOf(sel.ar, sel.ac), via: "bar" };
    lastPoint = null;
  });
  ui.formula.addEventListener("input", () => { if (editing && editing.via === "cell") { ui.editor.value = ui.formula.value; } });
  ui.formula.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (editing && editing.via === "cell") ui.editor.value = ui.formula.value; if (editing && editing.via === "cell") editing.via = "bar"; commitEdit({ dr: 1, dc: 0 }); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
  });
  ui.formula.addEventListener("blur", () => { if (editing && editing.via === "bar") commitEdit(); });

  /* ---------------- Ações sobre a seleção ---------------- */

  function forRect(fn) { const R = rect(); for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) fn(r, c); }

  function clearSel() {
    mutate(() => forRect((r, c) => { if (getCell(r, c)) setCell(r, c, { v: "" }); }));
  }

  function applyFmt(patch) {
    mutate(() => forRect((r, c) => { setCell(r, c, patch); }));
  }

  function toggle(prop) {
    const on = !(getCell(sel.ar, sel.ac) || {})[prop];
    applyFmt({ [prop]: on ? true : undefined });
  }

  function clearFormat() {
    mutate(() => forRect((r, c) => { const x = getCell(r, c); if (x) setCell(r, c, { b: undefined, i: undefined, u: undefined, a: undefined, bg: undefined, fg: undefined, n: undefined }); }));
  }

  function fillDown(right) {
    const R = rect();
    mutate(() => {
      if (!right) {
        const src = R.r1 > R.r0 ? R.r0 : R.r0 - 1;
        if (src < 0) return;
        for (let c = R.c0; c <= R.c1; c++) {
          const base = getCell(src, c);
          for (let r = src + 1; r <= Math.max(R.r1, R.r0); r++) {
            if (r < R.r0 && R.r1 > R.r0) continue;
            if (!base) { if (getCell(r, c)) setCell(r, c, { v: "" }); continue; }
            setCell(r, c, { ...base, v: X.shiftFormula(base.v || "", r - src, 0) });
          }
        }
      } else {
        const src = R.c1 > R.c0 ? R.c0 : R.c0 - 1;
        if (src < 0) return;
        for (let r = R.r0; r <= R.r1; r++) {
          const base = getCell(r, src);
          for (let c = src + 1; c <= Math.max(R.c1, R.c0); c++) {
            if (c < R.c0 && R.c1 > R.c0) continue;
            if (!base) { if (getCell(r, c)) setCell(r, c, { v: "" }); continue; }
            setCell(r, c, { ...base, v: X.shiftFormula(base.v || "", 0, c - src) });
          }
        }
      }
    });
  }

  function autoSum(fn) {
    fn = fn || "SOMA";
    const R = rect();
    const num = (r, c) => typeof cx.get(r, c) === "number";
    mutate(() => {
      if (R.r1 > R.r0) {
        for (let c = R.c0; c <= R.c1; c++) if (R.r1 + 1 < MAXR) setCell(R.r1 + 1, c, { v: "=" + fn + "(" + refOf(R.r0, c) + ":" + refOf(R.r1, c) + ")", n: (getCell(R.r1, c) || {}).n, b: true });
        if (R.r1 + 1 >= state.rows) { state.rows = Math.min(MAXR, R.r1 + 2); }
      } else if (R.c1 > R.c0) {
        if (R.c1 + 1 < MAXC) setCell(R.r0, R.c1 + 1, { v: "=" + fn + "(" + refOf(R.r0, R.c0) + ":" + refOf(R.r0, R.c1) + ")" });
        if (R.c1 + 1 >= state.cols) state.cols = Math.min(MAXC, R.c1 + 2);
      } else {
        let r = sel.ar - 1;
        while (r >= 0 && num(r, sel.ac)) r--;
        if (r < sel.ar - 1) { setCell(sel.ar, sel.ac, { v: "=" + fn + "(" + refOf(r + 1, sel.ac) + ":" + refOf(sel.ar - 1, sel.ac) + ")" }); return; }
        let c = sel.ac - 1;
        while (c >= 0 && num(sel.ar, c)) c--;
        if (c < sel.ac - 1) setCell(sel.ar, sel.ac, { v: "=" + fn + "(" + refOf(sel.ar, c + 1) + ":" + refOf(sel.ar, sel.ac - 1) + ")" });
        else setCell(sel.ar, sel.ac, { v: "=" + fn + "()" });
      }
    }, true);
  }

  function sortSel(asc) {
    const R = rect();
    if (R.r1 === R.r0) { C.toast("Selecione as linhas que deseja ordenar."); return; }
    const kc = sel.ac >= R.c0 && sel.ac <= R.c1 ? sel.ac : R.c0;
    const rows = [];
    for (let r = R.r0; r <= R.r1; r++) {
      const cells = [];
      for (let c = R.c0; c <= R.c1; c++) { const x = getCell(r, c); cells.push(x ? { ...x } : null); }
      rows.push({ r, cells, v: cx.get(r, kc) });
    }
    const rank = (v) => (v === null ? 4 : v instanceof X.XErr ? 3 : typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);
    rows.sort((a, b) => {
      const ra = rank(a.v), rb = rank(b.v);
      if (ra === 4 || rb === 4) return ra === rb ? a.r - b.r : ra === 4 ? 1 : -1;
      if (ra !== rb) return ra - rb;
      let d = 0;
      if (ra === 0) d = a.v - b.v;
      else if (ra === 1) d = a.v.localeCompare(b.v, "pt-BR", { sensitivity: "base", numeric: true });
      else if (ra === 2) d = Number(a.v) - Number(b.v);
      return (asc ? d : -d) || a.r - b.r;
    });
    mutate(() => {
      rows.forEach((row, j) => {
        const r = R.r0 + j;
        row.cells.forEach((x, i) => {
          const c = R.c0 + i;
          delete state.cells[key(r, c)];
          if (x) { if (x.v) x.v = X.shiftFormula(x.v, r - row.r, 0); state.cells[key(r, c)] = x; }
        });
      });
    });
  }

  /* ---- inserir e excluir linhas e colunas ---- */

  function restructure(axis, at, kind) {
    const next = {};
    for (const [k, cell] of Object.entries(state.cells)) {
      let [r, c] = k.split(",").map(Number);
      const idx = axis === "r" ? r : c;
      if (kind === "del" && idx === at) continue;
      const moved = kind === "ins" ? (idx >= at ? idx + 1 : idx) : (idx > at ? idx - 1 : idx);
      if (axis === "r") r = moved; else c = moved;
      const out = { ...cell };
      if (out.v && out.v[0] === "=") out.v = X.remapFormula(out.v, axis, at, kind);
      next[key(r, c)] = out;
    }
    state.cells = next;
    if (axis === "c") {
      const w = {};
      Object.entries(state.widths).forEach(([k, v]) => { const c = Number(k); if (kind === "ins") w[c >= at ? c + 1 : c] = v; else if (c !== at) w[c > at ? c - 1 : c] = v; });
      state.widths = w;
    }
  }

  function insertLines(axis, after) {
    const R = rect();
    const lo = axis === "r" ? R.r0 : R.c0, hi = axis === "r" ? R.r1 : R.c1;
    const n = hi - lo + 1;
    const at = after ? hi + 1 : lo;
    const limit = axis === "r" ? MAXR : MAXC;
    if ((axis === "r" ? state.rows : state.cols) + n > limit) { C.toast("Limite de " + (axis === "r" ? MAXR + " linhas" : MAXC + " colunas") + "."); return; }
    mutate(() => {
      for (let i = 0; i < n; i++) restructure(axis, at, "ins");
      if (axis === "r") state.rows += n; else state.cols += n;
    }, true);
    if (after) { if (axis === "r") select(R.r1 + 1, sel.ac, R.r1 + n, sel.fc); else select(sel.ar, R.c1 + 1, sel.fr, R.c1 + n); }
  }

  function deleteLines(axis) {
    const R = rect();
    const lo = axis === "r" ? R.r0 : R.c0, hi = axis === "r" ? R.r1 : R.c1;
    const n = hi - lo + 1;
    if ((axis === "r" ? state.rows : state.cols) - n < 1) { C.toast("A planilha precisa ter pelo menos uma " + (axis === "r" ? "linha." : "coluna.")); return; }
    mutate(() => {
      for (let i = 0; i < n; i++) restructure(axis, lo, "del");
      if (axis === "r") state.rows -= n; else state.cols -= n;
    }, true);
    select(clamp(sel.ar, 0, state.rows - 1), clamp(sel.ac, 0, state.cols - 1));
  }

  /* ---------------- Copiar, recortar e colar ---------------- */

  const tsvCell = (s) => (/[\t\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const displayAt = (r, c) => { const x = getCell(r, c); return X.showValue(cx.get(r, c), x && x.n); };

  function copyData() {
    const R = rect();
    const cells = [];
    const lines = [];
    for (let r = R.r0; r <= R.r1; r++) {
      const row = [], line = [];
      for (let c = R.c0; c <= R.c1; c++) { const x = getCell(r, c); row.push(x ? { ...x } : null); line.push(tsvCell(displayAt(r, c))); }
      cells.push(row); lines.push(line.join("\t"));
    }
    internal = { r0: R.r0, c0: R.c0, cells, tsv: lines.join("\n") };
    return internal.tsv;
  }

  function doCopy(dt, cut) {
    const text = copyData();
    if (dt) dt.setData("text/plain", text);
    else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    if (cut) clearSel();
    C.toast(cut ? "Recortado." : "Copiado.");
  }

  function parseTsv(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const t = text.replace(/\r\n?/g, "\n");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === "") q = true;
      else if (ch === "\t") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function doPaste(text) {
    if (typeof text !== "string" || text === "") return;
    const R = rect();
    const norm = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
    const same = internal && internal.tsv === norm;
    const grid = same ? internal.cells : parseTsv(text).map((row) => row.map((v) => (v === "" ? null : { v })));
    if (same === false && grid.length && grid[grid.length - 1].every((x) => x === null) && /\n$/.test(text.replace(/\r\n?/g, "\n"))) grid.pop();
    if (!grid.length) return;
    const h = grid.length, w = Math.max(...grid.map((r) => r.length));
    growTo(R.r0 + h - 1, R.c0 + w - 1);
    let structural = false;
    mutate(() => {
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
        const r = R.r0 + i, c = R.c0 + j;
        if (!inb(r, c)) continue;
        const x = grid[i][j];
        if (!x) { if (same && getCell(r, c)) delete state.cells[key(r, c)]; continue; }
        if (same) {
          const copy = { ...x };
          if (copy.v) copy.v = X.shiftFormula(copy.v, r - internal.r0, c - internal.c0);
          if (cellCount() >= MAXCELLS && !state.cells[key(r, c)]) continue;
          state.cells[key(r, c)] = copy;
        } else setCell(r, c, { v: String(x.v).slice(0, MAXLEN) });
      }
    }, structural);
    select(R.r0, R.c0, Math.min(state.rows - 1, R.r0 + h - 1), Math.min(state.cols - 1, R.c0 + w - 1));
  }

  async function pasteFromMenu() {
    try { doPaste(await navigator.clipboard.readText()); }
    catch (_) { if (internal) doPaste(internal.tsv); else C.toast("Use Ctrl+V para colar (o navegador bloqueou o acesso à área de transferência)."); }
  }

  const gridActive = () => !ui.ws.hidden && !editing && (document.activeElement === ui.scroll || document.activeElement === document.body || ui.scroll.contains(document.activeElement));
  document.addEventListener("copy", (e) => { if (!gridActive()) return; e.preventDefault(); doCopy(e.clipboardData, false); });
  document.addEventListener("cut", (e) => { if (!gridActive()) return; e.preventDefault(); doCopy(e.clipboardData, true); });
  document.addEventListener("paste", (e) => {
    if (!gridActive()) return;
    e.preventDefault();
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (files.length) return;
    doPaste(e.clipboardData.getData("text/plain"));
  });

  /* ---------------- Teclado e mouse ---------------- */

  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  ui.scroll.addEventListener("keydown", (e) => {
    if (editing || e.target !== ui.scroll) return;
    const mod = e.ctrlKey || e.metaKey;
    if (DIRS[e.key]) {
      e.preventDefault();
      const [dr, dc] = DIRS[e.key];
      if (mod) {
        const [r, c] = jump(e.shiftKey ? sel.fr : sel.ar, e.shiftKey ? sel.fc : sel.ac, dr, dc);
        if (e.shiftKey) select(sel.ar, sel.ac, r, c); else select(r, c);
      } else moveBy(dr, dc, e.shiftKey);
      return;
    }
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); toggle("b"); return; }
      if (k === "i") { e.preventDefault(); toggle("i"); return; }
      if (k === "u") { e.preventDefault(); toggle("u"); return; }
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (k === "y") { e.preventDefault(); redo(); return; }
      if (k === "a") { e.preventDefault(); select(0, 0, state.rows - 1, state.cols - 1, true); return; }
      if (k === "d") { e.preventDefault(); fillDown(false); return; }
      if (k === "r") { e.preventDefault(); fillDown(true); return; }
      if (e.key === "Home") { e.preventDefault(); select(0, 0); return; }
      if (e.key === "End") { e.preventDefault(); const u = usedRect(); if (u) select(u.r1, u.c1); return; }
      return;
    }
    if (e.altKey && !mod && (e.key === "=" || e.code === "Equal")) { e.preventDefault(); autoSum(); return; }
    switch (e.key) {
      case "Enter": e.preventDefault(); enterMove(e.shiftKey ? -1 : 1); return;
      case "Tab": e.preventDefault(); tabMove(e.shiftKey ? -1 : 1); return;
      case "F2": e.preventDefault(); startEdit(); return;
      case "Delete": case "Backspace": e.preventDefault(); clearSel(); return;
      case "Home": e.preventDefault(); select(sel.ar, 0); return;
      case "PageDown": e.preventDefault(); moveBy(20, 0, e.shiftKey); return;
      case "PageUp": e.preventDefault(); moveBy(-20, 0, e.shiftKey); return;
      case "Escape": internal = null; return;
      default:
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === "Dead")) startEdit("");
  });

  function startResize(e, c) {
    e.preventDefault();
    const startX = e.clientX, startW = widthOf(c);
    const col = tbl().querySelector("colgroup").children[c + 1];
    const tableEl = tbl();
    const base = parseFloat(tableEl.style.width) - startW;
    const move = (ev) => {
      const w = clamp(Math.round(startW + ev.clientX - startX), MINW, MAXW);
      col.style.width = w + "px";
      tableEl.style.width = base + w + "px";
      state.widths[c] = w;
      drawSel();
    };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); C.scheduleSave(); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  ui.table.addEventListener("pointerdown", (e) => {
    const cellEl = e.target.closest("td,th");
    if (!cellEl || e.button > 0) return;
    if (e.target.classList.contains("rz")) { if (editing) commitEdit(); startResize(e, cellEl.cellIndex - 1); return; }
    const isTd = cellEl.tagName === "TD";
    const r = cellEl.parentNode.rowIndex - 1, c = cellEl.cellIndex - 1;
    if (isTd && editing && pointing()) { e.preventDefault(); pointRef(r, c, e.shiftKey); return; }
    if (editing) commitEdit();
    wasActive = isTd && !e.shiftKey && sel.ar === r && sel.ac === c && sel.fr === r && sel.fc === c;
    if (isTd) {
      if (e.shiftKey) select(sel.ar, sel.ac, r, c, true); else select(r, c, r, c, true);
      dragging = e.pointerType === "mouse";
    } else if (cellEl.classList.contains("corner")) select(0, 0, state.rows - 1, state.cols - 1, true);
    else if (cellEl.parentNode.parentNode.tagName === "THEAD") select(0, c, state.rows - 1, c, true);
    else select(r, 0, r, state.cols - 1, true);
    focusGrid();
  });
  document.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const td = t && t.closest && t.closest("#calcTable td");
    if (td) { const r = td.parentNode.rowIndex - 1, c = td.cellIndex - 1; if (r !== sel.fr || c !== sel.fc) select(sel.ar, sel.ac, r, c, true); }
  });
  document.addEventListener("pointerup", () => { dragging = false; });
  ui.table.addEventListener("dblclick", (e) => { if (e.target.closest("td")) startEdit(); });
  ui.table.addEventListener("click", (e) => { if (e.pointerType === "touch" && wasActive && e.target.closest("td")) { wasActive = false; startEdit(); } });
  ui.scroll.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); });
  ui.scroll.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });
  window.addEventListener("resize", () => { if (!ui.ws.hidden) drawSel(); });
  window.addEventListener("coding:shown", () => { if (!ui.ws.hidden) { drawSel(); } });
  ui.scroll.addEventListener("scroll", () => { if (editing && editing.via === "cell") { /* o editor acompanha a rolagem por estar dentro da grade */ } });

  /* ---------------- Barra de ferramentas ---------------- */

  const onToolClick = (e) => {
    const pal = e.target.closest("[data-pal]");
    if (pal) { openPalette(pal.dataset.pal, pal); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "sumMenu") { openSumMenu(b); return; }
    if (a === "fx") { toggleFx(); return; }
    if (a === "templates") { openTemplates(b); return; }
    if (a === "undo") undo();
    else if (a === "redo") redo();
    else if (a === "bold") toggle("b");
    else if (a === "italic") toggle("i");
    else if (a === "underline") toggle("u");
    else if (a === "al-l") applyFmt({ a: "l" });
    else if (a === "al-c") applyFmt({ a: "c" });
    else if (a === "al-r") applyFmt({ a: "r" });
    else if (a === "ins-row") insertLines("r", false);
    else if (a === "ins-col") insertLines("c", false);
    else if (a === "import") ui.file.click();
    else if (a === "edit") { focusGrid(); startEdit(); return; }
    else if (a === "copy" || a === "cut") { focusGrid(); if (!document.execCommand(a)) C.toast("Não consegui copiar. Use o menu do navegador."); }
    else if (a === "paste") { focusGrid(); pasteFromMenu(); return; }
    else if (a === "xlsx") exportXlsx();
    else if (a === "csv") exportCsv();
    if (a !== "import") focusGrid();
  };
  ui.tools.addEventListener("click", onToolClick);
  ui.fmt.addEventListener("change", () => { applyFmt({ n: ui.fmt.value || undefined }); focusGrid(); });
  ui.file.addEventListener("change", () => { const f = ui.file.files && ui.file.files[0]; ui.file.value = ""; if (f) importFile(f); });

  /* ---------------- Importar e exportar ---------------- */

  async function importFile(file) {
    if (file.size > 8 * 1048576) { C.toast("Arquivo grande demais (máximo de 8 MB)."); return; }
    const release = C.busy("Lendo a planilha…");
    try {
      const rows = await C.readSpreadsheet(file);
      const cells = {};
      let n = 0, cut = false;
      rows.slice(0, MAXR).forEach((row, r) => row.slice(0, MAXC).forEach((val, c) => {
        let v = String(val === undefined || val === null ? "" : val);
        if (v === "") return;
        if (n >= MAXCELLS) { cut = true; return; }
        if (v[0] === "=") { try { v = "=" + X.reemit(v.slice(1), "pt"); } catch (_) { v = "'" + v; } }
        cells[key(r, c)] = { v: v.slice(0, MAXLEN) };
        n++;
      }));
      if (rows.length > MAXR) cut = true;
      const next = normalize({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Planilha importada", cells });
      release();
      await C.createDoc("calc", next);
      C.toast(cut ? "Planilha aberta, mas só as primeiras " + MAXR + " linhas, " + MAXC + " colunas e " + MAXCELLS + " células couberam." : "Planilha aberta como novo documento.");
    } catch (err) {
      release();
      C.toast(err && /\.xls/.test(err.message || "") ? err.message : "Não consegui ler esse arquivo. Use .xlsx, .csv ou .tsv.");
    }
  }

  const baseName = () => ((C.cur() && C.cur().state.name.trim()) || "planilha").replace(/[\\/:*?"<>|]/g, "-");

  function exportCsv() {
    const u = usedRect();
    if (!u) { C.toast("A planilha está vazia."); return; }
    const lines = [];
    for (let r = 0; r <= u.r1; r++) {
      const row = [];
      for (let c = 0; c <= u.c1; c++) { const s = displayAt(r, c); row.push(/[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s); }
      lines.push(row.join(";"));
    }
    C.saveBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), baseName() + ".csv");
  }

  const XML_ERR = { "#NOME?": "#NAME?", "#VALOR!": "#VALUE!", "#NÚM!": "#NUM!", "#N/D": "#N/A", "#DIV/0!": "#DIV/0!", "#REF!": "#REF!" };
  const xesc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function exportXlsx() {
    const u = usedRect();
    if (!u) { C.toast("A planilha está vazia."); return; }
    if (!C.makeZip) { C.toast("Aguarde um instante e tente de novo."); return; }
    cx = X.makeCx(state.cells);
    const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const maps = { font: new Map(), fill: new Map(), xf: new Map() };
    const numFmt = { num: 4, brl: 164, pct: 10 };
    const argb = (h) => "FF" + h.slice(1).toUpperCase();
    const styleId = (cell) => {
      if (!cell || (!cell.b && !cell.i && !cell.u && !cell.a && !cell.bg && !cell.fg && !cell.n)) return 0;
      const fk = [cell.b, cell.i, cell.u, cell.fg].join("|");
      let fi = 0;
      if (cell.b || cell.i || cell.u || cell.fg) {
        if (!maps.font.has(fk)) { maps.font.set(fk, fonts.length); fonts.push("<font>" + (cell.b ? "<b/>" : "") + (cell.i ? "<i/>" : "") + (cell.u ? "<u/>" : "") + '<sz val="11"/>' + (cell.fg ? '<color rgb="' + argb(cell.fg) + '"/>' : "") + '<name val="Calibri"/></font>'); }
        fi = maps.font.get(fk);
      }
      let gi = 0;
      if (cell.bg) {
        if (!maps.fill.has(cell.bg)) { maps.fill.set(cell.bg, fills.length); fills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + argb(cell.bg) + '"/><bgColor indexed="64"/></patternFill></fill>'); }
        gi = maps.fill.get(cell.bg);
      }
      const nid = cell.n ? numFmt[cell.n] : 0;
      const xk = [fi, gi, nid, cell.a || ""].join("|");
      if (!maps.xf.has(xk)) {
        maps.xf.set(xk, xfs.length);
        const al = cell.a ? '<alignment horizontal="' + ALIGN[cell.a] + '"/>' : "";
        xfs.push('<xf numFmtId="' + nid + '" fontId="' + fi + '" fillId="' + gi + '" borderId="0" xfId="0"' + (nid ? ' applyNumberFormat="1"' : "") + (fi ? ' applyFont="1"' : "") + (gi ? ' applyFill="1"' : "") + (cell.a ? ' applyAlignment="1">' + al + "</xf>" : "/>"));
      }
      return maps.xf.get(xk);
    };
    let rowsXml = "";
    for (let r = 0; r <= u.r1; r++) {
      let cellsXml = "";
      for (let c = 0; c <= u.c1; c++) {
        const cell = getCell(r, c);
        if (!cell) continue;
        const s = styleId(cell);
        const ref = refOf(r, c);
        const attr = ' r="' + ref + '"' + (s ? ' s="' + s + '"' : "");
        const raw = cell.v || "";
        if (!raw) { cellsXml += "<c" + attr + "/>"; continue; }
        const v = cx.get(r, c);
        if (raw[0] === "=") {
          let f = "";
          try { f = X.reemit(raw.slice(1), "en"); } catch (_) { f = ""; }
          const fx = f ? "<f>" + xesc(f) + "</f>" : "";
          if (v instanceof X.XErr) cellsXml += "<c" + attr + ' t="e">' + fx + "<v>" + xesc(XML_ERR[v.code] || "#VALUE!") + "</v></c>";
          else if (typeof v === "number") cellsXml += "<c" + attr + ">" + fx + "<v>" + v + "</v></c>";
          else if (typeof v === "boolean") cellsXml += "<c" + attr + ' t="b">' + fx + "<v>" + (v ? 1 : 0) + "</v></c>";
          else cellsXml += "<c" + attr + ' t="str">' + fx + "<v>" + xesc(v === null ? "" : v) + "</v></c>";
        } else if (typeof v === "number") cellsXml += "<c" + attr + "><v>" + v + "</v></c>";
        else if (typeof v === "boolean") cellsXml += "<c" + attr + ' t="b"><v>' + (v ? 1 : 0) + "</v></c>";
        else cellsXml += "<c" + attr + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(raw[0] === "'" ? raw.slice(1) : raw) + "</t></is></c>";
      }
      if (cellsXml) rowsXml += '<row r="' + (r + 1) + '">' + cellsXml + "</row>";
    }
    let colsXml = "";
    Object.entries(state.widths).forEach(([k, w]) => { const c = Number(k) + 1; if (c <= u.c1 + 1) colsXml += '<col min="' + c + '" max="' + c + '" width="' + ((w - 5) / 7).toFixed(2) + '" customWidth="1"/>'; });
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const files = [
      ["[Content_Types].xml", head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ["_rels/.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", head + "<workbook " + NS + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ["xl/_rels/workbook.xml.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", head + "<styleSheet " + NS + '><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts><fonts count="' + fonts.length + '">' + fonts.join("") + '</fonts><fills count="' + fills.length + '">' + fills.join("") + '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join("") + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ["xl/worksheets/sheet1.xml", head + "<worksheet " + NS + ">" + (colsXml ? "<cols>" + colsXml + "</cols>" : "") + "<sheetData>" + rowsXml + "</sheetData></worksheet>"]
    ];
    const blob = await C.makeZip(files.map(([name, text]) => ({ name, blob: new Blob([text], { type: "application/xml" }) })));
    C.saveBlob(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), baseName() + ".xlsx");
    C.toast("Planilha baixada (.xlsx).");
  }

  function printSheet() {
    const u = usedRect();
    if (!u) { C.toast("A planilha está vazia."); return; }
    cx = X.makeCx(state.cells);
    let total = 0;
    let h = '<table class="calc-print-table"><colgroup>';
    for (let c = 0; c <= u.c1; c++) { total += widthOf(c); h += '<col style="width:' + widthOf(c) + 'px">'; }
    h += "</colgroup><tbody>";
    for (let r = 0; r <= u.r1; r++) {
      h += "<tr>";
      for (let c = 0; c <= u.c1; c++) {
        const cell = getCell(r, c);
        const v = cx.get(r, c);
        h += '<td style="' + styleOf(cell, v) + '">' + esc(X.showValue(v, cell && cell.n)) + "</td>";
      }
      h += "</tr>";
    }
    h += "</tbody></table>";
    let root = byId("calcPrintRoot");
    if (!root) { root = document.createElement("div"); root.id = "calcPrintRoot"; document.body.append(root); }
    root.innerHTML = h;
    const orient = total > 680 ? "landscape" : "portrait";
    byId("pageStyle").textContent = "@page { size: A4 " + orient + "; margin: 12mm; }";
    document.body.classList.add("print-calc");
    const done = () => { document.body.classList.remove("print-calc"); root.replaceChildren(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 50);
  }

  /* ---------------- Menu de clique direito ---------------- */

  const BG = [["Amarelo", "#fff2a8"], ["Verde", "#c9f0d2"], ["Azul", "#cfe3ff"], ["Vermelho", "#ffd0d0"], ["Laranja", "#ffdcb5"], ["Roxo", "#e2d4ff"], ["Cinza", "#e3e6eb"]];
  const FG = [["Preto", "#111111"], ["Vermelho", "#c0392b"], ["Azul", "#1f5fbf"], ["Verde", "#1e7a46"], ["Laranja", "#c76a00"], ["Cinza", "#6b7280"]];

  function menuItems(target) {
    if (!ui.ws.contains(target)) return null;
    const cellEl = target.closest && target.closest("#calcTable td, #calcTable th");
    if (cellEl) {
      const isTd = cellEl.tagName === "TD";
      const r = cellEl.parentNode.rowIndex - 1, c = cellEl.cellIndex - 1;
      const R = rect();
      if (isTd && !(r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1)) select(r, c, r, c, true);
      else if (!isTd) {
        if (cellEl.classList.contains("corner")) select(0, 0, state.rows - 1, state.cols - 1, true);
        else if (cellEl.parentNode.parentNode.tagName === "THEAD") { if (!(c >= R.c0 && c <= R.c1 && R.r0 === 0 && R.r1 === state.rows - 1)) select(0, c, state.rows - 1, c, true); }
        else if (!(r >= R.r0 && r <= R.r1 && R.c0 === 0 && R.c1 === state.cols - 1)) select(r, 0, r, state.cols - 1, true);
      }
    } else if (!ui.scroll.contains(target)) {
      return fileItems();
    }
    const R = rect();
    const cell = getCell(sel.ar, sel.ac) || {};
    const nLines = (axis) => (axis === "r" ? R.r1 - R.r0 + 1 : R.c1 - R.c0 + 1);
    return [
      { label: "Copiar", shortcut: "Ctrl+C", run: () => doCopy(null, false) },
      { label: "Recortar", shortcut: "Ctrl+X", run: () => doCopy(null, true) },
      { label: "Colar", shortcut: "Ctrl+V", run: pasteFromMenu },
      { sep: true },
      { label: "Formatar", sub: [
        { label: "Negrito", shortcut: "Ctrl+B", check: !!cell.b, run: () => toggle("b") },
        { label: "Itálico", shortcut: "Ctrl+I", check: !!cell.i, run: () => toggle("i") },
        { label: "Sublinhado", shortcut: "Ctrl+U", check: !!cell.u, run: () => toggle("u") },
        { sep: true },
        { label: "Alinhamento", sub: [["l", "À esquerda"], ["c", "Centralizado"], ["r", "À direita"]].map(([v, l]) => ({ label: l, check: cell.a === v, run: () => applyFmt({ a: v }) })) },
        { label: "Formato do número", sub: [["", "Geral"], ["num", "Número (1.234,50)"], ["brl", "Moeda (R$)"], ["pct", "Porcentagem"]].map(([v, l]) => ({ label: l, check: (cell.n || "") === v, run: () => applyFmt({ n: v || undefined }) })) },
        { label: "Cor de fundo", sub: BG.map(([l, v]) => ({ label: l, check: cell.bg === v, run: () => applyFmt({ bg: v }) })).concat([{ label: "Sem cor", run: () => applyFmt({ bg: undefined }) }]) },
        { label: "Cor do texto", sub: FG.map(([l, v]) => ({ label: l, check: cell.fg === v, run: () => applyFmt({ fg: v }) })).concat([{ label: "Cor padrão", run: () => applyFmt({ fg: undefined }) }]) },
        { sep: true },
        { label: "Limpar formatação", run: clearFormat }
      ] },
      { label: "Inserir", sub: [
        { label: nLines("r") > 1 ? "Linhas acima" : "Linha acima", run: () => insertLines("r", false) },
        { label: nLines("r") > 1 ? "Linhas abaixo" : "Linha abaixo", run: () => insertLines("r", true) },
        { label: nLines("c") > 1 ? "Colunas à esquerda" : "Coluna à esquerda", run: () => insertLines("c", false) },
        { label: nLines("c") > 1 ? "Colunas à direita" : "Coluna à direita", run: () => insertLines("c", true) }
      ] },
      { label: "Excluir", sub: [
        { label: nLines("r") > 1 ? "Linhas selecionadas" : "Linha", run: () => deleteLines("r"), danger: true },
        { label: nLines("c") > 1 ? "Colunas selecionadas" : "Coluna", run: () => deleteLines("c"), danger: true }
      ] },
      { label: "Limpar conteúdo", shortcut: "Del", run: clearSel },
      { sep: true },
      { label: "Dados", sub: [
        { label: "AutoSoma", shortcut: "Alt+=", run: autoSum },
        { label: "Preencher para baixo", shortcut: "Ctrl+D", run: () => fillDown(false) },
        { label: "Preencher para a direita", shortcut: "Ctrl+R", run: () => fillDown(true) },
        { sep: true },
        { label: "Ordenar de A a Z (pela coluna ativa)", run: () => sortSel(true) },
        { label: "Ordenar de Z a A (pela coluna ativa)", run: () => sortSel(false) }
      ] },
      { label: "Desfazer", shortcut: "Ctrl+Z", run: undo, disabled: !hist.length },
      { label: "Refazer", shortcut: "Ctrl+Y", run: redo, disabled: !redoStack.length },
      { sep: true },
      ...fileItems()
    ];
  }

  function fileItems() {
    return [
      { label: "Planilha", sub: [
        { label: "Baixar como Excel (.xlsx)", run: exportXlsx },
        { label: "Baixar como CSV", run: exportCsv },
        { label: "Imprimir", shortcut: "Ctrl+P", run: printSheet },
        { sep: true },
        { label: "Abrir CSV ou Excel como novo documento…", run: () => ui.file.click() },
        { sep: true },
        { label: "Adicionar 50 linhas", run: () => { if (state.rows >= MAXR) { C.toast("Limite de " + MAXR + " linhas."); return; } mutate(() => { state.rows = Math.min(MAXR, state.rows + 50); }, true); } }
      ] }
    ];
  }

  /* ---------------- Painéis flutuantes (paleta, contas rápidas, modelos) ---------------- */

  let popKind = null, popAnchor = null, live = false;
  function placePop(el, anchor) {
    const b = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(b.left, 8, window.innerWidth - w - 8) + "px";
    let top = b.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, b.top - h - 6);
    el.style.top = top + "px";
  }
  function closePop() { ui.pop.hidden = true; popKind = null; popAnchor = null; live = false; }
  function openPop(kind, anchor, build) {
    if (popKind === kind) { closePop(); return; }
    closePop();
    ui.pop.replaceChildren();
    ui.pop.className = "calc-pop pop-" + kind;
    build(ui.pop);
    ui.pop.hidden = false;
    popKind = kind; popAnchor = anchor;
    placePop(ui.pop, anchor);
  }
  document.addEventListener("pointerdown", (e) => { if (!ui.pop.hidden && !ui.pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ui.pop.hidden) { e.stopPropagation(); closePop(); } }, true);
  window.addEventListener("resize", closePop);

  const mkBtn = (cls, html, title) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; if (html) b.innerHTML = html; if (title) b.title = title; return b; };
  const mkText = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };

  /* ---- paleta de cores (estilo Google Planilhas) ---- */
  const GRAYS = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"];
  const VIVID = ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"];
  const BASIC = ["#000000", "#ffffff", "#4285f4", "#ea4335", "#fbbc04", "#34a853", "#ff6d01", "#46bdc6"];
  const SHADES = [0.8, 0.6, 0.4, -0.2, -0.4, -0.6];
  function shade(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
    return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const CUSTOM_KEY = "coding-calc-colors";
  const loadCustom = () => { try { const a = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); return Array.isArray(a) ? a.filter(colorOk).slice(0, 8) : []; } catch (_) { return []; } };
  const saveCustom = (c) => { try { const a = [c.toLowerCase(), ...loadCustom().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8); localStorage.setItem(CUSTOM_KEY, JSON.stringify(a)); } catch (_) { /* sem armazenamento */ } };

  function applyColor(kind, color, final) {
    if (!live) { pushHist(); live = true; }
    forRect((r, c) => { setCell(r, c, { [kind]: color }); });
    C.scheduleSave();
    repaint(); drawSel(); syncBar();
    if (final) live = false;
  }

  function openPalette(kind, anchor) {
    openPop("pal-" + kind, anchor, (box) => {
      const cur = ((getCell(sel.ar, sel.ac) || {})[kind] || "").toLowerCase();
      const reset = mkBtn("pal-reset", '<svg class="icon"><use href="#ic-undo"/></svg><span>Redefinir</span>', kind === "bg" ? "Tirar a cor de fundo" : "Voltar para a cor padrão do texto");
      reset.addEventListener("click", () => { applyColor(kind, undefined, true); closePop(); focusGrid(); });
      box.append(reset);
      const swatch = (color) => {
        const b = mkBtn("sw-c" + (cur === color.toLowerCase() ? " is-on" : ""), cur === color.toLowerCase() ? '<svg class="icon"><use href="#ic-check"/></svg>' : "", color);
        b.style.background = color;
        b.dataset.light = String(parseInt(color.slice(1), 16) > 0x999999 ? 1 : 0);
        b.addEventListener("click", () => { applyColor(kind, color, true); closePop(); focusGrid(); });
        return b;
      };
      const grid = document.createElement("div");
      grid.className = "pal-grid";
      GRAYS.forEach((c) => grid.append(swatch(c)));
      VIVID.forEach((c) => grid.append(swatch(c)));
      SHADES.forEach((t) => VIVID.forEach((c) => grid.append(swatch(shade(c, t)))));
      box.append(grid);
      box.append(mkText("div", "pal-title", "PADRÃO"));
      const basic = document.createElement("div");
      basic.className = "pal-row";
      BASIC.forEach((c) => basic.append(swatch(c)));
      box.append(basic);
      box.append(mkText("div", "pal-title", "CORES PERSONALIZADAS"));
      const row = document.createElement("div");
      row.className = "pal-row";
      const plus = document.createElement("label");
      plus.className = "sw-plus";
      plus.title = "Criar uma cor (muda enquanto você arrasta)";
      plus.innerHTML = '<svg class="icon"><use href="#ic-plus"/></svg>';
      const input = document.createElement("input");
      input.type = "color";
      input.value = colorOk(cur) ? cur : (kind === "bg" ? "#fff2a8" : "#c0392b");
      input.setAttribute("aria-label", "Escolher uma cor personalizada");
      input.addEventListener("input", () => applyColor(kind, input.value, false));
      input.addEventListener("change", () => { applyColor(kind, input.value, true); saveCustom(input.value); });
      plus.append(input);
      row.append(plus);
      if (window.EyeDropper) {
        const eye = mkBtn("sw-eye", '<svg class="icon"><use href="#ic-eye"/></svg>', "Pegar uma cor de qualquer lugar da tela");
        eye.addEventListener("click", async () => { try { const r = await new window.EyeDropper().open(); applyColor(kind, r.sRGBHex, true); saveCustom(r.sRGBHex); closePop(); focusGrid(); } catch (_) { /* cancelado */ } });
        row.append(eye);
      }
      loadCustom().forEach((c) => row.append(swatch(c)));
      box.append(row);
    });
  }

  /* ---- contas rápidas (Σ) ---- */
  function openSumMenu(anchor) {
    openPop("sum", anchor, (box) => {
      box.append(mkText("div", "pal-title", "SELECIONE OS NÚMEROS E ESCOLHA"));
      [["SOMA", "Somar", "soma tudo"], ["MÉDIA", "Média", "o valor do meio"], ["MÁXIMO", "Maior valor", "o maior número"], ["MÍNIMO", "Menor valor", "o menor número"], ["CONT.NÚM", "Contar", "quantos números"]].forEach(([fn, name, d]) => {
        const b = mkBtn("pop-item", "<strong></strong><small></small>");
        b.querySelector("strong").textContent = name;
        b.querySelector("small").textContent = d;
        b.addEventListener("click", () => { closePop(); autoSum(fn); focusGrid(); });
        box.append(b);
      });
      box.append(mkText("p", "pop-note", "O resultado aparece logo abaixo (ou à direita) das células selecionadas."));
    });
  }

  /* ---- modelos prontos ---- */
  const HEAD = { b: true, bg: "#c9f0d2" };
  function build(rows, opt) {
    const cells = {};
    rows.forEach((row, r) => row.forEach((v, c) => {
      if (v === "" || v === undefined) return;
      const cell = { v: String(v) };
      if (r === 0) Object.assign(cell, HEAD);
      const f = opt && opt.fmt && opt.fmt[c];
      if (f && r > 0) cell.n = f;
      if (opt && opt.bold && opt.bold.includes(r)) cell.b = true;
      cells[key(r, c)] = cell;
    }));
    return { name: opt.name, rows: Math.max(DEFR, rows.length + 5), cols: DEFC, widths: opt.widths || {}, cells };
  }
  const blankSafe = (n, f) => Array.from({ length: n }, (_, i) => f(i + 2));
  const TEMPLATES = [
    { name: "Lista de compras", desc: "Itens, quantidade, preço e total", make: () => build([["Item", "Quantidade", "Preço", "Total"], ["Arroz", "2", "6,5", "=B2*C2"], ["Feijão", "1", "8", "=B3*C3"], ["Leite", "6", "4,5", "=B4*C4"], ...blankSafe(11, (r) => ["", "", "", `=SE(B${r}="";"";B${r}*C${r})`]).slice(3), [], ["", "", "Total geral", "=SOMA(D2:D15)"]], { name: "Lista de compras", fmt: { 2: "brl", 3: "brl" }, bold: [13], widths: { 0: 160, 2: 110, 3: 120 } }) },
    { name: "Controle de gastos", desc: "Quanto gastei e em quê", make: () => build([["Data", "Descrição", "Categoria", "Valor", "", "Categoria", "Total gasto"], ["18/10", "Mercado", "Comida", "120", "", "Comida", "=SOMASE(C2:C100;F2;D2:D100)"], ["19/10", "Ônibus", "Transporte", "18,5", "", "Transporte", "=SOMASE(C2:C100;F3;D2:D100)"], ["20/10", "Cinema", "Lazer", "45", "", "Lazer", "=SOMASE(C2:C100;F4;D2:D100)"], ["", "", "", "", "", "", ""], ["", "", "Total", "=SOMA(D2:D100)", "", "Total geral", "=SOMA(D2:D100)"]], { name: "Controle de gastos", fmt: { 3: "brl", 6: "brl" }, bold: [5], widths: { 1: 160, 2: 120, 5: 120, 6: 120 } }) },
    { name: "Placar do jogo", desc: "Pontos por rodada e total", make: () => build([["Jogador", "Rodada 1", "Rodada 2", "Rodada 3", "Rodada 4", "Total"], ...[1, 2, 3, 4, 5, 6].map((i) => ["Jogador " + i, "", "", "", "", `=SOMA(B${i + 1}:E${i + 1})`])], { name: "Placar do jogo", widths: { 0: 130 } }) },
    { name: "Dividir a conta", desc: "Cada um com a sua parte e gorjeta", make: () => build([["Pessoa", "Consumiu", "Gorjeta 10%", "Total"], ["Ana", "50", "=B2*10%", "=B2+C2"], ["Bia", "35", "=B3*10%", "=B3+C3"], ["Caio", "62", "=B4*10%", "=B4+C4"], [], ["Soma", "=SOMA(B2:B4)", "=SOMA(C2:C4)", "=SOMA(D2:D4)"]], { name: "Dividir a conta", fmt: { 1: "brl", 2: "brl", 3: "brl" }, bold: [5], widths: { 0: 130, 1: 110, 2: 110, 3: 110 } }) },
    { name: "Notas da turma", desc: "Média e situação de cada aluno", make: () => build([["Aluno", "Nota 1", "Nota 2", "Nota 3", "Média", "Situação"], ...[2, 3, 4, 5, 6, 7].map((r) => [r === 2 ? "Ana" : r === 3 ? "Bia" : "", r === 2 ? "8" : r === 3 ? "5,5" : "", r === 2 ? "7" : r === 3 ? "6" : "", r === 2 ? "9" : r === 3 ? "4,5" : "", `=SE(B${r}="";"";MÉDIA(B${r}:D${r}))`, `=SE(E${r}="";"";SE(E${r}>=6;"Aprovado";"Recuperação"))`])], { name: "Notas da turma", fmt: { 4: "num" }, widths: { 0: 130, 5: 120 } }) },
    { name: "Estoque simples", desc: "Aviso quando está acabando", make: () => build([["Produto", "Quantidade", "Mínimo", "Aviso"], ["Caneta", "12", "10", '=SE(B2<C2;"Repor";"OK")'], ["Caderno", "3", "5", '=SE(B3<C3;"Repor";"OK")'], ["Lápis", "40", "20", '=SE(B4<C4;"Repor";"OK")'], ...[5, 6, 7, 8].map((r) => ["", "", "", `=SE(B${r}="";"";SE(B${r}<C${r};"Repor";"OK"))`])], { name: "Estoque simples", widths: { 0: 150, 3: 100 } }) }
  ];
  function openTemplates(anchor) {
    openPop("tpl", anchor, (box) => {
      box.append(mkText("div", "pal-title", "COMEÇAR DE UM MODELO"));
      TEMPLATES.forEach((t) => {
        const b = mkBtn("pop-item", "<strong></strong><small></small>");
        b.querySelector("strong").textContent = t.name;
        b.querySelector("small").textContent = t.desc;
        b.addEventListener("click", () => { closePop(); C.createDoc("calc", t.make()); });
        box.append(b);
      });
      box.append(mkText("p", "pop-note", "O modelo abre como um novo documento. O atual continua salvo."));
    });
  }

  /* ---------------- Ajudante de funções (sem escrever fórmulas) ---------------- */

  const OPS = [["=", "é igual a"], [">", "é maior que"], ["<", "é menor que"], [">=", "é maior ou igual a"], ["<=", "é menor ou igual a"], ["<>", "é diferente de"]];
  const R = (label, opt) => ({ k: "range", label, ...opt });
  const FX = [
    { g: "Contas", items: [
      { fn: "SOMA", name: "Somar", desc: "Soma os números de várias células", args: [R("Somar estas células")] },
      { fn: "MÉDIA", name: "Média", desc: "A média dos números", args: [R("Calcular a média de")] },
      { fn: "MÁXIMO", name: "Maior valor", desc: "Acha o maior número", args: [R("Procurar o maior entre")] },
      { fn: "MÍNIMO", name: "Menor valor", desc: "Acha o menor número", args: [R("Procurar o menor entre")] },
      { fn: "CONT.NÚM", name: "Contar números", desc: "Quantas células têm número", args: [R("Contar em")] },
      { fn: "ARRED", name: "Arredondar", desc: "Deixa o número com poucas casas", args: [{ k: "value", label: "Número ou célula" }, { k: "num", label: "Casas depois da vírgula", def: "2" }] }
    ] },
    { g: "Condições", items: [
      { fn: "SE", name: "Se… então… senão", desc: "Mostra uma coisa ou outra, conforme um teste", args: [{ k: "test", label: "Se isto for verdade" }, { k: "value", label: "Mostrar isto" }, { k: "value", label: "Senão, mostrar isto" }] },
      { fn: "SOMASE", name: "Somar só se…", desc: "Soma só o que combina com uma condição", args: [R("Olhar estas células"), { k: "crit", label: "Quando o valor" }, R("Somar estas células", { opt: true })] },
      { fn: "CONT.SE", name: "Contar se…", desc: "Conta quantas células combinam", args: [R("Olhar estas células"), { k: "crit", label: "Quando o valor" }] },
      { fn: "SEERRO", name: "Se der erro…", desc: "Troca uma mensagem de erro por outra coisa", args: [{ k: "value", label: "Conta ou célula" }, { k: "value", label: "Se der erro, mostrar" }] }
    ] },
    { g: "Procurar", items: [
      { fn: "PROCV", name: "Procurar numa tabela", desc: "Acha um item e traz outra coluna (ex.: preço pelo nome)", args: [{ k: "value", label: "O que procurar (nome ou célula)" }, R("Tabela onde procurar"), { k: "num", label: "Qual coluna trazer (1, 2, 3…)", def: "2" }, { k: "fixed", v: "FALSO" }] }
    ] },
    { g: "Texto", items: [
      { fn: "CONCATENAR", name: "Juntar textos", desc: "Une textos e células em um só", args: [{ k: "value", label: "Primeiro" }, { k: "value", label: "Segundo" }, { k: "value", label: "Terceiro", opt: true }] },
      { fn: "MAIÚSCULA", name: "TUDO MAIÚSCULO", desc: "Passa o texto para maiúsculas", args: [{ k: "value", label: "Texto ou célula" }] },
      { fn: "MINÚSCULA", name: "tudo minúsculo", desc: "Passa o texto para minúsculas", args: [{ k: "value", label: "Texto ou célula" }] },
      { fn: "ESQUERDA", name: "Primeiras letras", desc: "Pega o começo de um texto", args: [{ k: "value", label: "Texto ou célula" }, { k: "num", label: "Quantas letras", def: "3" }] },
      { fn: "NÚM.CARACT", name: "Contar letras", desc: "Quantas letras tem o texto", args: [{ k: "value", label: "Texto ou célula" }] }
    ] },
    { g: "Data e hora", items: [
      { fn: "HOJE", name: "Data de hoje", desc: "Mostra a data de hoje (hora de Brasília)", args: [] },
      { fn: "AGORA", name: "Data e hora agora", desc: "Mostra a data e a hora de agora", args: [] }
    ] }
  ];
  const FX_DESC = {};
  FX.forEach((g) => g.items.forEach((i) => { FX_DESC[X.strip(i.fn)] = i.desc; }));

  let fxItem = null, fxField = null, fxTarget = null;
  const fxOpen = () => !ui.fx.hidden;
  function rangeStr() { const R2 = rect(); return R2.r0 === R2.r1 && R2.c0 === R2.c1 ? refOf(R2.r0, R2.c0) : refOf(R2.r0, R2.c0) + ":" + refOf(R2.r1, R2.c1); }
  const quote = (t) => '"' + String(t).replace(/"/g, '""') + '"';
  const looksValue = (v) => /^[+-]?\d+([.,]\d+)?%?$/.test(v) || /^\$?[A-Za-z]{1,2}\$?\d+(:\$?[A-Za-z]{1,2}\$?\d+)?$/.test(v);
  const asValue = (v) => { v = v.trim(); if (v === "") return ""; if (v[0] === "=") return v.slice(1); return looksValue(v) ? v : quote(v); };
  const asCrit = (op, v) => { v = v.trim(); if (v === "") return ""; return op === "=" && /^[+-]?\d+([.,]\d+)?$/.test(v) ? v : quote((op === "=" ? "" : op) + v); };

  function fxFormula() {
    if (!fxItem) return "";
    const parts = [];
    fxItem.args.forEach((a, i) => {
      const f = ui.fx.querySelectorAll("[data-arg='" + i + "']");
      if (a.k === "fixed") { parts.push(a.v); return; }
      if (a.k === "test") { const l = asValue(f[0].value), op = f[1].value, r = asValue(f[2].value); parts.push(l === "" || r === "" ? "" : l + op + r); return; }
      if (a.k === "crit") { parts.push(asCrit(f[0].value, f[1].value)); return; }
      const v = f[0].value.trim();
      parts.push(a.k === "range" || a.k === "num" ? v.replace(/;|,/g, a.k === "range" ? ":" : ",") : asValue(v));
    });
    let n = parts.length;
    while (n > 0 && parts[n - 1] === "" && fxItem.args[n - 1].opt) n--;
    return "=" + fxItem.fn + "(" + parts.slice(0, n).join(";") + ")";
  }
  const ERR_TEXT = { "#DIV/0!": "divisão por zero", "#NOME?": "algo não foi reconhecido", "#VALOR!": "um valor não é número", "#REF!": "célula inválida", "#CICLO!": "uma célula depende dela mesma", "#ERRO!": "faltou preencher algo", "#N/D": "não encontrei" };
  function fxPreview() {
    const out = ui.fx.querySelector(".fx-result");
    if (!out) return;
    const f = fxFormula();
    const missing = fxItem.args.some((a, i) => !a.opt && a.k !== "fixed" && Array.from(ui.fx.querySelectorAll("[data-arg='" + i + "']")).some((el) => el.tagName === "INPUT" && el.type !== "hidden" && el.value.trim() === "" && !(a.k === "test" && el !== ui.fx.querySelectorAll("[data-arg='" + i + "']")[0] && false)));
    if (missing) { out.textContent = "Preencha os campos para ver o resultado."; out.className = "fx-result"; return; }
    let v;
    try { v = X.previewFormula(f, state.cells); } catch (_) { v = X.E("#ERRO!"); }
    if (v instanceof X.XErr) { out.textContent = "Ainda não dá: " + (ERR_TEXT[v.code] || v.code); out.className = "fx-result is-err"; }
    else { out.textContent = "Resultado: " + (X.showValue(v) || "(vazio)"); out.className = "fx-result is-ok"; }
    ui.fx.querySelector(".fx-code").textContent = f;
  }

  function fxList() {
    fxItem = null; fxField = null;
    const box = ui.fx;
    box.replaceChildren();
    const head = document.createElement("div");
    head.className = "fx-head";
    head.append(mkText("strong", "", "Funções"));
    const x = mkBtn("icon-btn fx-x", '<svg class="icon"><use href="#ic-close"/></svg>', "Fechar");
    x.addEventListener("click", () => { box.hidden = true; focusGrid(); });
    head.append(x);
    box.append(head, mkText("p", "fx-note", "Escolha o que você quer fazer. Eu monto a conta para você, sem precisar escrever nada."));
    const search = document.createElement("input");
    search.type = "search"; search.className = "fx-search"; search.placeholder = "Buscar (ex.: somar, média, se…)"; search.setAttribute("aria-label", "Buscar função");
    box.append(search);
    const list = document.createElement("div");
    list.className = "fx-list";
    box.append(list);
    const draw = () => {
      const q = X.strip(search.value.trim());
      list.replaceChildren();
      FX.forEach((g) => {
        const items = g.items.filter((i) => !q || X.strip(i.name + " " + i.desc + " " + i.fn).includes(q));
        if (!items.length) return;
        list.append(mkText("div", "pal-title", g.g.toUpperCase()));
        items.forEach((i) => {
          const b = mkBtn("pop-item", "<strong></strong><small></small>");
          b.querySelector("strong").textContent = i.name;
          b.querySelector("small").textContent = i.desc;
          b.addEventListener("click", () => fxForm(i));
          list.append(b);
        });
      });
      if (!list.children.length) list.append(mkText("p", "fx-note", "Nada encontrado. Tente outra palavra."));
    };
    search.addEventListener("input", draw);
    draw();
  }

  function fxForm(item) {
    fxItem = item; fxField = null;
    const box = ui.fx;
    box.replaceChildren();
    const head = document.createElement("div");
    head.className = "fx-head";
    const back = mkBtn("icon-btn fx-x", '<svg class="icon"><use href="#ic-left"/></svg>', "Voltar");
    back.addEventListener("click", fxList);
    head.append(back, mkText("strong", "", item.name));
    const x = mkBtn("icon-btn fx-x", '<svg class="icon"><use href="#ic-close"/></svg>', "Fechar");
    x.addEventListener("click", () => { box.hidden = true; focusGrid(); });
    head.append(x);
    box.append(head, mkText("p", "fx-note", item.desc));
    const form = document.createElement("div");
    form.className = "fx-form";
    box.append(form);
    const pickable = (inp) => { inp.addEventListener("focus", () => { fxField = inp; form.querySelectorAll(".is-picking").forEach((e) => e.classList.remove("is-picking")); if (inp.dataset.pick) inp.classList.add("is-picking"); }); inp.addEventListener("input", fxPreview); };
    item.args.forEach((a, i) => {
      if (a.k === "fixed") return;
      const lab = document.createElement("label");
      lab.className = "fx-field";
      lab.append(mkText("span", "", a.label + (a.opt ? " (opcional)" : "")));
      if (a.k === "test") {
        const row = document.createElement("div"); row.className = "fx-row";
        const l = document.createElement("input"); l.dataset.arg = i; l.dataset.pick = "1"; l.placeholder = "célula ou valor"; pickable(l);
        const op = document.createElement("select"); op.dataset.arg = i; OPS.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; op.append(o); }); op.value = ">="; op.addEventListener("change", fxPreview);
        const r = document.createElement("input"); r.dataset.arg = i; r.placeholder = "valor"; pickable(r);
        row.append(l, op, r); lab.append(row);
      } else if (a.k === "crit") {
        const row = document.createElement("div"); row.className = "fx-row";
        const op = document.createElement("select"); op.dataset.arg = i; OPS.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; op.append(o); }); op.addEventListener("change", fxPreview);
        const v = document.createElement("input"); v.dataset.arg = i; v.placeholder = "valor ou texto"; pickable(v);
        row.append(op, v); lab.append(row);
      } else {
        const inp = document.createElement("input");
        inp.dataset.arg = i;
        if (a.k === "range") { inp.dataset.pick = "1"; inp.placeholder = "Clique ou arraste nas células da planilha"; }
        else if (a.k === "num") { inp.value = a.def || ""; inp.inputMode = "numeric"; }
        else { inp.placeholder = "texto, número ou clique numa célula"; inp.dataset.pick = "1"; }
        pickable(inp);
        lab.append(inp);
      }
      form.append(lab);
    });
    const first = form.querySelector("[data-pick]");
    const tgt = document.createElement("label");
    tgt.className = "fx-field";
    tgt.append(mkText("span", "", "Mostrar o resultado na célula"));
    const t = document.createElement("input");
    t.className = "fx-target"; t.value = refOf(fxTarget.r, fxTarget.c); t.setAttribute("aria-label", "Célula do resultado");
    tgt.append(t);
    form.append(tgt);
    box.append(mkText("div", "fx-result", ""), mkText("code", "fx-code", ""));
    const ok = mkBtn("btn primary fx-ok", "Colocar na planilha");
    ok.addEventListener("click", () => {
      const ref = X.parseRef(t.value.trim().toUpperCase());
      if (!ref) { C.toast("Escreva uma célula válida, como D5."); return; }
      const f = fxFormula();
      mutate(() => { setCell(ref.r, ref.c, { v: f }); }, false);
      box.hidden = true;
      select(ref.r, ref.c);
      focusGrid();
    });
    box.append(ok);
    if (first) { first.focus(); }
    fxPreview();
  }

  function toggleFx() {
    if (fxOpen()) { ui.fx.hidden = true; return; }
    if (editing) commitEdit();
    fxTarget = { r: sel.ar, c: sel.ac };
    ui.fx.hidden = false;
    fxList();
  }

  /* ---------------- Sugestões enquanto digita =fórmula ---------------- */

  const FNLIST = X.functionNames();
  function hintToken(ed) {
    const v = ed.value;
    if (v[0] !== "=") return null;
    const pos = ed.selectionStart === null ? v.length : ed.selectionStart;
    const m = /(?:^=|[^A-Za-zÀ-ÿ0-9_.$])([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)$/.exec(v.slice(0, pos));
    return m ? { text: m[1], start: pos - m[1].length, end: pos } : null;
  }
  let hintMatches = [];
  function updateHint() {
    const ed = editing ? editorEl() : null;
    const tok = ed ? hintToken(ed) : null;
    if (!tok) { ui.hint.hidden = true; hintMatches = []; return; }
    const q = X.strip(tok.text);
    hintMatches = FNLIST.filter((f) => f.key.startsWith(q) && f.key !== q).slice(0, 6);
    if (!hintMatches.length) { ui.hint.hidden = true; return; }
    ui.hint.replaceChildren(...hintMatches.map((f, i) => {
      const b = mkBtn("hint-item" + (i === 0 ? " is-first" : ""), "<strong></strong><small></small>");
      b.querySelector("strong").textContent = f.pt;
      b.querySelector("small").textContent = FX_DESC[f.key] || "";
      b.addEventListener("mousedown", (e) => { e.preventDefault(); acceptHint(f); });
      return b;
    }));
    const box = ed.getBoundingClientRect();
    ui.hint.hidden = false;
    ui.hint.style.left = clamp(box.left, 8, window.innerWidth - ui.hint.offsetWidth - 8) + "px";
    ui.hint.style.top = box.bottom + 4 + "px";
  }
  function acceptHint(f) {
    const ed = editorEl();
    const tok = hintToken(ed);
    if (!tok) return;
    const ins = f.pt + "(";
    ed.value = ed.value.slice(0, tok.start) + ins + ed.value.slice(tok.end);
    const p = tok.start + ins.length;
    ed.setSelectionRange(p, p);
    if (editing.via === "cell") ui.formula.value = ed.value; else ui.editor.value = ed.value;
    ui.hint.hidden = true;
    ed.focus();
  }
  [ui.editor, ui.formula].forEach((el) => {
    el.addEventListener("input", updateHint);
    el.addEventListener("keyup", (e) => { if (!["Tab", "Enter", "Escape"].includes(e.key)) updateHint(); });
    el.addEventListener("keydown", (e) => { if (e.key === "Tab" && !ui.hint.hidden && hintMatches.length) { e.preventDefault(); e.stopPropagation(); acceptHint(hintMatches[0]); } else if (e.key === "Escape") ui.hint.hidden = true; }, true);
    el.addEventListener("blur", () => { setTimeout(() => { ui.hint.hidden = true; }, 120); });
  });

  /* ---------------- Integração com o núcleo ---------------- */

  function snippet(doc) {
    const ctx = X.makeCx(doc.state.cells);
    const out = [];
    for (let r = 0; r < Math.min(doc.state.rows, 30) && out.length < 7; r++) {
      const parts = [];
      for (let c = 0; c < Math.min(doc.state.cols, 8) && parts.length < 4; c++) {
        const x = doc.state.cells[key(r, c)];
        if (x && x.v) parts.push(X.showValue(ctx.get(r, c), x.n));
      }
      if (parts.length) out.push(parts.join(" · "));
    }
    return out;
  }

  function open(doc) {
    if (editing) cancelEdit();
    docId = doc.id;
    state = doc.state;
    hist = [];
    redoStack = [];
    internal = null;
    sel = { ar: 0, ac: 0, fr: 0, fc: 0 };
    ui.scroll.scrollTop = 0;
    ui.scroll.scrollLeft = 0;
    renderGrid();
  }

  X.clock = { now: () => C.time.now(), get zone() { return C.time.zone(); } };

  C.register({
    type: "calc",
    defaults, normalize, open, snippet,
    payload(doc) { return { format: "coding-document", version: 3, type: "calc", ...doc.state }; },
    info(doc) { const n = Object.values(doc.state.cells).filter((x) => x.v).length; return n + (n === 1 ? " célula" : " células"); },
    close() { if (editing) commitEdit(); },
    print: exportXlsx,
    primaryIsPrint: false,
    printKey: printSheet,
    menuItems
  });

  /* ---------- Celular: grade em cima, comandos na folha inferior (shell.js) ---------- */
  if (C.shell) {
    const A = (...acts) => () => acts.map((a) => ui.ws.querySelector('[data-act="' + a + '"]'));
    const sel1 = (s) => () => [ui.ws.querySelector(s)];
    const sh = C.shell.create({
      ws: ui.ws, id: "planilhas", defaultState: "collapsed", host: ui.ws, label: "Comandos da planilha",
      tabs: [
        { key: "edit", label: "Editar", icon: "ic-edit", nodes: A("edit", "undo", "redo", "copy", "cut", "paste") },
        { key: "fmt", label: "Formatar", icon: "ic-type", nodes: () => [...A("bold", "italic", "underline", "al-l", "al-c", "al-r")(), ui.ws.querySelector('[data-pal="bg"]'), ui.ws.querySelector('[data-pal="fg"]'), ui.fmt] },
        { key: "fx", label: "Fórmulas", icon: "ic-hash", nodes: A("sumMenu", "fx") },
        { key: "ins", label: "Inserir", icon: "ic-plus", nodes: A("ins-row", "ins-col") },
        { key: "file", label: "Arquivo", icon: "ic-file", nodes: A("templates", "import", "xlsx", "csv") }
      ]
    });
    sh.sheet.addEventListener("click", onToolClick);
    window.addEventListener("coding:keyboard", () => { if (sh.active && editing) setTimeout(() => { try { ui.scroll.querySelector(".calc-editor:not([hidden])") && ui.scroll.querySelector(".calc-editor").scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (_) { /* ok */ } }, 120); });
  }
  C.calc = { exportXlsx, exportCsv, printSheet };
})();
