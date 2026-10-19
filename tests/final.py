"""Verificações finais do Coding (Fase 5). Uso: servir a pasta em http://localhost:8766 e rodar `python3 tests/final.py`.
Imprime uma linha PASSOU/FALHOU por verificação. Precisa de playwright (python) e de um PDF de teste em tests/a.pdf."""
import json, re, sys, os
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8766/"
HERE = os.path.dirname(os.path.abspath(__file__))
R = []
def chk(name, ok, detail=""):
    R.append((name, bool(ok), detail)); print(("PASSOU" if ok else "FALHOU") + " | " + name + (" | " + str(detail) if detail else ""))
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⬀-⯿←-⇿⧉]️?")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1200, "height": 800}); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    # relógio
    pg.goto(BASE); pg.wait_for_timeout(1500)
    opts = pg.eval_on_selector_all("#homeZone option", "e=>e.map(x=>x.value)")
    chk("Relógio: opção 'local' existe", "local" in opts, opts)
    chk("Relógio: padrão Brasília", pg.input_value("#homeZone") == "America/Sao_Paulo")
    pg.select_option("#homeZone", "local"); pg.reload(); pg.wait_for_timeout(1200)
    chk("Relógio: escolha 'local' lembrada após recarregar", pg.input_value("#homeZone") == "local")
    # ícones: nenhum emoji em botões/rótulos de controle (adesivos ficam fora)
    bad = []
    for r in ["etiquetas", "texto", "planilhas", "qr", "planilha", "pdf", "imagens", "sorteio", "racha"]:
        pg.goto(BASE + "#/novo/" + r); pg.wait_for_timeout(600)
        t = pg.evaluate("[...document.querySelectorAll('button,.im-tool,.tab,label,.chip')].filter(e=>!e.closest('#imStk')).map(e=>e.textContent)")
        bad += [x.strip()[:30] for x in t if EMOJI.search(x.replace('Planilha → Etiquetas', ''))]  # o → do nome da ferramenta é texto, não ícone
    chk("Ícones: nenhum emoji nos controles", not bad, bad[:5])
    # acessibilidade: nomes
    JS = """()=>{const out=[];document.querySelectorAll('button,input,select,textarea,[role=button]').forEach(e=>{if(e.closest('[hidden],dialog:not([open])')||e.type==='hidden')return;if(getComputedStyle(e).display==='none')return;let n=(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')&&'x'||e.title||e.textContent||'').trim();if(!n&&e.labels&&e.labels.length)n=e.labels[0].textContent.trim();if(!n&&e.placeholder)n=e.placeholder;if(!n&&e.closest('label'))n=e.closest('label').textContent.trim();if(!n)out.push(e.tagName+'#'+e.id)});return out}"""
    un = []
    for r in ["", "novo/etiquetas", "novo/planilhas", "novo/imagens", "novo/sorteio", "novo/racha", "novo/pdf", "novo/planilha"]:
        pg.goto(BASE + "#/" + r); pg.wait_for_timeout(600); un += pg.evaluate(JS)
    chk("Acessibilidade: todo controle tem nome", not un, un[:5])
    # PDF: rótulo honesto
    pg.goto(BASE + "#/novo/pdf"); pg.wait_for_timeout(600)
    lab = pg.inner_text("[data-tool=cover]").strip()
    chk("PDF: botão chama 'Cobrir visualmente'", lab == "Cobrir visualmente", lab)
    # Planilha → Etiquetas manual
    pg.goto(BASE + "#/novo/planilha"); pg.wait_for_selector("#sheetWs:not([hidden])"); pg.click("#sheetManual"); pg.wait_for_timeout(300)
    ins = pg.locator("#sheetTable tr:not(.is-head) input"); ins.nth(0).fill("A1"); ins.nth(2).fill("3")
    chk("Etiquetas manual: 1 item / 3 etiquetas", pg.inner_text("#sheetInfo").startswith("1 item · 3 etiquetas"), pg.inner_text("#sheetInfo"))
    pg.click("#sheetCreate"); pg.wait_for_timeout(1200)
    chk("Etiquetas manual: cria documento de Etiquetas", "#/etiquetas/" in pg.url, pg.url)
    # PWA offline + cache do PDF
    pg.goto(BASE); pg.wait_for_timeout(1500); pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(3000)
    cached = pg.evaluate("caches.keys().then(async k=>{const c=await caches.open(k[k.length-1]);return (await c.keys()).map(r=>r.url.split('/').pop())})")
    chk("Offline: PDF (pdf.js, worker, pdf-lib) no cache", all(x in cached for x in ["pdf.min.js", "pdf.worker.min.js", "pdf-lib.min.js"]), [x for x in cached if "pdf" in x])
    ctx.set_offline(True)
    pdf = os.path.join(HERE, "a.pdf")
    if os.path.exists(pdf):
        pg.goto(BASE + "#/novo/pdf"); pg.wait_for_selector("#pdfWs:not([hidden])"); pg.set_input_files("#pdfFile", pdf); pg.wait_for_timeout(3500)
        n = pg.locator("#pdfWs canvas").count()
        chk("Offline: abre PDF sem internet", n > 0, str(n) + " miniaturas")
    else:
        chk("Offline: abre PDF sem internet", False, "tests/a.pdf ausente")
    ctx.set_offline(False)
    chk("Sem erros no console", not errs, errs[:3])
    b.close()
m = json.load(open(os.path.join(HERE, "..", "manifest.webmanifest"), encoding="utf-8"))
chk("Manifest: descrição cita a suíte", "planilhas" in m["description"].lower() and "pdf" in m["description"].lower())
print("TOTAL", sum(1 for x in R if x[1]), "/", len(R))
sys.exit(0 if all(x[1] for x in R) else 1)
