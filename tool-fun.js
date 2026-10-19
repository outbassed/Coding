/* Coding — ferramentas divertidas: Sorteio (roleta, times, dado, moeda, número) e Racha-conta (dividir a conta com gorjeta) */
(() => {
  "use strict";

  const C = window.Coding;
  const byId = C.util.byId;
  const clamp = C.util.clamp;
  const toText = C.util.toText;

  /* aleatório de verdade (sem viés) */
  function rnd(n) {
    if (n <= 1) return 0;
    const lim = Math.floor(4294967296 / n) * n;
    const a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lines = (t) => String(t || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const num = (v, d, a, b) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };
  // Dinheiro sempre em CENTAVOS inteiros: nada de 0,1 + 0,2 virar 0,30000000000000004.
  const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  /* Aceita 1234 · 1234,56 · 1.234,56 · R$ 1.234,56 · 12.5 · 1.234 (= mil duzentos e trinta e quatro). Devolve centavos ou null se não der para entender. */
  function parseMoney(raw) {
    let t = String(raw || "").replace(/R\$|\s/g, "");
    if (!t) return 0;
    if (!/^[\d.,]+$/.test(t)) return null;
    let int, frac = "";
    if (t.includes(",")) {
      const parts = t.split(",");
      if (parts.length > 2 || !/^\d{0,2}$/.test(parts[1]) || !/^(\d+|\d{1,3}(\.\d{3})+)?$/.test(parts[0])) return null;
      int = parts[0].replace(/\./g, ""); frac = parts[1];
    } else if (t.includes(".")) {
      if (/^\d{1,3}(\.\d{3})+$/.test(t)) int = t.replace(/\./g, "");          // 1.234 = mil duzentos e trinta e quatro
      else if (/^\d+\.\d{1,2}$/.test(t)) { [int, frac] = t.split("."); }        // 12.5 = doze e cinquenta
      else return null;
    } else int = t;
    if (int.length > 9) return null;
    return Number(int || "0") * 100 + Number((frac + "00").slice(0, 2));
  }
  // Reparte "cents" entre n pessoas sem perder nem sobrar centavo: as primeiras recebem 1 centavo a mais.
  function splitCents(cents, n, start = 0) {
    const base = Math.floor(cents / n), rem = cents - base * n;
    return Array.from({ length: n }, (_, i) => base + (((i - start % n + n) % n) < rem ? 1 : 0));
  }
  const mark = () => C.scheduleSave();

  /* ============================== Sorteio ============================== */

  const dws = byId("drawWs");
  const dq = (s) => dws.querySelector(s);
  const dui = {
    names: byId("drNames"), remove: byId("drRemove"), count: byId("drCount"), winners: byId("drWinners"), wheel: byId("drWheel"), spin: byId("drSpin"), result: byId("drResult"),
    teamNames: byId("drTeamNames"), teamCount: byId("drTeamCount"), teams: byId("drTeams"),
    diceN: byId("drDiceN"), diceS: byId("drDiceS"), dice: byId("drDice"), diceSum: byId("drDiceSum"),
    coin: byId("drCoin"), coinFace: byId("drCoinFace"), coinRes: byId("drCoinRes"), coinStat: byId("drCoinStat"),
    min: byId("drMin"), max: byId("drMax"), qty: byId("drQty"), unique: byId("drUnique"), nums: byId("drNums")
  };
  const wx = dui.wheel.getContext("2d");
  // Exemplo fictício: dá para girar a roleta e sortear times sem digitar nada.
  const D_EX = { names: "Ana\nBia\nCaio\nDuda\nEdu\nFê", teamNames: "Ana\nBia\nCaio\nDuda\nEdu\nFê" };
  let ds = dDefaults();
  let clearedWinners = null;
  let dSheet = null, sSheet = null, dTabsFn = null, sTabsFn = null; // folha inferior do celular (shell.js)
  let angle = 0, spinning = false, animId = 0;

  function dDefaults() {
    return { name: "Sorteio sem título", tab: "names", names: D_EX.names, teamNames: D_EX.teamNames, teamCount: 2, remove: false, winners: [], diceN: 1, diceS: 6, coin: { h: 0, t: 0 }, min: 1, max: 100, qty: 1, unique: true };
  }
  function dNormalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = dDefaults();
    const coin = o.coin && typeof o.coin === "object" ? o.coin : {};
    return {
      name: toText(o.name, d.name, 80),
      tab: ["names", "teams", "dice", "coin", "num"].includes(o.tab) ? o.tab : "names",
      names: toText(o.names, "", 6000), teamNames: toText(o.teamNames, "", 6000),
      teamCount: C.util.toInt(o.teamCount, 2, 2, 12),
      remove: Boolean(o.remove),
      winners: (Array.isArray(o.winners) ? o.winners : []).slice(0, 200).map((w) => toText(w, "", 80)).filter(Boolean),
      diceN: C.util.toInt(o.diceN, 1, 1, 6), diceS: [4, 6, 8, 10, 12, 20, 100].includes(Number(o.diceS)) ? Number(o.diceS) : 6,
      coin: { h: C.util.toInt(coin.h, 0, 0, 1e6), t: C.util.toInt(coin.t, 0, 0, 1e6) },
      min: num(o.min, 1, -1e9, 1e9), max: num(o.max, 100, -1e9, 1e9), qty: C.util.toInt(o.qty, 1, 1, 100), unique: o.unique !== false
    };
  }
  const COLORS = ["#ef5350", "#ffa726", "#fdd835", "#66bb6a", "#26c6da", "#42a5f5", "#7e57c2", "#ec407a", "#8d6e63", "#26a69a"];
  function pool() {
    const all = lines(ds.names);
    if (!ds.remove) return all;
    const gone = ds.winners.slice();
    return all.filter((n) => { const i = gone.indexOf(n); if (i >= 0) { gone.splice(i, 1); return false; } return true; });
  }
  function drawWheel() {
    const list = pool(), S = dui.wheel.width, R = S / 2 - 6;
    wx.clearRect(0, 0, S, S);
    wx.save();
    wx.translate(S / 2, S / 2);
    if (list.length < 2) {
      wx.fillStyle = "#2a3446"; wx.beginPath(); wx.arc(0, 0, R, 0, 7); wx.fill();
      wx.fillStyle = "#98a6bd"; wx.font = "bold 26px system-ui, sans-serif"; wx.textAlign = "center"; wx.fillText(list.length ? "Falta mais um nome" : "Escreva os nomes ao lado", 0, 8);
      wx.restore(); return;
    }
    wx.rotate(angle);
    const step = (Math.PI * 2) / list.length;
    list.forEach((name, i) => {
      wx.beginPath(); wx.moveTo(0, 0); wx.arc(0, 0, R, i * step, (i + 1) * step); wx.closePath();
      wx.fillStyle = COLORS[i % COLORS.length]; wx.fill();
      wx.strokeStyle = "#fff"; wx.lineWidth = 3; wx.stroke();
      wx.save();
      wx.rotate(i * step + step / 2);
      wx.textAlign = "right"; wx.fillStyle = "#fff"; wx.shadowColor = "#0006"; wx.shadowBlur = 4;
      wx.font = "bold " + clamp(Math.round(300 / Math.sqrt(list.length + 2)), 16, 34) + "px system-ui, sans-serif";
      let t = name; const maxW = R - 40;
      while (t.length > 1 && wx.measureText(t).width > maxW) t = t.slice(0, -1);
      wx.fillText(t === name ? t : t + "…", R - 18, 9);
      wx.restore();
    });
    wx.restore();
    wx.save(); wx.translate(S / 2, S / 2); wx.beginPath(); wx.arc(0, 0, 34, 0, 7); wx.fillStyle = "#fff"; wx.fill(); wx.restore();
  }
  function dInfo() {
    const n = pool().length;
    dui.count.textContent = lines(ds.names).length ? n + (n === 1 ? " nome na roleta" : " nomes na roleta") : "";
    dui.winners.replaceChildren();
    if (ds.winners.length) {
      const h = document.createElement("div"); h.className = "fn-sub"; h.textContent = "Já saíram";
      const clr = document.createElement("button"); clr.type = "button"; clr.className = "chip"; clr.textContent = "Limpar";
      clr.addEventListener("click", () => { clearedWinners = ds.winners.slice(); ds.winners = []; mark(); dInfo(); drawWheel(); });
      dui.winners.append(h);
      ds.winners.slice().reverse().forEach((w, i) => { const s = document.createElement("span"); s.className = "fn-tag"; s.textContent = (ds.winners.length - i) + "º " + w; dui.winners.append(s); });
      dui.winners.append(clr);
    } else if (clearedWinners && clearedWinners.length) {
      const undo = document.createElement("button"); undo.type = "button"; undo.className = "chip"; undo.textContent = "Desfazer limpeza";
      undo.addEventListener("click", () => { ds.winners = clearedWinners; clearedWinners = null; mark(); dInfo(); drawWheel(); });
      dui.winners.append(undo);
    }
  }
  function spin() {
    if (spinning) return;
    const list = pool();
    if (list.length < 2) { dui.result.textContent = "Escreva pelo menos 2 nomes."; return; }
    clearedWinners = null;
    spinning = true; dui.spin.disabled = true; dui.result.textContent = "";
    const win = rnd(list.length), step = (Math.PI * 2) / list.length;
    // o ponteiro fica no alto (-90°): o centro do setor vencedor precisa parar ali
    const target = -Math.PI / 2 - (win * step + step / 2);
    const turns = 5 + rnd(3);
    const from = angle % (Math.PI * 2);
    let end = target - Math.PI * 2 * turns;
    while (end > from) end -= Math.PI * 2;
    const t0 = performance.now(), dur = 4200;
    const tick = (now) => {
      const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      angle = from + (end - from) * e;
      drawWheel();
      if (k < 1) animId = requestAnimationFrame(tick);
      else {
        spinning = false; dui.spin.disabled = false;
        const name = list[win];
        dui.result.textContent = name + "!";
        ds.winners.push(name); mark(); dInfo();
        if (ds.remove) setTimeout(drawWheel, 1200);
      }
    };
    animId = requestAnimationFrame(tick);
  }
  function teamsGo() {
    const names = lines(ds.teamNames), n = clamp(ds.teamCount, 2, 12);
    dui.teams.replaceChildren();
    if (names.length < 2) { const p = document.createElement("p"); p.className = "tv-info"; p.textContent = "Escreva pelo menos 2 nomes."; dui.teams.append(p); return; }
    const k = Math.min(n, names.length), groups = Array.from({ length: k }, () => []);
    shuffle(names).forEach((nm, i) => groups[i % k].push(nm));
    groups.forEach((g, i) => {
      const card = document.createElement("div"); card.className = "fn-team"; card.style.setProperty("--c", COLORS[i % COLORS.length]);
      const t = document.createElement("strong"); t.textContent = "Time " + (i + 1);
      const ul = document.createElement("ul"); g.forEach((nm) => { const li = document.createElement("li"); li.textContent = nm; ul.append(li); });
      card.append(t, ul); dui.teams.append(card);
    });
  }
  const NS = "http://www.w3.org/2000/svg";
  const PIPS = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]], 5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6.5], [17, 6.5], [7, 12], [17, 12], [7, 17.5], [17, 17.5]] };
  function dieSvg(n) {
    const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "die"); s.setAttribute("role", "img"); s.setAttribute("aria-label", "Dado: " + n);
    const r = document.createElementNS(NS, "rect"); r.setAttribute("x", "1.5"); r.setAttribute("y", "1.5"); r.setAttribute("width", "21"); r.setAttribute("height", "21"); r.setAttribute("rx", "5"); r.setAttribute("fill", "#fff"); r.setAttribute("stroke", "#1b2433"); r.setAttribute("stroke-width", "1.4"); s.append(r);
    PIPS[n].forEach(([x, y]) => { const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "2"); c.setAttribute("fill", "#1b2433"); s.append(c); });
    return s;
  }
  function iconSvg(id) { const s = document.createElementNS(NS, "svg"); s.setAttribute("class", "icon"); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS(NS, "use"); u.setAttribute("href", "#ic-" + id); s.append(u); return s; }
  async function roll() {
    const n = ds.diceN, s = ds.diceS;
    dui.dice.replaceChildren(); dui.diceSum.textContent = "";
    const els = [];
    for (let i = 0; i < n; i++) { const d = document.createElement("div"); d.className = "fn-die is-roll"; d.textContent = "?"; dui.dice.append(d); els.push(d); }
    const vals = els.map(() => 1 + rnd(s));
    for (let f = 0; f < 10; f++) { els.forEach((d) => { d.textContent = String(1 + rnd(s)); }); await new Promise((r) => setTimeout(r, 55)); }
    els.forEach((d, i) => { d.classList.remove("is-roll"); if (s === 6) d.replaceChildren(dieSvg(vals[i])); else d.textContent = String(vals[i]); d.title = String(vals[i]); d.classList.toggle("is-face", s === 6); });
    const sum = vals.reduce((a, b) => a + b, 0);
    dui.diceSum.textContent = n > 1 ? "Soma: " + sum + "  (" + vals.join(" + ") + ")" : "Saiu " + vals[0] + "!";
  }
  let flipping = false;
  function flip() {
    if (flipping) return;
    flipping = true;
    const heads = rnd(2) === 0;
    dui.coin.classList.remove("is-flip"); void dui.coin.offsetWidth; dui.coin.classList.add("is-flip");
    dui.coinRes.textContent = "";
    setTimeout(() => {
      dui.coinFace.replaceChildren(iconSvg(heads ? "smile" : "crown"));
      dui.coinRes.textContent = heads ? "Cara!" : "Coroa!";
      if (heads) ds.coin.h++; else ds.coin.t++;
      mark(); coinStat(); flipping = false;
    }, 900);
  }
  const coinStat = () => { const t = ds.coin.h + ds.coin.t; dui.coinStat.textContent = t ? t + (t === 1 ? " jogada" : " jogadas") + ": " + ds.coin.h + " cara, " + ds.coin.t + " coroa" : ""; };
  async function numGo() {
    let a = Math.round(Number(dui.min.value)), b = Math.round(Number(dui.max.value));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a > b) [a, b] = [b, a];
    const total = b - a + 1;
    let q = clamp(Math.round(Number(dui.qty.value)) || 1, 1, 100);
    if (dui.unique.checked && q > total) { q = total; dui.qty.value = String(q); }
    const out = [];
    if (dui.unique.checked) { const used = new Set(); while (out.length < q) { const v = a + rnd(total); if (!used.has(v)) { used.add(v); out.push(v); } } }
    else for (let i = 0; i < q; i++) out.push(a + rnd(total));
    dui.nums.classList.add("is-roll");
    for (let f = 0; f < 10; f++) { dui.nums.textContent = String(a + rnd(total)); await new Promise((r) => setTimeout(r, 50)); }
    dui.nums.classList.remove("is-roll");
    dui.nums.textContent = out.join("  ·  ");
    dui.nums.classList.toggle("is-many", out.length > 3);
  }
  function showDTab(t) {
    ds.tab = t;
    dws.querySelectorAll("[data-dt]").forEach((b) => b.classList.toggle("is-on", b.dataset.dt === t));
    dws.querySelectorAll("[data-dp]").forEach((p) => { p.hidden = p.dataset.dp !== t; });
    if (dSheet && dTabsFn) dSheet.setTabs(dTabsFn(t));
    if (t === "names") drawWheel();
  }
  function dPrimary() { ({ names: spin, teams: teamsGo, dice: roll, coin: flip, num: numGo })[ds.tab](); }

  dws.addEventListener("click", (e) => { const b = e.target.closest("[data-dt]"); if (b) { showDTab(b.dataset.dt); C.scheduleSave({ ui: true }); } });
  dui.spin.addEventListener("click", spin);
  byId("drTeamGo").addEventListener("click", teamsGo);
  byId("drRoll").addEventListener("click", roll);
  byId("drFlip").addEventListener("click", flip);
  dui.coin.addEventListener("click", flip);
  byId("drNumGo").addEventListener("click", numGo);
  dui.names.addEventListener("input", () => { ds.names = dui.names.value; mark(); dInfo(); if (!spinning) drawWheel(); });
  dui.remove.addEventListener("change", () => { ds.remove = dui.remove.checked; mark(); dInfo(); drawWheel(); });
  dui.teamNames.addEventListener("input", () => { ds.teamNames = dui.teamNames.value; mark(); });
  dui.teamCount.addEventListener("input", () => { ds.teamCount = C.util.toInt(dui.teamCount.value, 2, 2, 12); mark(); });
  [dui.diceN, dui.diceS].forEach((el) => el.addEventListener("change", () => { ds.diceN = Number(dui.diceN.value); ds.diceS = Number(dui.diceS.value); mark(); }));
  [dui.min, dui.max, dui.qty, dui.unique].forEach((el) => el.addEventListener("input", () => { ds.min = Number(dui.min.value) || 0; ds.max = Number(dui.max.value) || 0; ds.qty = C.util.toInt(dui.qty.value, 1, 1, 100); ds.unique = dui.unique.checked; mark(); }));

  C.register({
    type: "draw",
    defaults: dDefaults, normalize: dNormalize,
    payload(doc) { return { format: "coding-document", version: 4, type: "draw", ...doc.state }; },
    info(doc) { const n = lines(doc.state.names).length; return n ? n + " nomes" : "Roleta, dado e moeda"; },
    snippet(doc) { return lines(doc.state.names).slice(0, 7); },
    open(doc) {
      ds = doc.state; cancelAnimationFrame(animId); spinning = false; dui.spin.disabled = false; angle = 0;
      dui.names.value = ds.names; dui.remove.checked = ds.remove; dui.teamNames.value = ds.teamNames; dui.teamCount.value = String(ds.teamCount);
      dui.diceN.value = String(ds.diceN); dui.diceS.value = String(ds.diceS);
      dui.min.value = String(ds.min); dui.max.value = String(ds.max); dui.qty.value = String(ds.qty); dui.unique.checked = ds.unique;
      dui.result.textContent = ""; dui.coinRes.textContent = ""; dui.coinFace.replaceChildren(iconSvg("coin")); dui.diceSum.textContent = ""; dui.dice.replaceChildren(); dui.teams.replaceChildren(); dui.nums.textContent = "?";
      dInfo(); coinStat(); showDTab(ds.tab); C.setPrimary(undefined, false);
    },
    close() { cancelAnimationFrame(animId); spinning = false; },
    print: dPrimary, primaryIsPrint: false, shareable: false
  });

  /* ============================== Racha-conta ============================== */

  const sws = byId("splitWs");
  const sui = {
    total: byId("spTotal"), people: byId("spPeople"), tip: byId("spTip"), tipV: byId("spTipV"), round: byId("spRound"), each: byId("spEach"), detail: byId("spDetail"),
    tip2: byId("spTip2"), tipV2: byId("spTipV2"), plist: byId("spPeopleList"), newPerson: byId("spNewPerson"), items: byId("spItems"), result: byId("spResult")
  };
  // Exemplo fictício de conta: 4 pessoas, 6 itens (somam R$ 240,00) e gorjeta de 10%.
  function sSample() {
    return {
      total: "240,00", people: 4, tip: 10, round: false, tip2: 10, names: ["Ana", "Bia", "Caio", "Duda"],
      items: [
        { name: "Pizza grande", price: "68,00", who: [0, 1, 2, 3] }, { name: "Refrigerante 2L", price: "12,00", who: [0, 1, 2, 3] },
        { name: "Sobremesa", price: "24,00", who: [1, 2] }, { name: "Cerveja artesanal", price: "36,00", who: [0, 2] },
        { name: "Porção de batata", price: "30,00", who: [0, 3] }, { name: "Petiscos", price: "70,00", who: [0, 1, 2, 3] }
      ]
    };
  }
  let ss = sDefaults();

  function sDefaults() {
    return { name: "Conta sem título", tab: "eq", ...sSample() };
  }
  function sNormalize(src) {
    const o = src && typeof src === "object" ? src : {};
    const d = sDefaults();
    const names = (Array.isArray(o.names) ? o.names : d.names).slice(0, 30).map((n) => toText(n, "", 40)).filter(Boolean);
    return {
      name: toText(o.name, d.name, 80), tab: o.tab === "items" ? "items" : "eq",
      total: toText(o.total, "", 20), people: C.util.toInt(o.people, 4, 1, 99), tip: C.util.toInt(o.tip, 10, 0, 30), tip2: C.util.toInt(o.tip2, 10, 0, 30), round: Boolean(o.round),
      names: names.length ? names : d.names,
      items: (Array.isArray(o.items) ? o.items : []).slice(0, 80).map((i) => ({ name: toText(i && i.name, "", 60), price: toText(i && i.price, "", 20), who: (Array.isArray(i && i.who) ? i.who : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 30) }))
    };
  }
  let eqText = "", itText = "";
  function calcEq() {
    sui.tipV.textContent = ss.tip + "%";
    const total = parseMoney(ss.total);
    if (total === null) { sui.each.textContent = "—"; sui.detail.textContent = "Não entendi o valor. Use assim: 240 ou 1.234,56"; eqText = ""; return; }
    const n = Math.max(1, ss.people);
    const tip = Math.round((total * ss.tip) / 100), grand = total + tip;
    let parts = splitCents(grand, n), extra = 0;
    if (ss.round && grand > 0) { const each = Math.ceil(grand / n / 100) * 100; extra = each * n - grand; parts = new Array(n).fill(each); }
    const hi = Math.max(...parts), lo = Math.min(...parts), nHi = parts.filter((v) => v === hi).length;
    sui.each.textContent = brl(hi);
    let det = total ? "Conta " + brl(total) + " + gorjeta " + brl(tip) + " = " + brl(grand) : "Escreva o total da conta.";
    if (total && hi !== lo) det += "\n" + nHi + (nHi === 1 ? " pessoa paga " : " pessoas pagam ") + brl(hi) + " e " + (n - nHi) + (n - nHi === 1 ? " paga " : " pagam ") + brl(lo) + " (para não sobrar nem faltar centavo).";
    if (total && extra > 0) det += "\nSobra " + brl(extra) + " por causa do arredondamento.";
    sui.detail.textContent = det;
    eqText = total ? "🧾 Racha-conta\nConta: " + brl(total) + " + gorjeta de " + ss.tip + "% (" + brl(tip) + ") = " + brl(grand) + "\nDividido por " + n + ": " + (hi === lo ? brl(hi) + " para cada um" : nHi + " × " + brl(hi) + " e " + (n - nHi) + " × " + brl(lo)) + (extra > 0 ? "\nSobra " + brl(extra) + " (arredondamento)" : "") : "";
  }
  function calcItems() {
    const n = ss.names.length, paid = new Array(n).fill(0);
    const pending = [];
    let sum = 0, bad = 0;
    ss.items.forEach((it, k) => {
      const p = parseMoney(it.price);
      if (p === null) { bad++; return; }
      const who = [...new Set(it.who.filter((i) => i < n))];
      if (!who.length) { if (p) pending.push(it.name || "Item " + (k + 1)); return; }
      sum += p;
      splitCents(p, who.length, k).forEach((v, j) => { paid[who[j]] += v; });
    });
    sui.tipV2.textContent = ss.tip2 + "%";
    sui.result.replaceChildren();
    let txt = "🧾 Racha-conta (por itens)\n", grand = 0;
    paid.forEach((v, i) => {
      const tot = v + Math.round((v * ss.tip2) / 100);
      grand += tot;
      const row = document.createElement("div"); row.className = "fn-row2";
      const a = document.createElement("span"); a.textContent = ss.names[i];
      const b = document.createElement("strong"); b.textContent = brl(tot);
      row.append(a, b); sui.result.append(row);
      txt += ss.names[i] + ": " + brl(tot) + "\n";
    });
    const foot = document.createElement("p"); foot.className = "tv-info";
    foot.textContent = "Itens " + brl(sum) + " + gorjeta " + ss.tip2 + "% = " + brl(grand) + " (soma de todos os valores acima)";
    sui.result.append(foot);
    if (bad) { const w = document.createElement("p"); w.className = "tv-msg"; w.textContent = bad + (bad === 1 ? " item tem um preço que não entendi (use 12,50 ou 1.234,56) e ficou de fora." : " itens têm um preço que não entendi e ficaram de fora."); sui.result.append(w); }
    if (pending.length) {
      const w = document.createElement("div"); w.className = "fn-pending";
      const t = document.createElement("p"); t.append(iconSvg("alert"), " Sem ninguém marcado (não entram na conta): " + pending.join(", ") + ".");
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.textContent = "Dividir entre todos";
      btn.addEventListener("click", () => { ss.items.forEach((it) => { if (!it.who.some((i) => i < n) && parseMoney(it.price)) it.who = ss.names.map((_, i) => i); }); mark(); renderItems(); calcItems(); });
      w.append(t, btn); sui.result.append(w);
      txt += "Atenção: sem ninguém marcado: " + pending.join(", ") + "\n";
    }
    txt += "Total com " + ss.tip2 + "% de gorjeta: " + brl(grand);
    itText = pending.length ? "" : txt;
  }
  function renderPeople() {
    sui.plist.replaceChildren();
    ss.names.forEach((nm, i) => {
      const chip = document.createElement("span"); chip.className = "fn-tag";
      const inp = document.createElement("input"); inp.value = nm; inp.setAttribute("aria-label", "Nome da pessoa " + (i + 1)); inp.size = Math.max(4, nm.length);
      inp.addEventListener("input", () => { ss.names[i] = inp.value.slice(0, 40) || "Pessoa " + (i + 1); inp.size = Math.max(4, inp.value.length); mark(); calcItems(); renderItems(true); });
      const x = document.createElement("button"); x.type = "button"; x.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#ic-close"/></svg>'; x.title = "Tirar"; x.setAttribute("aria-label", "Tirar " + nm);
      x.addEventListener("click", () => {
        if (ss.names.length <= 1) return;
        ss.names.splice(i, 1);
        ss.items.forEach((it) => { it.who = it.who.filter((w) => w !== i).map((w) => (w > i ? w - 1 : w)); });
        mark(); renderPeople(); renderItems(); calcItems();
      });
      chip.append(inp, x); sui.plist.append(chip);
    });
  }
  function renderItems(keep) {
    if (keep) { sui.items.querySelectorAll(".fn-who").forEach((box, k) => { const it = ss.items[k]; if (!it) return; box.querySelectorAll("button").forEach((b, i) => { b.textContent = ss.names[i] || ""; }); }); return; }
    sui.items.replaceChildren();
    ss.items.forEach((it, k) => {
      const row = document.createElement("div"); row.className = "fn-item";
      const top = document.createElement("div"); top.className = "fn-itemtop";
      const nm = document.createElement("input"); nm.className = "fn-inp"; nm.placeholder = "O que foi? (ex.: Pizza)"; nm.value = it.name; nm.setAttribute("aria-label", "Nome do item");
      nm.addEventListener("input", () => { it.name = nm.value.slice(0, 60); mark(); });
      const pr = document.createElement("input"); pr.className = "fn-inp fn-price"; pr.placeholder = "R$"; pr.inputMode = "decimal"; pr.value = it.price; pr.setAttribute("aria-label", "Preço do item");
      pr.addEventListener("input", () => { it.price = pr.value.slice(0, 20); mark(); calcItems(); });
      const del = document.createElement("button"); del.type = "button"; del.className = "cbtn"; del.append(iconSvg("trash")); del.title = "Apagar item"; del.setAttribute("aria-label", "Apagar item");
      del.addEventListener("click", () => { ss.items.splice(k, 1); mark(); renderItems(); calcItems(); });
      top.append(nm, pr, del);
      const who = document.createElement("div"); who.className = "fn-who";
      ss.names.forEach((n, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "chip" + (it.who.includes(i) ? " is-on" : ""); b.textContent = n;
        b.addEventListener("click", () => { const at = it.who.indexOf(i); if (at >= 0) it.who.splice(at, 1); else it.who.push(i); b.classList.toggle("is-on", at < 0); mark(); calcItems(); });
        who.append(b);
      });
      const all = document.createElement("button"); all.type = "button"; all.className = "chip"; all.textContent = "Todos";
      all.addEventListener("click", () => { it.who = ss.names.map((_, i) => i); mark(); renderItems(); calcItems(); });
      who.append(all);
      row.append(top, who); sui.items.append(row);
    });
  }
  function showSTab(t) {
    ss.tab = t;
    sws.querySelectorAll("[data-st]").forEach((b) => b.classList.toggle("is-on", b.dataset.st === t));
    sws.querySelectorAll("[data-sp]").forEach((p) => { p.hidden = p.dataset.sp !== t; });
    if (sSheet && sTabsFn) sSheet.setTabs(sTabsFn(t));
  }
  async function copyText() {
    const t = ss.tab === "eq" ? eqText : itText;
    if (!t) { C.toast(ss.tab === "items" ? "Resolva os itens sem ninguém marcado antes de copiar." : "Preencha a conta primeiro."); return; }
    try { await navigator.clipboard.writeText(t); C.toast("Resumo copiado! É só colar no grupo."); } catch (_) { C.toast("Seu navegador não deixou copiar."); }
  }
  sws.addEventListener("click", (e) => {
    const t = e.target.closest("[data-st]"); if (t) { showSTab(t.dataset.st); C.scheduleSave({ ui: true }); return; }
    const st = e.target.closest("[data-step]"); if (st) { ss.people = clamp(ss.people + Number(st.dataset.step), 1, 99); sui.people.value = String(ss.people); mark(); calcEq(); return; }
    const tp = e.target.closest("[data-tip]"); if (tp) { ss.tip = Number(tp.dataset.tip); sui.tip.value = String(ss.tip); mark(); calcEq(); }
  });
  sui.total.addEventListener("input", () => { ss.total = sui.total.value; mark(); calcEq(); });
  sui.people.addEventListener("input", () => { ss.people = C.util.toInt(sui.people.value, 1, 1, 99); mark(); calcEq(); });
  sui.tip.addEventListener("input", () => { ss.tip = Number(sui.tip.value); mark(); calcEq(); });
  sui.round.addEventListener("change", () => { ss.round = sui.round.checked; mark(); calcEq(); });
  sui.tip2.addEventListener("input", () => { ss.tip2 = Number(sui.tip2.value); mark(); calcItems(); });
  byId("spAddPerson").addEventListener("click", () => {
    const n = sui.newPerson.value.trim().slice(0, 40) || "Pessoa " + (ss.names.length + 1);
    if (ss.names.length >= 30) return;
    ss.names.push(n); sui.newPerson.value = ""; mark(); renderPeople(); renderItems(); calcItems();
  });
  sui.newPerson.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); byId("spAddPerson").click(); } });
  byId("spAddItem").addEventListener("click", () => { if (ss.items.length >= 80) return; ss.items.push({ name: "", price: "", who: ss.names.map((_, i) => i) }); mark(); renderItems(); calcItems(); });
  byId("spCopyEq").addEventListener("click", copyText);
  byId("spCopyIt").addEventListener("click", copyText);

  C.register({
    type: "split",
    defaults: sDefaults, normalize: sNormalize,
    payload(doc) { return { format: "coding-document", version: 4, type: "split", ...doc.state }; },
    info(doc) { const t = parseMoney(doc.state.total); return doc.state.tab === "eq" && t ? brl(t + Math.round((t * doc.state.tip) / 100)) + " · " + doc.state.people + " pessoas" : doc.state.items.length + " itens"; },
    snippet(doc) { const s = doc.state; return s.tab === "eq" ? [s.total ? "Total R$ " + s.total : "", s.people + " pessoas", "Gorjeta " + s.tip + "%"].filter(Boolean) : s.items.map((i) => i.name + " " + i.price).slice(0, 7); },
    open(doc) {
      ss = doc.state;
      sui.total.value = ss.total; sui.people.value = String(ss.people); sui.tip.value = String(ss.tip); sui.round.checked = ss.round; sui.tip2.value = String(ss.tip2);
      renderPeople(); renderItems(); calcEq(); calcItems(); showSTab(ss.tab); C.setPrimary(undefined, false);
    },
    close() {},
    print: copyText, primaryIsPrint: false, shareable: false
  });

  /* ============================== Celular: folha inferior (shell.js) ============================== */

  // Restaurar exemplo: pergunta antes de trocar o que a pessoa já escreveu.
  byId("drSample").addEventListener("click", () => {
    const same = ds.names.trim() === D_EX.names && ds.teamNames.trim() === D_EX.teamNames;
    if (!same && (lines(ds.names).length || lines(ds.teamNames).length) && !window.confirm("Trocar as listas de nomes atuais pelo exemplo?")) return;
    ds.names = D_EX.names; ds.teamNames = D_EX.teamNames; ds.winners = []; clearedWinners = null;
    dui.names.value = ds.names; dui.teamNames.value = ds.teamNames;
    mark(); dInfo(); drawWheel(); C.toast("Exemplo restaurado.");
  });
  function sRestore() {
    const ex = sSample();
    const same = JSON.stringify([ss.total, ss.people, ss.tip, ss.round, ss.tip2, ss.names, ss.items]) === JSON.stringify([ex.total, ex.people, ex.tip, ex.round, ex.tip2, ex.names, ex.items]);
    const hasWork = Boolean(ss.total.trim() || ss.items.length);
    if (!same && hasWork && !window.confirm("Trocar a conta atual pelo exemplo?")) return;
    Object.assign(ss, ex);
    sui.total.value = ss.total; sui.people.value = String(ss.people); sui.tip.value = String(ss.tip); sui.round.checked = ss.round; sui.tip2.value = String(ss.tip2);
    renderPeople(); renderItems(); calcEq(); calcItems(); mark(); C.toast("Exemplo restaurado.");
  }
  byId("spSampleEq").addEventListener("click", sRestore);
  byId("spSampleIt").addEventListener("click", sRestore);

  if (C.shell) {
    const lbl = (el) => (el.closest("label") || el);
    function dTabs(mode) {
      if (mode === "teams") return [
        { key: "part", label: "Participantes", icon: "ic-users", nodes: () => [lbl(dui.teamNames)] },
        { key: "conf", label: "Configurações", icon: "ic-sliders", nodes: () => [lbl(dui.teamCount)] }
      ];
      if (mode === "dice") return [{ key: "conf", label: "Configurações", icon: "ic-sliders", nodes: () => [dws.querySelector('[data-dp="dice"] .fn-controls')] }];
      if (mode === "coin") return [{ key: "stat", label: "Estatísticas", icon: "ic-hash", nodes: () => [dui.coinStat] }];
      if (mode === "num") return [{ key: "conf", label: "Configurações", icon: "ic-sliders", nodes: () => [dws.querySelector('[data-dp="num"] .fn-controls'), lbl(dui.unique)] }];
      return [
        { key: "part", label: "Participantes", icon: "ic-users", nodes: () => [lbl(dui.names)] },
        { key: "conf", label: "Configurações", icon: "ic-sliders", nodes: () => [lbl(dui.remove), dui.count, byId("drSample")] },
        { key: "hist", label: "Histórico", icon: "ic-list", nodes: () => [dui.winners] }
      ];
    }
    const SEQ = [...sws.querySelectorAll('[data-sp="eq"] .fn-col:first-child > *')];
    const SIT = [...sws.querySelectorAll('[data-sp="items"] .fn-col:first-child > *')];
    function sTabs(mode) {
      if (mode === "items") return [
        { key: "people", label: "Pessoas", icon: "ic-users", nodes: () => SIT.slice(0, 3) },
        { key: "items", label: "Itens", icon: "ic-receipt", nodes: () => SIT.slice(3, 6) },
        { key: "tip", label: "Gorjeta", icon: "ic-sliders", nodes: () => [SIT[6], SIT[7]] }
      ];
      return [
        { key: "bill", label: "Conta", icon: "ic-receipt", nodes: () => [SEQ[0], SEQ[1]] },
        { key: "tip", label: "Gorjeta", icon: "ic-sliders", nodes: () => [SEQ[2], SEQ[3], SEQ[4]] }
      ];
    }
    dTabsFn = dTabs; sTabsFn = sTabs;
    dSheet = C.shell.create({ ws: dws, id: "sorteio", host: dws.querySelector(".fn-body"), label: "Controles do sorteio", tabs: dTabs(ds.tab), defaultState: "collapsed" });
    sSheet = C.shell.create({ ws: sws, id: "racha", host: sws.querySelector(".fn-body"), label: "Controles da conta", tabs: sTabs(ss.tab), defaultState: "half" });

    // O botão principal de "Times" fica na área de resultado (em cima), não escondido na folha.
    const goBtn = byId("drTeamGo"), goHome = goBtn.parentNode, goNext = goBtn.nextSibling;
    const placeGo = () => {
      const teams = byId("drTeams");
      if (C.shell.mq.matches) { if (goBtn.parentNode !== teams.parentNode) teams.parentNode.insertBefore(goBtn, teams); }
      else if (goBtn.parentNode !== goHome) goHome.insertBefore(goBtn, goNext && goNext.parentNode === goHome ? goNext : null);
    };
    C.shell.mq.addEventListener("change", placeGo); placeGo();
  }
})();
