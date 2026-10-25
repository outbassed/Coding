<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadText, safeFileName } from '../../shared/files/download';
import { formatBytes } from '../../shared/bytes';
import type { LegacyImage } from '../../storage/documents';
import { compareBytes, compareText, decodeText, hexWindow, sha256Hex, unifiedDiff, type BinaryResult, type Row } from './diff';
import { bothTextual, collapseRows, MAX_BINARY_BYTES, MAX_TEXT_CHARS, textSource, type CompareState, type Source } from './model';
import { compareKind, compareTemplates } from './kind';

const doc = useDocument<CompareState>({
  kind: compareKind, templates: compareTemplates, path: '/apps/comparador/', withImages: true,
  imagesFor: (state, images) => { const used = new Set([state.a.blobId, state.b.blobId]); return images.filter((i) => used.has(i.id)); }
});
const { state, images } = doc;
const tabs = [{ id: 'arquivos', label: 'Arquivos' }, { id: 'opcoes', label: 'Opções' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref('arquivos');
const problem = ref('');
const info = ref('');
function ok(text: string): void { info.value = text; problem.value = ''; doc.say(text); }
function fail(text: string): void { problem.value = text; info.value = ''; doc.say(text); }

type SideKey = 'a' | 'b';
const MB = (n: number): number => Math.round(n / 1048576);
function dropBlob(side: Source): void { if (side.blobId) images.value = images.value.filter((i) => i.id !== side.blobId); }

async function onFile(key: SideKey, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  if (file.size > MAX_BINARY_BYTES) { fail('“' + file.name + '” passa de ' + MB(MAX_BINARY_BYTES) + ' MB.'); return; }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = decodeText(bytes);
    dropBlob(state.value[key]);
    if (text !== null && text.length <= MAX_TEXT_CHARS) {
      state.value[key] = { ...textSource(file.name.slice(0, 160), text), size: bytes.length };
      ok('“' + file.name + '” lido como texto (' + formatBytes(bytes.length) + ').');
    } else {
      const id = 'cmp-' + crypto.randomUUID();
      const image: LegacyImage = { id, docId: '', blob: new Blob([bytes as BlobPart], { type: file.type || 'application/octet-stream' }), mime: file.type || 'application/octet-stream', name: file.name.slice(0, 160) };
      images.value = [...images.value, image];
      state.value[key] = { name: file.name.slice(0, 160), kind: 'binary', text: '', size: bytes.length, blobId: id };
      ok('“' + file.name + '” será comparado byte a byte (' + (text === null ? 'não é texto' : 'texto grande demais') + ').');
    }
  } catch { fail('Não foi possível ler “' + file.name + '”.'); }
}
function onText(key: SideKey, event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value.slice(0, MAX_TEXT_CHARS);
  dropBlob(state.value[key]);
  const name = state.value[key].name;
  state.value[key] = textSource(name, value);
}
function onName(key: SideKey, event: Event): void { state.value[key].name = (event.target as HTMLInputElement).value.slice(0, 160); }
function clearSide(key: SideKey): void {
  dropBlob(state.value[key]);
  state.value[key] = { name: key === 'a' ? 'Arquivo A' : 'Arquivo B', kind: 'empty', text: '', size: 0, blobId: '' };
  doc.say('Lado ' + key.toUpperCase() + ' limpo.');
}
function swap(): void { const a = state.value.a; state.value.a = state.value.b; state.value.b = a; doc.say('Lados trocados.'); }

// ---- resultado
const textual = computed(() => bothTextual(state.value));
const empty = computed(() => state.value.a.kind === 'empty' && state.value.b.kind === 'empty');
const result = computed(() => (textual.value && !empty.value ? compareText(state.value.a.text, state.value.b.text, state.value.options) : null));
const shown = computed(() => {
  const r = result.value;
  if (!r) return [];
  return state.value.onlyDiffs ? collapseRows(r.rows) : r.rows.map((row, index) => ({ row, index }));
});
const MAX_ROWS = 3000;
const limited = computed(() => shown.value.slice(0, MAX_ROWS));
const diffStarts = computed(() => {
  const starts: number[] = [];
  let prev = 'eq';
  (result.value?.rows ?? []).forEach((row, i) => { if (row.kind !== 'eq' && prev === 'eq') starts.push(i); prev = row.kind; });
  return starts;
});
const pos = ref(-1);
watch(() => [state.value.a.text, state.value.b.text, state.value.options.ignoreCase, state.value.options.ignoreSpace, state.value.options.ignoreBlank], () => { pos.value = -1; });
async function goto(delta: 1 | -1): Promise<void> {
  const n = diffStarts.value.length;
  if (!n) return;
  pos.value = pos.value < 0 ? (delta === 1 ? 0 : n - 1) : (pos.value + delta + n) % n;
  const rowIndex = diffStarts.value[pos.value] as number;
  await nextTick();
  const el = document.querySelector('[data-row-index="' + rowIndex + '"]') as HTMLElement | null;
  el?.scrollIntoView({ block: 'center' });
  doc.say('Diferença ' + (pos.value + 1) + ' de ' + n + '.');
}

// ---- hashes e binário
interface Digest { shaA: string; shaB: string; binary: BinaryResult | null }
const digest = ref<Digest | null>(null);
let token = 0;
async function bytesOf(side: Source): Promise<Uint8Array> {
  if (side.kind === 'binary') {
    const image = images.value.find((i) => i.id === side.blobId);
    if (!image?.blob) throw new Error('indisponível');
    return new Uint8Array(await image.blob.arrayBuffer());
  }
  return new TextEncoder().encode(side.text);
}
async function refresh(): Promise<void> {
  const mine = ++token;
  if (empty.value) { digest.value = null; return; }
  try {
    const [a, b] = await Promise.all([bytesOf(state.value.a), bytesOf(state.value.b)]);
    const [shaA, shaB] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
    if (mine === token) digest.value = { shaA, shaB, binary: textual.value ? null : compareBytes(a, b) };
  } catch {
    if (mine === token) { digest.value = null; fail('Um dos arquivos não está mais disponível. Escolha-o de novo.'); }
  }
}
watch(() => [state.value.a.kind, state.value.a.text, state.value.a.blobId, state.value.b.kind, state.value.b.text, state.value.b.blobId, images.value.length], () => { void refresh(); }, { immediate: true });
onBeforeUnmount(() => { token++; });

const sameHash = computed(() => !!digest.value && digest.value.shaA === digest.value.shaB);
const status = computed<'vazio' | 'identicos' | 'diferentes' | 'iguais-no-conteudo'>(() => {
  if (empty.value) return 'vazio';
  if (textual.value) {
    const r = result.value;
    if (!r) return 'vazio';
    if (r.identical) return sameHash.value ? 'identicos' : 'iguais-no-conteudo';
    return 'diferentes';
  }
  if (!digest.value) return 'vazio';
  return digest.value.binary?.identical ? 'identicos' : 'diferentes';
});
const statusText = computed(() => ({
  vazio: 'Escolha dois arquivos ou cole dois textos para comparar.',
  identicos: 'Os dois são idênticos.',
  'iguais-no-conteudo': 'Mesmo conteúdo, só mudam finais de linha, espaços ou maiúsculas conforme as opções.',
  diferentes: 'Há diferenças.'
})[status.value]);
const eolName = (e: string): string => ({ lf: 'LF (Linux/macOS)', crlf: 'CRLF (Windows)', cr: 'CR (antigo)', mixed: 'misto', none: 'sem quebras' })[e] ?? e;

/** Linhas de hexadecimal para a janela de bytes diferentes. */
const hexRows = computed(() => {
  const b = digest.value?.binary;
  if (!b) return [];
  const rows: { offset: string; a: { v: string; d: boolean }[]; b: { v: string; d: boolean }[] }[] = [];
  for (let i = 0; i < 48; i += 16) {
    const ra = b.windowA.slice(i, i + 16), rb = b.windowB.slice(i, i + 16);
    if (!ra.length && !rb.length) break;
    const cell = (mine: number[], other: number[]) => Array.from({ length: Math.max(ra.length, rb.length) }, (_, j) => ({ v: mine[j] === undefined ? '--' : hexWindow([mine[j] as number]), d: mine[j] !== other[j] }));
    rows.push({ offset: (b.windowStart + i).toString(16).padStart(8, '0'), a: cell(ra, rb), b: cell(rb, ra) });
  }
  return rows;
});

// ---- exportar
const diffText = (): string => unifiedDiff(state.value.a.text, state.value.b.text, state.value.a.name, state.value.b.name, state.value.options);
function exportDiff(): void { downloadText(diffText(), safeFileName(state.value.name, 'comparacao') + '.diff'); doc.say('Diferenças exportadas (.diff).'); }
async function copyDiff(): Promise<void> {
  try { await navigator.clipboard.writeText(diffText()); doc.say('Diferenças copiadas.'); }
  catch { doc.say('Não foi possível copiar automaticamente. Use Exportar.'); }
}
function exportReport(): void {
  const s = state.value, d = digest.value, r = result.value;
  const lines = [s.name, '', 'A: ' + s.a.name + ' (' + formatBytes(s.a.size) + ')', 'B: ' + s.b.name + ' (' + formatBytes(s.b.size) + ')', ''];
  lines.push('Resultado: ' + statusText.value);
  if (r) lines.push('Linhas: A ' + r.stats.linesA + ', B ' + r.stats.linesB + ' · iguais ' + r.stats.same + ', trocadas ' + r.stats.changed + ', removidas ' + r.stats.removed + ', acrescentadas ' + r.stats.added + ' · semelhança ' + r.stats.similarity + '%');
  if (d?.binary && !d.binary.identical) lines.push('Primeira diferença no byte ' + d.binary.firstDifference + ' · ' + d.binary.differentBytes + ' bytes diferentes');
  if (d) lines.push('', 'SHA-256 A: ' + d.shaA, 'SHA-256 B: ' + d.shaB);
  downloadText(lines.join('\n') + '\n', safeFileName(s.name, 'comparacao') + '-relatorio.txt');
  doc.say('Relatório exportado.');
}
const rowText = (side: { n: number; text: string } | undefined): string => (side ? side.text : '');
</script>

<template>
  <EditorShell v-model:tab="tab" app="compare" :doc="doc" :tabs="tabs" :history="false">
    <template #panel="{ tab: current }">
      <div v-if="current === 'arquivos'" class="ed-group">
        <section v-for="key in (['a', 'b'] as const)" :key="key" class="side" :aria-label="'Lado ' + key.toUpperCase()">
          <h2 class="ed-label-h">Lado {{ key.toUpperCase() }}</h2>
          <label class="ed-field"><span class="ed-label">Arquivo</span>
            <input type="file" class="inp" :aria-label="'Escolher o arquivo do lado ' + key.toUpperCase()" :data-testid="'side-' + key + '-file'" @change="onFile(key, $event)" /></label>
          <label class="ed-field"><span class="ed-label">Nome</span>
            <input class="inp" :value="state[key].name" maxlength="160" :data-testid="'side-' + key + '-name'" @change="onName(key, $event)" /></label>
          <label v-if="state[key].kind !== 'binary'" class="ed-field"><span class="ed-label">Texto (cole ou edite)</span>
            <textarea class="inp" rows="5" spellcheck="false" :value="state[key].text" :maxlength="MAX_TEXT_CHARS" :data-testid="'side-' + key + '-text'" @input="onText(key, $event)" /></label>
          <p v-else class="ed-hint" :data-testid="'side-' + key + '-binary'">Arquivo binário de {{ formatBytes(state[key].size) }}: comparado byte a byte.</p>
          <div class="ed-row"><button type="button" class="btn" :disabled="state[key].kind === 'empty'" :data-testid="'clear-' + key" @click="clearSide(key)">Limpar lado {{ key.toUpperCase() }}</button></div>
        </section>
        <div class="ed-row"><button type="button" class="btn" data-testid="swap-sides" @click="swap">Trocar A e B</button></div>
      </div>

      <div v-else-if="current === 'opcoes'" class="ed-group">
        <fieldset class="opts">
          <legend class="ed-label">Ao comparar texto</legend>
          <label class="check"><input v-model="state.options.ignoreCase" type="checkbox" data-testid="opt-case" /> Ignorar maiúsculas e minúsculas</label>
          <label class="check"><input v-model="state.options.ignoreSpace" type="checkbox" data-testid="opt-space" /> Ignorar espaços repetidos e nas pontas</label>
          <label class="check"><input v-model="state.options.ignoreBlank" type="checkbox" data-testid="opt-blank" /> Ignorar linhas em branco</label>
        </fieldset>
        <fieldset class="opts">
          <legend class="ed-label">Exibição</legend>
          <label class="check"><input type="radio" name="cmp-view" :checked="state.view === 'side'" data-testid="view-side" @change="state.view = 'side'" /> Lado a lado</label>
          <label class="check"><input type="radio" name="cmp-view" :checked="state.view === 'unified'" data-testid="view-unified" @change="state.view = 'unified'" /> Unificada (como o diff)</label>
          <label class="check"><input v-model="state.onlyDiffs" type="checkbox" data-testid="only-diffs" /> Mostrar só as diferenças (com 3 linhas de contexto)</label>
        </fieldset>
        <p class="ed-hint">Finais de linha diferentes (Windows e Linux) nunca contam como diferença. Arquivos que não são texto são comparados byte a byte.</p>
      </div>

      <FileTab v-else :templates="compareTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!result || result.identical" data-testid="export-diff" @click="exportDiff">Diferenças (.diff)</button>
        <button type="button" class="btn" :disabled="!result || result.identical" data-testid="copy-diff" @click="copyDiff">Copiar diferenças</button>
        <button type="button" class="btn" :disabled="status === 'vazio'" data-testid="export-report" @click="exportReport">Relatório (TXT)</button>
      </FileTab>
    </template>

    <div class="stage" data-testid="compare-stage">
      <p v-if="problem" class="ed-error" role="alert" data-testid="compare-error">{{ problem }}</p>
      <p v-else-if="info" class="ed-ok" role="status" data-testid="compare-info">{{ info }}</p>

      <section aria-labelledby="res-h">
        <h2 id="res-h" class="sh">Resultado</h2>
        <p class="status" :data-state="status" data-testid="compare-status">{{ statusText }}</p>
        <template v-if="result && !result.tooLarge">
          <ul class="stats" data-testid="compare-stats">
            <li>Semelhança <strong data-testid="stat-similarity">{{ result.stats.similarity }}%</strong></li>
            <li>Trocadas <strong data-testid="stat-changed">{{ result.stats.changed }}</strong></li>
            <li>Removidas <strong data-testid="stat-removed">{{ result.stats.removed }}</strong></li>
            <li>Acrescentadas <strong data-testid="stat-added">{{ result.stats.added }}</strong></li>
            <li>Iguais <strong data-testid="stat-same">{{ result.stats.same }}</strong></li>
          </ul>
          <p v-if="result.eolA !== result.eolB && result.eolA !== 'none' && result.eolB !== 'none'" class="ed-hint" data-testid="eol-note">Finais de linha diferentes: A usa {{ eolName(result.eolA) }} e B usa {{ eolName(result.eolB) }}. Isso não conta como diferença.</p>
          <p v-if="result.approximate" class="ed-error" role="status" data-testid="approx-note">Há diferenças demais para um cálculo exato: o trecho muito diferente aparece como trocado por inteiro.</p>
          <div v-if="diffStarts.length" class="ed-row" role="group" aria-label="Navegar pelas diferenças">
            <button type="button" class="btn" data-testid="prev-diff" @click="goto(-1)">Diferença anterior</button>
            <button type="button" class="btn" data-testid="next-diff" @click="goto(1)">Próxima diferença</button>
            <span class="ed-hint" data-testid="diff-position">{{ pos >= 0 ? pos + 1 : '–' }} de {{ diffStarts.length }}</span>
          </div>
        </template>
        <p v-else-if="result?.tooLarge" class="ed-error" role="alert" data-testid="too-large">Os arquivos têm linhas demais para comparar aqui. Compare partes menores.</p>
      </section>

      <section v-if="digest" aria-labelledby="hash-h" data-testid="hashes">
        <h2 id="hash-h" class="sh">Tamanho e SHA-256</h2>
        <dl class="hash">
          <dt>A · {{ state.a.name }}</dt><dd><span>{{ formatBytes(state.a.size) }}</span> <code data-testid="hash-a">{{ digest.shaA }}</code></dd>
          <dt>B · {{ state.b.name }}</dt><dd><span>{{ formatBytes(state.b.size) }}</span> <code data-testid="hash-b">{{ digest.shaB }}</code></dd>
        </dl>
        <p class="ed-hint" data-testid="hash-verdict">{{ sameHash ? 'As impressões digitais são iguais: os arquivos são idênticos byte a byte.' : 'As impressões digitais são diferentes.' }}</p>
      </section>

      <section v-if="digest?.binary" aria-labelledby="bin-h" data-testid="binary-result">
        <h2 id="bin-h" class="sh">Comparação byte a byte</h2>
        <p v-if="digest.binary.identical">Nenhuma diferença.</p>
        <template v-else>
          <p data-testid="binary-summary">Primeira diferença no byte <strong>{{ digest.binary.firstDifference }}</strong> · {{ digest.binary.differentBytes }} {{ digest.binary.differentBytes === 1 ? 'byte diferente' : 'bytes diferentes' }} · A tem {{ digest.binary.sizeA }} e B tem {{ digest.binary.sizeB }} bytes.</p>
          <div class="hexwrap" role="group" aria-label="Bytes ao redor da primeira diferença" data-testid="hex-view">
            <div v-for="r in hexRows" :key="r.offset" class="hexrow">
              <span class="off">{{ r.offset }}</span>
              <span class="hx"><span class="sr-only">Lado A: </span><template v-for="(c, i) in r.a" :key="i"><mark v-if="c.d">{{ c.v }}</mark><span v-else>{{ c.v }}</span>{{ ' ' }}</template></span>
              <span class="hx"><span class="sr-only">Lado B: </span><template v-for="(c, i) in r.b" :key="i"><mark v-if="c.d">{{ c.v }}</mark><span v-else>{{ c.v }}</span>{{ ' ' }}</template></span>
            </div>
          </div>
        </template>
      </section>

      <section v-if="result && !result.identical && !result.tooLarge" aria-labelledby="diff-h">
        <h2 id="diff-h" class="sh">Diferenças</h2>
        <div class="diff" :class="'v-' + state.view" role="table" aria-label="Linhas comparadas" data-testid="diff-view">
          <template v-for="(item, i) in limited" :key="i">
            <div v-if="'skipped' in item" class="skip" role="row"><span role="cell">… {{ item.skipped }} {{ item.skipped === 1 ? 'linha igual' : 'linhas iguais' }} …</span></div>
            <template v-else>
              <div v-if="state.view === 'side'" class="drow" role="row" :data-kind="(item.row as Row).kind" :data-row-index="item.index">
                <span class="ln" role="cell">{{ (item.row as Row).a?.n ?? '' }}</span>
                <span class="tx a" role="cell"><template v-if="(item.row as Row).segA"><template v-for="(s, j) in (item.row as Row).segA" :key="j"><mark v-if="s.changed">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></template><template v-else>{{ rowText((item.row as Row).a) }}</template></span>
                <span class="ln lnb" role="cell">{{ (item.row as Row).b?.n ?? '' }}</span>
                <span class="tx b" role="cell"><template v-if="(item.row as Row).segB"><template v-for="(s, j) in (item.row as Row).segB" :key="j"><mark v-if="s.changed">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></template><template v-else>{{ rowText((item.row as Row).b) }}</template></span>
              </div>
              <template v-else>
                <div v-if="(item.row as Row).kind === 'eq'" class="urow" role="row" data-kind="eq" :data-row-index="item.index"><span class="mk" role="cell" aria-label="igual"> </span><span class="tx" role="cell">{{ rowText((item.row as Row).a) }}</span></div>
                <template v-else>
                  <div v-if="(item.row as Row).a" class="urow" role="row" data-kind="del" :data-row-index="item.index"><span class="mk" role="cell" aria-label="removida">−</span><span class="tx" role="cell">{{ rowText((item.row as Row).a) }}</span></div>
                  <div v-if="(item.row as Row).b" class="urow" role="row" data-kind="add"><span class="mk" role="cell" aria-label="acrescentada">+</span><span class="tx" role="cell">{{ rowText((item.row as Row).b) }}</span></div>
                </template>
              </template>
            </template>
          </template>
        </div>
        <p v-if="shown.length > MAX_ROWS" class="ed-hint">Mostrando as primeiras {{ MAX_ROWS }} linhas. Exporte as diferenças para ver tudo.</p>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.stage { display: grid; gap: 16px; width: min(100%, 1100px); margin: 0 auto; padding: 14px max(14px, var(--sa-r)) 28px max(14px, var(--sa-l)); box-sizing: border-box; min-width: 0; }
.sh { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.ed-label-h { margin: 0; font-size: 14px; }
.side { display: grid; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
textarea.inp { resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; }
.opts { border: 0; margin: 0 0 8px; padding: 0; display: grid; gap: 2px; }
.check { display: flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; flex: 0 0 auto; }
.status { margin: 0 0 8px; font-size: 18px; font-weight: 800; }
.status[data-state="identicos"], .status[data-state="iguais-no-conteudo"] { color: var(--ok); }
.stats { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; }
.stats strong { font-variant-numeric: tabular-nums; }
.hash { margin: 0; display: grid; gap: 2px; }
.hash dt { font-weight: 700; overflow-wrap: anywhere; }
.hash dd { margin: 0 0 8px; display: grid; gap: 2px; min-width: 0; }
.hash code { overflow-wrap: anywhere; font-size: 12.5px; }
.hexwrap { display: grid; gap: 6px; overflow-x: auto; font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.hexrow { display: grid; grid-template-columns: 70px max-content max-content; gap: 12px; align-items: start; }
.off { color: var(--muted); }
.hx { white-space: pre; }
mark { background: color-mix(in srgb, var(--danger) 28%, transparent); color: inherit; border-radius: 3px; }
.diff { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font: 13.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-x: auto; }
.drow { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px minmax(0, 1fr); min-width: 0; }
.drow > span { padding: 1px 6px; overflow-wrap: anywhere; white-space: pre-wrap; }
.ln { text-align: right; color: var(--muted); user-select: none; border-right: 1px solid var(--border); }
.drow[data-kind="del"] .a, .drow[data-kind="chg"] .a { background: color-mix(in srgb, var(--danger) 12%, transparent); }
.drow[data-kind="add"] .b, .drow[data-kind="chg"] .b { background: color-mix(in srgb, var(--ok) 14%, transparent); }
.urow { display: grid; grid-template-columns: 24px minmax(0, 1fr); }
.urow > span { padding: 1px 6px; overflow-wrap: anywhere; white-space: pre-wrap; }
.urow[data-kind="del"] { background: color-mix(in srgb, var(--danger) 12%, transparent); }
.urow[data-kind="add"] { background: color-mix(in srgb, var(--ok) 14%, transparent); }
.mk { text-align: center; font-weight: 800; }
.skip { padding: 4px 8px; color: var(--muted); background: var(--panel); text-align: center; font-size: 12.5px; }
@media (max-width: 599px) {
  .drow { grid-template-columns: 34px minmax(0, 1fr); }
  .drow .lnb { display: none; }
  .drow .b { grid-column: 1 / -1; border-top: 1px dashed var(--border); }
}
</style>
