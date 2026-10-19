"""Simula o teclado virtual do Android (a janela encolhe quando o teclado abre) com campos de texto de verdade.
É emulação: não é um teclado real de aparelho. Uso: `python3 tests/teclado.py` na raiz, com a pasta servida em http://localhost:8766."""
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8766/"
R = []
def chk(n, ok, d=""):
    R.append(ok); print(("PASSOU" if ok else "FALHOU") + " | " + n + (" | " + str(d)[:140] if d else ""))
def inview(pg, sel):
    return pg.evaluate("""s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom),innerHeight]}""", sel)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    # Texto: digitar com o teclado aberto; o cursor continua visível
    pg.goto(BASE + "#/novo/texto"); pg.wait_for_timeout(1200)
    pg.locator("#txEditor").tap()
    pg.set_viewport_size({"width": 360, "height": 400}); pg.wait_for_timeout(400)
    for i in range(40): pg.keyboard.type("Linha de teste número %d com texto comprido para quebrar. " % i); pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    caret = pg.evaluate("""()=>{const s=getSelection();const r=s.getRangeAt(0).cloneRange();r.collapse(false);let b=r.getClientRects()[0]||r.startContainer.getBoundingClientRect?.call(r.startContainer);const sc=document.querySelector('#txScroll').getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom),Math.round(sc.top),Math.round(sc.bottom)]}""")
    chk("Texto: cursor visível dentro da área de rolagem com teclado aberto (janela 360x400)", caret[0] >= caret[2] - 2 and caret[1] <= caret[3] + 2, caret)
    sh = pg.evaluate("document.querySelector('#textsWs .sh-sheet').getBoundingClientRect().bottom")
    chk("Texto: folha inferior cabe na janela encolhida", sh <= 401, sh)
    pg.set_viewport_size({"width": 360, "height": 740}); pg.wait_for_timeout(300)
    # Imagens: campo de texto da folha visível com teclado
    pg.goto(BASE + "#/novo/imagens"); pg.wait_for_timeout(1200)
    pg.tap("#imgSample"); pg.wait_for_timeout(2500)
    pg.tap('#imagesWs .sh-tab[data-tab="text"]'); pg.wait_for_timeout(300)
    pg.tap('#imagesWs .im-clone[data-add="text"]'); pg.wait_for_timeout(600)
    pg.set_viewport_size({"width": 360, "height": 420}); pg.wait_for_timeout(500)
    r = inview(pg, "#imText"); st = inview(pg, "#imStage")
    chk("Imagens: campo de texto visível com teclado (janela 360x420)", r and r[0] >= 0 and r[1] <= r[2] + 1, r)
    chk("Imagens: palco ainda visível (>=60px)", st and (st[1] - st[0]) >= 60, st)
    pg.set_viewport_size({"width": 360, "height": 740}); pg.wait_for_timeout(300)
    # Planilhas: editar célula com teclado, célula e barra de fórmula visíveis
    pg.goto(BASE + "#/novo/planilhas"); pg.wait_for_timeout(1200)
    pg.set_viewport_size({"width": 360, "height": 420}); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('#calcFormula, #calcInput') && document.querySelector('#calcFormula, #calcInput').focus()")
    gr = inview(pg, "#calcScroll")
    chk("Planilhas: grade ainda visível com janela encolhida (>=80px)", gr and (gr[1] - gr[0]) >= 80, gr)
    chk("Sem erros no console", not errs, errs)
    print("PULADO | teclado real de iOS/Android e visualViewport com deslocamento (exige aparelho físico)")
print(sum(R), "/", len(R))
