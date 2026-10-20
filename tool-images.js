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
    return { name: "Imagem sem título", w: 0, h: 0, fmt: "image/jpeg", quality: 85, outSize: 0, thumb: "", origId: "", curId: "", objects: [], color: "#e53935", bg: "#ffffff", rot0: 0, filter: { id: "", amt: 100 }, frames: [] };
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
    const r = { t, x: num(o.x, 0, -20000, 20000), y: num(o.y, 0, -20000, 20000), size: num(o.size, 60, 4, 6000), rot: num(o.rot, 0, -7, 7), alpha: num(o.alpha, 1, 0.05, 1) };
    if (t === "emoji") r.ch = C.util.toText(o.ch, "😀", 8);
    if (t === "text" || t === "balloon") {
      r.text = C.util.toText(o.text, "", 400);
      r.color = hex(o.color, t === "balloon" ? "#ffffff" : "#ffffff");
      r.font = FONTS[o.font] ? o.font : "sans";
      r.bold = Boolean(o.bold);
      r.stroke = hex(o.stroke, "#000000");
      r.strokeOn = Boolean(o.strokeOn);
      r.caps = Boolean(o.caps);
      r.align = ["l", "c", "r"].includes(o.align) ? o.align : "c";
      r.shadow = Boolean(o.shadow);
      r.box = Boolean(o.box);
      r.boxColor = hex(o.boxColor, "#000000");
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
      filter: { id: o.filter && FILTER_IDS.includes(o.filter.id) ? o.filter.id : "", amt: o.filter ? C.util.toInt(o.filter.amt, 100, 0, 100) : 100 },
      frames: normFrames(o.frames)
    };
  }


  /* ---------------- Molduras: camadas não destrutivas ---------------- */
  /* Cada moldura é uma camada com opções próprias. A de índice 0 fica rente à foto; a última fica por fora.
     Elas só mudam a tela e a imagem salva: a foto original continua intacta e dá para ligar, desligar, reordenar e apagar. */

  const FR_MAX = 6;
  const FR_KINDS = {
    border: { name: "Borda", icon: "frame", def: { size: 6, color: "#ffffff", style: "solid", radius: 0, where: "out" }, fields: [
      ["size", "range", "Espessura", 1, 30, "%"], ["color", "color", "Cor"],
      ["style", "select", "Estilo", [["solid", "Lisa"], ["double", "Dupla"], ["dashed", "Tracejada"]]],
      ["radius", "range", "Cantos arredondados", 0, 50, "%"],
      ["where", "select", "Posição", [["out", "Por fora da foto"], ["in", "Por cima da foto"]]]] },
    polaroid: { name: "Polaroid", icon: "polaroid", def: { size: 5, bottom: 22, color: "#fbfaf6", caption: "", capColor: "#333333", font: "hand" }, fields: [
      ["size", "range", "Margem", 1, 20, "%"], ["bottom", "range", "Margem de baixo", 8, 45, "%"], ["color", "color", "Cor do papel"],
      ["caption", "text", "Legenda"], ["capColor", "color", "Cor da legenda"],
      ["font", "select", "Letra da legenda", [["hand", "Manuscrita"], ["sans", "Normal"], ["serif", "Clássica"], ["mono", "Máquina"]]]] },
    rounded: { name: "Cantos redondos", icon: "rounded", def: { radius: 12, bgOn: false, bg: "#ffffff" }, fields: [
      ["radius", "range", "Arredondamento", 1, 50, "%"], ["bgOn", "check", "Pintar o fundo dos cantos"], ["bg", "color", "Cor do fundo"]] },
    circle: { name: "Círculo", icon: "circle", def: { shape: "circle", bgOn: false, bg: "#ffffff" }, fields: [
      ["shape", "select", "Forma", [["circle", "Círculo (corta em quadrado)"], ["oval", "Oval (mantém o tamanho)"]]],
      ["bgOn", "check", "Pintar o fundo dos cantos"], ["bg", "color", "Cor do fundo"]] },
    vignette: { name: "Vinheta", icon: "vignette", def: { strength: 55, size: 45, color: "#000000" }, fields: [
      ["strength", "range", "Intensidade", 5, 100, "%"], ["size", "range", "Área clara", 0, 100, "%"], ["color", "color", "Cor"]] },
    blur: { name: "Fundo desfocado", icon: "blurbg", def: { ratio: "1:1", blur: 30, dim: 20 }, fields: [
      ["ratio", "select", "Formato", [["1:1", "Quadrado 1:1"], ["4:5", "Retrato 4:5"], ["9:16", "Story 9:16"], ["16:9", "Paisagem 16:9"], ["4:3", "Paisagem 4:3"]]],
      ["blur", "range", "Desfoque", 5, 80, ""], ["dim", "range", "Escurecer", 0, 80, "%"]] },
    film: { name: "Filme", icon: "film", def: { size: 9, color: "#111111", holes: true }, fields: [
      ["size", "range", "Tamanho", 4, 20, "%"], ["color", "color", "Cor"], ["holes", "check", "Furinhos"]] }
  };
  function normFrame(o) {
    const K = o && typeof o === "object" ? FR_KINDS[o.kind] : null;
    if (!K) return null;
    const r = { id: okId(o.id) || newId(), kind: o.kind, on: o.on !== false };
    K.fields.forEach(([key, type, , a, b]) => {
      const d = K.def[key], v = o[key];
      if (type === "range") r[key] = num(v, d, a, b);
      else if (type === "color") r[key] = hex(v, d);
      else if (type === "select") r[key] = a.some((x) => x[0] === v) ? v : d;
      else if (type === "check") r[key] = typeof v === "boolean" ? v : d;
      else r[key] = C.util.toText(v, d, 60);
    });
    return r;
  }
  function normFrames(arr) { return (Array.isArray(arr) ? arr.slice(0, FR_MAX) : []).map(normFrame).filter(Boolean); }
  const frCopy = (arr) => arr.map((f) => ({ ...f }));
  const luma = (c) => { const n = parseInt(c.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  // Tamanho de cada camada e onde a foto fica dentro dela (só deslocamentos: a foto nunca é esticada).
  function frGeo(f, iw, ih) {
    const m = Math.min(iw, ih), I = { ow: iw, oh: ih, dx: 0, dy: 0 };
    if (f.kind === "border") { if (f.where === "in") return I; const p = Math.max(1, Math.round(m * f.size / 100)); return { ow: iw + 2 * p, oh: ih + 2 * p, dx: p, dy: p }; }
    if (f.kind === "polaroid") { const p = Math.max(1, Math.round(m * f.size / 100)), b = Math.max(1, Math.round(m * f.bottom / 100)); return { ow: iw + 2 * p, oh: ih + p + b, dx: p, dy: p }; }
    if (f.kind === "circle" && f.shape === "circle") { const s = Math.min(iw, ih); return { ow: s, oh: s, dx: -Math.round((iw - s) / 2), dy: -Math.round((ih - s) / 2) }; }
    if (f.kind === "blur") {
      const [a, b] = f.ratio.split(":").map(Number), r = a / b;
      let ow = iw, oh = ih;
      if (iw / ih > r) oh = iw / r; else ow = ih * r;
      ow = Math.round(ow); oh = Math.round(oh);
      return { ow, oh, dx: Math.round((ow - iw) / 2), dy: Math.round((oh - ih) / 2) };
    }
    if (f.kind === "film") { const p = Math.max(2, Math.round(m * f.size / 100)), side = Math.round(p * 0.5), strip = Math.round(p * 1.7); return { ow: iw + 2 * side, oh: ih + 2 * strip, dx: side, dy: strip }; }
    return I;
  }
  function frGeoAll(fs, pw, ph) {
    let iw = pw, ih = ph, L = 0, T = 0;
    const geos = [];
    fs.forEach((f) => {
      let g = frGeo(f, iw, ih);
      if (g.ow > 9000 || g.oh > 9000 || g.ow * g.oh > 50e6) g = { ow: iw, oh: ih, dx: 0, dy: 0 };
      g.iw = iw; g.ih = ih; geos.push(g);
      L += g.dx; T += g.dy; iw = g.ow; ih = g.oh;
    });
    return { W: iw, H: ih, L, T, geos };
  }
  function ringPath(g, W, H, p, r) { // "anel" de largura p (a borda), com a abertura no meio
    g.beginPath();
    rrectPath(g, 0, 0, W, H, r);
    rrectPath(g, p, p, Math.max(1, W - 2 * p), Math.max(1, H - 2 * p), Math.max(0, r - p));
  }
  function rrectPath(g, x, y, ww, hh, r) {
    r = Math.max(0, Math.min(r, ww / 2, hh / 2));
    g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath();
  }
  let blurCache = { key: "", c: null };
  function blurBackdrop(f, ow, oh) {
    const key = [ow, oh, f.blur, baseRev, state.filter.id, state.filter.amt].join(":");
    if (blurCache.c && (blurCache.key === key || drag)) return blurCache.c;
    const src = shown(true);
    const k = 3 + f.blur * 0.55;
    const s1 = newCanvas(Math.max(4, ow / k), Math.max(4, oh / k));
    const c1 = s1.getContext("2d"); c1.imageSmoothingQuality = "high";
    const cover = Math.max(s1.width / src.width, s1.height / src.height);
    c1.drawImage(src, (s1.width - src.width * cover) / 2, (s1.height - src.height * cover) / 2, src.width * cover, src.height * cover);
    const s2 = newCanvas(Math.max(3, s1.width / 2), Math.max(3, s1.height / 2));
    const c2 = s2.getContext("2d"); c2.imageSmoothingQuality = "high"; c2.drawImage(s1, 0, 0, s2.width, s2.height);
    const out = newCanvas(ow, oh);
    const co = out.getContext("2d"); co.imageSmoothingQuality = "high"; co.drawImage(s2, 0, 0, ow, oh);
    blurCache = { key, c: out };
    return out;
  }
  function frBack(g, f, gm) {
    if ((f.kind === "rounded" || f.kind === "circle") && f.bgOn) { g.fillStyle = f.bg; g.fillRect(0, 0, gm.ow, gm.oh); }
  }
  function frClip(g, f, gm) {
    const m = Math.min(gm.ow, gm.oh);
    if (f.kind === "border" && f.radius > 0) { g.beginPath(); rrectPath(g, 0, 0, gm.ow, gm.oh, m * f.radius / 100); g.clip(); }
    else if (f.kind === "rounded") { g.beginPath(); rrectPath(g, 0, 0, gm.ow, gm.oh, m * f.radius / 100); g.clip(); }
    else if (f.kind === "circle") { g.beginPath(); g.ellipse(gm.ow / 2, gm.oh / 2, gm.ow / 2, gm.oh / 2, 0, 0, 7); g.clip(); }
  }
  function frUnder(g, f, gm) {
    const { ow, oh } = gm, m = Math.min(gm.iw, gm.ih);
    if (f.kind === "border" && f.where === "out") { g.fillStyle = f.color; g.fillRect(0, 0, ow, oh); }
    else if (f.kind === "polaroid") { g.fillStyle = f.color; g.fillRect(0, 0, ow, oh); }
    else if (f.kind === "blur") {
      g.drawImage(blurBackdrop(f, ow, oh), 0, 0, ow, oh);
      if (f.dim > 0) { g.fillStyle = "rgba(0,0,0," + (f.dim / 100).toFixed(2) + ")"; g.fillRect(0, 0, ow, oh); }
    } else if (f.kind === "film") {
      g.fillStyle = f.color; g.fillRect(0, 0, ow, oh);
      if (f.holes) {
        const p = Math.max(2, Math.round(m * f.size / 100)), strip = Math.round(p * 1.7), hs = strip * 0.36, step = hs * 1.9;
        g.fillStyle = luma(f.color) > 0.5 ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.88)";
        for (let x = step / 2; x < ow - hs; x += step) {
          g.beginPath(); rrectPath(g, x, (strip - hs) / 2, hs * 1.15, hs, hs * 0.25); g.fill();
          g.beginPath(); rrectPath(g, x, oh - strip + (strip - hs) / 2, hs * 1.15, hs, hs * 0.25); g.fill();
        }
      }
    }
  }
  function frOver(g, f, gm) {
    const { ow, oh } = gm, m = Math.min(gm.iw, gm.ih);
    if (f.kind === "border") {
      const p = Math.max(1, Math.round(m * f.size / 100)), r = f.radius > 0 ? Math.min(ow, oh) * f.radius / 100 : 0;
      if (f.where === "in") { g.save(); g.fillStyle = f.color; ringPath(g, ow, oh, p, r); g.fill("evenodd"); g.restore(); }
      if (f.style !== "solid") {
        g.save();
        g.strokeStyle = luma(f.color) > 0.5 ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.8)";
        const lw = Math.max(1, p * 0.1);
        g.lineWidth = lw;
        const line = (inset) => { g.beginPath(); rrectPath(g, inset, inset, ow - 2 * inset, oh - 2 * inset, Math.max(0, r - inset)); g.stroke(); };
        if (f.style === "double") { line(p * 0.28); line(p * 0.72); }
        else { g.setLineDash([p * 0.55, p * 0.4]); line(p * 0.5); }
        g.restore();
      }
    } else if (f.kind === "polaroid" && f.caption.trim()) {
      const p = Math.max(1, Math.round(m * f.size / 100)), top = p + gm.ih, areaH = oh - top;
      let size = Math.max(8, areaH * 0.42);
      g.save();
      g.fillStyle = f.capColor; g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < 12; i++) { g.font = Math.round(size) + "px " + (FONTS[f.font] || FONTS.sans); if (g.measureText(f.caption).width <= ow * 0.88) break; size *= 0.88; }
      g.fillText(f.caption, ow / 2, top + areaH / 2, ow * 0.92);
      g.restore();
    } else if (f.kind === "vignette") {
      const r1 = Math.hypot(ow, oh) / 2, r0 = r1 * (f.size / 100) * 0.85, c = rgba(f.color);
      const gr = g.createRadialGradient(ow / 2, oh / 2, r0, ow / 2, oh / 2, r1);
      gr.addColorStop(0, "rgba(" + c.join(",") + ",0)"); gr.addColorStop(1, "rgba(" + c.join(",") + "," + (f.strength / 100 * 0.95).toFixed(2) + ")");
      g.fillStyle = gr; g.fillRect(0, 0, ow, oh);
    }
  }
  // Desenha a pilha de molduras ao redor da foto. drawPhoto(g) desenha a foto (e textos) na origem (0,0).
  function frDraw(g, i, fs, geos, drawPhoto) {
    if (i < 0) { drawPhoto(g); return; }
    const f = fs[i], gm = geos[i];
    g.save();
    frBack(g, f, gm);
    frClip(g, f, gm);
    frUnder(g, f, gm);
    g.save(); g.translate(gm.dx, gm.dy); frDraw(g, i - 1, fs, geos, drawPhoto); g.restore();
    frOver(g, f, gm);
    g.restore();
  }
  let fg = { W: 0, H: 0, L: 0, T: 0, geos: [], fs: [] };
  const framesOn = () => (tool === "crop" ? [] : state.frames.filter((f) => f.on));
  function refreshGeom() { const fs = framesOn(); fg = { ...frGeoAll(fs, w, h), fs }; }


  /* ---- tela das molduras: lista de camadas + opções da camada escolhida ---- */
  let frSelId = "";
  function frFixSel() { if (!state.frames.some((f) => f.id === frSelId)) frSelId = state.frames.length ? state.frames[state.frames.length - 1].id : ""; }
  const frSel = () => state.frames.find((f) => f.id === frSelId) || null;
  const mkEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const frIcon = (id) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "icon"); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#ic-" + id); s.append(u); return s; };
  function frChanged(geom) { if (geom) layout(); changed(false); }
  function frRebuildAfter(fn) { pushUndo(); fn(); frFixSel(); renderFrameUi(); layout(); changed(false); }
  function addFrame(kind) {
    if (!has) { C.toast("Abra uma foto ou comece uma tela em branco primeiro."); return; }
    if (state.frames.length >= FR_MAX) { C.toast("Limite de " + FR_MAX + " molduras. Apague uma para colocar outra."); return; }
    const K = FR_KINDS[kind];
    frRebuildAfter(() => { const f = { id: newId(), kind, on: true, ...K.def }; state.frames.push(f); frSelId = f.id; });
  }
  function moveFrame(id, dir) { // dir +1 = mais para fora, -1 = mais para perto da foto
    const i = state.frames.findIndex((f) => f.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= state.frames.length) return;
    frRebuildAfter(() => { const [f] = state.frames.splice(i, 1); state.frames.splice(j, 0, f); });
  }
  function delFrame(id) { frRebuildAfter(() => { state.frames = state.frames.filter((f) => f.id !== id); }); }
  function toggleFrame(id) { const f = state.frames.find((x) => x.id === id); if (f) frRebuildAfter(() => { f.on = !f.on; }); }
  function frField(f, [key, type, label, a, b, unit]) {
    const wrap = mkEl("label", type === "check" ? "tv-check" : "tv-field");
    const set = (v, geom) => { undoBurst(); f[key] = v; frChanged(geom); };
    const geomKeys = ["size", "bottom", "radius", "ratio", "shape", "where"];
    const geom = geomKeys.includes(key) || (f.kind === "blur" && key === "blur") ;
    if (type === "range") {
      const sp = mkEl("span"); sp.append(label + " "); const out = mkEl("b", "", f[key] + (unit || "")); sp.append(out);
      const inp = mkEl("input"); inp.type = "range"; inp.min = a; inp.max = b; inp.value = f[key];
      inp.addEventListener("input", () => { out.textContent = inp.value + (unit || ""); set(Number(inp.value), geom && key !== "blur"); });
      wrap.append(sp, inp);
    } else if (type === "color") {
      const sp = mkEl("span", "", label); const inp = mkEl("input"); inp.type = "color"; inp.value = f[key];
      inp.addEventListener("input", () => set(inp.value, false)); wrap.append(sp, inp); wrap.classList.add("is-inline");
    } else if (type === "select") {
      const sp = mkEl("span", "", label); const sel2 = mkEl("select");
      a.forEach(([v, l]) => { const o = mkEl("option", "", l); o.value = v; sel2.append(o); });
      sel2.value = f[key];
      sel2.addEventListener("change", () => set(sel2.value, geomKeys.includes(key)));
      wrap.append(sp, sel2);
    } else if (type === "check") {
      const inp = mkEl("input"); inp.type = "checkbox"; inp.checked = Boolean(f[key]);
      inp.addEventListener("change", () => set(inp.checked, false)); wrap.append(inp, " " + label);
    } else {
      const sp = mkEl("span", "", label); const inp = mkEl("input"); inp.type = "text"; inp.maxLength = 60; inp.value = f[key]; inp.placeholder = "Escreva aqui…";
      inp.addEventListener("input", () => set(inp.value, false)); wrap.append(sp, inp);
    }
    return wrap;
  }
  function renderFrameUi() {
    const add = byId("imFrAdd"), list = byId("imFrList"), opts = byId("imFrOpts"), empty = byId("imFrEmpty");
    if (!add) return;
    if (!add.children.length) {
      Object.entries(FR_KINDS).forEach(([kind, K]) => {
        const b = mkEl("button", "im-fradd"); b.type = "button"; b.title = "Adicionar: " + K.name;
        b.append(frIcon(K.icon), mkEl("span", "", K.name));
        b.addEventListener("click", () => addFrame(kind));
        add.append(b);
      });
    }
    frFixSel();
    list.replaceChildren();
    empty.hidden = state.frames.length > 0;
    [...state.frames].reverse().forEach((f, idx, arr) => {
      const K = FR_KINDS[f.kind];
      const row = mkEl("li", "im-frrow" + (f.id === frSelId ? " is-sel" : "") + (f.on ? "" : " is-off"));
      const eye = mkEl("button", "fr-btn"); eye.type = "button"; eye.append(frIcon(f.on ? "see" : "unsee")); eye.title = f.on ? "Ocultar" : "Mostrar"; eye.setAttribute("aria-label", (f.on ? "Ocultar " : "Mostrar ") + K.name); eye.setAttribute("aria-pressed", String(f.on));
      eye.addEventListener("click", () => toggleFrame(f.id));
      const name = mkEl("button", "fr-name"); name.type = "button"; name.append(frIcon(K.icon), mkEl("span", "", K.name));
      name.addEventListener("click", () => { frSelId = f.id; renderFrameUi(); });
      const up = mkEl("button", "fr-btn"); up.type = "button"; up.append(frIcon("up")); up.title = "Mais para fora"; up.setAttribute("aria-label", "Mover " + K.name + " para fora"); up.disabled = idx === 0;
      up.addEventListener("click", () => moveFrame(f.id, 1));
      const dn = mkEl("button", "fr-btn"); dn.type = "button"; dn.append(frIcon("down")); dn.title = "Mais para perto da foto"; dn.setAttribute("aria-label", "Mover " + K.name + " para perto da foto"); dn.disabled = idx === arr.length - 1;
      dn.addEventListener("click", () => moveFrame(f.id, -1));
      const del = mkEl("button", "fr-btn danger"); del.type = "button"; del.append(frIcon("trash")); del.title = "Apagar moldura"; del.setAttribute("aria-label", "Apagar " + K.name);
      del.addEventListener("click", () => delFrame(f.id));
      row.append(eye, name, up, dn, del);
      list.append(row);
    });
    opts.replaceChildren();
    const f = frSel();
    if (f) { const K = FR_KINDS[f.kind]; opts.append(mkEl("p", "tv-info fr-title", "Opções: " + K.name)); K.fields.forEach((fd) => opts.append(frField(f, fd))); }
    const hint = byId("imFrHint");
    hint.hidden = !state.frames.some((f) => f.on && (f.kind === "rounded" || f.kind === "circle" || (f.kind === "border" && f.radius > 0)) && !((f.kind === "rounded" || f.kind === "circle") && f.bgOn));
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
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const ls = linesOf(o), tw = m && m.tw ? m.tw : 0;
    const al = o.t === "balloon" ? "c" : (o.align || "c");
    ctx.textAlign = al === "l" ? "left" : al === "r" ? "right" : "center";
    const x = al === "l" ? cxo - tw / 2 : al === "r" ? cxo + tw / 2 : cxo;
    const th = ls.length * o.size * 1.2, top = cyo - th / 2 + o.size * 0.6;
    if (o.box && o.t === "text") {
      const pad = o.size * 0.25;
      ctx.save(); ctx.fillStyle = o.boxColor; rrect(ctx, cxo - tw / 2 - pad, cyo - th / 2 - pad * 0.3, tw + pad * 2, th + pad * 0.6, o.size * 0.22); ctx.fill(); ctx.restore();
    }
    ctx.save();
    if (o.shadow && o.t === "text") { ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = o.size * 0.14; ctx.shadowOffsetX = o.size * 0.04; ctx.shadowOffsetY = o.size * 0.05; }
    ls.forEach((l, i) => {
      const y = top + i * o.size * 1.2;
      if (o.strokeOn || o.caps) { ctx.lineWidth = Math.max(2, o.size * 0.16); ctx.strokeStyle = o.caps && !o.strokeOn ? "#000000" : o.stroke; ctx.strokeText(l, x, y); }
      ctx.fillStyle = o.t === "balloon" ? (lum(o.color) > 0.5 ? "#111111" : "#ffffff") : o.color;
      ctx.fillText(l, x, y);
    });
    ctx.restore();
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
    if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = o.alpha;
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
    return { base: lastCopy, objs: objs.map(cloneObj), w, h, filter: { ...state.filter }, frames: frCopy(state.frames) };
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
    state.frames = frCopy(s.frames || []);
    sel = null; crop = null; adj = null; clearAdjUi(); syncFilterUi(); frFixSel(); renderFrameUi();
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
    if (!has) { fg = { W: 0, H: 0, L: 0, T: 0, geos: [], fs: [] }; return; }
    refreshGeom();
    for (const c of [ui.cv, ui.ov]) { if (c.width !== fg.W) c.width = fg.W; if (c.height !== fg.H) c.height = fg.H; }
    const av = { w: Math.max(80, ui.stage.clientWidth - 24), h: Math.max(80, ui.stage.clientHeight - 24) };
    const fit = Math.min(av.w / fg.W, av.h / fg.H, 3);
    view.scale = view.zoom ? view.zoom : fit;
    ui.wrap.style.width = Math.round(fg.W * view.scale) + "px";
    ui.wrap.style.height = Math.round(fg.H * view.scale) + "px";
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
    cx.clearRect(0, 0, fg.W, fg.H);
    frDraw(cx, fg.fs.length - 1, fg.fs, fg.geos, (g) => {
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
      if (showOrig && origBmp) {
        const k = Math.min(w / origBmp.width, h / origBmp.height);
        g.drawImage(origBmp, (w - origBmp.width * k) / 2, (h - origBmp.height * k) / 2, origBmp.width * k, origBmp.height * k);
      } else {
        drawPhotoSrc(g, adj ? adj.out : shown());
        objs.forEach((o) => drawObj(g, o));
      }
      g.restore();
    });
    drawOverlay();
  }
  function drawOverlay() {
    ox.clearRect(0, 0, fg.W, fg.H);
    ox.save(); ox.translate(fg.L, fg.T);
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
    ox.restore();
  }

  /* ---------------- Salvar no aparelho ---------------- */

  function changed(imgChanged = true) {
    state.objects = objs.map(serialObj);
    state.w = w; state.h = h;
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
    if (!has) return;
    state.thumb = composite(240, "#ffffff").toDataURL("image/jpeg", 0.7);
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
    const src = has ? smallCopy(180) : null;
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
      state.filter = { id: "", amt: 100 }; state.frames = []; frSelId = ""; renderFrameUi();
      setBaseCanvas(info.canvas);
      view.zoom = 0; layout(); syncFilterUi();
      dirtyImg = true; changed();
    } catch (_) { C.toast("Não consegui abrir a foto original."); } finally { end(); }
  }

  /* ajustes (brilho, contraste, cores, calor) com prévia ao vivo */
  const ADJ = ["imBr", "imCo", "imSa", "imWa", "imSh"];
  function sharpen(id, amt) { // realce de bordas: mistura a imagem com uma versão "afiada" (kernel 3x3)
    const W2 = id.width, H2 = id.height, s = id.data, o = new Uint8ClampedArray(s);
    for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
      const i = (y * W2 + x) * 4;
      for (let k = 0; k < 3; k++) {
        const v = 5 * s[i + k] - s[i - 4 + k] - s[i + 4 + k] - s[i - W2 * 4 + k] - s[i + W2 * 4 + k];
        o[i + k] = s[i + k] + (v - s[i + k]) * amt;
      }
    }
    s.set(o);
  }
  function autoEnhance() {
    if (!has) return;
    const d = bx.getImageData(0, 0, w, h), px = d.data, hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < px.length; i += 16) { if (px[i + 3] < 8) continue; hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++; n++; }
    if (!n) return;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
    if (hi - lo < 24) { C.toast("Esta imagem já está bem equilibrada."); return; }
    const a = 255 / (hi - lo), o = -lo / (hi - lo);
    pushUndo(); touchBase();
    applyMatrix(d, chain([a, 0, 0, 0, o, 0, a, 0, 0, o, 0, 0, a, 0, o, 0, 0, 0, 1, 0], M.sat(1.08)));
    bx.putImageData(d, 0, 0);
    changed();
    C.toast("Cores e contraste melhorados. Dá para desfazer.");
  }
  /* endireitar: gira um pouco e amplia só o necessário para não sobrar canto vazio */
  let strDeg = 0;
  function strScale(rad) { const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad)); return Math.max(c + (h / w) * s, c + (w / h) * s); }
  function drawPhotoSrc(g, src) {
    if (!strDeg) { g.drawImage(src, 0, 0, w, h); return; }
    const rad = (strDeg * Math.PI) / 180;
    g.save(); g.translate(w / 2, h / 2); g.rotate(rad); g.scale(strScale(rad), strScale(rad)); g.drawImage(src, -w / 2, -h / 2, w, h); g.restore();
  }
  function clearStr() { strDeg = 0; byId("imSt").value = "0"; byId("imStV").textContent = "0"; }
  function strApply() {
    if (!has || !strDeg) return;
    const rad = (strDeg * Math.PI) / 180, k = strScale(rad);
    geo(() => { const nc = newCanvas(w, h); const c = nc.getContext("2d"); c.imageSmoothingQuality = "high"; c.translate(w / 2, h / 2); c.rotate(rad); c.scale(k, k); c.drawImage(base, -w / 2, -h / 2); return nc; });
    clearStr();
  }
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
    const sh = Number(byId("imSh").value) / 100;
    if (sh > 0) sharpen(id, sh);
    c.putImageData(id, 0, 0);
    paint();
  }
  function adjApply() {
    if (!adj) return;
    const m = adjMatrix();
    pushUndo(); touchBase();
    const id = bx.getImageData(0, 0, w, h);
    applyMatrix(id, m);
    const sh = Number(byId("imSh").value) / 100;
    if (sh > 0) sharpen(id, sh);
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
  function hasWork() { return has && (undoSt.length > 0 || objs.length > 0 || state.frames.length > 0 || Boolean(state.curId) || dirtyImg); }
  async function loadBase(file) {
    if (!C.store.images) { C.toast("Este navegador não guarda arquivos: o editor de imagens fica indisponível."); return; }
    if (hasWork() && !window.confirm("Trocar a foto deste documento? As alterações feitas nela (desenhos, textos, filtros, cortes) serão perdidas.\n\nDica: use Novo na barra de cima para abrir outra foto num documento separado, sem perder esta.")) return;
    const end = C.busy("Preparando a foto…");
    try {
      const info = await decode(file);
      const oldIds = [state.origId, state.curId].filter(Boolean);
      undoSt = []; redoSt = []; lastCopy = null; lastRev = -1;
      objs = []; sel = null; crop = null; adj = null; clearAdjUi(); state.filter = { id: "", amt: 100 }; state.frames = []; frSelId = ""; renderFrameUi();
      setBaseCanvas(info.canvas);
      let blob = !info.scaled && file.size < 12e6 && /^image\/(jpeg|png|webp)$/.test(file.type) ? file : await toBlobP(info.canvas, "image/webp", 1);
      if (!blob) blob = await toBlobP(info.canvas, "image/png");
      origBlob = blob; origBmp = null;
      state.origId = newId(); state.curId = "";
      state.name = (file.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || state.name;
      byId("documentName").value = state.name;
      await C.store.putImage({ id: state.origId, docId, blob, mime: blob.type, name: file.name || "foto" });
      if (oldIds.length) C.store.deleteImages(oldIds).catch(() => {});
      dirtyImg = true; changed();
      syncButtons(); setTool("move");
      if (info.scaled) C.toast("Foto reduzida para " + w + "×" + h + " (o editor fica mais rápido).");
    } catch (_) {
      C.toast("Não consegui abrir esta foto. Se for HEIC, tente converter para JPG ou tirar um print.");
    } finally { end(); }
  }
  async function loadBlank(bw, bh, transparent) {
    if (hasWork() && !window.confirm("Começar uma tela em branco neste documento? Tudo o que está nesta imagem será perdido.\n\nDica: use Novo na barra de cima para começar outra tela sem perder esta.")) return;
    const oldIds = [state.origId, state.curId].filter(Boolean);
    undoSt = []; redoSt = []; lastCopy = null; lastRev = -1;
    objs = []; sel = null; crop = null; adj = null; clearAdjUi(); state.filter = { id: "", amt: 100 }; state.frames = []; frSelId = ""; renderFrameUi();
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
    addObj({ t: "text", ...mid(), size: Math.round(Math.min(w, h) * 0.09), rot: 0, text: "Seu texto", color: ui.color.value, font: "sans", bold: true, stroke: "#000000", strokeOn: false, caps: false, align: "c", shadow: false, box: false, boxColor: "#000000", alpha: 1 });
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
      state.filter = { id: "", amt: 100 }; state.frames = []; frSelId = ""; renderFrameUi();
      touchBase();
      setBaseCanvas(big); view.zoom = 0; layout();
      dirtyImg = true; changed(); syncButtons();
    } catch (_) { C.toast("Não consegui montar a colagem."); } finally { end(); }
  }

  /* ---------------- Exportar ---------------- */

  const outFrames = () => state.frames.filter((f) => f.on);
  function outDims() { const G = frGeoAll(outFrames(), w, h); return { W: G.W, H: G.H }; }
  // A imagem final = foto + textos + todas as molduras ligadas. `white`: true usa o fundo do JPG; ou passe uma cor.
  function composite(maxSide, white) {
    const fs = outFrames(), G = frGeoAll(fs, w, h);
    const k = maxSide ? Math.min(1, maxSide / Math.max(G.W, G.H)) : 1;
    const c = newCanvas(G.W * k, G.H * k);
    const g = c.getContext("2d");
    if (white) { g.fillStyle = typeof white === "string" ? white : (state.bg || "#ffffff"); g.fillRect(0, 0, c.width, c.height); }
    g.imageSmoothingQuality = "high";
    g.scale(c.width / G.W, c.height / G.H);
    frDraw(g, fs.length - 1, fs, G.geos, (gg) => {
      gg.save(); gg.beginPath(); gg.rect(0, 0, w, h); gg.clip();
      gg.drawImage(shown(true), 0, 0);
      objs.forEach((o) => drawObj(gg, o));
      gg.restore();
    });
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
      const D = outDims(), k = state.outSize ? Math.min(1, state.outSize / Math.max(D.W, D.H)) : 1;
      ui.est.textContent = Math.round(D.W * k) + "×" + Math.round(D.H * k) + " px · cerca de " + fmtKB(b.size);
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
    $$("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").some((t) => tokens.includes(t)); });
    ui.tip.textContent = TIPS[tool] || "";
    ui.tip.hidden = !TIPS[tool] || (tool === "move" && sel);
    if (sel && tool === "move") syncObjUi();
  }
  function setTool(t) {
    if (t === "picker" && tool !== "picker") prevTool = tool;
    if (tool === "crop" && t !== "crop") crop = null;
    const wasCrop = tool === "crop";
    tool = t;
    if (t !== "move") sel = null;
    if ((t === "crop") !== wasCrop && has && state.frames.some((f) => f.on)) layout();
    $$("[data-tool]").forEach((b) => b.classList.toggle("is-on", b.dataset.tool === t));
    ws.dataset.tool = t;
    ui.ov.style.cursor = t === "move" ? "default" : "crosshair";
    if (t === "crop") startCrop();
    showOpts(); paint();
  }
  function select(o) {
    sel = o;
    showOpts(); paint();
  }
  function syncObjUi() {
    if (!sel) return;
    const txt = sel.t === "text" || sel.t === "balloon";
    ["imText", "imFont", "imBold", "imStroke", "imStrokeOn", "imAlL", "imAlC", "imAlR", "imShadow", "imBox", "imBoxC"].forEach((id) => { const el = byId(id); (el.closest("label") || el).hidden = !txt; });
    byId("imAlL").hidden = byId("imAlC").hidden = byId("imAlR").hidden = !(sel.t === "text");
    (byId("imShadow").closest("label")).hidden = !(sel.t === "text");
    (byId("imBox").closest("label")).hidden = !(sel.t === "text");
    (byId("imBoxC").closest("label")).hidden = !(sel.t === "text");
    if (txt) {
      ui.text.value = sel.text; ui.font.value = sel.font; ui.stroke.value = sel.stroke; ui.strokeOn.checked = sel.strokeOn; ui.color.value = sel.color;
      ui.bold.classList.toggle("is-on", sel.bold);
      byId("imShadow").checked = Boolean(sel.shadow); byId("imBox").checked = Boolean(sel.box); byId("imBoxC").value = sel.boxColor || "#000000";
      ["l", "c", "r"].forEach((k) => byId("imAl" + k.toUpperCase()).classList.toggle("is-on", (sel.align || "c") === k));
    }
    byId("imObjAlpha").value = String(Math.round((sel.alpha === undefined ? 1 : sel.alpha) * 100));
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

  function pt(e) { const r = ui.ov.getBoundingClientRect(); return { x: ((e.clientX - r.left) * fg.W) / r.width - fg.L, y: ((e.clientY - r.top) * fg.H) / r.height - fg.T }; }
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

  /* dois dedos: pinça para dar zoom e arrastar a foto (cancela o traço que tinha começado) */
  const pointers = new Map();
  let pinch = null;
  function abortDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.timer) clearInterval(d.timer);
    if (DRAWERS.includes(tool) || d.mode === "done") { const s = undoSt.pop(); if (s) restore(s); syncButtons(); }
    paint();
  }
  function pinchPts() { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  function startPinch() { abortDrag(); const q = pinchPts(); pinch = { d0: q.d, s0: view.scale, mx: q.mx, my: q.my }; }
  function movePinch() {
    const q = pinchPts(), r = ui.ov.getBoundingClientRect();
    const fx = (pinch.mx - r.left) / r.width, fy = (pinch.my - r.top) / r.height;
    view.zoom = clamp(pinch.s0 * q.d / pinch.d0, 0.05, 8);
    layout();
    const r2 = ui.ov.getBoundingClientRect();
    ui.stage.scrollLeft += r2.left + fx * r2.width - q.mx;
    ui.stage.scrollTop += r2.top + fy * r2.height - q.my;
    pinch.mx = q.mx; pinch.my = q.my;
  }
  const dropPointer = (e) => { pointers.delete(e.pointerId); if (pinch && pointers.size < 2) pinch = null; };
  ui.ov.addEventListener("pointerup", dropPointer);
  ui.ov.addEventListener("pointercancel", dropPointer);

  ui.ov.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2 && has) { e.preventDefault(); startPinch(); return; } if (pinch) return; }
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
    const d = cx.getImageData(Math.round(x + fg.L), Math.round(y + fg.T), 1, 1).data;
    if (d[3] < 10) return;
    const c = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    ui.color.value = c; state.color = c;
  }
  ui.ov.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) { if (pointers.size >= 2) movePinch(); return; }
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
    adjok: adjApply, adjno: () => { clearAdjUi(); paint(); }, auto: autoEnhance, stok: strApply, stno: () => { clearStr(); paint(); },
    rotl: () => rotate(-1), rotr: () => rotate(1), flipx: () => flip(true), flipy: () => flip(false), resize: resizeTo,
    surprise: () => { const pool = FILTERS.filter((f) => f.id !== state.filter.id); setFilter(pool[Math.floor(Math.random() * pool.length)].id, 100); },
    restore: restoreOriginal,
    collage: () => { byId("imColl").hidden = !byId("imColl").hidden; },
    download: downloadImg, copy: copyImg, share: shareImg, sticker: stickerExport
  };
  ws.addEventListener("click", (e) => {
    const t = e.target.closest("[data-im],[data-tool],[data-add],[data-coll],[data-tab],[data-ratio]");
    if (!t || t === ws || !ws.contains(t)) return; // (o próprio workspace carrega data-tool; ignorar)
    if (t.dataset.im) { const f = actions[t.dataset.im]; if (f) f(t); }
    else if (t.dataset.tool) { byId("imSide").classList.remove("is-open"); setTool(t.dataset.tool); }
    else if (t.dataset.add) { const a = t.dataset.add; if (a === "text") addText(); else if (a === "meme") addMeme(); else if (a === "balloon") addBalloon(); else if (a === "photo") { if (!has) C.toast("Abra uma foto primeiro."); else byId("imObjFile").click(); } }
    else if (t.dataset.coll) { collMode = t.dataset.coll; byId("imCollFiles").click(); }
    else if (t.dataset.tab) {
      const side = byId("imSide"), same = t.classList.contains("is-on");
      side.classList.toggle("is-open", !(same && side.classList.contains("is-open"))); // no celular: tocar de novo na aba recolhe o painel
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
      await loadBase(new File([await r.blob()], "Praia de exemplo.jpg", { type: "image/jpeg" }));
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
  ["l", "c", "r"].forEach((k) => byId("imAl" + k.toUpperCase()).addEventListener("click", () => objEdit((o) => { o.align = k; ["l", "c", "r"].forEach((q) => byId("imAl" + q.toUpperCase()).classList.toggle("is-on", q === k)); })));
  byId("imShadow").addEventListener("change", () => objEdit((o) => { o.shadow = byId("imShadow").checked; }));
  byId("imBox").addEventListener("change", () => objEdit((o) => { o.box = byId("imBox").checked; }));
  byId("imBoxC").addEventListener("input", () => objEdit((o) => { o.box = true; o.boxColor = byId("imBoxC").value; byId("imBox").checked = true; }));
  byId("imObjAlpha").addEventListener("input", () => objEdit((o) => { o.alpha = Number(byId("imObjAlpha").value) / 100; }));
  ui.objSize.addEventListener("input", () => objEdit((o) => { const k = Number(ui.objSize.value) / o.size; o.size = Number(ui.objSize.value); if (o.t === "balloon") { o.tx *= k; o.ty *= k; } }));
  ADJ.forEach((id) => byId(id).addEventListener("input", adjInput));
  byId("imSt").addEventListener("input", () => { strDeg = Number(byId("imSt").value); byId("imStV").textContent = String(strDeg); paint(); });
  let filBurst = false;
  byId("imFilAmt").addEventListener("input", () => {
    if (!state.filter.id) return;
    if (!filBurst) { pushUndo(); filBurst = true; setTimeout(() => { filBurst = false; }, 1200); }
    state.filter.amt = Number(byId("imFilAmt").value);
    syncFilterUi(); changed(false);
  });
  byId("imW").addEventListener("input", () => { if (byId("imLock").checked && w) byId("imH").value = String(Math.max(1, Math.round((Number(byId("imW").value) * h) / w))); });
  byId("imH").addEventListener("input", () => { if (byId("imLock").checked && h) byId("imW").value = String(Math.max(1, Math.round((Number(byId("imH").value) * w) / h))); });
  const outForm = () => { state.fmt = byId("imFmt").value; state.quality = Number(byId("imQ").value); state.outSize = Number(byId("imOutSize").value); byId("imQV").textContent = state.quality; byId("imQ").disabled = state.fmt === "image/png"; state.bg = byId("imBg").value; byId("imBgBox").hidden = state.fmt !== "image/jpeg"; C.scheduleSave(); updateEst(); };
  ["imFmt", "imQ", "imOutSize", "imBg"].forEach((id) => { byId(id).addEventListener("input", outForm); byId(id).addEventListener("change", outForm); });

  new ResizeObserver(() => { if (has && !ws.hidden) layout(); }).observe(ui.stage);
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
    frSelId = ""; frFixSel(); renderFrameUi();
    layout(); syncButtons(); filtersDirty = true; syncFilterUi();
    setTool(has ? "move" : "move");
    C.setPrimary(undefined, false);
  }
  function closeDoc() {
    openTok++;
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
