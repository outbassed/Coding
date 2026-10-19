/* Coding — Imagens: um editor divertido, no estilo Paint + edição básica de fotos (documento salvo no aparelho) */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const SMALL = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  const LIMIT = SMALL ? 1800 : 2560; // lado maior de trabalho: fotos grandes são reduzidas para o editor ficar rápido
  const BUDGET = (SMALL ? 120 : 320) * 1048576; // memória do "desfazer"
  const FONTS = {
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, Menlo, Consolas, monospace",
    hand: "'Comic Sans MS', 'Segoe Print', 'Bradley Hand', cursive",
    impact: "Impact, 'Arial Black', 'Anton', sans-serif"
  };
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const STICKERS = "😀 😂 🤣 😍 😎 🥳 😱 😭 😡 🤔 🙄 😴 🤪 🥰 😇 🤩 👍 👎 👏 🙏 💪 ✌️ 👀 💯 🔥 ✨ ❤️ 💔 💥 ⭐ 🌈 ☀️ 🌙 ⚡ 🎉 🎈 🎁 🏆 👑 💎 🍕 🍔 🍟 🍦 🍰 🍺 ☕ ⚽ 🏀 🎮 🎵 📸 🚗 ✈️ 🏠 🐶 🐱 🦄 🐸 🐼 🦁 🌸 🌴 🌊 🚀 💡 💩 🤡 👻 💀 🎃 🧠".split(" ");
  const SWATCHES = ["#000000", "#ffffff", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#ec407a", "#795548"];

  const ws = byId("imagesWs");
  const $ = (s) => ws.querySelector(s);
  const $$ = (s) => Array.from(ws.querySelectorAll(s));
  const ui = {
    stage: byId("imStage"), wrap: byId("imWrap"), cv: byId("imCv"), ov: byId("imOv"), empty: byId("imEmpty"),
    color: byId("imColor"), size: byId("imSize"), sizeOut: byId("imSizeOut"), fill: byId("imFill"), tol: byId("imTol"),
    text: byId("imText"), font: byId("imFont"), bold: byId("imBold"), stroke: byId("imStroke"), strokeOn: byId("imStrokeOn"), objSize: byId("imObjSize"),
    tip: byId("imTip"), zoom: byId("imZoom"), est: byId("imEst")
  };
  const cx = ui.cv.getContext("2d");
  const ox = ui.ov.getContext("2d");
  const base = document.createElement("canvas");
  const bx = base.getContext("2d", { willReadFrequently: true });
  const mx = document.createElement("canvas").getContext("2d");

  let state = defaults();
  let docId = null;
  let openTok = 0;
  let has = false;
  let w = 0, h = 0;
  let objs = [];
  let sel = null;
  let tool = "move";
  let prevTool = "pencil";
  let view = { zoom: 0, scale: 1 };
  let undoSt = [], redoSt = [];
  let baseRev = 0, lastRev = -1, lastCopy = null;
  let origBlob = null, origBmp = null, showOrig = false;
  let adj = null; // { src, out } enquanto os controles de ajuste estão em uso
  let dirtyImg = false, saveTimer = 0, thumbTimer = 0;
  let crop = null;
  let drag = null;
  let ratio = "";

  function defaults() {
    return { name: "Imagem sem título", w: 0, h: 0, fmt: "image/jpeg", quality: 85, outSize: 0, thumb: "", origId: "", curId: "", objects: [], color: "#e53935", bg: "#ffffff", rot0: 0, filter: { id: "", amt: 100 } };
  }
  const FILTER_IDS = ["bw", "sepia", "vintage", "neon", "sunset", "cool", "cartoon", "vivid", "fade", "neg", "pixel"];
  const okId = (v) => typeof v === "string" && /^[a-z0-9]{4,24}$/.test(v) ? v : "";
  const newId = () => (C.util.uid() + C.util.uid()).replace(/[^a-z0-9]/g, "").slice(0, 14);
  const hex = (v, d) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d;
  const num = (v, d, a, b) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };

  function normObj(o) {
    if (!o || typeof o !== "object") return null;
    const t = ["text", "emoji", "balloon", "img"].includes(o.t) ? o.t : "";
    if (!t) return null;
    const r = { t, x: num(o.x, 0, -20000, 20000), y: num(o.y, 0, -20000, 20000), size: num(o.size, 60, 4, 6000), rot: num(o.rot, 0, -7, 7) };
    if (t === "emoji") r.ch = C.util.toText(o.ch, "😀", 8);
    if (t === "text" || t === "balloon") {
      r.text = C.util.toText(o.text, "", 400);
      r.color = hex(o.color, t === "balloon" ? "#ffffff" : "#ffffff");
      r.font = FONTS[o.font] ? o.font : "sans";
      r.bold = Boolean(o.bold);
      r.stroke = hex(o.stroke, "#000000");
      r.strokeOn = Boolean(o.strokeOn);
      r.caps = Boolean(o.caps);
    }
    if (t === "balloon") { r.tx = num(o.tx, -r.size, -20000, 20000); r.ty = num(o.ty, r.size * 2, -20000, 20000); }
    if (t === "img") {
      if (typeof o.src !== "string" || !o.src.startsWith("data:image/") || o.src.length > 4000000) return null;
      r.src = o.src; r.ar = num(o.ar, 1, 0.05, 20);
    }
    return r;
  }
  function normalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = defaults();
    const first = Array.isArray(o.items) && o.items[0] && typeof o.items[0] === "object" ? o.items[0] : null;
    const cur = okId(o.curId) || (first ? okId(first.id) : "");
    return {
      name: C.util.toText(o.name, d.name, 80),
      w: C.util.toInt(o.w, 0, 0, 20000), h: C.util.toInt(o.h, 0, 0, 20000),
      bg: /^#[0-9a-f]{6}$/i.test(o.bg) ? o.bg.toLowerCase() : d.bg,
      fmt: ["image/jpeg", "image/png", "image/webp"].includes(o.fmt) ? o.fmt : d.fmt,
      quality: C.util.toInt(o.quality, 85, 30, 100),
      outSize: [0, 3000, 1920, 1280, 800, 400].includes(Number(o.outSize)) ? Number(o.outSize) : 0,
      thumb: typeof o.thumb === "string" && o.thumb.startsWith("data:image/") && o.thumb.length < 120000 ? o.thumb : "",
      origId: okId(o.origId) || (first ? cur : ""), curId: cur,
      objects: (Array.isArray(o.objects) ? o.objects.slice(0, 40) : []).map(normObj).filter(Boolean),
      color: hex(o.color, d.color),
      rot0: first && [90, 180, 270].includes(first.rotate) ? first.rotate : 0,
      filter: { id: o.filter && FILTER_IDS.includes(o.filter.id) ? o.filter.id : "", amt: o.filter ? C.util.toInt(o.filter.amt, 100, 0, 100) : 100 }
    };
  }

  /* ---------------- Objetos (textos, adesivos, balões, fotos) ---------------- */

  function fontOf(o) { return (o.bold ? "bold " : "") + Math.round(o.size) + "px " + (o.caps ? FONTS.impact : FONTS[o.font] || FONTS.sans); }
  function linesOf(o) { const t = o.caps ? (o.text || "").toUpperCase() : (o.text || ""); return (t === "" ? " " : t).split("\n"); }
  function measure(o) {
    if (o.t === "emoji") return { w: o.size * 1.2, h: o.size * 1.2 };
    if (o.t === "img") return { w: o.size * o.ar, h: o.size };
    mx.font = fontOf(o);
    const ls = linesOf(o);
    const tw = Math.max(...ls.map((l) => mx.measureText(l).width), o.size * 0.5);
    const th = ls.length * o.size * 1.2;
    return o.t === "balloon" ? { w: tw + o.size * 1.2, h: th + o.size * 0.9, tw, th } : { w: tw, h: th, tw, th };
  }
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  function drawText(ctx, o, cxo, cyo, m) {
    ctx.font = fontOf(o);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const ls = linesOf(o);
    const top = cyo - (ls.length * o.size * 1.2) / 2 + o.size * 0.6;
    ls.forEach((l, i) => {
      const y = top + i * o.size * 1.2;
      if (o.strokeOn || o.caps) { ctx.lineWidth = Math.max(2, o.size * 0.16); ctx.strokeStyle = o.caps && !o.strokeOn ? "#000000" : o.stroke; ctx.strokeText(l, cxo, y); }
      ctx.fillStyle = o.t === "balloon" ? (lum(o.color) > 0.5 ? "#111111" : "#ffffff") : o.color;
      ctx.fillText(l, cxo, y);
    });
  }
  function rrect(ctx, x, y, ww, hh, r) {
    r = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath();
  }
  function tailPoly(o, m) {
    const rr = o.size * 0.7;
    const down = o.ty >= 0;
    const bxp = clamp(o.tx * 0.5, -m.w / 2 + rr * 1.3, m.w / 2 - rr * 1.3);
    const hw = o.size * 0.32;
    const y = down ? m.h / 2 - 1 : -m.h / 2 + 1;
    return [[bxp - hw, y], [o.tx, o.ty], [bxp + hw, y]];
  }
  function drawObj(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    const m = measure(o);
    if (o.t === "emoji") {
      ctx.font = Math.round(o.size) + "px " + EMOJI_FONT;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(o.ch, 0, o.size * 0.06);
    } else if (o.t === "img") {
      if (o.img) ctx.drawImage(o.img, -m.w / 2, -m.h / 2, m.w, m.h);
    } else if (o.t === "balloon") {
      const p = tailPoly(o, m);
      ctx.lineWidth = Math.max(3, o.size * 0.12);
      ctx.strokeStyle = "#111111";
      ctx.lineJoin = "round";
      rrect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, o.size * 0.7);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.stroke();
      ctx.fillStyle = o.color;
      rrect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, o.size * 0.7);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p[0][0] + 1, p[0][1] - (o.ty >= 0 ? 3 : -3)); ctx.lineTo(p[2][0] - 1, p[2][1] - (o.ty >= 0 ? 3 : -3)); ctx.lineWidth = Math.max(4, o.size * 0.14); ctx.strokeStyle = o.color; ctx.stroke();
      drawText(ctx, { ...o, strokeOn: false, caps: false }, 0, 0, m);
    } else drawText(ctx, o, 0, 0, m);
    ctx.restore();
  }
  function toLocal(o, x, y) {
    const dx = x - o.x, dy = y - o.y, c = Math.cos(-o.rot), s = Math.sin(-o.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }
  function toWorld(o, x, y) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    return { x: o.x + x * c - y * s, y: o.y + x * s + y * c };
  }
  function hitObj(x, y) {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i], m = measure(o), l = toLocal(o, x, y), pad = 8 / view.scale;
      if (Math.abs(l.x) <= m.w / 2 + pad && Math.abs(l.y) <= m.h / 2 + pad) return o;
      if (o.t === "balloon" && Math.hypot(l.x - o.tx, l.y - o.ty) < 14 / view.scale) return o;
    }
    return null;
  }
  function handles(o) {
    const m = measure(o), pad = 8 / view.scale;
    const hs = { scale: toWorld(o, m.w / 2 + pad, m.h / 2 + pad), rot: toWorld(o, 0, -m.h / 2 - pad - 26 / view.scale) };
    if (o.t === "balloon") hs.tail = toWorld(o, o.tx, o.ty);
    return hs;
  }
  function hitHandle(x, y) {
    if (!sel) return null;
    const hs = handles(sel), r = 16 / view.scale;
    for (const k of ["tail", "scale", "rot"]) if (hs[k] && Math.hypot(hs[k].x - x, hs[k].y - y) <= r) return k;
    return null;
  }
  function cloneObj(o) { return { ...o }; }
  function serialObj(o) {
    const r = { ...o };
    delete r.img;
    return r;
  }
  function objFromImage(src, extra) {
    const o = normObj({ t: "img", x: w / 2, y: h / 2, size: Math.min(h * 0.5, 600), rot: 0, src, ar: extra.ar });
    if (o) o.img = extra.img;
    return o;
  }

  /* ---------------- Desfazer / refazer ---------------- */

  function clone(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    return c;
  }
  const touchBase = () => { baseRev++; };
  function takeSnap() {
    if (!lastCopy || lastRev !== baseRev) { lastCopy = clone(base); lastRev = baseRev; }
    return { base: lastCopy, objs: objs.map(cloneObj), w, h, filter: { ...state.filter } };
  }
  function trimHistory() {
    const seen = new Set();
    const total = () => { seen.clear(); let t = 0; [...undoSt, ...redoSt].forEach((s) => { if (!seen.has(s.base)) { seen.add(s.base); t += s.base.width * s.base.height * 4; } }); return t; };
    while (undoSt.length > 4 && total() > BUDGET) undoSt.shift();
    while (redoSt.length > 2 && total() > BUDGET) redoSt.shift();
  }
  function pushUndo() {
    if (!has) return;
    undoSt.push(takeSnap());
    redoSt = [];
    trimHistory();
    syncButtons();
  }
  function restore(s) {
    base.width = s.w; base.height = s.h;
    bx.clearRect(0, 0, s.w, s.h);
    bx.drawImage(s.base, 0, 0);
    w = s.w; h = s.h;
    objs = s.objs.map(cloneObj);
    state.filter = { ...(s.filter || { id: "", amt: 100 }) };
    sel = null; crop = null; adj = null; clearAdjUi(); syncFilterUi();
    baseRev++; lastCopy = s.base; lastRev = baseRev;
    layout();
    changed();
  }
  function undo() {
    if (!has || !undoSt.length) return;
    redoSt.push(takeSnap());
    restore(undoSt.pop());
    syncButtons();
  }
  function redo() {
    if (!has || !redoSt.length) return;
    undoSt.push(takeSnap());
    restore(redoSt.pop());
    syncButtons();
  }
  function syncButtons() {
    const set = (k, d) => { const b = $('[data-im="' + k + '"]'); if (b) b.disabled = d; };
    set("undo", !undoSt.length);
    set("redo", !redoSt.length);
    $("#imCompare").disabled = !has || !origBlob;
  }

  /* ---------------- Tela, zoom e desenho ---------------- */

  function layout() {
    ui.wrap.hidden = !has;
    ui.empty.hidden = has;
    ws.classList.toggle("has-image", has);
    if (!has) return;
    for (const c of [ui.cv, ui.ov]) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; }
    const av = { w: Math.max(80, ui.stage.clientWidth - 24), h: Math.max(80, ui.stage.clientHeight - 24) };
    const fit = Math.min(av.w / w, av.h / h, 3);
    view.scale = view.zoom ? view.zoom : fit;
    ui.wrap.style.width = Math.round(w * view.scale) + "px";
    ui.wrap.style.height = Math.round(h * view.scale) + "px";
    ui.zoom.textContent = view.zoom ? Math.round(view.scale * 100) + "%" : "Ajustar";
    paint();
  }
  let raf = 0;
  function paint() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paintNow(); });
  }
  function paintNow() {
    if (!has) return;
    cx.clearRect(0, 0, w, h);
    if (showOrig && origBmp) {
      const k = Math.min(w / origBmp.width, h / origBmp.height);
      cx.drawImage(origBmp, (w - origBmp.width * k) / 2, (h - origBmp.height * k) / 2, origBmp.width * k, origBmp.height * k);
    } else {
      if (adj) cx.drawImage(adj.out, 0, 0, w, h); else cx.drawImage(shown(), 0, 0);
      objs.forEach((o) => drawObj(cx, o));
    }
    drawOverlay();
  }
  function drawOverlay() {
    ox.clearRect(0, 0, w, h);
    const px = 1 / view.scale;
    if (tool === "crop" && crop) {
      ox.fillStyle = "rgba(0,0,0,.55)";
      ox.beginPath(); ox.rect(0, 0, w, h); ox.rect(crop.x, crop.y, crop.w, crop.h); ox.fill("evenodd");
      ox.strokeStyle = "#fff"; ox.lineWidth = 2 * px; ox.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ox.lineWidth = px; ox.strokeStyle = "rgba(255,255,255,.55)";
      for (let i = 1; i < 3; i++) { ox.beginPath(); ox.moveTo(crop.x + (crop.w * i) / 3, crop.y); ox.lineTo(crop.x + (crop.w * i) / 3, crop.y + crop.h); ox.moveTo(crop.x, crop.y + (crop.h * i) / 3); ox.lineTo(crop.x + crop.w, crop.y + (crop.h * i) / 3); ox.stroke(); }
      ox.fillStyle = "#fff";
      [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]].forEach(([a, b]) => { ox.beginPath(); ox.arc(a, b, 9 * px, 0, 7); ox.fill(); });
    }
    if (drag && drag.preview) drag.preview(ox);
    if (sel && tool === "move" && !showOrig) {
      const m = measure(sel);
      ox.save();
      ox.translate(sel.x, sel.y); ox.rotate(sel.rot);
      const pad = 8 * px;
      ox.setLineDash([6 * px, 5 * px]); ox.lineWidth = 2 * px; ox.strokeStyle = "#4da3ff";
      ox.strokeRect(-m.w / 2 - pad, -m.h / 2 - pad, m.w + pad * 2, m.h + pad * 2);
      ox.restore();
      const hs = handles(sel);
      ox.setLineDash([]);
      const dot = (p, c, sym) => { ox.fillStyle = c; ox.strokeStyle = "#fff"; ox.lineWidth = 2 * px; ox.beginPath(); ox.arc(p.x, p.y, 11 * px, 0, 7); ox.fill(); ox.stroke(); ox.fillStyle = "#fff"; ox.font = "bold " + 13 * px + "px sans-serif"; ox.textAlign = "center"; ox.textBaseline = "middle"; ox.fillText(sym, p.x, p.y + px); };
      dot(hs.scale, "#4da3ff", "↔");
      dot(hs.rot, "#7b61ff", "⟳");
      if (hs.tail) dot(hs.tail, "#ff7a45", "◆");
    }
  }

  /* ---------------- Salvar no aparelho ---------------- */

  let sampleUntouched = false; // exemplo aberto só para ver: não vira documento até a primeira edição de verdade
  function changed(imgChanged = true, quiet = false) {
    state.objects = objs.map(serialObj);
    state.w = w; state.h = h;
    if (quiet) { paint(); updateEst(); markFilters(); return; }
    sampleUntouched = false;
    if (imgChanged) { dirtyImg = true; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 1500); }
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(makeThumb, 900);
    C.scheduleSave();
    paint();
    updateEst();
    markFilters();
  }
  function toBlobP(canvas, type, q) { return new Promise((res) => canvas.toBlob((b) => res(b), type, q)); }
  async function persist() {
    clearTimeout(saveTimer);
    if (!dirtyImg || !has || !docId || !C.store.images) return;
    dirtyImg = false;
    const id = docId;
    let blob = await toBlobP(base, "image/webp", 1);
    if (!blob || blob.type !== "image/webp") blob = await toBlobP(base, "image/png");
    if (!blob || id !== docId) return;
    if (!state.curId) state.curId = newId();
    try { await C.store.putImage({ id: state.curId, docId: id, blob, mime: blob.type, name: state.name }); } catch (_) { C.toast("Não consegui guardar a imagem neste aparelho."); }
    C.scheduleSave();
  }
  function makeThumb() {
    if (!has || sampleUntouched) return;
    const k = Math.min(1, 240 / Math.max(w, h));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(w * k)); t.height = Math.max(1, Math.round(h * k));
    const tx = t.getContext("2d");
    tx.fillStyle = "#fff"; tx.fillRect(0, 0, t.width, t.height);
    tx.scale(k, k);
    tx.drawImage(shown(true), 0, 0);
    objs.forEach((o) => drawObj(tx, o));
    state.thumb = t.toDataURL("image/jpeg", 0.7);
    C.scheduleSave();
  }

  /* ---------------- Cores (matrizes) e filtros ---------------- */

  const ID = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  function then(a, b) { // aplica a, depois b
    const o = new Array(20).fill(0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      let v = c === 4 ? b[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += b[r * 5 + k] * a[k * 5 + c];
      o[r * 5 + c] = v;
    }
    return o;
  }
  const chain = (...ms) => ms.reduce((a, b) => then(a, b), ID);
  const M = {
    bright: (v) => [v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, 1, 0],
    contrast: (v) => [v, 0, 0, 0, 0.5 - 0.5 * v, 0, v, 0, 0, 0.5 - 0.5 * v, 0, 0, v, 0, 0.5 - 0.5 * v, 0, 0, 0, 1, 0],
    sat: (s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0, 0, 0, 0, 1, 0],
    gray: [0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0],
    sepia: [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0],
    invert: [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0],
    warm: (w2) => [1 + 0.18 * w2, 0, 0, 0, 0.02 * w2, 0, 1, 0, 0, 0, 0, 0, 1 - 0.18 * w2, 0, -0.02 * w2, 0, 0, 0, 1, 0],
    hue: (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0, 0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0, 0, 0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0, 0, 0, 0, 1, 0]; },
    mix: (m, k) => m.map((v, i) => ID[i] + (v - ID[i]) * k)
  };
  function applyMatrix(id, m) {
    const d = id.data, n = d.length;
    const o = [m[4] * 255, m[9] * 255, m[14] * 255, m[19] * 255];
    for (let i = 0; i < n; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      d[i] = m[0] * r + m[1] * g + m[2] * b + m[3] * a + o[0];
      d[i + 1] = m[5] * r + m[6] * g + m[7] * b + m[8] * a + o[1];
      d[i + 2] = m[10] * r + m[11] * g + m[12] * b + m[13] * a + o[2];
      d[i + 3] = m[15] * r + m[16] * g + m[17] * b + m[18] * a + o[3];
    }
  }
  function posterize(id, levels) {
    const d = id.data, k = levels - 1;
    for (let i = 0; i < d.length; i += 4) { d[i] = Math.round((d[i] / 255) * k) * (255 / k); d[i + 1] = Math.round((d[i + 1] / 255) * k) * (255 / k); d[i + 2] = Math.round((d[i + 2] / 255) * k) * (255 / k); }
  }
  function pixelate(src, dst, block) {
    const sw = Math.max(1, Math.round(src.width / block)), sh = Math.max(1, Math.round(src.height / block));
    const t = document.createElement("canvas");
    t.width = sw; t.height = sh;
    const tc = t.getContext("2d");
    tc.imageSmoothingQuality = "high";
    tc.drawImage(src, 0, 0, sw, sh);
    const dc = dst.getContext("2d");
    dc.imageSmoothingEnabled = false;
    dc.clearRect(0, 0, dst.width, dst.height);
    dc.drawImage(t, 0, 0, dst.width, dst.height);
  }
  const FILTERS = [
    { id: "bw", name: "P&B", e: "⚫", run: (id) => applyMatrix(id, chain(M.gray, M.contrast(1.1))) },
    { id: "sepia", name: "Sépia", e: "🟤", run: (id) => applyMatrix(id, M.sepia) },
    { id: "vintage", name: "Vintage", e: "📻", run: (id) => applyMatrix(id, chain(M.mix(M.sepia, 0.45), M.contrast(0.88), M.bright(1.08), M.sat(0.85))) },
    { id: "neon", name: "Neon", e: "🌈", run: (id) => applyMatrix(id, chain(M.sat(2.4), M.contrast(1.3), M.hue(-25))) },
    { id: "sunset", name: "Pôr do sol", e: "🌅", run: (id) => applyMatrix(id, chain(M.warm(1.3), M.sat(1.25), M.contrast(1.05), [1, 0, 0, 0, 0.03, 0, 0.92, 0, 0, 0, 0, 0, 1.05, 0, 0.05, 0, 0, 0, 1, 0])) },
    { id: "cool", name: "Gelado", e: "🧊", run: (id) => applyMatrix(id, chain(M.warm(-1.2), M.sat(1.05))) },
    { id: "cartoon", name: "Desenho", e: "🎭", run: (id) => { applyMatrix(id, chain(M.sat(1.6), M.contrast(1.2))); posterize(id, 5); } },
    { id: "vivid", name: "Vivo", e: "🍭", run: (id) => applyMatrix(id, chain(M.sat(1.7), M.contrast(1.1))) },
    { id: "fade", name: "Desbotado", e: "☁️", run: (id) => applyMatrix(id, chain(M.contrast(0.78), M.bright(1.12), M.sat(0.8))) },
    { id: "neg", name: "Negativo", e: "🔄", run: (id) => applyMatrix(id, M.invert) },
    { id: "pixel", name: "Pixel", e: "🕹️", special: "pixel" }
  ];
  function applyFilterTo(canvas, f) {
    if (f.special === "pixel") { const t = clone(canvas); pixelate(t, canvas, Math.max(canvas.width, canvas.height) / 70); return; }
    const c = canvas.getContext("2d");
    const id = c.getImageData(0, 0, canvas.width, canvas.height);
    f.run(id);
    c.putImageData(id, 0, 0);
  }
  function smallCopy(max) {
    const k = Math.min(1, max / Math.max(w, h));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(w * k)); t.height = Math.max(1, Math.round(h * k));
    const c = t.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(base, 0, 0, t.width, t.height);
    return t;
  }
  let filtersDirty = true;
  let thumbRev = -1;
  let filTimer = 0;
  function markFilters() { if (thumbRev === baseRev) return; filtersDirty = true; clearTimeout(filTimer); filTimer = setTimeout(() => { if (filtersDirty && !$('[data-pane="fil"]').hidden) buildFilters(); }, 300); }
  function buildFilters() {
    const box = byId("imFilters");
    filtersDirty = false; thumbRev = baseRev;
    box.replaceChildren();
    const src = has ? smallCopy(96) : null;
    [{ id: "", name: "Normal", e: "" }, ...FILTERS].forEach((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "im-filter"; b.title = f.id ? f.name : "Sem filtro"; b.dataset.fid = f.id;
      const c = document.createElement("canvas");
      if (src) { c.width = src.width; c.height = src.height; c.getContext("2d").drawImage(src, 0, 0); if (f.id) applyFilterTo(c, f); }
      const s = document.createElement("span"); s.textContent = f.id ? f.name : "Normal (sem filtro)";
      b.append(c, s);
      b.addEventListener("click", () => setFilter(f.id));
      box.append(b);
    });
    syncFilterUi();
  }
  /* O filtro é só um "estado": a foto de verdade (base) nunca é alterada por ele.
     Trocar de filtro SUBSTITUI o anterior; "Normal" tira o filtro; a intensidade vai de 0 a 100%. */
  let fc = null, fcKey = "", fcRev = -1;
  const curFilter = () => FILTERS.find((f) => f.id === state.filter.id) || null;
  function shown(force) {
    const f = curFilter();
    if (!f || state.filter.amt <= 0) return base;
    const key = f.id + ":" + state.filter.amt;
    if (fc && fcKey === key && fcRev === baseRev && fc.width === base.width && fc.height === base.height) return fc;
    if (drag && !force) return base; // durante o traço mostra a base; o filtro volta ao soltar
    const full = clone(base);
    applyFilterTo(full, f);
    if (state.filter.amt >= 100) fc = full;
    else { fc = clone(base); const g = fc.getContext("2d"); g.globalAlpha = state.filter.amt / 100; g.drawImage(full, 0, 0); }
    fcKey = key; fcRev = baseRev;
    return fc;
  }
  function syncFilterUi() {
    const f = curFilter();
    ws.querySelectorAll(".im-filter").forEach((b) => b.classList.toggle("is-on", (b.dataset.fid || "") === (f ? f.id : "")));
    const amt = byId("imFilAmt");
    amt.value = String(state.filter.amt);
    amt.disabled = !f;
    byId("imFilAmtV").textContent = state.filter.amt;
    byId("imFilName").textContent = f ? "Filtro: " + f.name + " (" + state.filter.amt + "%)" : "Sem filtro";
  }
  function setFilter(id, amt) {
    if (!has) return;
    const next = { id, amt: id ? (amt === undefined ? (state.filter.id ? state.filter.amt : 100) : amt) : 100 };
    if (next.id === state.filter.id && next.amt === state.filter.amt) return;
    pushUndo();
    state.filter = next;
    syncFilterUi();
    changed(false);
  }
  function applyFilter(f) { setFilter(f.id); }
  async function restoreOriginal() {
    if (!has || !origBlob) { C.toast("Esta imagem não tem uma foto original guardada."); return; }
    if (hasWork() && !window.confirm("Voltar para a foto original? Desenhos, textos, cortes, ajustes e filtros serão desfeitos (você ainda poderá usar Desfazer).")) return;
    const end = C.busy("Voltando para a original…");
    try {
      const info = await decode(origBlob);
      pushUndo();
      objs = []; sel = null; crop = null;
      state.filter = { id: "", amt: 100 };
      setBaseCanvas(info.canvas);
      view.zoom = 0; layout(); syncFilterUi();
      dirtyImg = true; changed();
    } catch (_) { C.toast("Não consegui abrir a foto original."); } finally { end(); }
  }

  /* ajustes (brilho, contraste, cores, calor) com prévia ao vivo */
  const ADJ = ["imBr", "imCo", "imSa", "imWa"];
  function adjMatrix() {
    const v = ADJ.map((id) => Number(byId(id).value) / 100);
    return chain(M.bright(1 + v[0] * 0.5), M.contrast(1 + v[1] * 0.6), M.sat(1 + v[2]), M.warm(v[3]));
  }
  function clearAdjUi() { ADJ.forEach((id) => { byId(id).value = "0"; byId(id + "V").textContent = "0"; }); adj = null; }
  function adjInput() {
    if (!has) return;
    ADJ.forEach((id) => { byId(id + "V").textContent = byId(id).value; });
    if (ADJ.every((id) => Number(byId(id).value) === 0)) { adj = null; paint(); return; }
    if (!adj) { const s = smallCopy(900); adj = { src: s, out: document.createElement("canvas") }; adj.out.width = s.width; adj.out.height = s.height; }
    const c = adj.out.getContext("2d");
    c.drawImage(adj.src, 0, 0);
    const id = c.getImageData(0, 0, adj.out.width, adj.out.height);
    applyMatrix(id, adjMatrix());
    c.putImageData(id, 0, 0);
    paint();
  }
  function adjApply() {
    if (!adj) return;
    const m = adjMatrix();
    pushUndo(); touchBase();
    const id = bx.getImageData(0, 0, w, h);
    applyMatrix(id, m);
    bx.putImageData(id, 0, 0);
    clearAdjUi();
    changed();
  }

  /* ---------------- Abrir fotos ---------------- */

  const fmtKB = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const newCanvas = (cw, ch) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(cw)); c.height = Math.max(1, Math.round(ch)); return c; };

  async function decode(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (_) { throw new Error("decode"); }
    const k = Math.min(1, LIMIT / Math.max(bmp.width, bmp.height));
    let curSrc = bmp, cw = bmp.width, ch = bmp.height;
    const tw = Math.max(1, Math.round(bmp.width * k)), th = Math.max(1, Math.round(bmp.height * k));
    while (cw / 2 > tw) { // reduz em etapas: mais nítido e leve para fotos enormes
      const t = newCanvas(Math.ceil(cw / 2), Math.ceil(ch / 2));
      const c = t.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(curSrc, 0, 0, t.width, t.height);
      if (curSrc !== bmp && curSrc.width) curSrc.width = 0;
      curSrc = t; cw = t.width; ch = t.height;
      await new Promise((r) => setTimeout(r, 0));
    }
    const out = newCanvas(tw, th);
    const oc = out.getContext("2d"); oc.imageSmoothingQuality = "high"; oc.drawImage(curSrc, 0, 0, tw, th);
    const info = { canvas: out, scaled: k < 1, ow: bmp.width, oh: bmp.height };
    try { bmp.close(); } catch (_) { /* ignorado */ }
    return info;
  }
  function setBaseCanvas(nc) {
    base.width = nc.width; base.height = nc.height;
    bx.clearRect(0, 0, base.width, base.height);
    bx.drawImage(nc, 0, 0);
    w = base.width; h = base.height;
    has = true;
    touchBase();
    byId("imW").value = String(w); byId("imH").value = String(h);
    layout();
  }
  // Há trabalho a perder? Vale para quem acabou de editar e também para um documento salvo e reaberto.
  function hasWork() { return has && !sampleUntouched && (undoSt.length > 0 || objs.length > 0 || Boolean(state.curId) || dirtyImg); }
  async function loadBase(file, opts = {}) {
    if (!C.store.images) { C.toast("Este navegador não guarda arquivos: o editor de imagens fica indisponível."); return; }
    if (hasWork() && !window.confirm("Trocar a foto deste documento? As alterações feitas nela (desenhos, textos, filtros, cortes) serão perdidas.\n\nDica: use Novo na barra de cima para abrir outra foto num documento separado, sem perder esta.")) return;
    const end = C.busy("Preparando a foto…");
    try {
      const info = await decode(file);
      const oldIds = [state.origId, state.curId].filter(Boolean);
      undoSt = []; redoSt = []; lastCopy = null; lastRev = -1;
      objs = []; sel = null; crop = null; adj = null; clearAdjUi(); state.filter = { id: "", amt: 100 };
      setBaseCanvas(info.canvas);
      let blob = !info.scaled && file.size < 12e6 && /^image\/(jpeg|png|webp)$/.test(file.type) ? file : await toBlobP(info.canvas, "image/webp", 1);
      if (!blob) blob = await toBlobP(info.canvas, "image/png");
      origBlob = blob; origBmp = null;
      state.origId = newId(); state.curId = "";
      state.name = (file.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || state.name;
      byId("documentName").value = state.name;
      await C.store.putImage({ id: state.origId, docId, blob, mime: blob.type, name: file.name || "foto" });
      if (oldIds.length) C.store.deleteImages(oldIds).catch(() => {});
      if (opts.sample) {
        // exemplo editável: foto + camadas de texto e adesivo independentes
        const sz = Math.round(Math.min(w, h) * 0.11);
        objs.push(
          { t: "text", x: w / 2, y: h * 0.14, size: sz, rot: 0, text: "Dia de praia", color: "#ffffff", font: "impact", bold: false, stroke: "#000000", strokeOn: true, caps: true },
          { t: "emoji", x: w * 0.82, y: h * 0.82, size: Math.round(Math.min(w, h) * 0.2), rot: 0, ch: "🌴" }
        );
        dirtyImg = false; changed(false, true); sampleUntouched = true;
      } else { dirtyImg = true; changed(); }
      syncButtons(); setTool("move");
      if (info.scaled) C.toast("Foto grande: reduzi de " + info.ow + "×" + info.oh + " para " + w + "×" + h + " para o editor ficar rápido.");
    } catch (_) {
      C.toast("Não consegui abrir esta foto. Se for HEIC, tente converter para JPG ou tirar um print.");
    } finally { end(); }
  }
  async function loadBlank(bw, bh, transparent) {
    if (hasWork() && !window.confirm("Começar uma tela em branco neste documento? Tudo o que está nesta imagem será perdido.\n\nDica: use Novo na barra de cima para começar outra tela sem perder esta.")) return;
    const oldIds = [state.origId, state.curId].filter(Boolean);
    undoSt = []; redoSt = []; lastCopy = null; lastRev = -1;
    objs = []; sel = null; crop = null; adj = null; clearAdjUi(); state.filter = { id: "", amt: 100 };
    const c = newCanvas(bw, bh);
    if (!transparent) { const k = c.getContext("2d"); k.fillStyle = "#ffffff"; k.fillRect(0, 0, bw, bh); }
    setBaseCanvas(c);
    origBlob = null; origBmp = null;
    state.origId = ""; state.curId = "";
    if (oldIds.length) C.store.deleteImages(oldIds).catch(() => {});
    dirtyImg = true; changed(); syncButtons(); setTool("pencil");
  }
  async function addPhotoObj(file) {
    if (!has) { loadBase(file); return; }
    try {
      const info = await decode(file);
      const k = Math.min(1, 800 / Math.max(info.canvas.width, info.canvas.height));
      const t = newCanvas(info.canvas.width * k, info.canvas.height * k);
      t.getContext("2d").drawImage(info.canvas, 0, 0, t.width, t.height);
      const src = t.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/webp", 0.88);
      const o = objFromImage(src, { ar: t.width / t.height, img: t });
      if (!o) throw new Error("x");
      o.size = Math.min(h * 0.5, Math.max(80, w * 0.5 / o.ar));
      addObj(o);
    } catch (_) { C.toast("Não consegui usar esta foto."); }
  }
  function addObj(o) {
    if (!has) { C.toast("Abra uma foto ou comece uma tela em branco primeiro."); return; }
    if (objs.length >= 40) { C.toast("Muitos itens! Apague alguns antes."); return; }
    pushUndo();
    objs.push(o);
    setTool("move");
    select(o);
    changed(false);
  }
  const mid = () => ({ x: w / 2, y: h / 2 });
  function addText() {
    addObj({ t: "text", ...mid(), size: Math.round(Math.min(w, h) * 0.09), rot: 0, text: "Seu texto", color: ui.color.value, font: "sans", bold: true, stroke: "#000000", strokeOn: false, caps: false });
    ui.text.focus(); ui.text.select();
  }
  function addBalloon() {
    const size = Math.round(Math.min(w, h) * 0.06);
    addObj({ t: "balloon", x: w / 2, y: h * 0.3, size, rot: 0, text: "Oi!", color: "#ffffff", font: "hand", bold: false, stroke: "#000000", strokeOn: false, caps: false, tx: -size * 1.5, ty: size * 3 });
    ui.text.focus(); ui.text.select();
  }
  function addMeme() {
    if (!has) { C.toast("Abra uma foto primeiro."); return; }
    const size = Math.round(Math.min(w, h) * 0.11);
    pushUndo();
    const mk = (y, text) => ({ t: "text", x: w / 2, y, size, rot: 0, text, color: "#ffffff", font: "impact", bold: false, stroke: "#000000", strokeOn: true, caps: true });
    const a = mk(size * 0.9 + 12, "Texto de cima"), b = mk(h - size * 0.9 - 12, "Texto de baixo");
    objs.push(a, b);
    setTool("move"); select(a); changed(false);
    ui.text.focus(); ui.text.select();
  }
  function addEmoji(ch) {
    addObj({ t: "emoji", ...mid(), size: Math.round(Math.min(w, h) * 0.22), rot: 0, ch });
  }

  /* ---------------- Cortar, girar, espelhar, mudar tamanho, molduras ---------------- */

  function bake() {
    if (!objs.length) return false;
    objs.forEach((o) => drawObj(bx, o));
    objs = []; sel = null; touchBase();
    return true;
  }
  function geo(make) {
    if (!has) return;
    pushUndo();
    if (bake()) C.toast("Textos e adesivos foram fixados na foto.");
    touchBase();
    const nc = make();
    setBaseCanvas(nc);
    view.zoom = 0; crop = null;
    layout(); changed(); showOpts();
  }
  function rotate(dir) {
    geo(() => { const nc = newCanvas(h, w); const c = nc.getContext("2d"); c.translate(nc.width / 2, nc.height / 2); c.rotate((dir * Math.PI) / 2); c.drawImage(base, -w / 2, -h / 2); return nc; });
  }
  function flip(horiz) {
    geo(() => { const nc = newCanvas(w, h); const c = nc.getContext("2d"); if (horiz) { c.translate(w, 0); c.scale(-1, 1); } else { c.translate(0, h); c.scale(1, -1); } c.drawImage(base, 0, 0); return nc; });
  }
  function resizeTo() {
    let nw = Math.round(Number(byId("imW").value)), nh = Math.round(Number(byId("imH").value));
    if (!(nw >= 1 && nh >= 1)) { C.toast("Digite a largura e a altura."); return; }
    if (nw > 12000 || nh > 12000 || nw * nh > 64e6) { C.toast("Esse tamanho é grande demais para o editor."); return; }
    geo(() => { const nc = newCanvas(nw, nh); const c = nc.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(base, 0, 0, nc.width, nc.height); return nc; });
  }
  function startCrop() {
    if (!has) return;
    const m = Math.min(w, h) * 0.06;
    crop = { x: m, y: m, w: w - m * 2, h: h - m * 2 };
    fitRatio(); drawOverlay();
  }
  function ratioVal() { if (!ratio) return 0; const [a, b] = ratio.split(":").map(Number); return a / b; }
  function fitRatio() {
    const r = ratioVal();
    if (!r || !crop) return;
    const cxm = crop.x + crop.w / 2, cym = crop.y + crop.h / 2;
    let nw = crop.w, nh = nw / r;
    if (nh > crop.h) { nh = crop.h; nw = nh * r; }
    if (nw > w) { nw = w; nh = nw / r; }
    if (nh > h) { nh = h; nw = nh * r; }
    crop = { x: clamp(cxm - nw / 2, 0, w - nw), y: clamp(cym - nh / 2, 0, h - nh), w: nw, h: nh };
  }
  function applyCrop() {
    if (!crop) return;
    const c = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.max(1, Math.round(crop.w)), h: Math.max(1, Math.round(crop.h)) };
    if (c.w < 4 || c.h < 4) { C.toast("A área de corte está pequena demais."); return; }
    geo(() => { const nc = newCanvas(c.w, c.h); nc.getContext("2d").drawImage(base, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h); return nc; });
    setTool("move");
  }
  function frame(kind) {
    if (!has) return;
    const pct = Number(byId("imFr").value) / 100;
    const pad = Math.max(2, Math.round(Math.min(w, h) * pct));
    const color = ui.color.value;
    if (kind === "vignette") {
      pushUndo(); touchBase();
      const g = bx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0," + (0.25 + pct * 2.6).toFixed(2) + ")");
      bx.fillStyle = g; bx.fillRect(0, 0, w, h);
      changed();
      return;
    }
    geo(() => {
      if (kind === "border") { const nc = newCanvas(w + pad * 2, h + pad * 2); const c = nc.getContext("2d"); c.fillStyle = color; c.fillRect(0, 0, nc.width, nc.height); c.drawImage(base, pad, pad); return nc; }
      if (kind === "polaroid") { const nc = newCanvas(w + pad * 2, h + pad * 4.2); const c = nc.getContext("2d"); c.fillStyle = "#fbfaf6"; c.fillRect(0, 0, nc.width, nc.height); c.drawImage(base, pad, pad); return nc; }
      if (kind === "rounded") { const nc = newCanvas(w, h); const c = nc.getContext("2d"); rrect(c, 0, 0, w, h, Math.min(w, h) * pct * 2.6); c.clip(); c.drawImage(base, 0, 0); return nc; }
      const s = Math.min(w, h); const nc = newCanvas(s, s); const c = nc.getContext("2d"); c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, 7); c.clip(); c.drawImage(base, (s - w) / 2, (s - h) / 2); return nc;
    });
  }
  async function collage(mode, files) {
    const list = Array.from(files || []).slice(0, mode === "g" ? 3 : 3);
    if (!list.length) return;
    const end = C.busy("Montando a colagem…");
    try {
      const imgs = [];
      if (has) imgs.push(clone(composite(0, false)));
      for (const f of list) { const i = await decode(f); imgs.push(i.canvas); }
      const need = mode === "g" ? 4 : 2;
      const use = imgs.slice(0, need);
      if (use.length < 2) { C.toast("Escolha pelo menos mais uma foto."); return; }
      const cell = 900, gap = 10;
      const cols = mode === "h" ? use.length : mode === "v" ? 1 : 2;
      const rows = mode === "h" ? 1 : mode === "v" ? use.length : Math.ceil(use.length / 2);
      const nc = newCanvas(cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap);
      const c = nc.getContext("2d"); c.fillStyle = "#ffffff"; c.fillRect(0, 0, nc.width, nc.height); c.imageSmoothingQuality = "high";
      use.forEach((im, i) => {
        const col = mode === "v" ? 0 : i % cols, row = mode === "h" ? 0 : mode === "v" ? i : Math.floor(i / cols);
        const k = Math.max(cell / im.width, cell / im.height);
        const sw = cell / k, sh = cell / k;
        c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, gap + col * (cell + gap), gap + row * (cell + gap), cell, cell);
      });
      let big = nc;
      if (Math.max(nc.width, nc.height) > LIMIT) { const k = LIMIT / Math.max(nc.width, nc.height); big = newCanvas(nc.width * k, nc.height * k); big.getContext("2d").drawImage(nc, 0, 0, big.width, big.height); }
      if (has) { pushUndo(); objs = []; sel = null; } else { undoSt = []; redoSt = []; }
      state.filter = { id: "", amt: 100 };
      touchBase();
      setBaseCanvas(big); view.zoom = 0; layout();
      dirtyImg = true; changed(); syncButtons();
    } catch (_) { C.toast("Não consegui montar a colagem."); } finally { end(); }
  }

  /* ---------------- Exportar ---------------- */

  function composite(maxSide, white) {
    const k = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
    const c = newCanvas(w * k, h * k);
    const g = c.getContext("2d");
    if (white) { g.fillStyle = state.bg || "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
    g.imageSmoothingQuality = "high";
    g.scale(c.width / w, c.height / h);
    g.drawImage(shown(true), 0, 0);
    objs.forEach((o) => drawObj(g, o));
    return c;
  }
  async function outBlob() {
    const type = state.fmt;
    const c = composite(state.outSize, type === "image/jpeg");
    let b = await toBlobP(c, type, state.quality / 100);
    if (!b || b.type !== type) b = await toBlobP(c, "image/png");
    return b;
  }
  const extOf = (t) => t === "image/png" ? "png" : t === "image/webp" ? "webp" : "jpg";
  const fileBase = () => (state.name || "imagem").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60) || "imagem";
  let estTimer = 0;
  function updateEst() {
    if ($('[data-pane="out"]').hidden || !has) return;
    clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      const tok = ++estTok;
      const b = await outBlob();
      if (tok !== estTok || !b) return;
      const k = state.outSize ? Math.min(1, state.outSize / Math.max(w, h)) : 1;
      ui.est.textContent = Math.round(w * k) + "×" + Math.round(h * k) + " px · cerca de " + fmtKB(b.size);
    }, 450);
  }
  let estTok = 0;
  async function downloadImg() {
    if (!has) { C.toast("Abra uma foto primeiro."); return; }
    const b = await outBlob();
    if (b) C.saveBlob(b, fileBase() + "." + extOf(b.type));
  }
  async function copyImg() {
    if (!has) return;
    try {
      const c = composite(0, false);
      const b = await toBlobP(c, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
      C.toast("Imagem copiada! É só colar onde quiser.");
    } catch (_) { C.toast("Seu navegador não deixou copiar. Use Baixar."); }
  }
  async function shareImg() {
    if (!has) return;
    const b = await outBlob();
    const f = new File([b], fileBase() + "." + extOf(b.type), { type: b.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: state.name });
      else { C.saveBlob(b, f.name); C.toast("Este aparelho não compartilha daqui, então baixei a imagem."); }
    } catch (_) { /* cancelado */ }
  }
  async function stickerExport() {
    if (!has) return;
    const c = newCanvas(512, 512);
    const g = c.getContext("2d");
    const src = composite(1024, false);
    const k = Math.min(512 / src.width, 512 / src.height);
    g.imageSmoothingQuality = "high";
    g.drawImage(src, (512 - src.width * k) / 2, (512 - src.height * k) / 2, src.width * k, src.height * k);
    let q = 0.9, b = null;
    for (let i = 0; i < 6; i++) { b = await toBlobP(c, "image/webp", q); if (!b || b.type !== "image/webp" || b.size <= 100 * 1024) break; q -= 0.15; }
    if (!b || b.type !== "image/webp") { b = await toBlobP(c, "image/png"); C.toast("Seu navegador não faz WebP: baixei em PNG."); }
    C.saveBlob(b, fileBase() + "-figurinha." + extOf(b.type));
  }

  /* ---------------- Pincéis, formas e efeitos ---------------- */

  function rgba(hexc) { const n = parseInt(hexc.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function floodFill(sx, sy, color, tol) {
    sx = clamp(Math.floor(sx), 0, w - 1); sy = clamp(Math.floor(sy), 0, h - 1);
    const id = bx.getImageData(0, 0, w, h), d = id.data;
    const i0 = (sy * w + sx) * 4;
    const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], f = [...rgba(color), 255];
    const lim = tol * 4;
    const near = (i) => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) <= lim;
    if (Math.abs(f[0] - t[0]) + Math.abs(f[1] - t[1]) + Math.abs(f[2] - t[2]) + Math.abs(255 - t[3]) <= 2) return false;
    const seen = new Uint8Array(w * h);
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x0 = stack.pop();
      let x = x0;
      while (x >= 0 && !seen[y * w + x] && near((y * w + x) * 4)) x--;
      x++;
      let up = false, dn = false;
      while (x < w && !seen[y * w + x] && near((y * w + x) * 4)) {
        const i = (y * w + x) * 4;
        d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
        seen[y * w + x] = 1;
        if (y > 0) { const ok = !seen[(y - 1) * w + x] && near(((y - 1) * w + x) * 4); if (ok && !up) { stack.push(x, y - 1); up = true; } else if (!ok) up = false; }
        if (y < h - 1) { const ok = !seen[(y + 1) * w + x] && near(((y + 1) * w + x) * 4); if (ok && !dn) { stack.push(x, y + 1); dn = true; } else if (!ok) dn = false; }
        x++;
      }
    }
    bx.putImageData(id, 0, 0);
    return true;
  }
  function drawShape(g, kind, a, b, px, color, fill) {
    g.save();
    g.lineWidth = px; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = color; g.fillStyle = color;
    if (kind === "line" || kind === "arrow") {
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      if (kind === "arrow") {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), len = px * 3.5 + 14 / view.scale;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - len * Math.cos(ang - 0.5), b.y - len * Math.sin(ang - 0.5)); g.moveTo(b.x, b.y); g.lineTo(b.x - len * Math.cos(ang + 0.5), b.y - len * Math.sin(ang + 0.5)); g.stroke();
      }
    } else if (kind === "rect") {
      if (fill) g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); else g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (kind === "ellipse") {
      g.beginPath(); g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
      if (fill) g.fill(); else g.stroke();
    }
    g.restore();
  }
  function areaEffect(kind, a, b, blk) {
    const x = clamp(Math.round(Math.min(a.x, b.x)), 0, w - 1), y = clamp(Math.round(Math.min(a.y, b.y)), 0, h - 1);
    const rw = clamp(Math.round(Math.abs(b.x - a.x)), 0, w - x), rh = clamp(Math.round(Math.abs(b.y - a.y)), 0, h - y);
    if (rw < 6 || rh < 6) return false;
    pushUndo(); touchBase();
    const reg = newCanvas(rw, rh);
    reg.getContext("2d").drawImage(base, x, y, rw, rh, 0, 0, rw, rh);
    if (kind === "pixel") pixelate(reg, reg, blk);
    else {
      const f = Math.max(2, blk * 0.9);
      const s1 = newCanvas(rw / f, rh / f), s2 = newCanvas(rw / (f / 2), rh / (f / 2));
      const c1 = s1.getContext("2d"), c2 = s2.getContext("2d"), c0 = reg.getContext("2d");
      c1.imageSmoothingQuality = "high"; c1.drawImage(reg, 0, 0, s1.width, s1.height);
      c2.imageSmoothingQuality = "high"; c2.drawImage(s1, 0, 0, s2.width, s2.height);
      c0.imageSmoothingQuality = "high"; c0.clearRect(0, 0, rw, rh); c0.drawImage(s2, 0, 0, rw, rh);
    }
    bx.drawImage(reg, x, y);
    return true;
  }

  /* ---------------- Ferramentas (ponteiro) ---------------- */

  const TIPS = {
    move: "Toque num texto ou adesivo para mexer: arraste, gire (roxo) ou aumente (azul).",
    pencil: "Arraste na imagem para desenhar.", brush: "Pincel macio: arraste para pintar.", marker: "Marca-texto transparente: passe por cima do que quer destacar.",
    spray: "Segure e passe para pintar com spray.", eraser: "Apaga até deixar transparente.", bucket: "Toque numa área para pintar tudo da mesma cor. Ajuste a Força se sobrar pedaços.",
    picker: "Toque na imagem para pegar uma cor.", line: "Arraste para fazer uma linha.", arrow: "Arraste para fazer uma seta.", rect: "Arraste para fazer um retângulo.", ellipse: "Arraste para fazer um círculo.",
    blur: "Arraste sobre a área que quer borrar (rostos, placas…).", pixel: "Arraste sobre a área que quer esconder com pixels.", crop: "Arraste os cantos para escolher o que fica. Depois toque em Cortar.", stickers: "Toque num adesivo para colocar na foto."
  };
  const DRAWERS = ["pencil", "brush", "marker", "spray", "eraser"];
  const SHAPES = ["line", "arrow", "rect", "ellipse"];
  const pxSize = () => Math.max(1, Number(ui.size.value) / view.scale);

  function showOpts() {
    const tokens = [tool];
    if (tool === "move" && sel) { tokens.push("obj"); if (sel.t === "text" || sel.t === "balloon") tokens.push("text"); }
    if (!$('[data-pane="fra"]').hidden) tokens.push("frame");
    $$("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").some((t) => tokens.includes(t)); });
    ui.tip.textContent = TIPS[tool] || "";
    ui.tip.hidden = !TIPS[tool] || (tool === "move" && sel);
    if (sel && tool === "move") syncObjUi();
  }
  function setTool(t) {
    if (t === "picker" && tool !== "picker") prevTool = tool;
    if (tool === "crop" && t !== "crop") crop = null;
    tool = t;
    if (t !== "move") sel = null;
    $$("[data-tool]").forEach((b) => b.classList.toggle("is-on", b.dataset.tool === t));
    ws.dataset.tool = t;
    ui.ov.style.cursor = t === "move" ? "default" : "crosshair";
    if (t === "crop") startCrop();
    showOpts(); paint();
  }
  function select(o) {
    sel = o;
    if (o && sheetUi) sheetUi.reveal(o.t === "text" || o.t === "balloon" ? "text" : o.t === "emoji" || o.t === "img" ? "stk" : "tools", o.t === "text" || o.t === "balloon" ? "expanded" : "half");
    showOpts(); paint();
  }
  function syncObjUi() {
    if (!sel) return;
    const txt = sel.t === "text" || sel.t === "balloon";
    ["imText", "imFont", "imBold", "imStroke", "imStrokeOn"].forEach((id) => { const el = byId(id); (el.closest("label") || el).hidden = !txt; });
    if (txt) {
      ui.text.value = sel.text; ui.font.value = sel.font; ui.stroke.value = sel.stroke; ui.strokeOn.checked = sel.strokeOn; ui.color.value = sel.color;
      ui.bold.classList.toggle("is-on", sel.bold);
    }
    ui.objSize.max = String(Math.round(Math.max(w, h)));
    ui.objSize.value = String(Math.round(sel.size));
  }
  let burst = false;
  function undoBurst() { if (!burst) { pushUndo(); burst = true; setTimeout(() => { burst = false; }, 1200); } }
  function objEdit(fn) { if (!sel) return; undoBurst(); fn(sel); changed(false); }
  function setColor(v) {
    state.color = v;
    if (tool === "move" && sel && (sel.t === "text" || sel.t === "balloon")) objEdit((o) => { o.color = v; });
    C.scheduleSave();
  }

  function pt(e) { const r = ui.ov.getBoundingClientRect(); return { x: ((e.clientX - r.left) * w) / r.width, y: ((e.clientY - r.top) * h) / r.height }; }
  function commitSnap(s) { undoSt.push(s); redoSt = []; trimHistory(); syncButtons(); }

  function strokeSetup(g, px) {
    g.lineCap = "round"; g.lineJoin = "round";
    const color = ui.color.value;
    if (tool === "pencil") { g.lineWidth = px; g.strokeStyle = color; }
    else if (tool === "brush") { g.lineWidth = px * 1.5; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = px * 0.7; }
    else if (tool === "eraser") { g.lineWidth = px * 1.6; g.globalCompositeOperation = "destination-out"; g.strokeStyle = "#000"; }
  }
  function strokeTo(p) {
    const pts = drag.pts;
    pts.push(p);
    const n = pts.length;
    bx.save();
    strokeSetup(bx, drag.px);
    bx.beginPath();
    if (n < 3) { bx.moveTo(pts[0].x, pts[0].y); bx.lineTo(p.x, p.y); }
    else { const a = pts[n - 3], b = pts[n - 2]; bx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); bx.quadraticCurveTo(b.x, b.y, (b.x + p.x) / 2, (b.y + p.y) / 2); }
    bx.stroke();
    bx.restore();
  }
  function markerPaint() {
    bx.clearRect(0, 0, w, h);
    bx.drawImage(drag.sb, 0, 0);
    bx.save();
    bx.globalCompositeOperation = "multiply"; bx.globalAlpha = 0.9;
    bx.lineCap = "square"; bx.lineJoin = "round"; bx.strokeStyle = ui.color.value; bx.lineWidth = drag.px * 2.2;
    bx.beginPath(); drag.pts.forEach((q, i) => (i ? bx.lineTo(q.x, q.y) : bx.moveTo(q.x, q.y)));
    if (drag.pts.length === 1) bx.lineTo(drag.pts[0].x + 0.1, drag.pts[0].y);
    bx.stroke(); bx.restore();
  }
  function spray(p) {
    const px = drag.px, n = Math.round(px * 1.4), dot = Math.max(1, px / 14);
    bx.fillStyle = ui.color.value;
    for (let i = 0; i < n; i++) { const r = px * 1.1 * Math.sqrt(Math.random()), a = Math.random() * 6.2832; bx.fillRect(p.x + r * Math.cos(a), p.y + r * Math.sin(a), dot, dot); }
    paint();
  }
  function cropHit(p) {
    const r = 24 / view.scale;
    const cs = { tl: [crop.x, crop.y], tr: [crop.x + crop.w, crop.y], bl: [crop.x, crop.y + crop.h], br: [crop.x + crop.w, crop.y + crop.h] };
    for (const k in cs) if (Math.hypot(cs[k][0] - p.x, cs[k][1] - p.y) <= r) return k;
    if (p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h) return "move";
    return "";
  }
  function cropFrom(anchor, p) {
    const r = ratioVal();
    let dx = clamp(p.x, 0, w) - anchor.x, dy = clamp(p.y, 0, h) - anchor.y;
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let cw = Math.abs(dx), ch = Math.abs(dy);
    if (r) {
      cw = Math.max(cw, ch * r); ch = cw / r;
      const maxW = sx > 0 ? w - anchor.x : anchor.x, maxH = sy > 0 ? h - anchor.y : anchor.y;
      if (cw > maxW) { cw = maxW; ch = cw / r; }
      if (ch > maxH) { ch = maxH; cw = ch * r; }
    }
    crop = { x: sx > 0 ? anchor.x : anchor.x - cw, y: sy > 0 ? anchor.y : anchor.y - ch, w: Math.max(1, cw), h: Math.max(1, ch) };
  }

  ui.ov.addEventListener("pointerdown", (e) => {
    if (!has || drag || showOrig || (e.button && e.button > 0)) return;
    e.preventDefault();
    const p = pt(e);
    try { ui.ov.setPointerCapture(e.pointerId); } catch (_) { /* ignorado */ }
    drag = { id: e.pointerId, start: p, last: p, px: pxSize(), moved: false };
    if (tool === "move") {
      const hnd = hitHandle(p.x, p.y);
      if (hnd) { drag.mode = hnd; drag.snap = takeSnap(); drag.o0 = { ...sel }; }
      else {
        const o = hitObj(p.x, p.y);
        if (o) { select(o); drag.mode = "move"; drag.snap = takeSnap(); drag.off = { x: p.x - o.x, y: p.y - o.y }; }
        else { select(null); drag.mode = "pan"; drag.sx = e.clientX; drag.sy = e.clientY; drag.sl = ui.stage.scrollLeft; drag.st = ui.stage.scrollTop; }
      }
    } else if (DRAWERS.includes(tool)) {
      pushUndo(); touchBase();
      drag.pts = [p];
      if (tool === "marker") { drag.sb = lastCopy; markerPaint(); }
      else if (tool === "spray") { spray(p); drag.timer = setInterval(() => spray(drag.last), 28); }
      else strokeTo(p);
    } else if (tool === "bucket") {
      pushUndo(); touchBase();
      const ok = floodFill(p.x, p.y, ui.color.value, Number(ui.tol.value));
      if (!ok) { undoSt.pop(); syncButtons(); }
      drag.mode = "done";
    } else if (tool === "picker") { drag.mode = "pick"; pick(p); }
    else if (SHAPES.includes(tool)) {
      drag.preview = (g) => drawShape(g, tool, drag.start, drag.last, drag.px, ui.color.value, ui.fill.checked);
    } else if (tool === "blur" || tool === "pixel") {
      drag.preview = (g) => { const px = 1 / view.scale; g.save(); g.setLineDash([6 * px, 5 * px]); g.lineWidth = 2 * px; g.strokeStyle = "#fff"; g.fillStyle = "rgba(77,163,255,.25)"; g.fillRect(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y); g.strokeRect(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y); g.restore(); };
    } else if (tool === "crop") {
      const k = crop ? cropHit(p) : "";
      if (k === "move") { drag.mode = "cmove"; drag.c0 = { ...crop }; }
      else if (k) { drag.mode = "cresize"; drag.anchor = { x: k.includes("l") ? crop.x + crop.w : crop.x, y: k.includes("t") ? crop.y + crop.h : crop.y }; }
      else { drag.mode = "cresize"; drag.anchor = p; }
    }
    paint();
  });
  function pick(p) {
    const x = clamp(Math.floor(p.x), 0, w - 1), y = clamp(Math.floor(p.y), 0, h - 1);
    const d = cx.getImageData(x, y, 1, 1).data;
    if (d[3] < 10) return;
    const c = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    ui.color.value = c; state.color = c;
  }
  ui.ov.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pt(e);
    drag.last = p;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * view.scale > 2) drag.moved = true;
    if (drag.snap && drag.moved && !drag.committed) { commitSnap(drag.snap); drag.committed = true; }
    if (tool === "move") {
      if (drag.mode === "move" && sel) { sel.x = p.x - drag.off.x; sel.y = p.y - drag.off.y; }
      else if (drag.mode === "scale" && sel) { const d0 = Math.hypot(drag.start.x - drag.o0.x, drag.start.y - drag.o0.y) || 1; sel.size = clamp(drag.o0.size * (Math.hypot(p.x - sel.x, p.y - sel.y) / d0), 6, 6000); if (sel.t === "balloon") { const k = sel.size / drag.o0.size; sel.tx = drag.o0.tx * k; sel.ty = drag.o0.ty * k; } ui.objSize.value = String(Math.round(sel.size)); }
      else if (drag.mode === "rot" && sel) sel.rot = Math.atan2(p.y - sel.y, p.x - sel.x) + Math.PI / 2;
      else if (drag.mode === "tail" && sel) { const l = toLocal(sel, p.x, p.y); sel.tx = l.x; sel.ty = l.y; }
      else if (drag.mode === "pan") { ui.stage.scrollLeft = drag.sl - (e.clientX - drag.sx); ui.stage.scrollTop = drag.st - (e.clientY - drag.sy); }
    } else if (DRAWERS.includes(tool)) {
      if (tool === "marker") { drag.pts.push(p); markerPaint(); }
      else if (tool !== "spray") strokeTo(p);
    } else if (drag.mode === "pick") pick(p);
    else if (drag.mode === "cmove") { crop.x = clamp(drag.c0.x + p.x - drag.start.x, 0, w - crop.w); crop.y = clamp(drag.c0.y + p.y - drag.start.y, 0, h - crop.h); }
    else if (drag.mode === "cresize") cropFrom(drag.anchor, p);
    paint();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag, p = d.last;
    drag = null;
    if (d.timer) clearInterval(d.timer);
    if (tool === "move") {
      if (d.mode === "move" || d.mode === "scale" || d.mode === "rot" || d.mode === "tail") { if (d.committed) changed(false); if (sel) syncObjUi(); }
    } else if (DRAWERS.includes(tool) || d.mode === "done") changed();
    else if (d.mode === "pick") { if (state.color) C.scheduleSave(); setTool(prevTool === "picker" ? "pencil" : prevTool); }
    else if (SHAPES.includes(tool)) {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * view.scale > 3) { pushUndo(); touchBase(); drawShape(bx, tool, d.start, p, d.px, ui.color.value, ui.fill.checked); changed(); }
    } else if (tool === "blur" || tool === "pixel") {
      const blk = Math.max(4, Math.round(Number(ui.size.value) / view.scale / 2));
      if (areaEffect(tool, d.start, p, blk)) changed();
    }
    paint();
  }
  ui.ov.addEventListener("pointerup", endDrag);
  ui.ov.addEventListener("pointercancel", endDrag);
  ui.ov.addEventListener("dblclick", () => { if (tool === "move" && sel && (sel.t === "text" || sel.t === "balloon")) { ui.text.focus(); ui.text.select(); } });

  /* ---------------- Ligações da tela ---------------- */

  function zoomBy(k) {
    if (!has) return;
    view.zoom = clamp((view.zoom || view.scale) * k, 0.05, 8);
    layout();
  }
  function blankMenu(anchor) {
    const old = document.getElementById("imBlankPop");
    if (old) { old.remove(); return; }
    const box = document.createElement("div");
    box.id = "imBlankPop"; box.className = "calc-pop";
    const sizes = [["Quadrado", 1080, 1080], ["Paisagem", 1280, 720], ["Retrato", 1080, 1350], ["Figurinha", 512, 512]];
    box.innerHTML = '<div class="pal-title">TELA EM BRANCO</div>';
    sizes.forEach(([n, a, b]) => {
      const bt = document.createElement("button"); bt.type = "button"; bt.className = "pop-item";
      bt.innerHTML = "<strong></strong><small></small>"; bt.querySelector("strong").textContent = n; bt.querySelector("small").textContent = a + "×" + b + " px";
      bt.addEventListener("click", () => { box.remove(); loadBlank(a, b, tr.checked); });
      box.append(bt);
    });
    const lab = document.createElement("label"); lab.className = "tv-check"; lab.style.marginTop = "8px";
    const tr = document.createElement("input"); tr.type = "checkbox"; lab.append(tr, " Fundo transparente");
    box.append(lab);
    document.body.append(box);
    const r = anchor.getBoundingClientRect();
    box.style.left = clamp(r.left, 8, innerWidth - box.offsetWidth - 8) + "px"; box.style.top = r.bottom + 6 + "px";
    setTimeout(() => document.addEventListener("pointerdown", function f(ev) { if (!box.contains(ev.target)) { box.remove(); document.removeEventListener("pointerdown", f); } }), 0);
  }
  function deleteSel() { if (!sel) return; pushUndo(); objs.splice(objs.indexOf(sel), 1); sel = null; changed(false); showOpts(); }
  const actions = {
    open: () => byId("imFile").click(), camera: () => byId("imCam").click(), blank: (b) => blankMenu(b),
    undo, redo, zoomin: () => zoomBy(1.25), zoomout: () => zoomBy(0.8), fit: () => { view.zoom = 0; layout(); },
    objdel: deleteSel,
    objfront: () => { if (sel) { pushUndo(); objs.splice(objs.indexOf(sel), 1); objs.push(sel); changed(false); } },
    objdup: () => { if (sel) { pushUndo(); const c = { ...sel, x: sel.x + sel.size * 0.3, y: sel.y + sel.size * 0.3 }; objs.push(c); select(c); changed(false); } },
    cropok: applyCrop, cropno: () => setTool("move"),
    adjok: adjApply, adjno: () => { clearAdjUi(); paint(); },
    rotl: () => rotate(-1), rotr: () => rotate(1), flipx: () => flip(true), flipy: () => flip(false), resize: resizeTo,
    surprise: () => { const pool = FILTERS.filter((f) => f.id !== state.filter.id); setFilter(pool[Math.floor(Math.random() * pool.length)].id, 100); },
    restore: restoreOriginal,
    collage: () => { byId("imColl").hidden = !byId("imColl").hidden; },
    download: downloadImg, copy: copyImg, share: shareImg, sticker: stickerExport
  };
  ws.addEventListener("click", (e) => {
    const t = e.target.closest("[data-im],[data-tool],[data-add],[data-frame],[data-coll],[data-tab],[data-ratio]");
    if (!t || !ws.contains(t)) return;
    if (t.dataset.im) { const f = actions[t.dataset.im]; if (f) f(t); }
    else if (t.dataset.tool) setTool(t.dataset.tool);
    else if (t.dataset.add) { const a = t.dataset.add; if (a === "text") addText(); else if (a === "meme") addMeme(); else if (a === "balloon") addBalloon(); else if (a === "photo") { if (!has) C.toast("Abra uma foto primeiro."); else byId("imObjFile").click(); } }
    else if (t.dataset.frame) frame(t.dataset.frame);
    else if (t.dataset.coll) { collMode = t.dataset.coll; byId("imCollFiles").click(); }
    else if (t.dataset.tab) {
      $$("[data-tab]").forEach((b) => b.classList.toggle("is-on", b === t));
      $$("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      if (t.dataset.tab === "fil" && filtersDirty) buildFilters();
      if (t.dataset.tab === "out") updateEst();
      showOpts();
    } else if (t.dataset.ratio !== undefined) {
      ratio = t.dataset.ratio;
      $$("[data-ratio]").forEach((b) => b.classList.toggle("is-on", b === t));
      fitRatio(); paint();
    }
  });
  let collMode = "h";
  byId("imFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) loadBase(f); });
  byId("imCam").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) loadBase(f); });
  byId("imObjFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) addPhotoObj(f); });
  byId("imCollFiles").addEventListener("change", (e) => { const f = e.target.files; collage(collMode, f).then(() => { e.target.value = ""; }); });
  byId("imgSample").addEventListener("click", async () => {
    const b = byId("imgSample"); b.disabled = true;
    try {
      const r = await fetch("exemplos/praia.jpg");
      if (!r.ok) throw new Error("http");
      await loadBase(new File([await r.blob()], "Praia de exemplo.jpg", { type: "image/jpeg" }), { sample: true });
    } catch (_) { C.toast("Não consegui carregar a foto de exemplo (ela precisa de internet na primeira vez)."); }
    b.disabled = false;
  });
  const cmp = byId("imCompare");
  const showO = async () => { if (!origBlob || !has) return; if (!origBmp) { try { origBmp = await createImageBitmap(origBlob, { imageOrientation: "from-image" }); } catch (_) { return; } } showOrig = true; paint(); };
  const hideO = () => { if (showOrig) { showOrig = false; paint(); } };
  cmp.addEventListener("pointerdown", (e) => { e.preventDefault(); showO(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => cmp.addEventListener(ev, hideO));

  ui.color.addEventListener("input", () => setColor(ui.color.value));
  SWATCHES.forEach((c) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw-c"; b.style.background = c; b.title = c;
    b.addEventListener("click", () => { ui.color.value = c; setColor(c); });
    byId("imSwatches").append(b);
  });
  ui.size.addEventListener("input", () => { ui.sizeOut.textContent = ui.size.value; });
  ui.text.addEventListener("input", () => objEdit((o) => { o.text = ui.text.value; }));
  ui.font.addEventListener("change", () => objEdit((o) => { o.font = ui.font.value; }));
  ui.bold.addEventListener("click", () => objEdit((o) => { o.bold = !o.bold; ui.bold.classList.toggle("is-on", o.bold); }));
  ui.stroke.addEventListener("input", () => objEdit((o) => { o.stroke = ui.stroke.value; o.strokeOn = true; ui.strokeOn.checked = true; }));
  ui.strokeOn.addEventListener("change", () => objEdit((o) => { o.strokeOn = ui.strokeOn.checked; }));
  ui.objSize.addEventListener("input", () => objEdit((o) => { const k = Number(ui.objSize.value) / o.size; o.size = Number(ui.objSize.value); if (o.t === "balloon") { o.tx *= k; o.ty *= k; } }));
  ADJ.forEach((id) => byId(id).addEventListener("input", adjInput));
  let filBurst = false;
  byId("imFilAmt").addEventListener("input", () => {
    if (!state.filter.id) return;
    if (!filBurst) { pushUndo(); filBurst = true; setTimeout(() => { filBurst = false; }, 1200); }
    state.filter.amt = Number(byId("imFilAmt").value);
    syncFilterUi(); changed(false);
  });
  byId("imFr").addEventListener("input", () => { byId("imFrV").textContent = byId("imFr").value; });
  byId("imW").addEventListener("input", () => { if (byId("imLock").checked && w) byId("imH").value = String(Math.max(1, Math.round((Number(byId("imW").value) * h) / w))); });
  byId("imH").addEventListener("input", () => { if (byId("imLock").checked && h) byId("imW").value = String(Math.max(1, Math.round((Number(byId("imH").value) * w) / h))); });
  const outForm = () => { state.fmt = byId("imFmt").value; state.quality = Number(byId("imQ").value); state.outSize = Number(byId("imOutSize").value); byId("imQV").textContent = state.quality; byId("imQ").disabled = state.fmt === "image/png"; state.bg = byId("imBg").value; byId("imBgBox").hidden = state.fmt !== "image/jpeg"; C.scheduleSave(); updateEst(); };
  ["imFmt", "imQ", "imOutSize", "imBg"].forEach((id) => { byId(id).addEventListener("input", outForm); byId(id).addEventListener("change", outForm); });

  new ResizeObserver(() => { if (has && !ws.hidden) layout(); }).observe(ui.stage);

  /* ---------- Celular: folha inferior compartilhada (shell.js) ---------- */
  let sheetUi = null;
  if (C.shell) {
    const pane = (k) => ws.querySelector('[data-pane="' + k + '"]');
    // Texto e Adesivos ganham abas próprias: os botões são cópias (a ação é pelo data-add/data-tool, que já é delegado)
    const toolsEl = byId("imTools");
    const mkTools = (sel) => {
      const box = document.createElement("div"); box.className = "im-tools im-tools-x";
      sel.forEach((q) => { const src = toolsEl.querySelector(q); if (src) { const c = src.cloneNode(true); c.classList.add("im-clone"); box.appendChild(c); } });
      return box;
    };
    sheetUi = C.shell.create({
      ws, id: "imagens", host: ws.querySelector(".im-main"), native: true, label: "Controles do editor de imagens",
      tabs: [
        { key: "tools", label: "Ferramentas", icon: "ic-tools", nodes: () => [byId("imTools"), byId("imOpts")] },
        { key: "adj", label: "Ajustes", icon: "ic-sliders", pane: pane("adj") },
        { key: "fil", label: "Filtros", icon: "ic-wand", pane: pane("fil") },
        { key: "text", label: "Texto", icon: "ic-type", nodes: () => [mkTools(['[data-add="text"]', '[data-add="meme"]', '[data-add="balloon"]'])] },
        { key: "stk", label: "Adesivos", icon: "ic-smile", nodes: () => [mkTools(['[data-tool="stickers"]', '[data-add="photo"]'])] },
        { key: "fra", label: "Molduras", icon: "ic-frame", pane: pane("fra") },
        { key: "out", label: "Salvar", icon: "ic-download", pane: pane("out") }
      ]
    });
  }
  /* A barra de opções (cor, tamanho, texto) acompanha a aba ativa: Ferramentas, Texto, Adesivos ou Molduras. */
  function placeOpts() {
    if (!sheetUi || !sheetUi.active) return;
    const opts = byId("imOpts");
    const act = ["tools", "text", "stk", "fra"].map(pane2).find((p) => p && !p.hidden);
    if (!act) return;
    if (opts.parentNode === act) return;
    if (act.dataset.pane === "fra") act.insertBefore(opts, act.firstChild); else act.appendChild(opts);
  }
  function pane2(k) { return ws.querySelector('[data-pane="' + k + '"]'); }
  ws.addEventListener("click", (e) => { if (e.target.closest("[data-tab]")) placeOpts(); });

  ui.stage.addEventListener("wheel", (e) => { if (e.ctrlKey && has) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 0.89); } }, { passive: false });
  ["dragenter", "dragover"].forEach((ev) => ui.stage.addEventListener(ev, (e) => { e.preventDefault(); ui.stage.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => ui.stage.addEventListener(ev, (e) => { e.preventDefault(); ui.stage.classList.remove("drag"); }));
  ui.stage.addEventListener("drop", (e) => { const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => x.type.startsWith("image/")); if (!f) return; if (has) { addPhotoObj(f); C.toast("Foto colocada por cima. Para trocar a foto, use Abrir foto."); } else loadBase(f); });
  document.addEventListener("paste", (e) => {
    if (ws.hidden || !document.body.classList.contains("in-doc")) return;
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    if (has) { addPhotoObj(f); C.toast("Foto colada por cima. Para trocar a foto, use Abrir foto."); } else loadBase(f);
  });
  document.addEventListener("keydown", (e) => {
    if (ws.hidden || !document.body.classList.contains("in-doc") || !C.curMode() || C.curMode().type !== "images") return;
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.code === "KeyZ" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && !e.altKey && e.code === "KeyY" && !typing) { e.preventDefault(); redo(); }
    else if (!typing && (e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSel(); }
    else if (e.key === "Escape" && !typing) { if (tool === "crop") setTool("move"); else if (sel) select(null); }
    else if (!typing && sel && tool === "move" && e.key.startsWith("Arrow")) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; undoBurst(); sel.x += e.key === "ArrowRight" ? s : e.key === "ArrowLeft" ? -s : 0; sel.y += e.key === "ArrowDown" ? s : e.key === "ArrowUp" ? -s : 0; changed(false); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });

  /* ---- arquivos: salvar e ZIP (usados por outras ferramentas) ---- */
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  C.saveBlob = saveBlob;

  /* ZIP sem compressão (as imagens já estão comprimidas) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
      parts.push(local, name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    let size = 0;
    central.forEach((p) => { size += p.byteLength !== undefined ? p.byteLength : p.length; });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  C.makeZip = makeZip;

  /* ---------------- Integração com o núcleo ---------------- */

  const HELP = { maxStickers: STICKERS };
  STICKERS.forEach((ch) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = ch; b.title = "Colocar na foto";
    b.addEventListener("click", () => addEmoji(ch));
    byId("imStk").append(b);
  });

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  async function exportPayload(doc) {
    const data = { format: "coding-document", version: 4, type: "images", ...doc.state, images: [] };
    if (doc.id === docId) await persist();
    const records = await C.store.getImages(doc.id);
    const ids = new Set([doc.state.origId, doc.state.curId].filter(Boolean));
    for (const r of records.filter((x) => ids.has(x.id))) data.images.push({ id: r.id, mime: r.mime || r.blob.type, name: r.name || "imagem", data: await blobToBase64(r.blob) });
    return data;
  }
  async function prepareImport(data) {
    const st = normalize(data);
    const list = Array.isArray(data.images) ? data.images.slice(0, 4) : [];
    const images = [];
    const map = {};
    for (const rec of list) {
      if (!rec || typeof rec.id !== "string" || typeof rec.data !== "string" || rec.data.length > 80000000) continue;
      const mime = /^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(rec.mime) ? rec.mime : "";
      if (!mime) continue;
      try {
        const bin = atob(rec.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fresh = newId();
        map[rec.id] = fresh;
        images.push({ id: fresh, blob: new Blob([bytes], { type: mime }), mime, name: C.util.toText(rec.name, "imagem", 120) });
      } catch (_) { /* ignora imagem inválida */ }
    }
    st.origId = map[st.origId] || "";
    st.curId = map[st.curId] || "";
    if (st.curId && st.curId === st.origId) st.curId = "";
    return { state: st, images };
  }

  async function open(doc) {
    sampleUntouched = false;
    const tok = ++openTok;
    clearTimeout(saveTimer);
    docId = doc.id;
    state = doc.state;
    has = false; w = h = 0; objs = []; sel = null; crop = null; adj = null; drag = null;
    undoSt = []; redoSt = []; lastCopy = null; lastRev = -1; dirtyImg = false; origBlob = null; origBmp = null; showOrig = false; view.zoom = 0;
    clearAdjUi();
    byId("imFmt").value = state.fmt; byId("imQ").value = String(state.quality); byId("imOutSize").value = String(state.outSize);
    byId("imQV").textContent = state.quality; byId("imQ").disabled = state.fmt === "image/png"; byId("imBg").value = state.bg || "#ffffff"; byId("imBgBox").hidden = state.fmt !== "image/jpeg";
    ui.color.value = state.color;
    if (state.curId && state.curId === state.origId) state.curId = "";
    byId("imgSample").disabled = !C.store.images;
    let records = [];
    try { records = await C.store.getImages(doc.id); } catch (_) { records = []; }
    if (tok !== openTok) return;
    const rec = (id) => records.find((r) => r.id === id);
    const cur = rec(state.curId) || rec(state.origId);
    if (cur) {
      try {
        const bmp = await createImageBitmap(cur.blob, { imageOrientation: "from-image" });
        if (tok !== openTok) return;
        const k = Math.min(1, LIMIT * 1.3 / Math.max(bmp.width, bmp.height));
        const c = newCanvas(bmp.width * k, bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        try { bmp.close(); } catch (_) { /* ignorado */ }
        setBaseCanvas(c);
        const o = rec(state.origId);
        origBlob = o ? o.blob : null;
        for (const raw of state.objects) {
          const ob = { ...raw };
          if (ob.t === "img") {
            try { const im = new Image(); im.src = ob.src; await im.decode(); ob.img = im; } catch (_) { continue; }
          }
          objs.push(ob);
        }
        if (state.rot0) { const turns = state.rot0 / 90; for (let i = 0; i < turns; i++) { const nc = newCanvas(h, w); const g = nc.getContext("2d"); g.translate(nc.width / 2, nc.height / 2); g.rotate(Math.PI / 2); g.drawImage(base, -w / 2, -h / 2); setBaseCanvas(nc); } state.rot0 = 0; dirtyImg = true; changed(); }
      } catch (_) { C.toast("Não consegui abrir a imagem deste documento."); has = false; }
    }
    const keep = new Set([state.origId, state.curId]);
    const orphans = records.filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (orphans.length && cur) C.store.deleteImages(orphans).catch(() => {});
    if (tok !== openTok) return;
    layout(); syncButtons(); filtersDirty = true; syncFilterUi();
    setTool(has ? "move" : "move");
    C.setPrimary(undefined, false);
  }
  function closeDoc() {
    openTok++;
    if (sampleUntouched) { // exemplo que ninguém editou: não deixa nada guardado
      const ids = [state.origId, state.curId].filter(Boolean);
      if (ids.length) C.store.deleteImages(ids).catch(() => {});
      sampleUntouched = false;
    }
    persist();
    clearTimeout(saveTimer);
    clearInterval(drag && drag.timer);
    drag = null;
    const old = document.getElementById("imBlankPop");
    if (old) old.remove();
  }
  function menuItems(target) {
    if (!ws.contains(target)) return null;
    return [
      { label: "Baixar imagem", run: downloadImg, disabled: !has },
      { label: "Copiar imagem", run: copyImg, disabled: !has },
      { sep: true },
      { label: "Desfazer", run: undo, disabled: !undoSt.length },
      { label: "Refazer", run: redo, disabled: !redoSt.length },
      { sep: true },
      { label: "Girar para a esquerda", run: () => rotate(-1), disabled: !has },
      { label: "Girar para a direita", run: () => rotate(1), disabled: !has },
      { label: "Espelhar", run: () => flip(true), disabled: !has },
      { sep: true },
      { label: "Abrir outra foto…", run: () => byId("imFile").click() }
    ];
  }

  C.register({
    type: "images",
    defaults, normalize, exportPayload, prepareImport, open,
    payload(doc) { return { format: "coding-document", version: 4, type: "images", ...doc.state }; },
    info(doc) { return doc.state.w ? doc.state.w + "×" + doc.state.h + " px" : "Vazia"; },
    thumb(doc) { return doc.state.thumb || ""; },
    close: closeDoc,
    print: downloadImg,
    primaryIsPrint: false,
    shareable: false,
    menuItems
  });
  layout();
})();
