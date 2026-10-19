"""Teste de toque (emulação) — imagens-exemplo. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/imagens-exemplo.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append(ok); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
docs="Object.values(Coding.lib.docs).filter(d=>!d.draft).length"
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/imagens"); pg.wait_for_timeout(1200)
    pg.tap("#imgSample"); pg.wait_for_timeout(3000)
    pg.screenshot(path=OUT+"img-sample.png")
    chk("Exemplo abre sem criar documento", pg.evaluate(docs)==0, pg.evaluate(docs))
    pg.wait_for_timeout(2500)
    chk("Continua sem documento após 2,5 s", pg.evaluate(docs)==0, pg.evaluate(docs))
    n=pg.evaluate("document.querySelector('#imgSample')?document.querySelector('#imgSample').offsetParent!==null:false")
    chk("Estado vazio some ao abrir exemplo", not n)
    # edição real: tocar no texto da imagem e mudar o texto
    pg.tap('#imagesWs .sh-tab[data-tab="text"]') if pg.locator('#imagesWs .sh-tab[data-tab="text"]').count() else None
    pg.evaluate("document.querySelector('#imText').value")
    ok=pg.evaluate("""(()=>{const t=document.querySelector('#imText');return !!t})()""")
    # adicionar texto novo = primeira edição
    tabs=pg.eval_on_selector_all("#imagesWs .sh-tab","e=>e.map(x=>x.dataset.tab||x.dataset.shTab)")
    print("abas:",tabs)
    pg.tap('#imagesWs .sh-tab[data-tab="text"]') if "text" in tabs else None
    pg.wait_for_timeout(300)
    btn=pg.locator('#imagesWs .im-clone[data-add="text"]')
    btn.first.tap(); pg.wait_for_timeout(1500)
    chk("Primeira edição real cria documento independente", pg.evaluate(docs)==1, pg.evaluate(docs))
    cnt=pg.evaluate("Object.values(Coding.lib.docs).filter(d=>!d.draft)[0].state.objects.length")
    chk("Documento guardado tem 3 camadas (2 do exemplo + 1 nova)", cnt==3, cnt)
    # recarregar e confirmar que abre
    pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_timeout(2500)
    pg.goto("http://localhost:8766/#/ferramentas/imagens"); pg.wait_for_timeout(2500)
    objs=pg.evaluate("Object.values(Coding.lib.docs).filter(d=>!d.draft).map(d=>d.state.objects.length)")
    chk("Documento persiste após recarregar", objs==[3], objs)
    # segundo exemplo sem editar, sair => nada salvo
    pg.goto("http://localhost:8766/#/novo/imagens"); pg.wait_for_timeout(1500)
    pg.tap("#imgSample"); pg.wait_for_timeout(3000)
    pg.goto("http://localhost:8766/#/"); pg.wait_for_timeout(1500)
    chk("Exemplo intocado não vira documento ao sair", pg.evaluate(docs)==1, pg.evaluate(docs))
    chk("Sem erros no console", not errs, errs)
print(sum(R),"/",len(R))
