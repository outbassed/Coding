<script setup lang="ts">
import { computed, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { CodeError } from './barcodes';
import { renderCode, svgToPng, SYMBOLOGIES, type Rendered } from './render';
import { cid, MAX_ITEMS, type CodeItem } from './model';
import { codesKind, codesTemplates } from './kind';

const doc = useDocument({ kind: codesKind, templates: codesTemplates, path: '/apps/qr/' });
const { state } = doc;
const tab = ref('codigo');
const tabs = [{ id: 'codigo', label: 'Código' }, { id: 'aparencia', label: 'Aparência' }, { id: 'folha', label: 'Folha' }, { id: 'arquivo', label: 'Arquivo' }];
const selectedId = ref<string | null>(state.value.items[0]?.id ?? null);
const selected = computed(() => state.value.items.find((i) => i.id === selectedId.value) ?? state.value.items[0] ?? null);
type Out = { ok: true; r: Rendered } | { ok: false; error: string };
function render(item: CodeItem): Out {
  try { return { ok: true, r: renderCode(item.kind, item.value, state.value.style, item.caption) }; }
  catch (e) { return { ok: false, error: e instanceof CodeError ? e.message : 'Não foi possível gerar este código.' }; }
}
const current = computed<Out | null>(() => (selected.value ? render(selected.value) : null));
const sheet = computed(() => state.value.items.flatMap((item) => { const out = render(item); return out.ok ? Array.from({ length: item.copies }, (_, k) => ({ key: item.id + ':' + k, svg: out.r.svg })) : []; }).slice(0, 600));
const invalidCount = computed(() => state.value.items.filter((i) => !render(i).ok).length);
const hint = computed(() => SYMBOLOGIES.find((s) => s.id === selected.value?.kind)?.hint ?? '');

function addItem(): void {
  if (state.value.items.length >= MAX_ITEMS) { doc.say('Limite de ' + MAX_ITEMS + ' códigos.'); return; }
  const item: CodeItem = { id: cid(), kind: selected.value?.kind ?? 'qr', value: '', caption: '', copies: 1 };
  state.value.items.push(item); selectedId.value = item.id;
  requestAnimationFrame(() => document.getElementById('code-value')?.focus());
}
function duplicate(): void {
  const s = selected.value; if (!s || state.value.items.length >= MAX_ITEMS) return;
  const copy = { ...s, id: cid() };
  state.value.items.splice(state.value.items.indexOf(s) + 1, 0, copy); selectedId.value = copy.id;
}
function remove(): void {
  const s = selected.value; if (!s) return;
  const i = state.value.items.indexOf(s);
  state.value.items.splice(i, 1);
  selectedId.value = state.value.items[Math.min(i, state.value.items.length - 1)]?.id ?? null;
}
const baseName = () => safeFileName(selected.value?.caption || selected.value?.value || state.value.name, 'codigo');
function exportSvg(): void {
  const out = current.value; if (!out?.ok) { doc.say('Corrija o código antes de exportar.'); return; }
  downloadText(out.r.svg, baseName() + '.svg', 'image/svg+xml'); doc.say('SVG exportado.');
}
async function exportPng(): Promise<void> {
  const out = current.value; if (!out?.ok) { doc.say('Corrija o código antes de exportar.'); return; }
  try { downloadBlob(await svgToPng(out.r.svg, 2), baseName() + '.png'); doc.say('PNG exportado em alta resolução.'); }
  catch (e) { doc.say((e as Error).message); }
}
function printSheet(): void {
  if (!sheet.value.length) { doc.say('Nenhum código válido para imprimir.'); return; }
  window.print();
}
const swatch = (k: 'fg' | 'bg') => computed({ get: () => state.value.style[k], set: (v: string) => { state.value.style[k] = v; } });
const fg = swatch('fg'), bg = swatch('bg');
</script>

<template>
  <EditorShell v-model:tab="tab" app="codes" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: currentTab }">
      <div v-if="currentTab === 'codigo'" class="ed-group">
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Códigos ({{ state.items.length }})</span>
            <select v-model="selectedId" class="inp" data-testid="code-select"><option v-for="(it, i) in state.items" :key="it.id" :value="it.id">{{ i + 1 }}. {{ SYMBOLOGIES.find((s) => s.id === it.kind)?.name }} · {{ it.caption || it.value || 'vazio' }}</option></select></label>
          <button type="button" class="btn btn-app" data-testid="add-code" @click="addItem">Novo código</button>
          <button type="button" class="btn" :disabled="!selected" @click="duplicate">Duplicar</button>
          <button type="button" class="btn" :disabled="!selected" @click="remove">Excluir</button>
        </div>
        <template v-if="selected">
          <div class="ed-row">
            <label class="ed-field"><span class="ed-label">Tipo</span>
              <select v-model="selected.kind" class="inp" data-testid="code-kind"><option v-for="s in SYMBOLOGIES" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
            <label class="ed-field grow"><span class="ed-label">Conteúdo</span>
              <input id="code-value" v-model="selected.value" class="inp" maxlength="2000" autocomplete="off" :inputmode="['ean13', 'ean8', 'upca'].includes(selected.kind) ? 'numeric' : 'text'" :aria-invalid="current && !current.ok ? 'true' : undefined" aria-describedby="code-hint code-error" data-testid="code-value" @input="doc.setChangeKey('v' + selected.id)" /></label>
          </div>
          <div class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Legenda (opcional)</span><input v-model="selected.caption" class="inp" maxlength="80" data-testid="code-caption" @input="doc.setChangeKey('c' + selected.id)" /></label>
            <label class="ed-field"><span class="ed-label">Cópias na folha</span><input v-model.number="selected.copies" class="inp inp-num" type="number" min="1" max="200" /></label>
          </div>
          <p id="code-hint" class="ed-hint">{{ hint }}</p>
        </template>
      </div>
      <div v-else-if="currentTab === 'aparencia'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Tamanho do módulo (px)</span><input v-model.number="state.style.module" class="inp inp-num" type="number" min="1" max="20" data-testid="module-size" /></label>
        <label class="ed-field"><span class="ed-label">Altura das barras (px)</span><input v-model.number="state.style.height" class="inp inp-num" type="number" min="20" max="400" /></label>
        <label class="ed-field"><span class="ed-label">Margem (módulos)</span><input v-model.number="state.style.margin" class="inp inp-num" type="number" min="0" max="10" /></label>
        <label class="ed-field"><span class="ed-label">Correção do QR</span>
          <select v-model="state.style.ecl" class="inp"><option value="L">L · 7%</option><option value="M">M · 15%</option><option value="Q">Q · 25%</option><option value="H">H · 30%</option></select></label>
        <label class="ed-field"><span class="ed-label">Cor</span><input v-model="fg" class="inp color" type="color" /></label>
        <label class="ed-field"><span class="ed-label">Fundo</span><input v-model="bg" class="inp color" type="color" /></label>
        <label class="check"><input v-model="state.style.showText" type="checkbox" /> Mostrar texto</label>
        <p class="ed-hint wide">Para leitura confiável, mantenha a cor escura sobre fundo claro e a margem de pelo menos 4 módulos.</p>
      </div>
      <div v-else-if="currentTab === 'folha'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Colunas na folha A4</span><input v-model.number="state.layout.cols" class="inp inp-num" type="number" min="1" max="6" data-testid="sheet-cols" /></label>
        <label class="ed-field"><span class="ed-label">Espaço entre códigos (mm)</span><input v-model.number="state.layout.gapMm" class="inp inp-num" type="number" min="0" max="30" /></label>
        <button type="button" class="btn btn-app" data-testid="print-sheet" @click="printSheet">Imprimir folha</button>
        <p class="ed-hint wide">{{ sheet.length }} códigos na folha<template v-if="invalidCount"> · {{ invalidCount }} com erro ficam de fora</template>. Para PDF, escolha “Salvar como PDF” na impressão.</p>
      </div>
      <FileTab v-else :templates="codesTemplates" @new="doc.newFrom">
        <button type="button" class="btn" data-testid="export-png" @click="exportPng">Baixar PNG</button>
        <button type="button" class="btn" data-testid="export-svg" @click="exportSvg">Baixar SVG</button>
        <button type="button" class="btn" @click="printSheet">Imprimir folha</button>
      </FileTab>
    </template>

    <div class="stage">
      <section class="preview" aria-label="Código selecionado">
        <template v-if="current?.ok">
          <!-- SVG gerado localmente; textos escapados em render.ts -->
          <div class="code" role="img" :aria-label="(SYMBOLOGIES.find((s) => s.id === selected?.kind)?.name ?? 'Código') + ': ' + (selected?.value ?? '')" data-testid="code-preview" v-html="current.r.svg"></div>
          <p class="muted small">{{ current.r.width }} × {{ current.r.height }} px</p>
        </template>
        <p v-else-if="current" id="code-error" class="ed-error" role="alert" data-testid="code-error">{{ current.error }}</p>
        <p v-else class="muted">Adicione um código.</p>
      </section>
      <section class="sheet-wrap" aria-label="Folha de impressão">
        <h2 class="muted small">Folha A4 · {{ sheet.length }} códigos</h2>
        <div class="print-sheet" :style="{ gridTemplateColumns: 'repeat(' + state.layout.cols + ', minmax(0, 1fr))', gap: state.layout.gapMm + 'mm' }" data-testid="sheet">
          <div v-for="c in sheet" :key="c.key" class="cell" aria-hidden="true" v-html="c.svg"></div>
        </div>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.grow { flex: 1 1 220px; }
.wide { flex-basis: 100%; }
.color { width: 64px; padding: 4px; }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.stage { display: grid; gap: 16px; padding: 16px max(16px, var(--sa-r)) 28px max(16px, var(--sa-l)); max-width: 1100px; margin: 0 auto; }
.preview { display: grid; justify-items: center; gap: 6px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; }
.code { max-width: 100%; overflow: auto; background: #fff; padding: 8px; border-radius: 8px; }
.code :deep(svg) { display: block; max-width: 100%; height: auto; }
.small { font-size: 12.5px; margin: 0; }
.sheet-wrap { display: grid; gap: 6px; }
.print-sheet { background: #fff; color: #000; width: 100%; max-width: 210mm; box-sizing: border-box; padding: 10mm; margin: 0 auto; display: grid; align-content: start; box-shadow: var(--shadow); border: 1px solid var(--border); min-height: 120px; }
.cell { display: grid; place-items: center; break-inside: avoid; }
.cell :deep(svg) { max-width: 100%; height: auto; }
@media print {
  .preview, .sheet-wrap h2 { display: none; }
  .stage { padding: 0; }
  .print-sheet { box-shadow: none; border: 0; max-width: none; padding: 0; }
  @page { size: A4; margin: 10mm; }
}
</style>
