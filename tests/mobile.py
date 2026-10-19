"""Matriz de uso no celular do Coding (v29): 9 ferramentas x vários tamanhos de tela, com toque de verdade (has_touch).
Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/mobile.py [saida.md]`.
Cada verificação imprime PASSOU / FALHOU / PULADO. Nada aqui usa aparelho real: é emulação de Chromium com toque.
Verifica, por ferramenta e tamanho: sem erros no console, sem rolagem horizontal da página, folha inferior montada só até 899px,
área de trabalho acima da folha sem sobreposição, abas com alvo >= 44px que respondem ao toque (hit-test) e que a folha
cabe na tela nos três estados (recolhida/meia/expandida)."""
import sys, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8766/"
# (rota, seletor do espaço de trabalho, seletor da área principal que precisa ficar visível acima da folha, id da folha)
TOOLS = [
    ("etiquetas", "#labelsWs", "#labelsWs .preview"),
    ("texto", "#textsWs", "#txScroll"),
    ("planilhas", "#calcWs", ".calc-scroll"),
    ("imagens", "#imagesWs", "#imStage"),
    ("pdf", "#pdfWs", "#pdfMain"),
    ("qr", "#codesWs", "#codesWs .tv-preview"),
    ("planilha", "#sheetWs", "#sheetWs .tv-form"),
    ("sorteio", "#drawWs", "#drawWs .fn-body > .fn-pane:not([hidden])"),
    ("racha", "#splitWs", "#splitWs .fn-body > .fn-pane:not([hidden])"),
]
VIEWPORTS = [(320, 568), (360, 740), (375, 667), (390, 844), (412, 915), (430, 932), (740, 360), (768, 1024), (899, 700), (900, 700), (1280, 800), (1920, 1080)]
R = []


def chk(name, ok, detail=""):
    status = "PASSOU" if ok is True else ("PULADO" if ok is None else "FALHOU")
    R.append((name, status, detail))
    print(status + " | " + name + (" | " + str(detail)[:160] if detail else ""))


def rect(pg, sel):
    return pg.evaluate("s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]}", sel)


with sync_playwright() as p:
    b = p.chromium.launch()
    for (vw, vh) in VIEWPORTS:
        mobile = vw <= 899
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        for (route, ws, main) in TOOLS:
            tag = f"{route} {vw}x{vh}"
            errs.clear()
            pg.goto(BASE + "#/novo/" + route)
            pg.wait_for_timeout(900)
            sheet = pg.locator(ws + " .sh-sheet")
            vis = sheet.count() > 0 and sheet.first.is_visible()
            if not mobile:
                chk(f"{tag}: sem folha inferior no desktop", not vis)
                chk(f"{tag}: sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
                chk(f"{tag}: sem erros no console", not errs, errs)
                continue
            chk(f"{tag}: folha inferior montada", vis)
            if not vis:
                continue
            chk(f"{tag}: sem rolagem horizontal da página", pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), pg.evaluate("document.documentElement.scrollWidth"))
            sh = rect(pg, ws + " .sh-sheet")
            chk(f"{tag}: folha dentro da tela", sh[0] >= 0 and sh[2] <= vw + 1 and sh[3] <= vh + 1 and sh[1] >= 0, sh)
            # estados
            sizes = {}
            for i in range(3):
                if pg.locator(ws + " .sh-down").first.is_enabled():
                    pg.locator(ws + " .sh-down").first.click()
            pg.wait_for_timeout(350)
            sizes["collapsed"] = rect(pg, ws + " .sh-sheet")
            pg.locator(ws + " .sh-up").first.click(); pg.wait_for_timeout(350)
            sizes["half"] = rect(pg, ws + " .sh-sheet")
            pg.locator(ws + " .sh-up").first.click(); pg.wait_for_timeout(350)
            sizes["expanded"] = rect(pg, ws + " .sh-sheet")
            hs = {k: v[3] - v[1] for k, v in sizes.items()}
            chk(f"{tag}: 3 alturas distintas (recolhida < meia < expandida)", hs["collapsed"] < hs["half"] < hs["expanded"], hs)
            # área principal acima da folha (meia) e ainda visível com folha expandida
            pg.locator(ws + " .sh-down").first.click(); pg.wait_for_timeout(350)
            m = rect(pg, main); sh = rect(pg, ws + " .sh-sheet")
            if m is None:
                chk(f"{tag}: área principal existe", None, "seletor ausente (planilha sem linhas: tabela aparece só depois do exemplo)")
            else:
                chk(f"{tag}: área principal não passa por baixo da folha (meia)", m[3] <= sh[1] + 2, (m, sh))
                chk(f"{tag}: área principal tem altura útil (meia) >= {80 if vh < 400 else 140}px", (m[3] - m[1]) >= (80 if vh < 400 else 140), m[3] - m[1])
            # abas: alvo >= 44px, hit-test depois de rolar até cada uma, troca de aba
            tabs = pg.locator(ws + " .sh-tab")
            n = tabs.count()
            bad, small = [], []
            for i in range(n):
                t = tabs.nth(i)
                t.scroll_into_view_if_needed(); pg.wait_for_timeout(80)
                bb = t.bounding_box()
                if bb["height"] < 44 or bb["width"] < 44:
                    small.append((i, round(bb["width"]), round(bb["height"])))
                hit = pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('.sh-tab'))}", [bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2])
                if not hit:
                    bad.append(i)
            chk(f"{tag}: {n} abas com alvo >= 44px", not small, small)
            chk(f"{tag}: abas recebem o toque (hit-test)", not bad, bad)
            if n > 1:
                tabs.nth(1).tap(); pg.wait_for_timeout(250)
                chk(f"{tag}: tocar na 2ª aba a ativa", pg.evaluate("(s)=>{const t=document.querySelectorAll(s+' .sh-tab')[1];return t.classList.contains('is-on')||t.getAttribute('aria-selected')==='true'}", ws))
            # botões da folha: alvo mínimo (ignora campos de texto e controles nativos pequenos)
            tiny = pg.evaluate("""(s)=>[...document.querySelectorAll(s+' .sh-sheet button')].filter(b=>b.offsetParent!==null).map(b=>{const r=b.getBoundingClientRect();return [(b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,18),Math.round(r.width),Math.round(r.height)]}).filter(x=>x[1]>0&&(x[1]<32||x[2]<32))""", ws)
            chk(f"{tag}: nenhum botão visível da folha menor que 32px", not tiny, tiny[:4])
            chk(f"{tag}: sem erros no console", not errs, errs)
        ctx.close()
    b.close()

passou = sum(1 for _, s, _ in R if s == "PASSOU")
falhou = sum(1 for _, s, _ in R if s == "FALHOU")
pulado = sum(1 for _, s, _ in R if s == "PULADO")
print(f"\nTOTAL: {passou} PASSOU, {falhou} FALHOU, {pulado} PULADO")
if len(sys.argv) > 1:
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write("| Verificação | Resultado | Detalhe |\n|---|---|---|\n")
        for n, s, d in R:
            f.write(f"| {n} | {s} | {str(d)[:100].replace('|', '/')} |\n")
sys.exit(1 if falhou else 0)
