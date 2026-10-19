/* Coding — shell móvel compartilhado.
   Em telas estreitas (até 899px) a área de trabalho fica em cima e os controles ficam numa
   "folha" embaixo, com 3 estados (recolhida, meia, expandida). Em telas largas nada muda:
   os elementos voltam ao lugar original e a folha some.
   Uso: Coding.shell.create({ ws, host, tabs: [{ key, label, icon, nodes | pane }], native }) */
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
  function syncKeyboard() {
    const vv = window.visualViewport;
    const next = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    kb = next > 90 ? next : 0;
    document.documentElement.style.setProperty("--sh-kb", kb + "px");
    document.documentElement.classList.toggle("sh-keyboard", kb > 0);
    all.forEach((s) => { if (s.active) s.layout(); });
    window.dispatchEvent(new CustomEvent("coding:keyboard", { detail: { height: kb } }));
  }
  document.addEventListener("focusout", () => setTimeout(() => all.forEach((s) => { if (s.active) s.layout(); }), 50));
  document.addEventListener("focusin", () => setTimeout(() => all.forEach((s) => { if (s.active) s.layout(); }), 50));
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", syncKeyboard); window.visualViewport.addEventListener("scroll", syncKeyboard); }

  function create(opts) {
    const { ws, host, tabs, native = false, label = "Controles", id = "geral", defaultState = "half" } = opts;
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

    const panes = new Map();
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

    const inst = { sheet, active: false, state: readPref(id, defaultState), tab: tabs[0].key, layout, setState, show, reveal, destroyed: false };
    all.push(inst);

    /* ---------- alturas ---------- */
    function heights() {
      const H = Math.max(240, (host.clientHeight || 0) - kb); // o teclado já tira espaço da área útil
      const strip = (sheet.querySelector(".sh-head").offsetHeight || 22) + (tabsEl.offsetHeight || 52);
      const collapsed = strip + 2;
      const half = clamp(Math.round(H * 0.42), collapsed + 120, Math.max(collapsed + 120, H - 150));
      const expanded = clamp(Math.round(H * 0.72), half + 40, Math.max(half + 40, H - 110));
      return { collapsed, half, expanded };
    }
    function layout() {
      if (!inst.active) return;
      const h = heights();
      // com o teclado aberto e o foco fora da folha (ex.: editando uma célula), a folha encolhe para não esconder o campo
      const eff = kb > 0 && !sheet.contains(document.activeElement) ? "collapsed" : inst.state;
      sheet.style.setProperty("--sh-h", h[eff] + "px");
      document.documentElement.style.setProperty("--sh-open", h[eff] + "px"); document.documentElement.classList.add("sh-has");
      sheet.dataset.state = inst.state;
      btnUp.disabled = inst.state === "expanded";
      btnDown.disabled = inst.state === "collapsed";
      handle.setAttribute("aria-expanded", String(inst.state !== "collapsed"));
    }
    function setState(s, persist = true) {
      if (!STATES.includes(s)) return;
      inst.state = s; if (persist) writePref(id, s);
      layout();
    }
    function reveal(key, min = "half") {
      const p = panes.get(key); if (!p || !inst.active) return;
      if (inst.tab !== key) p.tab.click();
      if (STATES.indexOf(inst.state) < STATES.indexOf(min)) setState(min, false); // abre sem gravar como preferência
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
      drag = { y: e.clientY, h0: h[inst.state], h, moved: false, t: performance.now() };
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
    function show(key, { expand = true } = {}) {
      if (!panes.has(key)) return;
      inst.tab = key;
      panes.forEach((p, k) => {
        p.tab.classList.toggle("is-on", k === key);
        p.tab.setAttribute("aria-selected", String(k === key));
        if (!native) p.pane.hidden = k !== key;
      });
      if (expand && inst.state === "collapsed") setState("half");
      const cb = tabs.find((t) => t.key === key).onShow; if (cb) cb();
    }
    tabsEl.addEventListener("click", (e) => {
      const b = e.target.closest(".sh-tab"); if (!b) return;
      const key = b.dataset.shTab;
      if (key === inst.tab && inst.state !== "collapsed") { if (native) return; setState("collapsed"); return; }
      if (!native) show(key);
      else { // a ferramenta troca o painel pelo atributo data-tab; aqui só cuidamos da folha
        inst.tab = key; panes.forEach((p, k) => { p.tab.classList.toggle("is-on", k === key); p.tab.setAttribute("aria-selected", String(k === key)); });
        if (inst.state === "collapsed") setState("half");
      }
    });
    if (native) {
      // quando a ferramenta muda de aba sozinha, a folha acompanha
      ws.addEventListener("click", (e) => { const t = e.target.closest("[data-tab]:not(.sh-tab)"); if (t && inst.active) { inst.tab = t.dataset.tab; panes.forEach((p, k) => p.tab.classList.toggle("is-on", k === inst.tab)); } });
    }

    /* ---------- teclado: o campo ativo precisa continuar visível ---------- */
    sheet.addEventListener("focusin", (e) => {
      const el = e.target; if (!el.matches || !el.matches("input,textarea,select,[contenteditable]")) return;
      if (inst.state === "collapsed") setState("half", false);
      setTimeout(() => { try { el.scrollIntoView({ block: "nearest", behavior: reduce.matches ? "auto" : "smooth" }); } catch (_) { /* sem suporte */ } }, 250);
    });

    /* ---------- montar / desmontar conforme a largura ---------- */
    function adopt(node) { if (!node || moved.some((m) => m.node === node)) return; moved.push({ node, parent: node.parentNode, next: node.nextSibling }); }
    function mount() {
      if (inst.active) return;
      inst.active = true;
      panes.forEach((p) => {
        const nodes = p.spec.nodes ? p.spec.nodes() : [];
        nodes.forEach((n) => { adopt(n); p.pane.appendChild(n); });
        if (p.spec.pane) adopt(p.spec.pane);
        bodyEl.appendChild(p.pane);
      });
      host.appendChild(sheet);
      sheet.hidden = false;
      ws.classList.add("sh-on");
      inst.state = readPref(id, defaultState);
      show(inst.tab, { expand: false });
      if (native) { const t = panes.get(inst.tab).tab; t.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
      layout();
      requestAnimationFrame(layout);
    }
    function unmount() {
      if (!inst.active) return;
      inst.active = false;
      // devolve na ordem inversa para manter a posição original
      for (let i = moved.length - 1; i >= 0; i--) { const m = moved[i]; if (m.parent) m.parent.insertBefore(m.node, m.next && m.next.parentNode === m.parent ? m.next : null); }
      moved.length = 0;
      panes.forEach((p) => { if (p.spec.pane) p.pane.hidden = false; });
      sheet.hidden = true; sheet.remove();
      document.documentElement.style.removeProperty("--sh-open"); if (!all.some((x) => x !== inst && x.active)) document.documentElement.classList.remove("sh-has");
      ws.classList.remove("sh-on");
      if (native) { ws.querySelectorAll(".im-pane").forEach((p, i) => { p.hidden = i !== 0; }); ws.querySelectorAll(".im-tabs button").forEach((b, i) => b.classList.toggle("is-on", i === 0)); }
    }
    function apply() { if (mq.matches) mount(); else unmount(); }
    mq.addEventListener("change", apply);
    window.addEventListener("resize", () => { if (inst.active) layout(); });
    window.addEventListener("orientationchange", () => setTimeout(layout, 250));
    new ResizeObserver(() => { if (inst.active) layout(); }).observe(host);
    apply();
    return inst;
  }

  C.shell = { create, STATES, syncKeyboard };
})();
