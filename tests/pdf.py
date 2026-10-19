"""Teste de toque (emulação) — pdf. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/pdf.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
import subprocess, json
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
R=[]
def chk(n,ok,d=""): R.append((n,ok)); print(("PASSOU" if ok else "FALHOU")+" | "+n+(" | "+str(d) if d else ""))
def rect(pg,sel): return pg.evaluate("s=>{const b=document.querySelector(s).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]}",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True,accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8766/#/novo/pdf"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+"pdf-new-empty.png")
    chk("Estado vazio oferece Abrir arquivo e Começar com exemplo", pg.locator("#pdfSample").is_visible() and pg.locator("#pdfEmptyOpen").is_visible())
    # abrir exemplo OFFLINE
    pg.goto("http://localhost:8766/"); pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(2500)
    ctx.set_offline(True)
    pg.goto("http://localhost:8766/#/novo/pdf"); pg.wait_for_timeout(1000)
    pg.tap("#pdfSample"); pg.wait_for_timeout(3500)
    n=pg.locator("#pdfGrid .pdf-card").count()
    chk("Exemplo abre OFFLINE com 3 páginas", n==3, n)
    docs=pg.evaluate("Object.values(Coding.lib.docs).filter(d=>!d.draft).length")
    chk("Só ver o exemplo não cria documento salvo", docs==0, docs)
    pg.screenshot(path=OUT+"pdf-new-sample.png")
    gr=rect(pg,"#pdfMain"); sh=rect(pg,"#pdfWs .sh-sheet")
    chk("Grade de páginas acima da folha", gr[3]<=sh[1]+1, (gr,sh))
    # selecionar página 1, girar, anotar com texto
    pg.tap("#pdfGrid .pdf-card:nth-child(1)"); pg.wait_for_timeout(300)
    pg.tap('#pdfWs .sh-tab[data-sh-tab="org"]'); pg.wait_for_timeout(300)
    pg.tap("#pdfRotR"); pg.wait_for_timeout(800)
    docs=pg.evaluate("Object.values(Coding.lib.docs).filter(d=>!d.draft).length")
    chk("Primeira edição (girar) cria o documento salvo", docs==1, docs)
    pg.tap("#pdfRotL"); pg.wait_for_timeout(500)
    pg.tap('#pdfWs .sh-tab[data-sh-tab="ann"]'); pg.wait_for_timeout(300)
    pg.tap("#pdfAnnot"); pg.wait_for_timeout(1500)
    chk("Editor de anotação abriu", not pg.evaluate("document.querySelector('#pdfEditor').hidden"))
    pg.screenshot(path=OUT+"pdf-new-editor.png")
    pg.tap('#pdfEditor [data-tool="text"]'); pg.wait_for_timeout(200)
    box=pg.locator("#pdfOver").bounding_box()
    pg.touchscreen.tap(box["x"]+box["width"]*0.4, box["y"]+box["height"]*0.7); pg.wait_for_timeout(500)
    pg.keyboard.type("Aprovado em teste"); pg.wait_for_timeout(200)
    pg.tap("#pdfEdDone"); pg.wait_for_timeout(800)
    badge=pg.locator("#pdfGrid .pdf-card .badge").count()
    chk("Página mostra emblema de anotação", badge==1, badge)
    # exportar
    pg.tap('#pdfWs .sh-tab[data-sh-tab="exp"]'); pg.wait_for_timeout(300)
    with pg.expect_download(timeout=20000) as dl:
        pg.tap("#pdfDownload")
    d=dl.value; path="/tmp/claude-0/-home-claude/5f722390-1482-5bfc-b284-53d2acd6956f/scratchpad/baseline/saida.pdf"; d.save_as(path)
    info=subprocess.run(["pdfinfo",path],capture_output=True,text=True).stdout
    txt=subprocess.run(["pdftotext","-f","1","-l","1",path,"-"],capture_output=True,text=True).stdout
    chk("PDF exportado é da seleção legível com 1 página", "Pages:           1" in info, info.split("Pages:")[1].split("\n")[0].strip() if "Pages:" in info else info[:80])
    chk("Texto anotado aparece na página 1 do PDF exportado", "Aprovado em teste" in txt, txt.strip().splitlines()[-3:] )
    chk("Sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    chk("Sem erros no console", not errs, errs[:3])
    ctx.set_offline(False); b.close()
print(sum(1 for _,o in R if o),"/",len(R))
