<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadText, safeFileName } from '../../shared/files/download';
import { backspace, clearAll, clearEntry, defineVariable, equals, historyText, insertText, memory, preview, removeVariable, show, toggleSign, type CalcMode, type Edit, type MemoryOp } from './model';
import { plainNumber } from './format';
import { calculatorKind, calculatorTemplates } from './kind';
import type { AngleUnit } from './parser';

const doc = useDocument({ kind: calculatorKind, templates: calculatorTemplates, path: '/apps/calculadora/' });
const { state } = doc;
const isPro = computed(() => state.value.mode === 'pro');
const tabs = computed(() => [
  { id: 'modo', label: 'Modo' }, { id: 'historico', label: 'Histórico' },
  ...(isPro.value ? [{ id: 'variaveis', label: 'Variáveis' }] : []),
  { id: 'arquivo', label: 'Arquivo' }
]);
const tab = ref('modo');
watch(isPro, (pro) => { if (!pro && tab.value === 'variaveis') tab.value = 'modo'; });

const input = ref<HTMLInputElement | null>(null);
/** Só mostra erro depois de o usuário pedir o resultado com "=" (enquanto digita, uma conta incompleta não é um erro). */
const attempted = ref(false);
const error = ref('');

const live = computed(() => preview(state.value));
const resultText = computed(() => {
  if (state.value.done && state.value.ans !== null) return show(state.value, state.value.ans);
  if (live.value && live.value.ok) return show(state.value, live.value.value);
  return '';
});
const shownError = computed(() => (attempted.value && live.value && !live.value.ok ? live.value.error : error.value));

function apply(edit: Edit): void {
  Object.assign(state.value, edit.state);
  attempted.value = false; error.value = '';
  void nextTick(() => { const el = input.value; if (el) { try { el.setSelectionRange(edit.caret, edit.caret); } catch { /* campo sem seleção */ } } });
}
function caretRange(): [number, number] {
  const el = input.value;
  const end = state.value.expr.length;
  if (!isPro.value || !el || el.selectionStart === null) return [end, end];
  return [el.selectionStart, el.selectionEnd ?? el.selectionStart];
}
/** Tecla que insere texto (dígitos, operadores, funções). No Pro respeita o cursor; no Básico acrescenta no fim. */
function put(text: string): void {
  const [from, to] = caretRange();
  apply(insertText(state.value, text, from, to));
}
function doEquals(): void {
  const result = equals(state.value);
  if (result.outcome.ok) {
    Object.assign(state.value, result.state);
    attempted.value = false; error.value = '';
    doc.say('Resultado: ' + show(state.value, result.outcome.value));
  } else {
    attempted.value = true;
    error.value = result.outcome.error;
    doc.say(result.outcome.error);
  }
}
function neg(): void { apply({ state: toggleSign(state.value), caret: Infinity }); }
function back(): void {
  const [from, to] = caretRange();
  if (isPro.value && (from !== to || from < state.value.expr.length)) {
    // Apaga a seleção ou o caractere antes do cursor.
    const expr = state.value.expr;
    const start = from === to ? Math.max(0, from - 1) : from;
    apply({ state: { ...state.value, expr: expr.slice(0, start) + expr.slice(to), done: false }, caret: start });
  } else apply({ state: backspace(state.value), caret: Infinity });
}
function clear(): void {
  if (!state.value.expr && state.value.ans !== null) { apply({ state: clearAll(state.value), caret: 0 }); doc.say('Tudo limpo.'); }
  else { apply({ state: clearEntry(state.value), caret: 0 }); doc.say('Entrada limpa.'); }
}
function mem(op: MemoryOp): void {
  const r = memory(state.value, op);
  apply(r);
  doc.say(r.message);
}
function setMode(mode: CalcMode): void { state.value.mode = mode; doc.say(mode === 'pro' ? 'Modo Pro: funções científicas e variáveis.' : 'Modo Básico.'); }
function setAngle(angle: AngleUnit): void { state.value.angle = angle; }

function onType(): void { state.value.done = false; attempted.value = false; error.value = ''; }
const KEYMAP: Record<string, string> = { '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷', '(': '(', ')': ')', '%': '%', '^': '^', '!': '!', ',': ',', '.': ',' };
function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Enter' || (event.key === '=' && !isPro.value)) { event.preventDefault(); doEquals(); return; }
  if (event.key === 'Escape') { event.preventDefault(); clear(); return; }
  if (isPro.value) return; // no Pro o campo é um texto normal
  if (event.key === 'Backspace') { event.preventDefault(); back(); return; }
  if (event.key === 'Delete') { event.preventDefault(); clear(); return; }
  if (/^[0-9]$/.test(event.key)) { event.preventDefault(); put(event.key); return; }
  const mapped = KEYMAP[event.key];
  if (mapped) { event.preventDefault(); put(mapped); return; }
  if (event.key.length === 1) event.preventDefault(); // letras não fazem nada no Básico
}
function onPaste(event: ClipboardEvent): void {
  if (isPro.value) return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text') ?? '';
  let edit: Edit = { state: state.value, caret: state.value.expr.length };
  for (const ch of text.trim().slice(0, 200)) {
    const mapped = /[0-9]/.test(ch) ? ch : KEYMAP[ch];
    if (mapped) edit = insertText(edit.state, mapped, edit.state.expr.length);
  }
  apply(edit);
}

async function copyResult(): Promise<void> {
  let value: number | null = null;
  if (state.value.done) value = state.value.ans;
  else if (live.value && live.value.ok) value = live.value.value;
  if (value === null) { doc.say('Ainda não há resultado para copiar.'); return; }
  const text = state.value.decimals !== null ? value.toFixed(state.value.decimals).replace('.', ',') : plainNumber(value);
  try { await navigator.clipboard.writeText(text); doc.say('Resultado copiado: ' + text); }
  catch { doc.say('Não foi possível copiar automaticamente. O resultado é ' + text + '.'); }
}

// ---- histórico, variáveis, arquivo ----
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
function reuseExpr(expr: string): void { apply({ state: { ...state.value, expr, done: false }, caret: expr.length }); doc.say('Expressão recolocada na calculadora.'); }
function reuseValue(index: number): void {
  const entry = state.value.history[index];
  if (!entry) return;
  put(plainNumber(entry.value).replace(/^-/, '−'));
  doc.say('Resultado inserido na expressão.');
}
function clearHistory(): void { state.value.history = []; doc.say('Histórico apagado.'); }
function exportHistory(): void { downloadText(historyText(state.value), safeFileName(state.value.name, 'calculadora') + '.txt'); doc.say('Histórico exportado.'); }
const varName = ref('');
const varValue = ref('');
const varError = ref('');
function addVar(): void {
  const r = defineVariable(state.value, varName.value, varValue.value);
  if (!r.ok) { varError.value = r.error; return; }
  Object.assign(state.value, r.state);
  doc.say('Variável ' + varName.value.trim().toLowerCase() + ' salva.');
  varName.value = ''; varValue.value = ''; varError.value = '';
}
function dropVar(name: string): void { Object.assign(state.value, removeVariable(state.value, name)); doc.say('Variável ' + name + ' removida.'); }
const decimalOptions = [{ v: -1, label: 'Automático' }, ...Array.from({ length: 11 }, (_, i) => ({ v: i, label: i + (i === 1 ? ' casa' : ' casas') }))];
const decimalsModel = computed({
  get: () => state.value.decimals ?? -1,
  set: (v: number) => { state.value.decimals = v < 0 ? null : v; }
});

const sci: { id: string; label: string; text: string; aria: string }[] = [
  { id: 'sin', label: 'sen', text: 'sin(', aria: 'Seno' }, { id: 'cos', label: 'cos', text: 'cos(', aria: 'Cosseno' }, { id: 'tan', label: 'tan', text: 'tan(', aria: 'Tangente' },
  { id: 'lp', label: '(', text: '(', aria: 'Abrir parêntese' }, { id: 'rp', label: ')', text: ')', aria: 'Fechar parêntese' },
  { id: 'asin', label: 'sen⁻¹', text: 'asin(', aria: 'Arco-seno' }, { id: 'acos', label: 'cos⁻¹', text: 'acos(', aria: 'Arco-cosseno' }, { id: 'atan', label: 'tan⁻¹', text: 'atan(', aria: 'Arco-tangente' },
  { id: 'pow', label: 'xʸ', text: '^', aria: 'Potência' }, { id: 'sq', label: 'x²', text: '^2', aria: 'Ao quadrado' },
  { id: 'ln', label: 'ln', text: 'ln(', aria: 'Logaritmo natural' }, { id: 'log', label: 'log', text: 'log(', aria: 'Logaritmo na base 10' }, { id: 'sqrt', label: '√', text: '√(', aria: 'Raiz quadrada' },
  { id: 'fact', label: 'n!', text: '!', aria: 'Fatorial' }, { id: 'exp', label: 'eˣ', text: 'exp(', aria: 'Exponencial' },
  { id: 'pi', label: 'π', text: 'pi', aria: 'Pi' }, { id: 'e', label: 'e', text: 'e', aria: 'Número de Euler' }, { id: 'ans', label: 'ans', text: 'ans', aria: 'Último resultado' },
  { id: 'abs', label: '|x|', text: 'abs(', aria: 'Valor absoluto' }, { id: 'semi', label: ';', text: ';', aria: 'Separador de argumentos' }
];
const memKeys: { op: MemoryOp; label: string; aria: string }[] = [
  { op: 'mc', label: 'MC', aria: 'Limpar a memória' }, { op: 'mr', label: 'MR', aria: 'Usar o valor da memória' },
  { op: 'm-', label: 'M−', aria: 'Subtrair da memória' }, { op: 'm+', label: 'M+', aria: 'Somar à memória' }
];
const digitsRows = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']];
</script>

<template>
  <EditorShell v-model:tab="tab" app="calculator" :doc="doc" :tabs="tabs" :history="false">
    <template #panel="{ tab: current }">
      <div v-if="current === 'modo'" class="ed-group">
        <fieldset class="seg" data-testid="mode-group">
          <legend class="ed-label">Modo</legend>
          <label class="radio"><input type="radio" name="calc-mode" value="basic" :checked="!isPro" data-testid="mode-basic" @change="setMode('basic')" /> Básico</label>
          <label class="radio"><input type="radio" name="calc-mode" value="pro" :checked="isPro" data-testid="mode-pro" @change="setMode('pro')" /> Pro</label>
        </fieldset>
        <p class="ed-hint">Básico: teclado simples com memória. Pro: funções científicas, parênteses, constantes e variáveis. A expressão e o histórico ficam salvos.</p>
        <fieldset v-if="isPro" class="seg">
          <legend class="ed-label">Ângulos</legend>
          <label class="radio"><input type="radio" name="calc-angle" value="deg" :checked="state.angle === 'deg'" data-testid="angle-deg" @change="setAngle('deg')" /> Graus</label>
          <label class="radio"><input type="radio" name="calc-angle" value="rad" :checked="state.angle === 'rad'" data-testid="angle-rad" @change="setAngle('rad')" /> Radianos</label>
        </fieldset>
        <label class="ed-field"><span class="ed-label">Casas decimais</span>
          <select v-model.number="decimalsModel" class="inp" data-testid="calc-decimals"><option v-for="o in decimalOptions" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
        <p v-if="isPro" class="ed-hint">Separe os argumentos das funções com ponto e vírgula: <code>max(2;7)</code>. A vírgula é o separador decimal.</p>
      </div>

      <div v-else-if="current === 'historico'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!state.history.length" data-testid="clear-history" @click="clearHistory">Limpar histórico</button>
        </div>
        <ol v-if="state.history.length" class="hist" data-testid="calc-history" reversed>
          <li v-for="(h, i) in [...state.history].reverse().slice(0, 100)" :key="h.at + '-' + i">
            <small class="muted">{{ h.at ? dateFmt.format(h.at) : '' }}</small>
            <span class="hexpr">{{ h.expr }} = <strong>{{ h.text }}</strong></span>
            <span class="hbtn">
              <button type="button" class="btn" :aria-label="'Usar a expressão ' + h.expr" @click="reuseExpr(h.expr)">Expressão</button>
              <button type="button" class="btn" :aria-label="'Usar o resultado ' + h.text" @click="reuseValue(state.history.length - 1 - i)">Resultado</button>
            </span>
          </li>
        </ol>
        <p v-else class="ed-hint">As contas que você fecha com “=” aparecem aqui e ficam salvas no documento.</p>
      </div>

      <div v-else-if="current === 'variaveis'" class="ed-group">
        <form class="ed-row" @submit.prevent="addVar">
          <label class="ed-field"><span class="ed-label">Nome</span><input v-model="varName" class="inp" maxlength="16" autocomplete="off" placeholder="taxa" data-testid="var-name" /></label>
          <label class="ed-field"><span class="ed-label">Valor ou conta</span><input v-model="varValue" class="inp" maxlength="120" autocomplete="off" placeholder="0,01 ou 12*5" data-testid="var-value" /></label>
          <button type="submit" class="btn btn-app" data-testid="var-add">Salvar variável</button>
        </form>
        <p v-if="varError" class="ed-error" role="alert" data-testid="var-error">{{ varError }}</p>
        <ul v-if="state.vars.length" class="vars" data-testid="var-list">
          <li v-for="v in state.vars" :key="v.name">
            <button type="button" class="btn" :aria-label="'Inserir ' + v.name + ' na expressão'" @click="put(v.name)"><code>{{ v.name }}</code> = {{ show(state, v.value) }}</button>
            <button type="button" class="btn" :aria-label="'Remover a variável ' + v.name" @click="dropVar(v.name)">Remover</button>
          </li>
        </ul>
        <p v-else class="ed-hint">Crie nomes para valores que você repete, como <code>taxa</code> ou <code>capital</code>, e use-os nas contas.</p>
      </div>

      <FileTab v-else :templates="calculatorTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!state.history.length" data-testid="export-history" @click="exportHistory">Exportar histórico (TXT)</button>
      </FileTab>
    </template>

    <div class="calc" :data-mode="state.mode" data-testid="calculator">
      <section class="display" aria-label="Visor">
        <div class="flags" aria-hidden="true">
          <span v-if="state.memory !== 0" data-testid="mem-flag">M</span>
          <span v-if="isPro">{{ state.angle === 'deg' ? 'GRAUS' : 'RAD' }}</span>
        </div>
        <input
          ref="input" v-model="state.expr" class="expr" :readonly="!isPro" :inputmode="isPro ? 'text' : 'none'" type="text" spellcheck="false" autocomplete="off" autocapitalize="off"
          aria-label="Expressão" :aria-describedby="shownError ? 'calc-err' : undefined" :aria-invalid="shownError ? 'true' : undefined" data-testid="calc-expr"
          @input="onType" @keydown="onKey" @paste="onPaste" />
        <output class="result" :class="{ empty: !resultText }" data-testid="calc-result">{{ resultText || '0' }}</output>
        <p v-if="shownError" id="calc-err" class="ed-error err" role="alert" data-testid="calc-error">{{ shownError }}</p>
        <button type="button" class="btn copy" data-testid="copy-result" @click="copyResult">Copiar resultado</button>
      </section>

      <div v-if="isPro" class="sci" role="group" aria-label="Funções científicas" data-testid="sci-keys">
        <button v-for="k in sci" :key="k.id" type="button" class="key fn" :aria-label="k.aria" :data-testid="'key-' + k.id" @click="put(k.text)">{{ k.label }}</button>
      </div>

      <div class="pad" role="group" aria-label="Teclado numérico">
        <button v-for="m in memKeys" :key="m.op" type="button" class="key mem" :aria-label="m.aria" :data-testid="'key-' + m.op" @click="mem(m.op)">{{ m.label }}</button>
        <button type="button" class="key act" aria-label="Limpar" data-testid="key-clear" @click="clear">C</button>
        <button type="button" class="key act" aria-label="Apagar o último caractere" data-testid="key-back" @click="back">⌫</button>
        <button type="button" class="key act" aria-label="Porcentagem" data-testid="key-pct" @click="put('%')">%</button>
        <button type="button" class="key op" aria-label="Dividir" data-testid="key-div" @click="put('÷')">÷</button>
        <template v-for="(row, r) in digitsRows" :key="r">
          <button v-for="d in row" :key="d" type="button" class="key num" :data-testid="'key-' + d" @click="put(d)">{{ d }}</button>
          <button type="button" class="key op" :aria-label="['Multiplicar', 'Subtrair', 'Somar'][r]" :data-testid="['key-mul', 'key-sub', 'key-add'][r]" @click="put(['×', '−', '+'][r] as string)">{{ ['×', '−', '+'][r] }}</button>
        </template>
        <button type="button" class="key act" aria-label="Trocar o sinal" data-testid="key-neg" @click="neg">±</button>
        <button type="button" class="key num" data-testid="key-0" @click="put('0')">0</button>
        <button type="button" class="key num" aria-label="Vírgula decimal" data-testid="key-dec" @click="put(',')">,</button>
        <button type="button" class="key eq" aria-label="Calcular" data-testid="key-eq" @click="doEquals">=</button>
      </div>
    </div>
  </EditorShell>
</template>

<style scoped>
.calc { display: grid; gap: 12px; width: min(100%, 460px); margin: 0 auto; padding: 14px max(14px, var(--sa-r)) 28px max(14px, var(--sa-l)); box-sizing: border-box; }
.calc[data-mode="pro"] { width: min(100%, 560px); }
.display { position: relative; display: grid; gap: 6px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; min-width: 0; }
.flags { display: flex; gap: 8px; min-height: 16px; font-size: 11px; font-weight: 800; letter-spacing: .06em; color: var(--muted); }
.expr { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 4px; border: 0; background: transparent; color: var(--text); font: 600 20px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: right; outline-offset: 2px; }
.expr:focus-visible { outline: 2px solid var(--accent); border-radius: 8px; }
.result { display: block; min-height: 52px; text-align: right; font-size: clamp(30px, 9vw, 44px); font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.result.empty { color: var(--muted); }
.err { margin: 0; text-align: right; }
.copy { justify-self: end; min-height: 44px; }
.pad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.sci { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.key { min-height: 52px; padding: 0 4px; border-radius: 14px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 20px; font-weight: 700; }
.key:hover { border-color: var(--app, var(--accent)); }
.key:active { transform: translateY(1px); }
.key.num { background: var(--surface); }
.key.op, .key.act { color: var(--app-cx-l, var(--accent)); color: light-dark(var(--app-cx-l, var(--accent)), var(--app-cx-d, var(--accent))); }
.key.mem, .key.fn { min-height: 44px; font-size: 15px; font-weight: 700; }
.key.eq { background: var(--app, var(--accent)); border-color: var(--app, var(--accent)); color: var(--ink); }
.seg { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; }
.radio { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 650; }
.radio input { width: 20px; height: 20px; }
.hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 50vh; overflow: auto; }
.hist li { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.hexpr { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.hbtn { display: flex; flex-wrap: wrap; gap: 6px; }
.vars { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
.vars li { display: flex; flex-wrap: wrap; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .key:active { transform: none; } }
</style>
