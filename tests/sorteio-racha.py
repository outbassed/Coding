"""Teste de toque (emulação) — sorteio-racha. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/sorteio-racha.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append((n,ok)); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
def rect(pg,sel): return pg.evaluate("s=>{const b=document.querySelector(s).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]}",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/sorteio"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+"draw-new-1.png")
    w=rect(pg,"#drWheel"); sh=rect(pg,"#drawWs .sh-sheet")
    chk("Roleta visível acima da folha", w[3]<=sh[1]+1 and w[3]-w[1]>=140, (w,sh))
    chk("Roleta tem nomes de exemplo (lista pronta)", pg.input_value("#drNames").startswith("Ana"), pg.input_value("#drNames")[:12])
    pg.tap("#drSpin"); pg.wait_for_timeout(6500)
    res=pg.inner_text("#drResult")
    chk("Girou e mostrou um resultado", len(res.strip())>0, res)
    pg.tap('#drawWs .sh-tab[data-sh-tab="part"]'); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT+"draw-new-part.png")
    chk("Roleta continua visível com a folha aberta", rect(pg,"#drWheel")[3]-rect(pg,"#drWheel")[1]>=100, rect(pg,"#drWheel"))
    pg.tap('#drawWs .sh-tab[data-sh-tab="hist"]'); pg.wait_for_timeout(300)
    chk("Histórico lista quem saiu", "já saíram" in pg.inner_text("#drWinners").lower(), pg.inner_text("#drWinners")[:30])
    pg.tap('#drWinners .chip'); pg.wait_for_timeout(300)
    chk("Limpar histórico mostra Desfazer limpeza", "Desfazer limpeza" in pg.inner_text("#drWinners"))
    pg.tap('#drWinners .chip'); pg.wait_for_timeout(300)
    chk("Desfazer limpeza restaura o histórico", "já saíram" in pg.inner_text("#drWinners").lower())
    # modo times
    pg.tap('#drawWs [data-dt="teams"]'); pg.wait_for_timeout(500)
    pg.tap("#drTeamGo"); pg.wait_for_timeout(500)
    chk("Times sorteados com exemplo", pg.locator("#drTeams .fn-team").count()>=2, pg.locator("#drTeams .fn-team").count())
    gb=rect(pg,"#drTeamGo"); sh=rect(pg,"#drawWs .sh-sheet")
    chk("Botão Sortear times acima da folha", gb[3]<=sh[1]+1, (gb,sh))
    pg.screenshot(path=OUT+"draw-new-teams.png")
    # dado/moeda/numero
    for m,btn in [("dice","#drRoll"),("coin","#drFlip"),("num","#drNumGo")]:
        pg.tap('#drawWs [data-dt="%s"]'%m); pg.wait_for_timeout(400); pg.tap(btn); pg.wait_for_timeout(1500)
    chk("Número sorteado", pg.inner_text("#drNums").strip()!="?", pg.inner_text("#drNums"))
    # Racha
    pg.goto("http://localhost:8766/#/novo/racha"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+"split-new-1.png")
    chk("Racha: exemplo calculado (R$ 66,00 cada = 240 + 10%)", "66,00" in pg.inner_text("#spEach"), pg.inner_text("#spEach"))
    pg.tap('#splitWs [data-st="items"]'); pg.wait_for_timeout(500)
    chk("Racha por itens: 6 itens de exemplo", pg.locator("#spItems .fn-item").count()==6, pg.locator("#spItems .fn-item").count())
    pg.tap('#splitWs .sh-tab[data-sh-tab="items"]'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT+"split-new-items.png")
    res=pg.inner_text("#spResult")
    print(res.replace("\n"," | "))
    # soma em centavos
    import re
    vals=[int(x.replace(".","").replace(",","")) for x in re.findall(r"R\$\s*([\d.]+,\d{2})",res)]
    print("valores",vals)
    chk("Sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    chk("Sem erros no console", not errs, errs[:3])
    b.close()
print(sum(1 for _,o in R if o),"/",len(R))
