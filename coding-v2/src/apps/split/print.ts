import type { PrintPage } from '../../shared/print/print';
import { owedFor, settle, summarize, type SplitState } from './model';
import { formatMoney } from './money';

/**
 * Resumo do racha-conta para imprimir (IMPRESSAO.md): total, saldo por pessoa, despesas e quem paga a quem.
 * Documento próprio de impressão: não leva abas, botões, campos nem o painel da tela.
 */
export function splitPrintPage(state: SplitState): PrintPage {
  const s = summarize(state);
  const name = (id: string): string => state.people.find((p) => p.id === id)?.name.trim() || 'Sem nome';
  const root = document.createElement('div');
  root.style.cssText = 'color:#000;background:#fff;font:10.5pt/1.4 system-ui,Arial,sans-serif;';
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', css = ''): HTMLElementTagNameMap[K] => {
    const n = document.createElement(tag); if (text) n.textContent = text; if (css) n.style.cssText = css; return n;
  };
  const table = (head: string[], rows: string[][], right: number[] = []): HTMLTableElement => {
    const t = el('table', '', 'width:100%;border-collapse:collapse;margin:2mm 0 6mm;');
    const thead = el('thead'); const hr = el('tr');
    head.forEach((h, i) => hr.append(el('th', h, 'text-align:' + (right.includes(i) ? 'right' : 'left') + ';border-bottom:.4mm solid #000;padding:1.2mm 2mm;font-weight:700;')));
    thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const r of rows) {
      const tr = el('tr'); tr.style.cssText = 'break-inside:avoid;';
      r.forEach((c, i) => tr.append(el('td', c, 'text-align:' + (right.includes(i) ? 'right' : 'left') + ';border-bottom:.2mm solid #999;padding:1.2mm 2mm;')));
      tb.append(tr);
    }
    t.append(tb);
    return t;
  };
  root.append(el('h1', state.name || 'Racha-conta', 'font-size:18pt;margin:0 0 2mm;'));
  root.append(el('p', 'Total das despesas: ' + formatMoney(s.total), 'font-size:12pt;font-weight:700;margin:0 0 5mm;'));

  root.append(el('h2', 'Por pessoa', 'font-size:12pt;margin:0;'));
  root.append(table(['Pessoa', 'Pagou', 'Parte', 'Saldo'], state.people.map((p) => [name(p.id), formatMoney(s.paid[p.id] ?? 0), formatMoney(s.owed[p.id] ?? 0), formatMoney(s.balance[p.id] ?? 0)]), [1, 2, 3]));

  root.append(el('h2', 'Quem paga a quem', 'font-size:12pt;margin:0;'));
  const transfers = settle(s.balance, state.people.map((p) => p.id));
  const ul = el('ul', '', 'margin:2mm 0 6mm;padding-left:6mm;');
  if (!transfers.length) ul.append(el('li', 'Ninguém deve nada.'));
  for (const t of transfers) ul.append(el('li', name(t.from) + ' paga ' + formatMoney(t.amount) + ' para ' + name(t.to), 'margin:.8mm 0;'));
  root.append(ul);

  if (state.expenses.length) {
    root.append(el('h2', 'Despesas', 'font-size:12pt;margin:0;'));
    root.append(table(['Descrição', 'Quem pagou', 'Valor'], state.expenses.map((e) => {
      const bad = owedFor(e, state.people).error;
      return [e.description + (bad ? ' (divisão incompleta, fora das contas)' : ''), name(e.payer), formatMoney(e.amount)];
    }), [2]));
  }
  if (s.invalid.length) root.append(el('p', s.invalid.length + ' despesa(s) com divisão incompleta ficaram fora das contas.', 'font-style:italic;'));
  return { el: root, fit: 'flow', marginMm: 15 };
}
