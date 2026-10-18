/* Coding — ferramenta de imagens: redimensionar, cortar, girar, comprimir e converter */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const MAX_FILES = 30;

  const ui = {
    add: byId("imgAdd"), files: byId("imgFiles"), maxW: byId("imgMaxW"), maxH: byId("imgMaxH"),
    crop: byId("imgCrop"), format: byId("imgFormat"), quality: byId("imgQuality"), qualityVal: byId("imgQualityVal"),
    msg: byId("imgMsg"), info: byId("imgInfo"), list: byId("imgList"), empty: byId("imgEmpty"),
    all: byId("imgDownloadAll"), drop: byId("imgDrop")
  };
  const items = []; // { id, file, bitmap, rotate, url, blob, w, h, name, ext, error }
  let seq = 0;
  let token = 0;
  let timer = 0;

  const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const extOf = (type) => type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";

  function outType(file) {
    const f = ui.format.value;
    if (f !== "keep") return f;
    return ["image/png", "image/webp", "image/jpeg"].includes(file.type) ? file.type : "image/jpeg";
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
    if (!files.length) { ui.msg.textContent = "Escolha arquivos de imagem (JPG, PNG, WebP…)."; return; }
    ui.msg.textContent = "";
    for (const file of files) {
      if (items.length >= MAX_FILES) { ui.msg.textContent = "Limite de " + MAX_FILES + " imagens por vez."; break; }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        items.push({ id: ++seq, file, bitmap, rotate: 0, url: "", blob: null, w: 0, h: 0, error: "" });
      } catch (_) {
        ui.msg.textContent = "Não consegui abrir “" + file.name + "”. HEIC/HEIF não funciona aqui: use JPG ou PNG.";
      }
    }
    schedule(0);
  }

  async function process(item) {
    const turned = item.rotate % 180 !== 0;
    const sw = turned ? item.bitmap.height : item.bitmap.width;
    const sh = turned ? item.bitmap.width : item.bitmap.height;
    // área de corte (centralizada) em coordenadas já giradas
    let cx = 0, cy = 0, cw = sw, ch = sh;
    const ratio = ui.crop.value;
    if (ratio) {
      const [a, b] = ratio.split(":").map(Number);
      const target = a / b;
      if (sw / sh > target) { cw = Math.round(sh * target); cx = Math.round((sw - cw) / 2); }
      else { ch = Math.round(sw / target); cy = Math.round((sh - ch) / 2); }
    }
    const maxW = Number(ui.maxW.value) || Infinity;
    const maxH = Number(ui.maxH.value) || Infinity;
    const scale = Math.min(1, maxW / cw, maxH / ch);
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    const type = outType(item.file);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.scale(w / cw, h / ch);
    ctx.translate(-cx, -cy);
    // desenha a imagem original já girada
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate(item.rotate * Math.PI / 180);
    ctx.drawImage(item.bitmap, -item.bitmap.width / 2, -item.bitmap.height / 2);
    ctx.restore();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, clamp(Number(ui.quality.value) / 100, 0.3, 1)));
    if (!blob) throw new Error("falha ao gerar");
    return { blob, w, h, type };
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay === undefined ? 200 : delay);
  }

  async function run() {
    const mine = ++token;
    ui.qualityVal.textContent = ui.quality.value + "%";
    const png = ui.format.value === "image/png";
    ui.quality.disabled = png;
    for (const item of items) {
      if (mine !== token) return;
      try {
        const r = await process(item);
        if (mine !== token) return;
        if (item.url) URL.revokeObjectURL(item.url);
        item.blob = r.blob; item.w = r.w; item.h = r.h; item.type = r.type; item.error = "";
        item.url = URL.createObjectURL(r.blob);
      } catch (_) {
        item.error = "Não foi possível processar esta imagem.";
        item.blob = null;
      }
      render();
    }
    render();
  }

  function render() {
    ui.empty.hidden = items.length > 0;
    ui.all.disabled = !items.some((i) => i.blob);
    ui.list.replaceChildren(...items.map((item) => {
      const card = document.createElement("div");
      card.className = "img-card";
      const img = document.createElement("img");
      img.className = "img-thumb";
      img.alt = "";
      if (item.url) img.src = item.url;
      const meta = document.createElement("div");
      meta.className = "img-meta";
      const name = document.createElement("strong");
      name.textContent = item.file.name;
      name.title = item.file.name;
      const line1 = document.createElement("span");
      line1.textContent = "Antes: " + item.bitmap.width + " × " + item.bitmap.height + " · " + fmtSize(item.file.size);
      const line2 = document.createElement("span");
      if (item.error) { line2.className = "bad"; line2.textContent = item.error; }
      else if (item.blob) {
        const diff = Math.round((1 - item.blob.size / item.file.size) * 100);
        line2.innerHTML = "Depois: " + item.w + " × " + item.h + " · " + fmtSize(item.blob.size) + (diff > 0 ? ' <span class="good">−' + diff + "%</span>" : diff < 0 ? ' <span class="bad">+' + Math.abs(diff) + "%</span>" : "");
      } else line2.textContent = "Processando…";
      const actions = document.createElement("div");
      actions.className = "img-actions";
      const mk = (label, fn, title, primary) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn " + (primary ? "primary" : "subtle");
        b.textContent = label;
        if (title) b.title = title;
        b.addEventListener("click", fn);
        return b;
      };
      actions.append(
        mk("↺", () => { item.rotate = (item.rotate + 270) % 360; schedule(0); }, "Girar para a esquerda"),
        mk("↻", () => { item.rotate = (item.rotate + 90) % 360; schedule(0); }, "Girar para a direita"),
        mk("Baixar", () => download(item), "", true),
        mk("✕", () => { if (item.url) URL.revokeObjectURL(item.url); items.splice(items.indexOf(item), 1); render(); }, "Remover")
      );
      meta.append(name, line1, line2, actions);
      card.append(img, meta);
      return card;
    }));
    const done = items.filter((i) => i.blob);
    const before = done.reduce((a, i) => a + i.file.size, 0);
    const after = done.reduce((a, i) => a + i.blob.size, 0);
    ui.info.textContent = done.length ? done.length + (done.length === 1 ? " imagem" : " imagens") + " · " + fmtSize(before) + " → " + fmtSize(after) : "";
  }

  function fileName(item, used) {
    const base = item.file.name.replace(/\.[^.]+$/, "") || "imagem";
    let name = base + "." + extOf(item.type);
    let n = 2;
    while (used && used.has(name)) name = base + "-" + n++ + "." + extOf(item.type);
    if (used) used.add(name);
    return name;
  }

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

  function download(item) { if (item.blob) saveBlob(item.blob, fileName(item)); }

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

  ui.all.addEventListener("click", async () => {
    const ready = items.filter((i) => i.blob);
    if (!ready.length) return;
    if (ready.length === 1) { download(ready[0]); return; }
    const used = new Set();
    const zip = await makeZip(ready.map((i) => ({ name: fileName(i, used), blob: i.blob })));
    saveBlob(zip, "imagens.zip");
  });

  ui.add.addEventListener("click", () => ui.files.click());
  ui.files.addEventListener("change", () => { const f = ui.files.files; addFiles(f).then(() => { ui.files.value = ""; }); });
  [ui.maxW, ui.maxH, ui.crop, ui.format, ui.quality].forEach((n) => { n.addEventListener("input", () => schedule()); n.addEventListener("change", () => schedule()); });
  ["dragenter", "dragover"].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.remove("drag"); }));
  ui.drop.addEventListener("drop", (e) => addFiles(e.dataTransfer && e.dataTransfer.files));
  document.addEventListener("paste", (e) => {
    if (byId("imagesView").hidden) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  render();
})();
