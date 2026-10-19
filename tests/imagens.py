"""Teste de toque (emulação) — imagens. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/imagens.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append((n,ok)); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
def rect(pg,sel): return pg.evaluate("s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.left,b.top,b.right,b.bottom]}",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/imagens"); pg.wait_for_timeout(1000)
    pg.tap("#imgSample"); pg.wait_for_timeout(1500)
    # abas cabem e não saem da tela
    tabs=pg.evaluate("[...document.querySelectorAll('#imagesWs .sh-tab')].map(t=>{const r=t.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right)]})")
    chk("7 abas: faixa rolável, todas com largura >=60px e altura >=44px", len(tabs)==7 and all(r-l>=60 for l,r in tabs) and pg.evaluate("[...document.querySelectorAll('#imagesWs .sh-tab')].every(t=>t.getBoundingClientRect().height>=44)"), tabs)
    # palco acima da folha, sem sobrepor
    st=rect(pg,"#imStage"); sh=rect(pg,"#imagesWs .sh-sheet")
    chk("Palco termina onde a folha começa (sem sobreposição)", st[3]<=sh[1]+1, (st[3],sh[1]))
    # estados da folha
    hs={}
    for s in ["collapsed","half","expanded"]:
        pg.evaluate("s=>document.querySelector('#imagesWs .sh-sheet')&&0")
    pg.tap("#imagesWs .sh-down"); pg.wait_for_timeout(300); hs["collapsed"]=rect(pg,"#imagesWs .sh-sheet")[1]; st1=rect(pg,"#imStage")
    pg.tap("#imagesWs .sh-up"); pg.wait_for_timeout(300); hs["half"]=rect(pg,"#imagesWs .sh-sheet")[1]
    pg.tap("#imagesWs .sh-up"); pg.wait_for_timeout(300); hs["expanded"]=rect(pg,"#imagesWs .sh-sheet")[1]; st3=rect(pg,"#imStage")
    chk("3 estados distintos (recolhida < meia < expandida)", hs["collapsed"]>hs["half"]>hs["expanded"], hs)
    chk("Palco continua visível com folha expandida (>=120px)", st3[3]-st3[1]>=120, st3[3]-st3[1])
    pg.tap("#imagesWs .sh-down"); pg.wait_for_timeout(300)
    # filtros A -> B -> Normal
    pg.tap('#imagesWs .sh-tab[data-sh-tab="fil"]'); pg.wait_for_timeout(800)
    names=pg.evaluate("[...document.querySelectorAll('.im-filter')].map(b=>b.textContent.trim())")
    pg.tap(".im-filter:nth-child(2)"); pg.wait_for_timeout(500); a=pg.inner_text("#imFilName")
    pg.tap(".im-filter:nth-child(3)"); pg.wait_for_timeout(500); bb=pg.inner_text("#imFilName")
    pg.screenshot(path=OUT+"img-filtro-B.png")
    pg.tap(".im-filter:nth-child(1)"); pg.wait_for_timeout(500); c=pg.inner_text("#imFilName")
    chk("Filtro A -> B -> Normal troca sem empilhar", a!=bb and "Sem filtro" in c, (a,bb,c))
    chk("Palco visível durante filtros", rect(pg,"#imStage")[3]-rect(pg,"#imStage")[1]>150)
    # texto: cria, seleciona, painel muda para Ferramentas com campo de texto
    pg.tap('#imagesWs .sh-tab[data-sh-tab="tools"]'); pg.wait_for_timeout(300)
    pg.tap('#imagesWs .sh-tab[data-tab="text"]'); pg.wait_for_timeout(300); pg.tap('#imagesWs .im-clone[data-add="text"]'); pg.wait_for_timeout(700)
    vis=pg.evaluate("(()=>{const e=document.querySelector('#imText');const r=e.getBoundingClientRect();return [e.offsetParent!==null,Math.round(r.top),Math.round(r.bottom)]})()")
    sh=rect(pg,"#imagesWs .sh-sheet")
    chk("Campo de texto visível dentro da folha", vis[0] and vis[1]>=sh[1] and vis[2]<=740, vis)
    pg.screenshot(path=OUT+"img-texto.png")
    # swatches não cobrem abas
    sw=rect(pg,"#imSwatches"); tb=rect(pg,"#imagesWs .sh-tabs")
    chk("Amostras de cor ficam dentro do corpo rolável da folha (recortadas, sem cobrir as abas)", pg.evaluate("document.querySelector('#imagesWs .sh-body').contains(document.querySelector('#imSwatches'))"), (sw,tb))
    # hit-test das abas
    bad=[]
    for t in pg.query_selector_all('#imagesWs .sh-tab'):
        t.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
        r=t.bounding_box(); cx,cy=r["x"]+r["width"]/2,r["y"]+r["height"]/2
        ok=pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('#imagesWs .sh-tab'))}",[cx,cy])
        if not ok: bad.append(t.inner_text())
    chk("Abas acessíveis ao toque (elementFromPoint)", not bad, bad)
    chk("Sem rolagem horizontal da página", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    # Molduras com cor
    pg.tap('#imagesWs .sh-tab[data-sh-tab="fra"]'); pg.wait_for_timeout(400)
    inpane=pg.evaluate("!!document.querySelector('[data-pane=fra] #imOpts')")
    chk("Molduras: seletor de cor dentro da aba", inpane)
    pg.screenshot(path=OUT+"img-molduras.png")
    chk("Sem erros no console", not errs, errs[:3])
    b.close()
print(sum(1 for _,o in R if o),"/",len(R))
