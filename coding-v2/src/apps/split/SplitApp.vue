<script setup lang="ts">
import { computed, ref } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadText, safeFileName } from '../../shared/files/download';
import { toCsv } from '../../shared/files/csv';
import MoneyInput from './MoneyInput.vue';
import { formatMoney } from './money';
import { MAX_EXPENSES, MAX_PEOPLE, owedFor, settle, sid, summarize, summaryText, type Expense, type SplitMode } from './model';
import { splitKind, splitTemplates } from './kind';

const doc = useDocument({ kind: splitKind, templates: splitTemplates, path: '/apps/racha-conta/' });
const { state } = doc;
const tab = ref('despesas');
const tabs = [{ id: 'pessoas', label: 'Pessoas' }, { id: 'despesas', label: 'Despesas' }, { id: 'arquivo', label: 'Arquivo' }];
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
function printSummary(): void { window.print(); }
</script>

<template>
  <EditorShell v-model:tab="tab" app="split" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'pessoas'" class="ed-group">
        <h3>Pessoas ({{ state.people.length }})</h3>
        <ul class="people" data-testid="people">
          <li v-for="(p, i) in state.people" :key="p.id">
            <label class="sr-only" :for="'person-' + p.id">Nome da pessoa {{ i + 1 }}</label>
            <input :id="'person-' + p.id" v-model="p.name" class="inp" maxlength="60" @input="doc.setChangeKey('p' + p.id)" />
            <button type="button" class="ib" :aria-label="'Remover ' + (p.name || 'pessoa ' + (i + 1))" @click="removePerson(p.id)">✕</button>
          </li>
        </ul>
        <div class="ed-row"><button type="button" class="btn" data-testid="add-person" @click="addPerson">Adicionar pessoa</button></div>
      </div>
      <div v-else-if="current === 'despesas'" class="exp-panel">
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="add-expense" @click="addExpense">Nova despesa</button>
          <label v-if="state.expenses.length" class="ed-field grow"><span class="ed-label">Editar despesa</span>
            <select v-model="selectedId" class="inp" data-testid="expense-select"><option v-for="e in state.expenses" :key="e.id" :value="e.id">{{ e.description || 'Sem descrição' }} · {{ formatMoney(e.amount) }}</option></select>
          </label>
        </div>
        <div v-if="selected" class="ed-group" data-testid="expense-editor">
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
      <FileTab v-else :templates="splitTemplates" @new="doc.newFrom">
        <button type="button" class="btn" data-testid="export-csv" @click="exportCsv">Exportar CSV</button>
        <button type="button" class="btn" data-testid="export-txt" @click="exportTxt">Exportar resumo (TXT)</button>
        <button type="button" class="btn" @click="printSummary">Imprimir / PDF</button>
      </FileTab>
    </template>

    <div class="report" data-testid="split-report">
      <section class="cards" aria-label="Resumo financeiro">
        <div class="card"><span class="muted">Total</span><strong data-testid="split-total">{{ formatMoney(summary.total) }}</strong></div>
        <div class="card"><span class="muted">Pessoas</span><strong>{{ state.people.length }}</strong></div>
        <div class="card"><span class="muted">Despesas</span><strong>{{ state.expenses.length }}</strong></div>
      </section>
      <p v-if="summary.invalid.length" class="ed-error" role="status">{{ summary.invalid.length }} despesa(s) com divisão incompleta não entram nas contas.</p>
      <section aria-labelledby="bal-h">
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
      <section aria-labelledby="set-h">
        <h2 id="set-h">Acertos sugeridos</h2>
        <ol v-if="transfers.length" class="transfers" data-testid="transfers">
          <li v-for="(t, i) in transfers" :key="i"><strong>{{ nameOf(t.from) }}</strong> paga <strong>{{ formatMoney(t.amount) }}</strong> para <strong>{{ nameOf(t.to) }}</strong></li>
        </ol>
        <p v-else class="muted" data-testid="transfers">Ninguém deve nada.</p>
      </section>
      <section aria-labelledby="exp-h">
        <h2 id="exp-h">Despesas</h2>
        <ul class="expenses">
          <li v-for="e in state.expenses" :key="e.id">
            <button type="button" class="exp" :aria-current="e.id === selectedId ? 'true' : undefined" @click="selectedId = e.id; tab = 'despesas'">
              <span>{{ e.description || 'Sem descrição' }}<small class="muted"> · pagou {{ nameOf(e.payer) }}</small></span>
              <strong>{{ formatMoney(e.amount) }}</strong>
            </button>
          </li>
        </ul>
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
.report { max-width: 860px; margin: 0 auto; padding: 18px max(16px, var(--sa-r)) 32px max(16px, var(--sa-l)); display: grid; gap: 18px; }
.report h2 { font-size: 17px; margin: 0 0 8px; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; display: grid; gap: 2px; }
.card strong { font-size: 20px; overflow-wrap: anywhere; }
.balances li { display: grid; grid-template-columns: minmax(70px, 1fr) minmax(60px, 2fr) auto; gap: 4px 10px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; }
.balances small { grid-column: 1 / -1; }
.bar { height: 10px; background: var(--raised); border-radius: 6px; overflow: hidden; }
.bar span { display: block; height: 100%; }
.pos { background: var(--ok); } .neg { background: var(--danger); }
.pos-t { color: var(--ok); font-weight: 750; } .neg-t { color: var(--danger); font-weight: 750; }
.transfers { margin: 0; padding-left: 22px; display: grid; gap: 6px; }
.exp { width: 100%; display: flex; justify-content: space-between; gap: 10px; text-align: left; min-height: 48px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.exp[aria-current="true"] { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); }
@media (max-width: 420px) { .cards { grid-template-columns: 1fr 1fr; } .card strong { font-size: 17px; } }
@media print { .report { max-width: none; padding: 0; } .exp { border: 0; } }
</style>
