import type { DocKind } from '../editors/docs';
import { calcKind } from '../apps/calc/kind';
import { codesKind } from '../apps/codes/kind';
import { drawKind } from '../apps/draw/kind';
import { splitKind } from '../apps/split/kind';
import { sheetLabelsKind } from '../apps/sheet-labels/model';
import { sid } from '../apps/split/model';
import { parseMoney } from '../apps/split/money';
import { cid, defaultStyle } from '../apps/codes/model';

/**
 * Conversores dos formatos do Coding 1.0 para os apps 2.0.
 * Sempre geram um documento NOVO: o original (e o banco do 1.0) nunca é alterado.
 */
type Raw = Record<string, unknown>;
const o = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {});
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const int = (v: unknown, d: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

export function convertCalc(raw: unknown): unknown {
  const s = o(raw);
  const cells: Record<string, { v: string; b?: boolean; a?: string; f?: string }> = {};
  const fmt: Record<string, string> = { num: 'number', brl: 'currency', pct: 'percent' };
  const align: Record<string, string> = { l: 'left', c: 'center', r: 'right' };
  for (const [k, cell] of Object.entries(o(s.cells))) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m) continue;
    const c = o(cell);
    const out: { v: string; b?: boolean; a?: string; f?: string } = { v: str(c.v) };
    if (c.b === true) out.b = true;
    if (typeof c.a === 'string' && align[c.a]) out.a = align[c.a];
    if (typeof c.n === 'string' && fmt[c.n]) out.f = fmt[c.n];
    cells[m[1] + ':' + m[2]] = out;
  }
  return { name: str(s.name, 'Planilha'), active: 0, sheets: [{ id: 's1', name: 'Planilha 1', rows: int(s.rows, 50), cols: int(s.cols, 12), cells, widths: o(s.widths) }] };
}
export function convertCodes(raw: unknown): unknown {
  const s = o(raw);
  const kind = s.kind === 'code128' || s.kind === 'ean13' ? s.kind : 'qr';
  const items = (Array.isArray(s.items) ? s.items : []).map((i) => ({ id: cid(), kind, value: str(o(i).content), caption: str(o(i).label), copies: int(o(i).copies, 1) }));
  return { name: str(s.name, 'Códigos'), items, style: { ...defaultStyle(), showText: s.showText !== false }, layout: { cols: int(s.cols, 2), gapMm: 6 } };
}
export function convertSheet(raw: unknown): unknown {
  const s = o(raw);
  return { name: str(s.name, 'Etiquetas da planilha'), rows: Array.isArray(s.rows) ? s.rows : [], hasHeader: s.header === true, map: { code: int(s.colCode, 0), desc: int(s.colDesc, -1), qty: int(s.colCopies, -1) }, defaultQty: int(s.defCopies, 1), source: 'Coding 1.0' };
}
export function convertDraw(raw: unknown): unknown {
  const s = o(raw);
  const tab = str(s.tab);
  const lines = (t: unknown) => str(t).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const participants = tab === 'teams' && lines(s.teamNames).length ? lines(s.teamNames) : lines(s.names);
  return {
    name: str(s.name, 'Sorteio'), mode: tab === 'teams' ? 'teams' : tab === 'dice' ? 'dice' : tab === 'num' ? 'numbers' : 'wheel',
    participants, excludeDrawn: s.remove === true, drawn: Array.isArray(s.winners) ? s.winners.map((w) => str(w)) : [],
    numbers: { min: int(s.min, 1), max: int(s.max, 100), count: int(s.qty, 1), unique: s.unique !== false },
    dice: { count: int(s.diceN, 1), sides: int(s.diceS, 6) }, teams: { count: int(s.teamCount, 2) }, history: []
  };
}
export function convertSplit(raw: unknown): unknown {
  const s = o(raw);
  const expenses: unknown[] = [];
  if (s.tab === 'items') {
    const names = (Array.isArray(s.names) ? s.names : []).map((n) => str(n)).filter(Boolean);
    const people = (names.length ? names : ['Pessoa 1', 'Pessoa 2']).map((name) => ({ id: sid(), name }));
    const all = people.map((p) => p.id);
    let subtotal = 0;
    for (const item of Array.isArray(s.items) ? s.items : []) {
      const it = o(item);
      const amount = parseMoney(str(it.price)) ?? 0;
      subtotal += amount;
      const who = (Array.isArray(it.who) ? it.who : []).map(Number).filter((n) => people[n]).map((n) => people[n]!.id);
      expenses.push({ id: sid(), description: str(it.name, 'Item'), amount, payer: all[0], mode: 'equal', shares: {}, participants: who.length ? who : all });
    }
    const tip = int(s.tip2, 0);
    if (tip > 0 && subtotal > 0) expenses.push({ id: sid(), description: 'Gorjeta (' + tip + '%)', amount: Math.round((subtotal * tip) / 100), payer: all[0], mode: 'equal', shares: {}, participants: all });
    return { name: str(s.name, 'Racha-conta'), people, expenses, currency: 'BRL' };
  }
  const n = Math.min(60, Math.max(1, int(s.people, 2)));
  const people = Array.from({ length: n }, (_, i) => ({ id: sid(), name: 'Pessoa ' + (i + 1) }));
  const all = people.map((p) => p.id);
  const total = parseMoney(str(s.total)) ?? 0;
  if (total > 0) expenses.push({ id: sid(), description: 'Conta', amount: total, payer: all[0], mode: 'equal', shares: {}, participants: all });
  const tip = int(s.tip, 0);
  if (total > 0 && tip > 0) expenses.push({ id: sid(), description: 'Gorjeta (' + tip + '%)', amount: Math.round((total * tip) / 100), payer: all[0], mode: 'equal', shares: {}, participants: all });
  return { name: str(s.name, 'Racha-conta'), people, expenses, currency: 'BRL' };
}

export interface Converter { kind: DocKind<unknown>; path: string; convert(raw: unknown): unknown }
export const CONVERTERS: Record<string, Converter> = {
  calc: { kind: calcKind as DocKind<unknown>, path: '/apps/planilhas/', convert: convertCalc },
  codes: { kind: codesKind as DocKind<unknown>, path: '/apps/qr/', convert: convertCodes },
  sheet: { kind: sheetLabelsKind as DocKind<unknown>, path: '/apps/planilha-etiquetas/', convert: convertSheet },
  draw: { kind: drawKind as DocKind<unknown>, path: '/apps/sorteio/', convert: convertDraw },
  split: { kind: splitKind as DocKind<unknown>, path: '/apps/racha-conta/', convert: convertSplit }
};
/** Só documentos do 1.0 (não criados na v2) precisam de conversão. */
export function converterFor(copy: { type?: string; legacyId: string }): Converter | null {
  const c = copy.type && Object.hasOwn(CONVERTERS, copy.type) ? CONVERTERS[copy.type]! : null;
  return c && !copy.legacyId.startsWith(c.kind.prefix) ? c : null;
}
