import { allocate, MAX_CENTS } from './money';

export type SplitMode = 'equal' | 'percent' | 'custom';
export interface Person { id: string; name: string }
export interface Expense {
  id: string;
  description: string;
  amount: number; // centavos
  payer: string;
  mode: SplitMode;
  /** Quem participa (igual) ou o peso de cada um: percent = centésimos de % (10000 = 100%), custom = centavos. */
  shares: Record<string, number>;
  participants: string[];
}
export interface SplitState { name: string; people: Person[]; expenses: Expense[]; currency: 'BRL' }
export const MAX_PEOPLE = 60;
export const MAX_EXPENSES = 500;

export const sid = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const int = (v: unknown, min: number, max: number, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function normalizeSplit(raw: unknown): SplitState {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<SplitState>;
  const people: Person[] = [];
  const ids = new Set<string>();
  for (const p of Array.isArray(src.people) ? src.people.slice(0, MAX_PEOPLE) : []) {
    const id = typeof p?.id === 'string' && p.id && !ids.has(p.id) ? p.id.slice(0, 40) : sid();
    ids.add(id);
    people.push({ id, name: text(p?.name, 60) });
  }
  const expenses: Expense[] = [];
  for (const e of Array.isArray(src.expenses) ? src.expenses.slice(0, MAX_EXPENSES) : []) {
    if (!e || typeof e !== 'object') continue;
    const mode: SplitMode = e.mode === 'percent' || e.mode === 'custom' ? e.mode : 'equal';
    const shares: Record<string, number> = {};
    if (e.shares && typeof e.shares === 'object') for (const [k, v] of Object.entries(e.shares)) if (ids.has(k)) shares[k] = int(v, 0, MAX_CENTS);
    const participants = Array.isArray(e.participants) ? e.participants.filter((p): p is string => typeof p === 'string' && ids.has(p)) : [...ids];
    expenses.push({
      id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : sid(),
      description: text(e.description, 120), amount: int(e.amount, 0, MAX_CENTS),
      payer: typeof e.payer === 'string' && ids.has(e.payer) ? e.payer : (people[0]?.id ?? ''),
      mode, shares, participants: [...new Set(participants)]
    });
  }
  return { name: text(src.name, 250) || 'Racha-conta', people, expenses, currency: 'BRL' };
}

export interface ExpenseCheck { owed: Record<string, number>; error: string }
/** Quanto cada pessoa deve numa despesa (centavos). Valida a divisão escolhida. */
export function owedFor(expense: Expense, people: readonly Person[]): ExpenseCheck {
  const owed: Record<string, number> = {};
  for (const p of people) owed[p.id] = 0;
  if (expense.amount <= 0) return { owed, error: 'Informe um valor maior que zero.' };
  if (!people.some((p) => p.id === expense.payer)) return { owed, error: 'Escolha quem pagou.' };
  if (expense.mode === 'equal') {
    const who = people.filter((p) => expense.participants.includes(p.id));
    if (!who.length) return { owed, error: 'Marque ao menos uma pessoa para dividir.' };
    allocate(expense.amount, who.map(() => 1)).forEach((v, i) => { owed[who[i]!.id] = v; });
    return { owed, error: '' };
  }
  if (expense.mode === 'percent') {
    const weights = people.map((p) => expense.shares[p.id] ?? 0);
    const total = weights.reduce((s, w) => s + w, 0);
    if (total !== 10000) return { owed, error: 'As porcentagens somam ' + (total / 100).toLocaleString('pt-BR') + '%; precisam somar 100%.' };
    allocate(expense.amount, weights).forEach((v, i) => { owed[people[i]!.id] = v; });
    return { owed, error: '' };
  }
  const values = people.map((p) => expense.shares[p.id] ?? 0);
  const total = values.reduce((s, v) => s + v, 0);
  if (total !== expense.amount) {
    const diff = expense.amount - total;
    return { owed, error: diff > 0 ? 'Faltam ' + (diff / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' para fechar o valor.' : 'Os valores passam do total em ' + (-diff / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.' };
  }
  people.forEach((p, i) => { owed[p.id] = values[i]!; });
  return { owed, error: '' };
}

export interface Summary {
  paid: Record<string, number>;
  owed: Record<string, number>;
  balance: Record<string, number>; // positivo = recebe; negativo = paga
  total: number;
  invalid: { id: string; error: string }[];
}
export function summarize(state: SplitState): Summary {
  const paid: Record<string, number> = {}, owed: Record<string, number> = {}, balance: Record<string, number> = {};
  for (const p of state.people) { paid[p.id] = 0; owed[p.id] = 0; }
  const invalid: { id: string; error: string }[] = [];
  let total = 0;
  for (const e of state.expenses) {
    const check = owedFor(e, state.people);
    if (check.error) { invalid.push({ id: e.id, error: check.error }); continue; }
    total += e.amount;
    paid[e.payer] = (paid[e.payer] ?? 0) + e.amount;
    for (const [id, v] of Object.entries(check.owed)) owed[id] = (owed[id] ?? 0) + v;
  }
  for (const p of state.people) balance[p.id] = (paid[p.id] ?? 0) - (owed[p.id] ?? 0);
  return { paid, owed, balance, total, invalid };
}
export interface Transfer { from: string; to: string; amount: number }
/** Sugestão de acertos: o maior devedor paga ao maior credor, até zerar (no máximo n−1 transferências). */
export function settle(balance: Record<string, number>, order: readonly string[]): Transfer[] {
  const debt = order.filter((id) => (balance[id] ?? 0) < 0).map((id) => ({ id, v: -(balance[id] ?? 0) }));
  const cred = order.filter((id) => (balance[id] ?? 0) > 0).map((id) => ({ id, v: balance[id] ?? 0 }));
  const out: Transfer[] = [];
  const byValue = (a: { v: number; id: string }, b: { v: number; id: string }) => b.v - a.v || order.indexOf(a.id) - order.indexOf(b.id);
  while (debt.length && cred.length) {
    debt.sort(byValue); cred.sort(byValue);
    const d = debt[0]!, c = cred[0]!;
    const amount = Math.min(d.v, c.v);
    if (amount > 0) out.push({ from: d.id, to: c.id, amount });
    d.v -= amount; c.v -= amount;
    if (d.v === 0) debt.shift();
    if (c.v === 0) cred.shift();
  }
  return out;
}

export function demoSplit(): SplitState {
  const ana = sid(), bruno = sid(), carla = sid(), davi = sid();
  const all = [ana, bruno, carla, davi];
  return {
    name: 'Viagem para a praia', currency: 'BRL',
    people: [{ id: ana, name: 'Ana' }, { id: bruno, name: 'Bruno' }, { id: carla, name: 'Carla' }, { id: davi, name: 'Davi' }],
    expenses: [
      { id: sid(), description: 'Hospedagem', amount: 120000, payer: ana, mode: 'equal', shares: {}, participants: all },
      { id: sid(), description: 'Mercado', amount: 31890, payer: bruno, mode: 'equal', shares: {}, participants: all },
      { id: sid(), description: 'Gasolina', amount: 25000, payer: carla, mode: 'percent', shares: { [ana]: 2500, [bruno]: 2500, [carla]: 5000, [davi]: 0 }, participants: all },
      { id: sid(), description: 'Jantar', amount: 23750, payer: davi, mode: 'custom', shares: { [ana]: 6000, [bruno]: 5750, [carla]: 6000, [davi]: 6000 }, participants: all }
    ]
  };
}
export function blankSplit(): SplitState {
  const a = sid(), b = sid();
  return { name: 'Nova divisão', currency: 'BRL', people: [{ id: a, name: 'Pessoa 1' }, { id: b, name: 'Pessoa 2' }], expenses: [] };
}

export function summaryText(state: SplitState): string {
  const s = summarize(state);
  const name = (id: string) => state.people.find((p) => p.id === id)?.name || 'Sem nome';
  const money = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const lines = [state.name, '', 'Total das despesas: ' + money(s.total), ''];
  lines.push('Por pessoa (pagou / parte / saldo):');
  for (const p of state.people) lines.push('- ' + name(p.id) + ': ' + money(s.paid[p.id] ?? 0) + ' / ' + money(s.owed[p.id] ?? 0) + ' / ' + money(s.balance[p.id] ?? 0));
  lines.push('', 'Acertos sugeridos:');
  const t = settle(s.balance, state.people.map((p) => p.id));
  if (!t.length) lines.push('- Ninguém deve nada.');
  for (const x of t) lines.push('- ' + name(x.from) + ' paga ' + money(x.amount) + ' para ' + name(x.to));
  if (s.invalid.length) lines.push('', s.invalid.length + ' despesa(s) com divisão incompleta ficaram de fora.');
  return lines.join('\n');
}
