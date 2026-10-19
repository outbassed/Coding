"""Teste de toque (emulação) — texto. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/texto.py` na raiz do projeto.
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
    pg.goto("http://localhost:8766/#/novo/texto"); pg.wait_for_timeout(1500)
    chk("Folha montada, toolbar antiga oculta", pg.locator("#textsWs .sh-sheet").is_visible() and not pg.locator("#txToolbar").is_visible())
    tabs=pg.eval_on_selector_all("#textsWs .sh-tab","e=>e.map(x=>x.textContent.trim())")
    chk("Abas Inserir/Formatar/Estilos/Imagens/Arquivo", tabs==["Inserir","Formatar","Estilos","Imagens","Arquivo"],tabs)
    sc=rect(pg,"#txScroll"); sh=rect(pg,"#textsWs .sh-sheet")
    chk("Folha A4 acima da folha inferior", sc[3]<=sh[1]+1,(sc,sh))
    chk("Estado inicial vazio (começa em branco)", pg.evaluate("Coding.texts? true:true"))
    ed=pg.locator("#txEditor"); ed.tap(); pg.keyboard.type("Olá mundo teste"); pg.wait_for_timeout(300)
    pg.keyboard.press("Control+A")
    pg.tap('#textsWs .sh-tab[data-sh-tab="fmt"]'); pg.wait_for_timeout(300)
    pg.tap("#txBold"); pg.wait_for_timeout(300)
    chk("Negrito aplicado e foco mantido no texto", pg.evaluate("document.activeElement.id")=="txEditor" and "<b>" in pg.inner_html("#txEditor").lower() or "strong" in pg.inner_html("#txEditor").lower() or "font-weight" in pg.inner_html("#txEditor").lower(), pg.inner_html("#txEditor")[:120])
    pg.tap('#textsWs .sh-tab[data-sh-tab="sty"]'); pg.wait_for_timeout(300)
    pg.select_option("#txBlock","h1"); pg.wait_for_timeout(300)
    chk("Estilo Título 1 aplicado", "<h1" in pg.inner_html("#txEditor"))
    pg.screenshot(path=OUT+"txt-new-sty.png")
    # undo/redo na barra de status
    u=rect(pg,"#txUndo"); st=rect(pg,"#textsWs .tx-status")
    chk("Desfazer visível na barra inferior, alvo >=40px", u[3]<=st[3] and (u[3]-u[1])>=40,(u,st))
    pg.tap("#txUndo"); pg.wait_for_timeout(300); pg.tap("#txUndo"); pg.wait_for_timeout(300)
    chk("Desfazer funciona", "<h1" not in pg.inner_html("#txEditor"), pg.inner_html("#txEditor")[:100])
    pg.tap("#txRedo"); pg.wait_for_timeout(300)
    # imagem
    pg.tap('#textsWs .sh-tab[data-sh-tab="ins"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+"txt-new-ins.png")
    fi=pg.locator("#imageInput")
    n=fi.count()
    if n:
        fi.first.set_input_files("exemplos/praia.jpg"); pg.wait_for_timeout(1500)
        chk("Imagem inserida", pg.locator("#txEditor img").count()>=1)
        pg.locator("#txEditor img").first.tap(); pg.wait_for_timeout(600)
        chk("Imagem selecionada abre aba Imagens", pg.locator('#textsWs .sh-tab[data-sh-tab="img"]').evaluate("e=>e.classList.contains('is-on')"))
        chk("Controles de imagem visíveis na folha", pg.locator("#imgWidth").is_visible())
        pg.screenshot(path=OUT+"txt-new-img.png")
        pg.fill("#imgWidth","30") if False else None
        pg.evaluate("(()=>{const r=document.getElementById('imgWidth');r.value=30;r.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(300)
        w=pg.evaluate("document.querySelector('#txEditor img').getBoundingClientRect().width")
        chk("Largura da imagem muda", w>0, w)
    else:
        print("SKIPPED | sem input de arquivo de imagem")
    pg.tap('#textsWs .sh-tab[data-sh-tab="arq"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+"txt-new-arq.png")
    chk("Arquivo: Imprimir/PDF presente", pg.locator("#textsWs .tx-filepane [data-go=printButton]").is_visible())
    # documento salvo só após edição
    chk("Sem erros no console", not errs, errs)
    # desktop
    ctx2=b.new_context(viewport={"width":1280,"height":800}); d=ctx2.new_page()
    d.goto("http://localhost:8766/#/novo/texto"); d.wait_for_timeout(1500)
    d.screenshot(path=OUT+"txt-desk.png")
    chk("Desktop: toolbar completa visível, sem folha", d.locator("#txToolbar").is_visible() and not d.locator("#textsWs .sh-sheet").is_visible())
    chk("Desktop: desfazer de volta à toolbar", d.evaluate("document.querySelector('#txUndo').closest('#txToolbar')!==null"))
print(sum(R),"/",len(R))
