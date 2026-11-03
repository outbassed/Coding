<script setup lang="ts">
import { computed, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import SegTabs from '../../editors/SegTabs.vue';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useDocument } from '../../editors/useDocument';
import { downloadText, safeFileName } from '../../shared/files/download';
import { toCsv } from '../../shared/files/csv';
import MoneyInput from './MoneyInput.vue';
import { formatMoney } from './money';
import { MAX_EXPENSES, MAX_PEOPLE, owedFor, settle, sid, summarize, summaryText, type Expense, type SplitMode } from './model';
import { splitKind, splitTemplates } from './kind';
import { usePrint } from '../../shared/print/usePrint';
import { requestPrint } from '../../shared/print/print';
import { splitPrintPage } from './print';

const doc = useDocument({ kind: splitKind, templates: splitTemplates, path: '/apps/racha-conta/' });
const { state } = doc;
/** Layout livre: no PC tudo aparece junto (pessoas e despesas à esquerda, o resultado — acertos e saldos — sempre à vista à direita); no celular, uma seção por vez. */
const wide = useMediaQuery('(min-width: 900px)', true);
const tab = ref('despesas');
const tabs = [{ id: 'despesas', label: 'Despesas' }, { id: 'pessoas', label: 'Pessoas' }, { id: 'acertos', label: 'Acertos' }, { id: 'arquivo', label: 'Arquivo' }];
const selectedId = ref<string | null>(state.value.expenses[0]?.id ?? null);
const selected = computed(() => state.value.expenses.find((e) => e.id === selectedId.value) ?? null);
const summary = computed(() => summarize(state.value));
const transfers = computed(() => settle(summary.value.balance, state.value.people.map((p) => p.id)));
const nameOf = (id: string): string => state.value.people.find((p) => p.id === id)?.name.trim() || 'Sem nome';
const check = computed(() => (selected.value ? owedFor(selected.value, state.value.people) : null));
const maxAbs = computed(() => Math.max(1, ...Object.values(summary.value.balance).map((v) => Math.abs(v))));
const modes: { id: SplitMode; label: string }[] = [{ id: 'equal', label: 'Igual' }, { id: 'percent', label: 'Porcentagem' }, { id: 'custom', label: 'Valores' }];

function addPerson(): void {
  if (state.value.people.length >= MAX_PEOPLE) { doc.say('Limite de ' + MAX_PEOPLE + ' pessoas.'); return; }
  const id = sid();
  state.value.people.push({ id, name: 'Pessoa ' + (state.value.people.length + 1) });
  for (const e of state.value.expenses) if (e.mode === 'equal') e.participants.push(id);
  requestAnimationFrame(() => document.getElementById('person-' + id)?.focus());
}
function removePerson(id: string): void {
  const used = state.value.expenses.some((e) => e.payer === id);
  if (used) { doc.say('Esta pessoa pagou uma despesa. Troque quem pagou antes de remover.'); return; }
  if (!confirm('Remover ' + nameOf(id) + '? A parte dela nas despesas deixa de existir.')) return;
  state.value.people = state.value.people.filter((p) => p.id !== id);
  for (const e of state.value.expenses) { e.participants = e.participants.filter((p) => p !== id); delete e.shares[id]; }
}
function addExpense(): void {
  if (state.value.expenses.length >= MAX_EXPENSES) { doc.say('Limite de ' + MAX_EXPENSES + ' despesas.'); return; }
  if (!state.value.people.length) { doc.say('Adicione pessoas antes das despesas.'); tab.value = 'pessoas'; return; }
  const e: Expense = { id: sid(), description: 'Nova despesa', amount: 0, payer: state.value.people[0]!.id, mode: 'equal', shares: {}, participants: state.value.people.map((p) => p.id) };
  state.value.expenses.push(e);
  selectedId.value = e.id; tab.value = 'despesas';
  requestAnimationFrame(() => document.getElementById('exp-desc')?.focus());
}
function removeExpense(id: string): void {
  const index = state.value.expenses.findIndex((e) => e.id === id);
  if (index < 0) return;
  state.value.expenses.splice(index, 1);
  selectedId.value = state.value.expenses[Math.min(index, state.value.expenses.length - 1)]?.id ?? null;
  doc.say('Despesa removida. Use Desfazer para recuperar.');
}
function duplicateExpense(id: string): void {
  const e = state.value.expenses.find((x) => x.id === id); if (!e) return;
  const copy: Expense = JSON.parse(JSON.stringify(e)) as Expense;
  copy.id = sid(); copy.description = (e.description + ' (cópia)').slice(0, 120);
  state.value.expenses.push(copy); selectedId.value = copy.id;
}
function setMode(mode: SplitMode): void {
  const e = selected.value; if (!e || e.mode === mode) return;
  e.mode = mode;
  const n = state.value.people.length;
  if (mode === 'percent') { const parts = n ? Array.from({ length: n }, (_, i) => Math.floor(10000 / n) + (i < 10000 % n ? 1 : 0)) : []; e.shares = Object.fromEntries(state.value.people.map((p, i) => [p.id, parts[i] ?? 0])); }
  if (mode === 'custom') { const o = owedFor({ ...e, mode: 'equal', participants: e.participants.length ? e.participants : state.value.people.map((p) => p.id) }, state.value.people).owed; e.shares = { ...o }; }
}
function toggleParticipant(id: string, on: boolean): void {
  const e = selected.value; if (!e) return;
  e.participants = on ? [...new Set([...e.participants, id])] : e.participants.filter((p) => p !== id);
}
function share(id: string): number { return selected.value?.shares[id] ?? 0; }
function setShare(id: string, value: number): void { const e = selected.value; if (e) e.shares = { ...e.shares, [id]: value }; }

function exportTxt(): void { downloadText(summaryText(state.value), safeFileName(state.value.name, 'racha-conta') + '.txt'); doc.say('Resumo exportado em TXT.'); }
function exportCsv(): void {
  const rows: string[][] = [['Despesa', 'Valor (R$)', 'Pagou', 'Divisão', ...state.value.people.map((p) => 'Parte de ' + nameOf(p.id))]];
  const brl = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  for (const e of state.value.expenses) {
    const o = owedFor(e, state.value.people);
    rows.push([e.description, brl(e.amount), nameOf(e.payer), o.error ? 'Incompleta' : modes.find((m) => m.id === e.mode)!.label, ...state.value.people.map((p) => (o.error ? '' : brl(o.owed[p.id] ?? 0)))]);
  }
  rows.push([]);
  rows.push(['Pessoa', 'Pagou', 'Parte', 'Saldo']);
  for (const p of state.value.people) rows.push([nameOf(p.id), brl(summary.value.paid[p.id] ?? 0), brl(summary.value.owed[p.id] ?? 0), brl(summary.value.balance[p.id] ?? 0)]);
  downloadText(toCsv(rows), safeFileName(state.value.name, 'racha-conta') + '.csv', 'text/csv;charset=utf-8');
  doc.say('Planilha CSV exportada.');
}
// Imprimir: um resumo próprio (total, saldo por pessoa, quem paga a quem e despesas), sem a interface do app.
usePrint({ kind: 'built', build: () => ({ title: state.value.name || 'Racha-conta', pages: [splitPrintPage(state.value)] }), buildSync: () => ({ title: state.value.name || 'Racha-conta', pages: [splitPrintPage(state.value)] }), enabled: () => state.value.people.length > 0, reason: () => 'Adicione pessoas e despesas para imprimir o resumo.', notify: (m) => doc.say(m) });
function printSummary(): void { void requestPrint(); }
</script>

<template>
  <EditorShell app="split" layout="free" :doc="doc">
    <div class="rc" :data-wide="wide ? 'sim' : 'nao'" data-testid="split-report">
      <section class="hero" aria-label="Resumo financeiro">
        <div class="total"><span class="muted">Total gasto</span><strong data-testid="split-total">{{ formatMoney(summary.total) }}</strong></div>
        <div class="mini"><span class="muted">Pessoas</span><strong>{{ state.people.length }}</strong></div>
        <div class="mini"><span class="muted">Despesas</span><strong>{{ state.expenses.length }}</strong></div>
        <details v-if="wide" class="filemenu" data-testid="file-menu">
          <summary class="btn">Arquivo</summary>
          <div class="filemenu-body">
            <FileTab :templates="splitTemplates" @new="doc.newFrom">
              <button type="button" class="btn" data-testid="export-csv" @click="exportCsv">Exportar CSV</button>
              <button type="button" class="btn" data-testid="export-txt" @click="exportTxt">Exportar resumo (TXT)</button>
              <button type="button" class="btn" data-testid="print-app" @click="printSummary">Imprimir / PDF</button>
            </FileTab>
          </div>
        </details>
      </section>
      <p v-if="summary.invalid.length" class="ed-error" role="status">{{ summary.invalid.length }} despesa(s) com divisão incompleta não entram nas contas.</p>

      <SegTabs v-if="!wide" v-model="tab" :tabs="tabs" label="Seções do racha-conta" prefix="rc" panel-id="rc-work" fill />

      <div id="rc-work" class="work" :role="wide ? undefined : 'tabpanel'" :aria-labelledby="wide ? undefined : 'rc-tab-' + tab">
        <section v-show="wide || tab === 'pessoas'" class="block people-block" aria-labelledby="ppl-h">
          <h2 id="ppl-h">Pessoas ({{ state.people.length }})</h2>
          <ul class="people" data-testid="people">
            <li v-for="(p, i) in state.people" :key="p.id">
              <label class="sr-only" :for="'person-' + p.id">Nome da pessoa {{ i + 1 }}</label>
              <input :id="'person-' + p.id" v-model="p.name" class="inp" maxlength="60" @input="doc.setChangeKey('p' + p.id)" />
              <button type="button" class="ib" :aria-label="'Remover ' + (p.name || 'pessoa ' + (i + 1))" @click="removePerson(p.id)">✕</button>
            </li>
          </ul>
          <div class="ed-row"><button type="button" class="btn" data-testid="add-person" @click="addPerson">Adicionar pessoa</button></div>
        </section>

        <section v-show="wide || tab === 'despesas'" class="block exp-block" aria-labelledby="exp-h">
          <div class="exp-head"><h2 id="exp-h">Despesas</h2><button type="button" class="btn btn-app" data-testid="add-expense" @click="addExpense">Nova despesa</button></div>
          <div class="md">
            <ul class="expenses">
              <li v-for="e in state.expenses" :key="e.id">
                <button type="button" class="exp" :aria-current="e.id === selectedId ? 'true' : undefined" @click="selectedId = e.id; tab = 'despesas'">
                  <span>{{ e.description || 'Sem descrição' }}<small class="muted"> · pagou {{ nameOf(e.payer) }}</small></span>
                  <strong>{{ formatMoney(e.amount) }}</strong>
                </button>
              </li>
            </ul>
            <div v-if="selected" class="ed-group editor" data-testid="expense-editor">
              <div class="ed-row">
                <label class="ed-field grow"><span class="ed-label">Descrição</span><input id="exp-desc" v-model="selected.description" class="inp" maxlength="120" @input="doc.setChangeKey('d' + selected.id)" /></label>
                <span class="ed-field"><span class="ed-label" aria-hidden="true">Valor (R$)</span><MoneyInput id="exp-amount" v-model="selected.amount" label="Valor da despesa em reais" /></span>
                <label class="ed-field"><span class="ed-label">Quem pagou</span>
                  <select v-model="selected.payer" class="inp" data-testid="payer"><option v-for="p in state.people" :key="p.id" :value="p.id">{{ p.name || 'Sem nome' }}</option></select></label>
              </div>
              <div class="modes" role="radiogroup" aria-label="Como dividir">
                <button v-for="m in modes" :key="m.id" type="button" role="radio" class="ib mode" :aria-checked="selected.mode === m.id" @click="setMode(m.id)">{{ m.label }}</button>
              </div>
              <ul class="shares">
                <li v-for="p in state.people" :key="p.id">
                  <template v-if="selected.mode === 'equal'">
                    <label class="check"><input type="checkbox" :checked="selected.participants.includes(p.id)" @change="toggleParticipant(p.id, ($event.target as HTMLInputElement).checked)" /> {{ p.name || 'Sem nome' }}</label>
                    <span class="muted">{{ check && !check.error ? formatMoney(check.owed[p.id] ?? 0) : '—' }}</span>
                  </template>
                  <template v-else>
                    <span class="who">{{ p.name || 'Sem nome' }}</span>
                    <MoneyInput :id="'share-' + p.id" :model-value="share(p.id)" :label="(selected.mode === 'percent' ? 'Porcentagem de ' : 'Valor de ') + (p.name || 'sem nome')" :suffix="selected.mode === 'percent' ? '%' : ''" @update:model-value="(v) => setShare(p.id, v)" />
                    <span v-if="selected.mode === 'percent'" class="muted">{{ check && !check.error ? formatMoney(check.owed[p.id] ?? 0) : '' }}</span>
                  </template>
                </li>
              </ul>
              <p v-if="check?.error" class="ed-error" role="status" data-testid="expense-error">{{ check.error }}</p>
              <div class="ed-row">
                <button type="button" class="btn" @click="duplicateExpense(selected.id)">Duplicar</button>
                <button type="button" class="btn" @click="removeExpense(selected.id)">Excluir despesa</button>
              </div>
            </div>
            <p v-else class="ed-hint">Nenhuma despesa ainda. Toque em “Nova despesa”.</p>
          </div>
        </section>

        <section v-if="!wide && tab === 'arquivo'" class="block" aria-label="Arquivo">
          <FileTab :templates="splitTemplates" @new="doc.newFrom">
            <button type="button" class="btn" data-testid="export-csv" @click="exportCsv">Exportar CSV</button>
            <button type="button" class="btn" data-testid="export-txt" @click="exportTxt">Exportar resumo (TXT)</button>
            <button type="button" class="btn" data-testid="print-app" @click="printSummary">Imprimir / PDF</button>
          </FileTab>
        </section>
      </div>

      <section v-show="wide || tab === 'acertos'" class="answer" aria-label="Resultado da divisão">
        <section class="block" aria-labelledby="set-h">
          <h2 id="set-h">Acertos sugeridos</h2>
          <ol v-if="transfers.length" class="transfers" data-testid="transfers">
            <li v-for="(t, i) in transfers" :key="i"><strong>{{ nameOf(t.from) }}</strong> paga <strong>{{ formatMoney(t.amount) }}</strong> para <strong>{{ nameOf(t.to) }}</strong></li>
          </ol>
          <p v-else class="muted" data-testid="transfers">Ninguém deve nada.</p>
        </section>
        <section class="block" aria-labelledby="bal-h">
          <h2 id="bal-h">Saldos</h2>
          <ul class="balances" data-testid="balances">
            <li v-for="p in state.people" :key="p.id">
              <span class="who">{{ p.name || 'Sem nome' }}</span>
              <span class="bar" aria-hidden="true"><span :class="(summary.balance[p.id] ?? 0) >= 0 ? 'pos' : 'neg'" :style="{ width: Math.round(Math.abs(summary.balance[p.id] ?? 0) / maxAbs * 100) + '%' }"></span></span>
              <span class="val" :class="(summary.balance[p.id] ?? 0) >= 0 ? 'pos-t' : 'neg-t'">{{ (summary.balance[p.id] ?? 0) > 0 ? 'recebe ' : (summary.balance[p.id] ?? 0) < 0 ? 'paga ' : '' }}{{ formatMoney(Math.abs(summary.balance[p.id] ?? 0)) }}</span>
              <small class="muted">pagou {{ formatMoney(summary.paid[p.id] ?? 0) }} · parte {{ formatMoney(summary.owed[p.id] ?? 0) }}</small>
            </li>
          </ul>
        </section>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.grow { flex: 1 1 180px; }
.people, .shares, .balances, .expenses { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.people li { display: flex; gap: 6px; align-items: center; }
.people .inp { flex: 1; }
.modes { display: flex; flex-wrap: wrap; gap: 6px; }
.mode { border: 1px solid var(--border); padding: 0 14px; }
.mode[aria-checked="true"] { background: var(--app); border-color: var(--app); color: var(--ink); }
.shares li { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 4px 0; border-bottom: 1px solid var(--border); }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; }
.check input { width: 20px; height: 20px; }
.who { font-weight: 700; min-width: 80px; }
.rc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; box-sizing: border-box; min-width: 0; padding: 14px max(14px, var(--sa-r)) 32px max(14px, var(--sa-l)); }
.rc h2 { font-size: 16px; margin: 0 0 8px; }
.hero { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; padding: 14px 18px; border: 1px solid var(--border); border-radius: 20px; background: linear-gradient(100deg, color-mix(in srgb, var(--app) 14%, var(--surface)), var(--surface) 70%); }
.total { display: grid; gap: 2px; flex: 1 1 200px; }
.total strong { font-size: clamp(30px, 8vw, 44px); line-height: 1.1; letter-spacing: -.02em; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.mini { display: grid; gap: 2px; text-align: center; }
.mini strong { font-size: 20px; }
@media (max-width: 899px) {
  .hero { padding: 12px 16px; gap: 4px 18px; }
  .total { flex-basis: 100%; }
  .mini { display: flex; gap: 8px; align-items: baseline; }
}
.filemenu { position: relative; margin-left: auto; }
.filemenu > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; }
.filemenu > summary::-webkit-details-marker { display: none; }
.filemenu-body { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; width: min(420px, 86vw); max-height: 70vh; overflow: auto; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 12px 32px #0003; }
.work { display: grid; gap: 14px; min-width: 0; align-content: start; }
.block { display: grid; gap: 10px; align-content: start; min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
.block h2 { margin: 0; }
.exp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.md { display: grid; gap: 12px; min-width: 0; }
.editor { padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
.answer { display: grid; gap: 14px; align-content: start; min-width: 0; }
.balances li { display: grid; grid-template-columns: minmax(70px, 1fr) minmax(60px, 2fr) auto; gap: 4px 10px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; }
.balances small { grid-column: 1 / -1; }
.bar { height: 10px; background: var(--raised); border-radius: 6px; overflow: hidden; }
.bar span { display: block; height: 100%; }
.pos { background: var(--ok); } .neg { background: var(--danger); }
.pos-t { color: var(--ok); font-weight: 750; } .neg-t { color: var(--danger); font-weight: 750; }
.transfers { margin: 0; padding-left: 22px; display: grid; gap: 6px; }
.exp { width: 100%; display: flex; justify-content: space-between; gap: 10px; text-align: left; min-height: 48px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.exp[aria-current="true"] { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); }
@media (min-width: 900px) {
  .rc { grid-template-columns: minmax(0, 1fr) 360px; column-gap: 18px; padding-top: 18px; }
  .hero, .rc > .ed-error { grid-column: 1 / -1; }
  .answer { position: sticky; top: 0; }
  .people { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
  .md { grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); align-items: start; }
}
</style>
