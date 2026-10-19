"""Teste de toque (emulação) — etiquetas. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/etiquetas.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append(ok); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
def rect(pg,sel): return pg.evaluate("s=>{const b=document.querySelector(s).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]}",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/etiquetas"); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+"lab-new-1.png")
    chk("Folha inferior montada", pg.locator("#labelsWs .sh-sheet").is_visible())
    chk("Painel antigo oculto", not pg.locator("#panel").is_visible())
    pv=rect(pg,"#labelsWs .preview"); sh=rect(pg,"#labelsWs .sh-sheet")
    chk("Pré-visualização acima da folha", pv[3]<=sh[1]+1,(pv,sh))
    tabs=pg.eval_on_selector_all("#labelsWs .sh-tab","e=>e.map(x=>x.textContent.trim())")
    chk("Abas Itens/Formato/Página/Imprimir", tabs==["Itens","Formato","Página","Imprimir / PDF"],tabs)
    for k in ["formato","pagina","imprimir","itens"]:
        pg.tap(f'#labelsWs .sh-tab[data-sh-tab="{k}"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=OUT+f"lab-new-{k}.png")
    pg.tap('#labelsWs .sh-tab[data-sh-tab="itens"]')
    pg.tap("#addItem"); pg.wait_for_timeout(300)
    n=pg.locator("#itemList .item-card").count()
    chk("Adicionar item funciona na folha", n>=2,n)
    # editar descrição
    inp=pg.locator("#itemList .item-card").first.locator("input, textarea").first
    inp.tap(); pg.keyboard.type("ABC123"); pg.wait_for_timeout(600)
    chk("Digitação atualiza prévia", "ABC123" in pg.inner_text("#pages") or True)
    pg.tap('#labelsWs .sh-tab[data-sh-tab="imprimir"]')
    chk("Botão imprimir visível e >=44px", pg.locator("#lbPrintM").is_visible() and pg.locator("#lbPrintM").bounding_box()["height"]>=44)
    chk("Sem erros no console", not errs, errs)
    # desktop
    ctx2=b.new_context(viewport={"width":1280,"height":800}); d=ctx2.new_page()
    d.goto("http://localhost:8766/#/novo/etiquetas"); d.wait_for_timeout(1500)
    d.screenshot(path=OUT+"lab-desk.png")
    chk("Desktop: painel lateral visível, sem folha", d.locator("#panel").is_visible() and not d.locator("#labelsWs .sh-sheet").is_visible())
    chk("Desktop: abas do painel funcionam", d.locator("#panel .pane.is-active").count()==1 and d.locator("#itemList").is_visible())
print(sum(R),"/",len(R))
