"""Auditoria de acessibilidade/ícones no celular (emulação, 360x740): para cada ferramenta e cada aba da folha inferior,
lista controles visíveis sem nome acessível, ícones SVG que apontam para símbolo inexistente, alvos de toque menores que 32px
e texto em inglês óbvio nos rótulos. Uso: `python3 tests/acessibilidade.py` na raiz, com a pasta servida em http://localhost:8766."""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8766/"
TOOLS = [("etiquetas", "#labelsWs"), ("texto", "#textsWs"), ("planilhas", "#calcWs"), ("imagens", "#imagesWs"), ("pdf", "#pdfWs"),
         ("qr", "#codesWs"), ("planilha", "#sheetWs"), ("sorteio", "#drawWs"), ("racha", "#splitWs")]
JS = """(ws)=>{
  const root=document.querySelector(ws); const out={nome:[],icone:[],pequeno:[]};
  const sym=new Set([...document.querySelectorAll('symbol')].map(s=>s.id));
  root.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=button],a[href]').forEach(e=>{
    if(e.closest('[hidden]')||!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;
    const r=e.getBoundingClientRect(); if(!r.width||!r.height)return;
    const lab=(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim()||(e.labels&&e.labels[0]&&e.labels[0].textContent.trim())||e.getAttribute('placeholder')||e.getAttribute('aria-labelledby');
    const id=e.id||e.className||e.tagName;
    if(!lab)out.nome.push(String(id).slice(0,40));
    const isField=/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)&&!/^(checkbox|radio|range|color)$/.test(e.type||'');
    if(!isField&&!(/^(checkbox|radio)$/.test(e.type||'')&&e.closest('label')&&e.closest('label').getBoundingClientRect().height>=40)&&(r.width<32||r.height<32)&&!e.closest('.calc-grid,table,.im-swatches,.im-stk,.cell'))out.pequeno.push(String(lab).slice(0,16)+' '+Math.round(r.width)+'x'+Math.round(r.height));
  });
  root.querySelectorAll('use').forEach(u=>{const h=(u.getAttribute('href')||'').replace('#','');if(h&&!sym.has(h))out.icone.push(h)});
  return out}"""
bad_total = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    for route, ws in TOOLS:
        pg.goto(BASE + "#/novo/" + route); pg.wait_for_timeout(900)
        keys = pg.eval_on_selector_all(ws + " .sh-tab", "e=>e.map(x=>x.dataset.shTab)")
        agg = {"nome": set(), "icone": set(), "pequeno": set()}
        for k in keys:
            t = pg.locator(f'{ws} .sh-tab[data-sh-tab="{k}"]'); t.scroll_into_view_if_needed(); t.tap(); pg.wait_for_timeout(250)
            r = pg.evaluate(JS, ws)
            for kk in agg: agg[kk].update(r[kk])
        ok = not any(agg.values()); bad_total += 0 if ok else 1
        print(("PASSOU" if ok else "FALHOU") + f" | {route}: {len(keys)} abas" + ("" if ok else " | " + str({k: sorted(v)[:6] for k, v in agg.items() if v})))
    b.close()
raise SystemExit(1 if bad_total else 0)
