"""Verificações do editor de Imagens (molduras em camadas, celular, opções básicas).
Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/imagens.py` (precisa de playwright e Pillow)."""
import io, json, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8766/"
R = []
def chk(name, ok, detail=""):
    R.append(bool(ok)); print(("PASSOU" if ok else "FALHOU") + " | " + name + (" | " + str(detail) if detail else ""))
def dims(pg): return pg.evaluate("[document.getElementById('imCv').width,document.getElementById('imCv').height]")
def export(pg, fmt="image/png"):
    pg.click('[data-tab=out]'); pg.select_option('#imFmt', fmt); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click('[data-im=download]')
    path = "/tmp/_imagens_test.out"; d.value.save_as(path); return Image.open(path).convert("RGBA")
def setv(pg, sel, v): pg.evaluate("(a)=>{const e=document.querySelector(a[0]);e.value=a[1];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}", [sel, str(v)])
def sample(pg):
    pg.goto(BASE + "#/novo/imagens"); pg.wait_for_timeout(700); pg.click("#imgSample"); pg.wait_for_timeout(2000)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1300, "height": 850}, accept_downloads=True); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    sample(pg); W0, H0 = dims(pg); pg.click("[data-tab=fra]")
    chk("Molduras: 7 tipos para adicionar", pg.locator(".im-fradd").count() == 7)
    pg.locator(".im-fradd").nth(0).click(); pg.wait_for_timeout(250)
    W1, H1 = dims(pg); chk("Borda cresce a tela e vira uma camada", W1 > W0 and pg.locator(".im-frrow").count() == 1, (W0, W1))
    pg.locator(".im-fradd").nth(0).click(); pg.wait_for_timeout(250)
    chk("Clicar de novo ADICIONA outra camada (não aplica por cima da foto)", pg.locator(".im-frrow").count() == 2 and dims(pg)[0] > W1)
    for _ in range(2): pg.locator(".im-frrow").nth(0).locator(".fr-btn.danger").click(); pg.wait_for_timeout(150)
    chk("Apagar as camadas devolve a foto intacta (mesmo tamanho)", dims(pg) == [W0, H0])
    pg.click("[data-im=undo]"); pg.wait_for_timeout(200); chk("Desfazer traz a camada de volta", pg.locator(".im-frrow").count() == 1)
    pg.click("[data-im=redo]"); pg.wait_for_timeout(200); chk("Refazer apaga de novo", pg.locator(".im-frrow").count() == 0)
    # opções próprias: borda vermelha de 10%
    pg.locator(".im-fradd").nth(0).click(); pg.wait_for_timeout(200)
    setv(pg, ".im-fropts input[type=color]", "#ff0000"); setv(pg, ".im-fropts input[type=range] >> nth=0", 10) if False else None
    pg.evaluate("(()=>{const e=document.querySelector('.im-fropts input[type=range]');e.value=10;e.dispatchEvent(new Event('input',{bubbles:true}))})()")
    pg.wait_for_timeout(300)
    img = export(pg); m = min(W0, H0); pad = round(m * 0.10)
    chk("Exportação: tamanho = foto + borda de 10% (opção da camada)", img.size == (W0 + 2 * pad, H0 + 2 * pad), (img.size, (W0 + 2 * pad, H0 + 2 * pad)))
    chk("Exportação: canto na cor escolhida (vermelho)", img.getpixel((3, 3))[:3] == (255, 0, 0), img.getpixel((3, 3)))
    pg.click("[data-tab=fra]")
    # ocultar camada
    pg.locator(".im-frrow").nth(0).locator(".fr-btn").first.click(); pg.wait_for_timeout(250)
    chk("Ocultar camada volta ao tamanho da foto", dims(pg) == [W0, H0])
    pg.locator(".im-frrow").nth(0).locator(".fr-btn").first.click(); pg.wait_for_timeout(250)
    # borda "por cima" não cresce
    pg.select_option(".im-fropts select >> nth=1", "in"); pg.wait_for_timeout(250)
    chk("Borda 'por cima da foto' não aumenta o tamanho", dims(pg) == [W0, H0])
    pg.locator(".im-frrow").nth(0).locator(".fr-btn.danger").click()
    # círculo: quadrado + transparente
    pg.locator(".im-fradd").nth(3).click(); pg.wait_for_timeout(250)
    chk("Círculo corta em quadrado", dims(pg) == [min(W0, H0)] * 2, dims(pg))
    img = export(pg); chk("Círculo: canto transparente no PNG", img.getpixel((2, 2))[3] == 0 and img.getpixel((img.width // 2, img.height // 2))[3] == 255)
    pg.click("[data-tab=fra]"); pg.locator(".im-frrow").nth(0).locator(".fr-btn.danger").click()
    # fundo desfocado 9:16
    pg.locator(".im-fradd").nth(5).click(); pg.wait_for_timeout(200); pg.select_option(".im-fropts select >> nth=0", "9:16"); pg.wait_for_timeout(300)
    d = dims(pg); chk("Fundo desfocado 9:16 tem proporção de story", abs(d[0] / d[1] - 9 / 16) < 0.01, d)
    pg.locator(".im-frrow").nth(0).locator(".fr-btn.danger").click()
    # persistência + ordem
    pg.locator(".im-fradd").nth(0).click(); pg.locator(".im-fradd").nth(4).click(); pg.wait_for_timeout(300)
    names = pg.eval_on_selector_all(".fr-name", "e=>e.map(x=>x.textContent.trim())")
    pg.locator(".im-frrow").nth(0).locator(".fr-btn >> nth=2").click(); pg.wait_for_timeout(200)  # desce a de fora (Vinheta)
    names2 = pg.eval_on_selector_all(".fr-name", "e=>e.map(x=>x.textContent.trim())")
    chk("Reordenar camadas", names == names2[::-1], (names, names2))
    pg.wait_for_timeout(2500); pg.reload(); pg.wait_for_timeout(2500)
    pg.click("[data-tab=fra]"); pg.wait_for_timeout(300)
    names3 = pg.eval_on_selector_all(".fr-name", "e=>e.map(x=>x.textContent.trim())")
    chk("Molduras ficam salvas, na mesma ordem, ao recarregar", names3 == names2 and dims(pg)[0] > W0, names3)
    chk("Sem erros no console (desktop)", not errs, errs[:2])
    # opções básicas
    sample(pg); pg.click("[data-add=text]"); pg.wait_for_timeout(200)
    pg.click("#imAlR"); pg.check("#imShadow"); setv(pg, "#imObjAlpha", 55)
    o = pg.evaluate("(()=>{const d=Object.values(Coding.lib.docs).pop();return null})()")
    pg.wait_for_timeout(2300)
    o = pg.evaluate("Object.values(Coding.lib.docs).map(d=>d.state.objects[0]).filter(Boolean)[0]")
    chk("Texto: alinhamento, sombra e opacidade salvos", o and o["align"] == "r" and o["shadow"] is True and abs(o["alpha"] - 0.55) < 0.01, o and {k: o[k] for k in ("align", "shadow", "alpha")})
    pg.click("[data-tab=adj]"); pg.click("[data-im=auto]"); pg.wait_for_timeout(500)
    chk("Melhorar automático aplica e dá para desfazer", pg.is_enabled("[data-im=undo]"))
    setv(pg, "#imSt", 6); pg.click("[data-im=stok]"); pg.wait_for_timeout(500)
    chk("Endireitar aplica e zera o controle", pg.input_value("#imSt") == "0")
    b.close()
    # --- celular ---
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 780}, has_touch=True, is_mobile=True, device_scale_factor=2); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    sample(pg)
    g = pg.evaluate("""()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.top,b.bottom]};return {c:r('.im-center'),t:r('.im-tools'),s:r('.im-side'),stage:r('.im-stage'),sw:document.documentElement.scrollWidth,iw:innerWidth}}""")
    chk("Celular: foto, ferramentas e abas em blocos separados (sem sobreposição)", g["c"][1] <= g["t"][0] + 1 and g["t"][1] <= g["s"][0] + 1, g)
    chk("Celular: foto ocupa mais da metade da altura", (g["stage"][1] - g["stage"][0]) > 780 * 0.5, g["stage"])
    chk("Celular: sem rolagem lateral", g["sw"] <= g["iw"])
    pg.click("[data-tab=fra]"); pg.wait_for_timeout(250)
    chk("Celular: tocar na aba abre o painel", pg.evaluate("document.getElementById('imSide').classList.contains('is-open')"))
    pg.locator(".im-fradd").nth(1).click(); pg.wait_for_timeout(300)
    chk("Celular: adicionar moldura mantém o painel aberto", pg.evaluate("document.getElementById('imSide').classList.contains('is-open')") and pg.locator(".im-frrow").count() == 1)
    pg.click("[data-tab=fra]"); pg.wait_for_timeout(200)
    chk("Celular: tocar de novo na aba recolhe o painel", not pg.evaluate("document.getElementById('imSide').classList.contains('is-open')"))
    pg.click("[data-add=text]"); pg.wait_for_timeout(400)
    try: pg.click("[data-tab=fil]", timeout=4000); okc = True
    except Exception: okc = False
    chk("Celular: aba continua clicável depois de inserir texto (canvas não cobre)", okc)
    pg.click("[data-tool=pencil]"); pg.wait_for_timeout(200)
    chk("Celular: escolher ferramenta recolhe o painel", not pg.evaluate("document.getElementById('imSide').classList.contains('is-open')"))
    chk("Celular: sem erros no console", not errs, errs[:2])
    b.close()
print("TOTAL", sum(R), "/", len(R)); sys.exit(0 if all(R) else 1)
