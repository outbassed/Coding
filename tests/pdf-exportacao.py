"""Teste de toque (emulação) — pdf-exportacao. Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/pdf-exportacao.py` na raiz do projeto.
Variável opcional CAPTURAS = pasta para salvar as capturas de tela."""
from playwright.sync_api import sync_playwright
OUT=__import__("os").environ.get("CAPTURAS","/tmp/")
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":360,"height":740},device_scale_factor=2,has_touch=True,is_mobile=True,accept_downloads=True)
    pg=ctx.new_page()
    pg.goto("http://localhost:8766/#/novo/pdf"); pg.wait_for_timeout(1200)
    pg.tap("#pdfSample"); pg.wait_for_timeout(3000)
    # full export (no selection) -> 3 pages
    pg.tap('#pdfWs .sh-tab[data-sh-tab="exp"]'); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.tap("#pdfDownload") if pg.locator("#pdfDownload").is_visible() else pg.tap("#pdfWs .sh-sheet .btn.primary")
    path=d.value.path(); data=open(path,"rb").read()
    import pypdf; print("paginas exportadas:", len(pypdf.PdfReader(path).pages))
    pg.tap('#pdfWs .sh-tab[data-sh-tab="ann"]'); pg.wait_for_timeout(300)
    pg.tap("#pdfGrid .pdf-card:nth-child(1)"); pg.tap("#pdfAnnot"); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+"pdf-editor-wrap.png")
    print(pg.evaluate("(()=>{const b=document.querySelector('.pdf-ebar').getBoundingClientRect();const c=document.querySelector('#pdfOver').getBoundingClientRect();return [b.height,c.top,c.height]})()"))
