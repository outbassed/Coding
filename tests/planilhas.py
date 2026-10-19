"""Teste de toque (emulação) — planilhas. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/planilhas.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append((n,ok)); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/planilhas"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+"calc-new-1.png")
    g=pg.evaluate("(()=>{const r=e=>{const b=document.querySelector(e).getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom)]};return {grid:r('#calcScroll'),sheet:r('#calcWs .sh-sheet'),fbar:r('.calc-fbar')}})()")
    print(g)
    chk("Grade ocupa mais de 50% da altura com folha recolhida", (g["grid"][1]-g["grid"][0])>370, g["grid"])
    pg.tap('#calcWs .sh-tab[data-sh-tab="fmt"]'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT+"calc-new-fmt.png")
    # selecionar B6 (toque), digitar e formatar
    pg.tap('#calcWs .sh-down'); pg.wait_for_timeout(300)
    errs_before=len(errs)
    cell=pg.locator("#calcTable tbody tr:nth-child(6) td:nth-child(3)")
    cell.tap(); pg.wait_for_timeout(200)
    chk("Endereço mostra B6", pg.input_value("#calcCell")=="B6", pg.input_value("#calcCell"))
    pg.tap('#calcWs .sh-tab[data-sh-tab="edit"]'); pg.wait_for_timeout(400)
    pg.tap('[data-act="edit"]'); pg.wait_for_timeout(300)
    pg.keyboard.type("123"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    chk("Editar via botão grava o valor em B6", pg.inner_text("#calcTable tbody tr:nth-child(6) td:nth-child(3)").strip()=="123")
    pg.tap('#calcWs .sh-tab[data-sh-tab="fmt"]'); pg.wait_for_timeout(300)
    pg.locator("#calcTable tbody tr:nth-child(6) td:nth-child(3)").tap(); pg.wait_for_timeout(200)
    pg.tap('[data-act="bold"]'); pg.wait_for_timeout(200)
    fw=pg.evaluate("getComputedStyle(document.querySelector('#calcTable tbody tr:nth-child(6) td:nth-child(3)')).fontWeight")
    chk("Negrito aplicado pela folha", int(fw)>=600, fw)
    pg.tap('[data-pal="bg"]'); pg.wait_for_timeout(400)
    r=pg.evaluate("(()=>{const e=document.querySelector('#calcPop');const b=e.getBoundingClientRect();return {hidden:e.hidden,l:Math.round(b.left),t:Math.round(b.top),r:Math.round(b.right),b:Math.round(b.bottom)}})()")
    chk("Paleta de cor abre dentro da tela", (not r["hidden"]) and r["l"]>=0 and r["r"]<=360 and r["t"]>=0 and r["b"]<=740, r)
    pg.screenshot(path=OUT+"calc-new-palette.png")
    pg.keyboard.press("Escape")
    pg.tap('[data-act="undo"]') if False else None
    chk("Sem rolagem horizontal da página", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    chk("Sem erros no console", not errs, errs[:3])
    b.close()
print(sum(1 for _,o in R if o),"/",len(R))
