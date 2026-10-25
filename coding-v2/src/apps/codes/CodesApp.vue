<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { CodeError } from './barcodes';
import { renderCode, svgToPng, SYMBOLOGIES, type Rendered } from './render';
import { cid, MAX_ITEMS, MAX_STYLE_PRESETS, normalizeStyle, type CodeItem } from './model';
import { buildEmail, buildPhone, buildSms, buildUrl, buildVcard, buildWifi, type Built, type WifiSecurity } from './content';
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
// assistente: monta o conteúdo de um QR a partir de campos
type AssistKind = 'url' | 'wifi' | 'email' | 'phone' | 'sms' | 'vcard';
const ASSIST_KINDS: { id: AssistKind; name: string }[] = [{ id: 'url', name: 'Site' }, { id: 'wifi', name: 'Wi-Fi' }, { id: 'email', name: 'E-mail' }, { id: 'phone', name: 'Telefone' }, { id: 'sms', name: 'SMS' }, { id: 'vcard', name: 'Contato (vCard)' }];
const assistKind = ref<AssistKind>('url');
const assist = reactive({ url: '', ssid: '', password: '', security: 'WPA' as WifiSecurity, hidden: false, to: '', subject: '', body: '', phone: '', smsText: '', vName: '', vOrg: '', vPhone: '', vEmail: '', vUrl: '' });
const assistError = ref('');
function buildAssist(): Built {
  switch (assistKind.value) {
    case 'url': return buildUrl(assist.url);
    case 'wifi': return buildWifi({ ssid: assist.ssid, password: assist.password, security: assist.security, hidden: assist.hidden });
    case 'email': return buildEmail({ to: assist.to, subject: assist.subject, body: assist.body });
    case 'phone': return buildPhone(assist.phone);
    case 'sms': return buildSms({ phone: assist.phone, message: assist.smsText });
    default: return buildVcard({ name: assist.vName, org: assist.vOrg, phone: assist.vPhone, email: assist.vEmail, url: assist.vUrl });
  }
}
function applyAssist(): void {
  const built = buildAssist();
  if (!built.ok) { assistError.value = built.error; return; }
  assistError.value = '';
  if (!selected.value) addItem();
  const s = selected.value; if (!s) return;
  s.kind = 'qr'; s.value = built.value;
  if (assistKind.value === 'wifi' && !s.caption.trim()) s.caption = ('Rede: ' + assist.ssid.trim()).slice(0, 80);
  doc.say('Conteúdo montado e colocado no QR code selecionado.');
}
// vários códigos de uma vez (um por linha)
const batchText = ref('');
function addBatch(): void {
  const lines = batchText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { doc.say('Escreva um conteúdo por linha.'); return; }
  const room = MAX_ITEMS - state.value.items.length;
  if (room <= 0) { doc.say('Limite de ' + MAX_ITEMS + ' códigos.'); return; }
  const kind = selected.value?.kind ?? 'qr';
  const take = lines.slice(0, room);
  const first = cid();
  take.forEach((v, i) => state.value.items.push({ id: i === 0 ? first : cid(), kind, value: v.slice(0, 2000), caption: '', copies: 1 }));
  selectedId.value = first;
  batchText.value = '';
  doc.say(take.length + (take.length === 1 ? ' código adicionado' : ' códigos adicionados') + (lines.length > take.length ? '; ' + (lines.length - take.length) + ' ficaram de fora pelo limite de ' + MAX_ITEMS + '.' : '.'));
}
// aparências guardadas
const styleName = ref('');
const stylePick = ref('');
function saveStyle(): void {
  const name = styleName.value.trim().slice(0, 60);
  if (!name) { doc.say('Dê um nome à aparência antes de salvar.'); return; }
  const same = state.value.stylePresets.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const style = normalizeStyle({ ...state.value.style });
  if (same) { same.style = style; same.name = name; stylePick.value = same.id; doc.say('Aparência “' + name + '” atualizada.'); }
  else {
    if (state.value.stylePresets.length >= MAX_STYLE_PRESETS) { doc.say('Limite de ' + MAX_STYLE_PRESETS + ' aparências salvas. Exclua uma para guardar outra.'); return; }
    const id = cid();
    state.value.stylePresets.push({ id, name, style });
    stylePick.value = id;
    doc.say('Aparência “' + name + '” salva.');
  }
  styleName.value = '';
}
function applyStyle(): void {
  const p = state.value.stylePresets.find((x) => x.id === stylePick.value);
  if (!p) return;
  Object.assign(state.value.style, normalizeStyle(p.style));
  doc.say('Aparência “' + p.name + '” aplicada a todos os códigos.');
}
function deleteStyle(): void {
  const i = state.value.stylePresets.findIndex((x) => x.id === stylePick.value);
  if (i < 0) return;
  const [gone] = state.value.stylePresets.splice(i, 1);
  stylePick.value = '';
  doc.say('Aparência “' + gone!.name + '” excluída.');
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
        <details class="tools" data-testid="assist">
          <summary>Montar conteúdo do QR (Wi-Fi, contato, e-mail…)</summary>
          <div class="ed-row">
            <label class="ed-field"><span class="ed-label">O que o QR faz</span>
              <select v-model="assistKind" class="inp" data-testid="assist-kind"><option v-for="k in ASSIST_KINDS" :key="k.id" :value="k.id">{{ k.name }}</option></select></label>
          </div>
          <div v-if="assistKind === 'url'" class="ed-row"><label class="ed-field grow"><span class="ed-label">Endereço do site</span><input v-model="assist.url" class="inp" inputmode="url" autocomplete="off" placeholder="exemplo.com.br" data-testid="assist-url" /></label></div>
          <div v-else-if="assistKind === 'wifi'" class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Nome da rede (SSID)</span><input v-model="assist.ssid" class="inp" maxlength="32" autocomplete="off" data-testid="assist-ssid" /></label>
            <label class="ed-field grow"><span class="ed-label">Senha</span><input v-model="assist.password" class="inp" maxlength="63" autocomplete="off" :disabled="assist.security === 'nopass'" data-testid="assist-password" /></label>
            <label class="ed-field"><span class="ed-label">Segurança</span>
              <select v-model="assist.security" class="inp" data-testid="assist-security"><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">Sem senha</option></select></label>
            <label class="check"><input v-model="assist.hidden" type="checkbox" /> Rede oculta</label>
          </div>
          <div v-else-if="assistKind === 'email'" class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Para</span><input v-model="assist.to" class="inp" type="email" autocomplete="off" data-testid="assist-to" /></label>
            <label class="ed-field grow"><span class="ed-label">Assunto (opcional)</span><input v-model="assist.subject" class="inp" maxlength="200" /></label>
            <label class="ed-field grow"><span class="ed-label">Mensagem (opcional)</span><input v-model="assist.body" class="inp" maxlength="500" /></label>
          </div>
          <div v-else-if="assistKind === 'phone' || assistKind === 'sms'" class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Telefone com DDD</span><input v-model="assist.phone" class="inp" type="tel" autocomplete="off" placeholder="+55 11 91234-5678" data-testid="assist-phone" /></label>
            <label v-if="assistKind === 'sms'" class="ed-field grow"><span class="ed-label">Mensagem</span><input v-model="assist.smsText" class="inp" maxlength="300" data-testid="assist-sms" /></label>
          </div>
          <div v-else class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Nome</span><input v-model="assist.vName" class="inp" maxlength="100" autocomplete="off" data-testid="assist-vname" /></label>
            <label class="ed-field grow"><span class="ed-label">Empresa (opcional)</span><input v-model="assist.vOrg" class="inp" maxlength="100" /></label>
            <label class="ed-field grow"><span class="ed-label">Telefone (opcional)</span><input v-model="assist.vPhone" class="inp" type="tel" /></label>
            <label class="ed-field grow"><span class="ed-label">E-mail (opcional)</span><input v-model="assist.vEmail" class="inp" type="email" /></label>
            <label class="ed-field grow"><span class="ed-label">Site (opcional)</span><input v-model="assist.vUrl" class="inp" inputmode="url" /></label>
          </div>
          <div class="ed-row"><button type="button" class="btn btn-app" data-testid="assist-apply" @click="applyAssist">Usar no QR selecionado</button></div>
          <p v-if="assistError" class="ed-error" role="alert" data-testid="assist-error">{{ assistError }}</p>
        </details>
        <details class="tools" data-testid="batch">
          <summary>Adicionar vários códigos de uma vez</summary>
          <label class="ed-field"><span class="ed-label">Um conteúdo por linha (usa o tipo do código selecionado)</span>
            <textarea v-model="batchText" class="inp" rows="4" data-testid="batch-text"></textarea></label>
          <div class="ed-row"><button type="button" class="btn" data-testid="batch-add" @click="addBatch">Adicionar à lista</button></div>
        </details>
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
        <details class="tools wide" data-testid="style-presets">
          <summary>Aparências salvas ({{ state.stylePresets.length }})</summary>
          <div class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Nome da aparência</span><input v-model="styleName" class="inp" maxlength="60" placeholder="Ex.: Etiqueta pequena" data-testid="style-name" @keydown.enter.prevent="saveStyle" /></label>
            <button type="button" class="btn" data-testid="style-save" @click="saveStyle">Salvar aparência atual</button>
          </div>
          <div v-if="state.stylePresets.length" class="ed-row">
            <label class="ed-field grow"><span class="ed-label">Aparências guardadas</span>
              <select v-model="stylePick" class="inp" data-testid="style-select"><option value="">Escolha…</option><option v-for="p in state.stylePresets" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
            <button type="button" class="btn" :disabled="!stylePick" data-testid="style-apply" @click="applyStyle">Aplicar</button>
            <button type="button" class="btn" :disabled="!stylePick" data-testid="style-delete" @click="deleteStyle">Excluir</button>
          </div>
          <p v-else class="ed-hint">Guarde tamanho, cores, margem e correção para repetir em outros códigos e documentos.</p>
        </details>
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
.tools { border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; }
.tools summary { cursor: pointer; font-weight: 600; min-height: 36px; display: flex; align-items: center; }
.tools textarea { width: 100%; resize: vertical; }
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
