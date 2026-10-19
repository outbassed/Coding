/* Coding — shell móvel compartilhado.
   Em telas estreitas (até 899px) a área de trabalho fica em cima e os controles ficam numa
   "folha" embaixo, com 3 estados (recolhida, meia, expandida). Em telas largas nada muda:
   os elementos voltam ao lugar original e a folha some.
   Uso: Coding.shell.create({ ws, host, id, tabs: [{ key, label, icon, nodes | pane }], native, defaultState })
   - nodes: função que devolve os elementos que vão para a aba (voltam ao lugar no desktop)
   - pane: elemento que já é um painel (ferramenta troca as abas sozinha quando native = true)
   - setTabs(tabs): troca as abas (ex.: Sorteio muda de modo) */
(() => {
  "use strict";

  const C = (window.Coding = window.Coding || {});
  const mq = window.matchMedia("(max-width: 899px)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STATES = ["collapsed", "half", "expanded"];
  const PREF_KEY = "coding.sheet.state"; // só preferência de tela; nunca é conteúdo do documento
  const all = [];

  const svg = (id) => `<svg class="icon" aria-hidden="true"><use href="#${id}"/></svg>`;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  function readPref(id, def) { try { const v = localStorage.getItem(PREF_KEY + "." + id); return STATES.includes(v) ? v : def; } catch (_) { return def; } }
  function writePref(id, v) { try { localStorage.setItem(PREF_KEY + "." + id, v); } catch (_) { /* sem armazenamento: tudo bem */ } }

  /* Teclado virtual: calcula quanto da tela ele cobre e empurra a folha para cima. */
  let kb = 0;
  const relayout = () => all.forEach((s) => { if (s.active) s.layout(); });
  function syncKeyboard() {
    const vv = window.visualViewport;
    const next = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    kb = next > 90 ? next : 0;
    document.documentElement.style.setProperty("--sh-kb", kb + "px");
    document.documentElement.classList.toggle("sh-keyboard", kb > 0);
    relayout();
    window.dispatchEvent(new CustomEvent("coding:keyboard", { detail: { height: kb } }));
  }
  window.addEventListener("coding:shown", () => requestAnimationFrame(relayout));
  document.addEventListener("focusout", () => setTimeout(relayout, 50));
  document.addEventListener("focusin", () => setTimeout(relayout, 50));
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", syncKeyboard); window.visualViewport.addEventListener("scroll", syncKeyboard); }

  function create(opts) {
    const { ws, host, native = false, label = "Controles", id = "geral", defaultState = "half" } = opts;
    let tabs = opts.tabs;
    const moved = []; // { node, parent, next } para devolver ao lugar no desktop
    const sheet = document.createElement("section");
    sheet.className = "sh-sheet";
    sheet.setAttribute("aria-label", label);
    sheet.hidden = true;
    sheet.innerHTML =
      `<div class="sh-head">
         <button class="sh-handle" type="button" aria-label="Alterar a altura do painel" title="Arraste ou toque para mudar a altura"><span></span></button>
         <button class="sh-step sh-down" type="button" aria-label="Recolher o painel">${svg("ic-down")}</button>
         <button class="sh-step sh-up" type="button" aria-label="Expandir o painel">${svg("ic-up")}</button>
       </div>
       <div class="sh-tabs" role="tablist"></div>
       <div class="sh-body"></div>`;
    const tabsEl = sheet.querySelector(".sh-tabs");
    const bodyEl = sheet.querySelector(".sh-body");
    const handle = sheet.querySelector(".sh-handle");
    const btnUp = sheet.querySelector(".sh-up");
    const btnDown = sheet.querySelector(".sh-down");
    let panes = new Map();

    const inst = { sheet, active: false, state: readPref(id, defaultState), tab: tabs[0].key, layout, setState, show, reveal, setTabs };
    all.push(inst);

    function buildTabs() {
      tabsEl.replaceChildren(); panes = new Map();
      tabs.forEach((t) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sh-tab"; b.setAttribute("role", "tab"); b.dataset.shTab = t.key;
        if (native) b.dataset.tab = t.key;
        b.innerHTML = (t.icon ? svg(t.icon) : "") + `<span>${t.label}</span>`;
        tabsEl.appendChild(b);
        const pane = t.pane || Object.assign(document.createElement("div"), { className: "sh-pane" });
        if (!t.pane && native) pane.dataset.pane = t.key;
        panes.set(t.key, { pane, tab: b, spec: t });
      });
      if (!panes.has(inst.tab)) inst.tab = tabs[0].key;
    }
    buildTabs();

    /* ---------- alturas ---------- */
    function heights() {
      const H = Math.max(240, (host.clientHeight || 0) - kb); // o teclado já tira espaço da área útil
      const strip = (sheet.querySelector(".sh-head").offsetHeight || 40) + (tabsEl.offsetHeight || 52);
      const collapsed = strip + 2;
      const room = H < 340 ? 56 : H < 420 ? 70 : 120; // celular deitado: a folha precisa deixar espaço para a área de trabalho
      const half = clamp(Math.round(H * 0.42), collapsed + room, Math.max(collapsed + room, H - (H < 420 ? 110 : 150)));
      const expanded = clamp(Math.round(H * 0.72), half + 40, Math.max(half + 40, H - 110));
      return { collapsed, half, expanded };
    }
    function layout() {
      if (!inst.active || ws.hidden) return; // ferramenta escondida não mexe nas variáveis globais da folha
      const h = heights();
      // com o teclado aberto e o foco fora da folha (ex.: editando uma célula), a folha encolhe para não esconder o campo
      const eff = kb > 0 && !sheet.contains(document.activeElement) ? "collapsed" : inst.state;
      sheet.style.setProperty("--sh-h", h[eff] + "px");
      document.documentElement.style.setProperty("--sh-open", h[eff] + "px");
      document.documentElement.classList.add("sh-has");
      sheet.dataset.state = inst.state;
      btnUp.disabled = inst.state === "expanded";
      btnDown.disabled = inst.state === "collapsed";
      handle.setAttribute("aria-expanded", String(inst.state !== "collapsed"));
      requestAnimationFrame(keepFocusVisible); setTimeout(keepFocusVisible, 260);
    }
    // se a folha encolheu (teclado, giro de tela), o campo em edição dentro dela continua à vista
    function keepFocusVisible() {
      const el = document.activeElement;
      if (!inst.active || !el || !bodyEl.contains(el) || !el.matches("input,textarea,select,[contenteditable]")) return;
      const b = bodyEl.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.bottom > b.bottom - 4) bodyEl.scrollTop += r.bottom - b.bottom + 12;
      else if (r.top < b.top + 4) bodyEl.scrollTop -= b.top - r.top + 12;
    }
    function setState(s, persist = true) {
      if (!STATES.includes(s)) return;
      inst.state = s; if (persist) writePref(id, s);
      layout();
    }
    const step = (d) => setState(STATES[clamp(STATES.indexOf(inst.state) + d, 0, 2)]);
    btnUp.addEventListener("click", () => step(1));
    btnDown.addEventListener("click", () => step(-1));
    handle.addEventListener("click", (e) => { if (handle._dragged) { handle._dragged = false; e.preventDefault(); return; } setState(inst.state === "collapsed" ? "half" : inst.state === "half" ? "expanded" : "half"); });
    handle.addEventListener("keydown", (e) => { if (e.key === "ArrowUp") { e.preventDefault(); step(1); } else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); } });

    /* ---------- arrastar pela alça (nunca pelo canvas/planilha) ---------- */
    let drag = null;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const h = heights();
      drag = { y: e.clientY, h0: h[inst.state], h, moved: false };
      handle.setPointerCapture(e.pointerId);
      sheet.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dy = drag.y - e.clientY;
      if (Math.abs(dy) > 4) drag.moved = true;
      sheet.style.setProperty("--sh-h", clamp(drag.h0 + dy, drag.h.collapsed, drag.h.expanded) + "px");
    });
    const endDrag = (e) => {
      if (!drag) return;
      const cur = parseFloat(sheet.style.getPropertyValue("--sh-h")) || drag.h0;
      const moved = drag.moved; const h = drag.h;
      drag = null; sheet.classList.remove("is-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* já solto */ }
      if (!moved) { layout(); return; }
      handle._dragged = true; setTimeout(() => { handle._dragged = false; }, 0);
      const best = STATES.reduce((a, s) => (Math.abs(h[s] - cur) < Math.abs(h[a] - cur) ? s : a), "half");
      setState(best);
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    /* ---------- abas ---------- */
    function paintTabs() {
      panes.forEach((p, k) => { p.tab.classList.toggle("is-on", k === inst.tab); p.tab.setAttribute("aria-selected", String(k === inst.tab)); });
      const on = panes.get(inst.tab); // com muitas abas a faixa rola: mantém a aba ativa à vista
      if (on && tabsEl.scrollWidth > tabsEl.clientWidth) { const t = on.tab; tabsEl.scrollLeft = Math.max(0, t.offsetLeft - (tabsEl.clientWidth - t.offsetWidth) / 2); }
    }
    function show(key, { expand = true } = {}) {
      if (!panes.has(key)) return;
      inst.tab = key; paintTabs();
      panes.forEach((p, k) => { if (!native) p.pane.hidden = k !== key; });
      if (expand && inst.state === "collapsed") setState("half");
      const cb = panes.get(key).spec.onShow; if (cb) cb();
    }
    function reveal(key, min = "half") {
      const p = panes.get(key); if (!p || !inst.active) return;
      if (inst.tab !== key) p.tab.click();
      if (STATES.indexOf(inst.state) < STATES.indexOf(min)) setState(min, false); // abre sem gravar como preferência
    }
    tabsEl.addEventListener("click", (e) => {
      const b = e.target.closest(".sh-tab"); if (!b) return;
      const key = b.dataset.shTab;
      if (key === inst.tab && inst.state !== "collapsed") { if (native) return; setState("collapsed"); return; }
      if (!native) show(key);
      else { inst.tab = key; paintTabs(); if (inst.state === "collapsed") setState("half"); }
    });
    // quando a ferramenta muda de aba sozinha (native), a folha acompanha
    if (native) ws.addEventListener("click", (e) => { const t = e.target.closest("[data-tab]:not(.sh-tab)"); if (t && inst.active) { inst.tab = t.dataset.tab; paintTabs(); } });

    /* ---------- teclado: o campo ativo precisa continuar visível ---------- */
    sheet.addEventListener("focusin", (e) => {
      const el = e.target; if (!el.matches || !el.matches("input,textarea,select,[contenteditable]")) return;
      if (inst.state === "collapsed") setState("half", false);
      setTimeout(() => { try { el.scrollIntoView({ block: "nearest", behavior: reduce.matches ? "auto" : "smooth" }); } catch (_) { /* sem suporte */ } }, 250);
    });

    /* ---------- montar / desmontar conforme a largura ---------- */
    function adopt(node) { if (!node || moved.some((m) => m.node === node)) return; moved.push({ node, parent: node.parentNode, next: node.nextSibling }); }
    function release() {
      // devolve na ordem inversa para manter a posição original
      for (let i = moved.length - 1; i >= 0; i--) { const m = moved[i]; if (m.parent) m.parent.insertBefore(m.node, m.next && m.next.parentNode === m.parent ? m.next : null); }
      moved.length = 0;
      panes.forEach((p) => { if (p.spec.pane) p.pane.hidden = false; });
    }
    function fill() {
      panes.forEach((p) => {
        const nodes = (p.spec.nodes ? p.spec.nodes() : []).filter(Boolean);
        nodes.forEach((n) => { adopt(n); p.pane.appendChild(n); });
        if (p.spec.pane) adopt(p.spec.pane);
        bodyEl.appendChild(p.pane);
      });
    }
    function mount() {
      if (inst.active) return;
      inst.active = true;
      fill();
      host.appendChild(sheet);
      sheet.hidden = false;
      ws.classList.add("sh-on");
      inst.state = readPref(id, defaultState);
      show(inst.tab, { expand: false });
      if (native) panes.get(inst.tab).tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      layout();
      requestAnimationFrame(layout);
    }
    function unmount() {
      if (!inst.active) return;
      inst.active = false;
      release();
      sheet.hidden = true; sheet.remove();
      document.documentElement.style.removeProperty("--sh-open");
      if (!all.some((x) => x !== inst && x.active)) document.documentElement.classList.remove("sh-has");
      ws.classList.remove("sh-on");
      if (native) { ws.querySelectorAll(".im-pane").forEach((p, i) => { p.hidden = i !== 0; }); ws.querySelectorAll(".im-tabs button").forEach((b, i) => b.classList.toggle("is-on", i === 0)); }
    }
    function setTabs(next, keep) {
      tabs = next;
      const was = inst.active;
      if (was) release();
      buildTabs();
      if (keep && panes.has(keep)) inst.tab = keep;
      bodyEl.replaceChildren();
      if (was) { fill(); show(inst.tab, { expand: false }); layout(); }
    }
    function apply() { if (mq.matches) mount(); else unmount(); }
    mq.addEventListener("change", apply);
    window.addEventListener("resize", () => { if (inst.active) layout(); });
    window.addEventListener("orientationchange", () => setTimeout(layout, 250));
    new ResizeObserver(() => { if (inst.active) layout(); }).observe(host);
    apply();
    return inst;
  }

  C.shell = { create, STATES, syncKeyboard, mq };
})();
