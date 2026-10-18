/* Coding — Imagens: redimensionar, cortar, girar, comprimir e converter (documento salvo no aparelho) */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const MAX_FILES = 30;
  const FORMATS = ["keep", "image/jpeg", "image/png", "image/webp"];
  const CROPS = ["", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"];

  const ui = {
    ws: byId("imagesWs"),
    add: byId("imgAdd"), files: byId("imgFiles"), maxW: byId("imgMaxW"), maxH: byId("imgMaxH"),
    crop: byId("imgCrop"), format: byId("imgFormat"), quality: byId("imgQuality"), qualityVal: byId("imgQualityVal"),
    msg: byId("imgMsg"), info: byId("imgInfo"), list: byId("imgList"), empty: byId("imgEmpty"), drop: byId("imgDrop")
  };

  let state = defaults();
  let docId = null;
  const items = []; // execução: { id, name, file, bitmap, rotate, url, blob, w, h, type, error }
  let token = 0;
  let timer = 0;
  let openTok = 0;

  function defaults() {
    return { name: "Imagens sem título", maxW: 0, maxH: 0, crop: "", format: "keep", quality: 80, items: [] };
  }
  function normalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = defaults();
    const list = Array.isArray(o.items) ? o.items.slice(0, MAX_FILES) : [];
    return {
      name: C.util.toText(o.name, d.name, 80),
      maxW: C.util.toInt(o.maxW, 0, 0, 12000),
      maxH: C.util.toInt(o.maxH, 0, 0, 12000),
      crop: CROPS.includes(o.crop) ? o.crop : "",
      format: FORMATS.includes(o.format) ? o.format : "keep",
      quality: C.util.toInt(o.quality, 80, 30, 100),
      items: list.filter((i) => i && typeof i.id === "string" && /^[a-z0-9]{4,24}$/.test(i.id)).map((i) => ({ id: i.id, name: C.util.toText(i.name, "imagem", 120), rotate: [0, 90, 180, 270].includes(i.rotate) ? i.rotate : 0 }))
    };
  }

  const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const extOf = (type) => type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const newId = () => (C.util.uid() + C.util.uid()).replace(/[^a-z0-9]/g, "").slice(0, 14);

  function fillForm() {
    ui.maxW.value = state.maxW ? String(state.maxW) : "";
    ui.maxH.value = state.maxH ? String(state.maxH) : "";
    ui.crop.value = state.crop;
    ui.format.value = state.format;
    ui.quality.value = String(state.quality);
    ui.qualityVal.textContent = state.quality + "%";
    ui.quality.disabled = state.format === "image/png";
  }
  function readForm() {
    state.maxW = Number(ui.maxW.value) || 0;
    state.maxH = Number(ui.maxH.value) || 0;
    state.crop = ui.crop.value;
    state.format = ui.format.value;
    state.quality = Number(ui.quality.value);
  }

  function outType(file) {
    if (state.format !== "keep") return state.format;
    return ["image/png", "image/webp", "image/jpeg"].includes(file.type) ? file.type : "image/jpeg";
  }

  function setPrimaryState() { C.setPrimary(undefined, !items.some((i) => i.blob)); }

  async function addFiles(fileList) {
    if (!C.store.images) { ui.msg.textContent = "Este navegador não guarda arquivos grandes. Use outro navegador para a ferramenta de imagens."; return; }
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
    if (!files.length) { ui.msg.textContent = "Escolha arquivos de imagem (JPG, PNG, WebP…)."; return; }
    ui.msg.textContent = "";
    const mine = docId;
    for (const file of files) {
      if (items.length >= MAX_FILES) { ui.msg.textContent = "Limite de " + MAX_FILES + " imagens por documento."; break; }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        if (docId !== mine) return;
        const id = newId();
        await C.store.putImage({ id, docId: mine, blob: file, mime: file.type || "image/jpeg", name: file.name });
        items.push({ id, name: file.name, file, bitmap, rotate: 0, url: "", blob: null, w: 0, h: 0, error: "" });
        state.items.push({ id, name: file.name, rotate: 0 });
        C.scheduleSave();
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
    let cx = 0, cy = 0, cw = sw, ch = sh;
    if (state.crop) {
      const [a, b] = state.crop.split(":").map(Number);
      const target = a / b;
      if (sw / sh > target) { cw = Math.round(sh * target); cx = Math.round((sw - cw) / 2); }
      else { ch = Math.round(sw / target); cy = Math.round((sh - ch) / 2); }
    }
    const maxW = state.maxW || Infinity;
    const maxH = state.maxH || Infinity;
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
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate(item.rotate * Math.PI / 180);
    ctx.drawImage(item.bitmap, -item.bitmap.width / 2, -item.bitmap.height / 2);
    ctx.restore();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, clamp(state.quality / 100, 0.3, 1)));
    if (!blob) throw new Error("falha ao gerar");
    return { blob, w, h, type };
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay === undefined ? 200 : delay);
  }

  async function run() {
    const mine = ++token;
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

  function removeItem(item) {
    if (item.url) URL.revokeObjectURL(item.url);
    items.splice(items.indexOf(item), 1);
    state.items = state.items.filter((i) => i.id !== item.id);
    C.store.deleteImages([item.id]).catch(() => {});
    C.scheduleSave();
    render();
  }
  function rotateItem(item, delta) {
    item.rotate = (item.rotate + delta + 360) % 360;
    const rec = state.items.find((i) => i.id === item.id);
    if (rec) rec.rotate = item.rotate;
    C.scheduleSave();
    schedule(0);
  }

  function render() {
    ui.empty.hidden = items.length > 0;
    setPrimaryState();
    ui.list.replaceChildren(...items.map((item) => {
      const card = document.createElement("div");
      card.className = "img-card";
      card.dataset.iid = item.id;
      const img = document.createElement("img");
      img.className = "img-thumb";
      img.alt = "";
      if (item.url) img.src = item.url;
      const meta = document.createElement("div");
      meta.className = "img-meta";
      const name = document.createElement("strong");
      name.textContent = item.name;
      name.title = item.name;
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
        mk("↺", () => rotateItem(item, 270), "Girar para a esquerda"),
        mk("↻", () => rotateItem(item, 90), "Girar para a direita"),
        mk("Baixar", () => download(item), "", true),
        mk("✕", () => removeItem(item), "Remover")
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
    const base = item.name.replace(/\.[^.]+$/, "") || "imagem";
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

  async function downloadAll() {
    const ready = items.filter((i) => i.blob);
    if (!ready.length) { C.toast("Adicione imagens primeiro."); return; }
    if (ready.length === 1) { download(ready[0]); return; }
    const used = new Set();
    const zip = await makeZip(ready.map((i) => ({ name: fileName(i, used), blob: i.blob })));
    saveBlob(zip, "imagens.zip");
  }

  byId("imgSample").addEventListener("click", async () => {
    const button = byId("imgSample");
    button.disabled = true;
    try {
      const response = await fetch("exemplos/praia.jpg");
      if (!response.ok) throw new Error("http");
      const blob = await response.blob();
      await addFiles([new File([blob], "praia-exemplo.jpg", { type: "image/jpeg" })]);
    } catch (_) {
      ui.msg.textContent = "Não consegui carregar a foto de exemplo (ela precisa de internet na primeira vez).";
    }
    button.disabled = false;
  });
  ui.add.addEventListener("click", () => ui.files.click());
  ui.files.addEventListener("change", () => { const f = ui.files.files; addFiles(f).then(() => { ui.files.value = ""; }); });
  [ui.maxW, ui.maxH, ui.crop, ui.format, ui.quality].forEach((n) => {
    const h = () => { readForm(); ui.qualityVal.textContent = state.quality + "%"; ui.quality.disabled = state.format === "image/png"; C.scheduleSave(); schedule(); };
    n.addEventListener("input", h);
    n.addEventListener("change", h);
  });
  ["dragenter", "dragover"].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.remove("drag"); }));
  ui.drop.addEventListener("drop", (e) => addFiles(e.dataTransfer && e.dataTransfer.files));
  document.addEventListener("paste", (e) => {
    if (ui.ws.hidden) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  function setPatch(patch) { Object.assign(state, patch); fillForm(); C.scheduleSave(); schedule(0); }

  function menuItems(target) {
    if (!ui.ws.contains(target)) return null;
    const card = target.closest && target.closest(".img-card");
    const item = card && items.find((i) => i.id === card.dataset.iid);
    if (item) {
      return [
        { label: "Baixar esta imagem", run: () => download(item), disabled: !item.blob },
        { sep: true },
        { label: "Girar para a esquerda", run: () => rotateItem(item, 270) },
        { label: "Girar para a direita", run: () => rotateItem(item, 90) },
        { sep: true },
        { label: "Remover imagem", run: () => removeItem(item), danger: true }
      ];
    }
    const cropLabel = { "": "Sem corte", "1:1": "Quadrado (1:1)", "4:3": "4:3", "3:4": "3:4 (em pé)", "3:2": "3:2", "2:3": "2:3 (em pé)", "16:9": "16:9", "9:16": "9:16 (em pé)" };
    return [
      { label: "Baixar tudo", run: downloadAll, disabled: !items.some((i) => i.blob) },
      { label: "Adicionar imagens…", run: () => ui.files.click() },
      { sep: true },
      { label: "Cortar", sub: CROPS.map((c) => ({ label: cropLabel[c], check: state.crop === c, run: () => setPatch({ crop: c }) })) },
      { label: "Formato", sub: [["keep", "Igual ao original"], ["image/jpeg", "JPG"], ["image/png", "PNG"], ["image/webp", "WebP"]].map(([v, l]) => ({ label: l, check: state.format === v, run: () => setPatch({ format: v }) })) },
      { label: "Largura máxima", sub: [0, 3000, 2000, 1600, 1200, 800].map((n) => ({ label: n ? n + " px" : "Sem limite", check: state.maxW === n, run: () => setPatch({ maxW: n }) })) },
      { sep: true },
      { label: "Remover todas as imagens", run: () => { items.slice().forEach(removeItem); }, danger: true, disabled: !items.length }
    ];
  }

  /* ---- integração com o núcleo ---- */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function exportPayload(doc) {
    const data = { format: "coding-document", version: 3, type: "images", ...doc.state, images: [] };
    const records = await C.store.getImages(doc.id);
    const ids = new Set(doc.state.items.map((i) => i.id));
    for (const r of records.filter((x) => ids.has(x.id))) data.images.push({ id: r.id, mime: r.mime || r.blob.type, name: r.name || "imagem", data: await blobToBase64(r.blob) });
    return data;
  }

  async function prepareImport(data) {
    const base = normalize(data);
    const list = Array.isArray(data.images) ? data.images.slice(0, MAX_FILES) : [];
    const images = [];
    const newItems = [];
    for (const rec of list) {
      if (!rec || typeof rec.id !== "string" || typeof rec.data !== "string" || rec.data.length > 60000000) continue;
      const mime = /^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(rec.mime) ? rec.mime : "";
      if (!mime) continue;
      try {
        const bin = atob(rec.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fresh = newId();
        const old = base.items.find((i) => i.id === rec.id);
        images.push({ id: fresh, blob: new Blob([bytes], { type: mime }), mime, name: C.util.toText(rec.name, "imagem", 120) });
        newItems.push({ id: fresh, name: C.util.toText(rec.name, "imagem", 120), rotate: old ? old.rotate : 0 });
      } catch (_) { /* ignora imagem inválida */ }
    }
    return { state: { ...base, items: newItems }, images };
  }

  function releaseItems() {
    items.forEach((i) => { if (i.url) URL.revokeObjectURL(i.url); try { i.bitmap.close(); } catch (_) { /* ignorado */ } });
    items.length = 0;
  }

  async function open(doc) {
    const tok = ++openTok;
    clearTimeout(timer);
    token++;
    docId = doc.id;
    state = doc.state;
    releaseItems();
    ui.msg.textContent = C.store.images ? "" : "Este navegador não guarda arquivos grandes: a ferramenta de imagens fica indisponível.";
    ui.add.disabled = !C.store.images;
    fillForm();
    let records = [];
    try { records = await C.store.getImages(doc.id); } catch (_) { records = []; }
    if (tok !== openTok) return;
    const byIdRec = new Map(records.map((r) => [r.id, r]));
    const kept = [];
    for (const it of state.items) {
      const rec = byIdRec.get(it.id);
      if (!rec) continue;
      try {
        const bitmap = await createImageBitmap(rec.blob, { imageOrientation: "from-image" });
        if (tok !== openTok) return;
        items.push({ id: it.id, name: it.name, file: rec.blob, bitmap, rotate: it.rotate, url: "", blob: null, w: 0, h: 0, error: "" });
        kept.push(it);
      } catch (_) { /* arquivo ilegível é descartado */ }
    }
    state.items = kept;
    const orphans = records.filter((r) => !kept.some((k) => k.id === r.id)).map((r) => r.id);
    if (orphans.length) C.store.deleteImages(orphans).catch(() => {});
    render();
    schedule(0);
  }

  C.register({
    type: "images",
    defaults, normalize, exportPayload, prepareImport, open,
    payload(doc) { return { format: "coding-document", version: 3, type: "images", ...doc.state, items: doc.state.items }; },
    info(doc) { const n = doc.state.items.length; return n + (n === 1 ? " imagem" : " imagens"); },
    close() { token++; },
    print: downloadAll,
    primaryIsPrint: false,
    shareable: false,
    menuItems
  });
  render();
})();
