"""PWA offline (v29): instala o service worker, corta a rede, recarrega e abre as 9 ferramentas; confere o cache novo e os arquivos novos.
Uso: `python3 tests/offline.py` na raiz, com a pasta servida em http://localhost:8766."""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8766/"
R = []
def chk(n, ok, d=""):
    R.append(ok); print(("PASSOU" if ok else "FALHOU") + " | " + n + (" | " + str(d)[:140] if d else ""))
ROUTES = [("etiquetas", "#labelsWs"), ("texto", "#textsWs"), ("planilhas", "#calcWs"), ("imagens", "#imagesWs"), ("pdf", "#pdfWs"),
          ("qr", "#codesWs"), ("planilha", "#sheetWs"), ("sorteio", "#drawWs"), ("racha", "#splitWs")]
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(3500)
    keys = pg.evaluate("caches.keys()")
    chk("Cache da versão atual criado (coding-cache-v29)", "coding-cache-v29" in keys, keys)
    cached = pg.evaluate("caches.open('coding-cache-v29').then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname))")
    for f in ["/shell.js", "/exemplos/exemplo.pdf", "/exemplos/praia.jpg", "/vendor/pdf.min.js", "/tool-fun.js"]:
        chk("No cache: " + f, f in cached)
    ctx.set_offline(True)
    pg.goto(BASE + "#/novo/etiquetas"); pg.reload(); pg.wait_for_timeout(1500)
    for route, ws in ROUTES:
        pg.goto(BASE + "#/novo/" + route); pg.wait_for_timeout(900)
        vis = pg.locator(ws + " .sh-sheet").first.is_visible()
        chk(f"Offline: {route} abre com a folha inferior", vis)
    pg.goto(BASE + "#/novo/pdf"); pg.wait_for_timeout(800); pg.tap("#pdfSample"); pg.wait_for_timeout(3500)
    chk("Offline: exemplo de PDF abre com 3 páginas", pg.locator("#pdfGrid .pdf-card").count() == 3)
    pg.goto(BASE + "#/novo/imagens"); pg.wait_for_timeout(800); pg.tap("#imgSample"); pg.wait_for_timeout(3000)
    chk("Offline: foto de exemplo abre com 2 camadas editáveis", pg.evaluate("Coding.lib && true") and pg.locator("#imWrap").is_visible())
    chk("Sem erros de JavaScript", not errs, errs)
print(sum(R), "/", len(R))
raise SystemExit(0 if all(R) else 1)
