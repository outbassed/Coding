import { MAX_EXPRESSION, RESERVED_NAMES, tryCalculate, type AngleUnit, type Outcome } from './parser';
import { formatNumber, plainNumber } from './format';

export type CalcMode = 'basic' | 'pro';
export interface CalcEntry { at: number; expr: string; text: string; value: number }
export interface CalcVar { name: string; value: number }
export interface CalcState {
  name: string;
  mode: CalcMode;
  angle: AngleUnit;
  /** Casas decimais fixas na exibição (0–10) ou null para automático. */
  decimals: number | null;
  /** Expressão que está sendo digitada. */
  expr: string;
  /** Verdadeiro logo depois de "=": a próxima tecla começa uma conta nova ou continua do resultado. */
  done: boolean;
  ans: number | null;
  memory: number;
  history: CalcEntry[];
  vars: CalcVar[];
}

export const MAX_HISTORY = 100;
export const MAX_VARS = 30;
export const VAR_NAME = /^[a-zà-ÿ_][a-z0-9à-ÿ_]{0,15}$/;

/** Número como texto de expressão: vírgula decimal e o sinal de menos tipográfico. */
const exprNumber = (n: number): string => plainNumber(n).replace(/^-/, '−');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function emptyCalc(mode: CalcMode = 'basic', name = mode === 'pro' ? 'Calculadora científica' : 'Calculadora'): CalcState {
  return { name, mode, angle: 'deg', decimals: null, expr: '', done: false, ans: null, memory: 0, history: [], vars: [] };
}

export function normalizeCalc(raw: unknown): CalcState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const mode: CalcMode = s.mode === 'pro' ? 'pro' : 'basic';
  const seen = new Set<string>();
  const vars: CalcVar[] = [];
  if (Array.isArray(s.vars)) {
    for (const item of s.vars) {
      const v = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const name = typeof v.name === 'string' ? v.name.toLowerCase() : '';
      if (VAR_NAME.test(name) && !RESERVED_NAMES.includes(name) && !seen.has(name) && finite(v.value) && vars.length < MAX_VARS) { seen.add(name); vars.push({ name, value: v.value }); }
    }
  }
  const history: CalcEntry[] = [];
  if (Array.isArray(s.history)) {
    for (const item of s.history.slice(-MAX_HISTORY)) {
      const h = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      if (typeof h.expr === 'string' && finite(h.value)) history.push({ at: finite(h.at) ? h.at : 0, expr: h.expr.slice(0, MAX_EXPRESSION), value: h.value, text: typeof h.text === 'string' ? h.text.slice(0, 60) : formatNumber(h.value) });
    }
  }
  const decimals = finite(s.decimals) ? Math.min(10, Math.max(0, Math.trunc(s.decimals))) : null;
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : emptyCalc(mode).name,
    mode, angle: s.angle === 'rad' ? 'rad' : 'deg', decimals,
    expr: typeof s.expr === 'string' ? s.expr.slice(0, MAX_EXPRESSION) : '',
    done: s.done === true, ans: finite(s.ans) ? s.ans : null, memory: finite(s.memory) ? s.memory : 0,
    history, vars
  };
}

export const scopeOf = (state: CalcState): Map<string, number> => new Map(state.vars.map((v) => [v.name, v.value]));
const options = (state: CalcState) => ({ angle: state.angle, scope: scopeOf(state), ans: state.ans ?? undefined, autoClose: true });

/** Resultado "ao vivo" da expressão atual; null quando não há nada digitado. */
export function preview(state: CalcState): Outcome | null {
  if (!state.expr.trim()) return null;
  return tryCalculate(state.expr, options(state));
}
export const show = (state: CalcState, value: number): string => formatNumber(value, state.decimals);

// ---------------------------------------------------------------- teclas
const BINARY = ['+', '−', '×', '÷', '^'];
const SYMBOL: Record<string, string> = { '-': '−', '*': '×', '/': '÷', '.': ',' };
const isDigit = (s: string): boolean => /^[0-9]$/.test(s);

export interface Edit { state: CalcState; caret: number }

/** Insere texto na posição do cursor aplicando as regras de uma calculadora (troca de operador, vírgula única etc.). */
export function insertText(state: CalcState, rawText: string, start = state.expr.length, end = start): Edit {
  const text = SYMBOL[rawText] ?? rawText;
  let expr = state.expr;
  let from = Math.min(Math.max(0, start), expr.length);
  let to = Math.min(Math.max(from, end), expr.length);
  if (state.done) {
    const continuing = BINARY.includes(text) || text === '%' || text === '!';
    if (continuing && state.ans !== null) { expr = exprNumber(state.ans); from = to = expr.length; }
    else { expr = ''; from = to = 0; }
  }
  const before = expr.slice(0, from);
  const after = expr.slice(to);
  let insert = text;

  if (BINARY.includes(text)) {
    if (before === '' || before.endsWith('(')) {
      if (text !== '−') {
        if (before === '' && state.ans !== null && !state.done) insert = exprNumber(state.ans) + text; else return { state: { ...state, done: false, expr }, caret: from };
      }
    } else {
      const last = before.slice(-1);
      if (BINARY.includes(last)) {
        const unaryAfterBinary = text === '−' && ['×', '÷', '^'].includes(last);
        if (!unaryAfterBinary) {
          const trimmed = before.slice(0, -1);
          return finish(state, trimmed + text + after, trimmed.length + text.length);
        }
      }
    }
  } else if (text === ',') {
    const number = /[0-9,]*$/.exec(before)?.[0] ?? '';
    if (number.includes(',')) return { state: { ...state, done: false, expr }, caret: from };
    if (number === '' ) insert = '0,';
  }
  return finish(state, before + insert + after, before.length + insert.length);
}
function finish(state: CalcState, expr: string, caret: number): Edit {
  if (expr.length > MAX_EXPRESSION) return { state: { ...state, done: false }, caret: Math.min(caret, state.expr.length) };
  return { state: { ...state, expr, done: false }, caret };
}

/** Troca o sinal do último número digitado (±). */
export function toggleSign(state: CalcState): CalcState {
  if (state.done && state.ans !== null) return { ...state, expr: exprNumber(-state.ans), done: false };
  const m = /[0-9][0-9,]*$/.exec(state.expr);
  if (!m) return state;
  const before = state.expr.slice(0, m.index);
  let expr: string;
  if (before.endsWith('−')) {
    const prior = before.slice(0, -1);
    expr = prior === '' || /[+−×÷^(;]$/.test(prior) ? prior + m[0] : prior + '+' + m[0];
  } else if (before.endsWith('+')) expr = before.slice(0, -1) + '−' + m[0];
  else expr = before + '−' + m[0];
  return { ...state, expr, done: false };
}

/** Apaga o último caractere; "sin(" e nomes de função saem inteiros. */
export function backspace(state: CalcState): CalcState {
  const fn = /[a-zà-ÿπ√][a-zà-ÿ0-9]*\($/i.exec(state.expr);
  const expr = fn ? state.expr.slice(0, fn.index) : state.expr.slice(0, -1);
  return { ...state, expr, done: false };
}

export const clearEntry = (state: CalcState): CalcState => ({ ...state, expr: '', done: false });
export const clearAll = (state: CalcState): CalcState => ({ ...state, expr: '', done: false, ans: null });

export type Evaluated = { state: CalcState; outcome: Outcome };
/** "=": calcula, guarda no histórico e prepara para continuar. Em caso de erro nada muda. */
export function equals(state: CalcState, now = Date.now()): Evaluated {
  if (!state.expr.trim()) return { state, outcome: { ok: false, error: 'Digite uma expressão.' } };
  if (state.done) return { state, outcome: state.ans !== null ? { ok: true, value: state.ans } : { ok: false, error: 'Digite uma expressão.' } };
  const outcome = tryCalculate(state.expr, options(state));
  if (!outcome.ok) return { state, outcome };
  const entry: CalcEntry = { at: now, expr: state.expr, value: outcome.value, text: formatNumber(outcome.value, state.decimals) };
  const history = [...state.history, entry].slice(-MAX_HISTORY);
  return { state: { ...state, ans: outcome.value, done: true, history }, outcome };
}

export type MemoryOp = 'mc' | 'mr' | 'm+' | 'm-';
/** Memória: M+ e M− usam o resultado ao vivo (ou o último resultado). */
export function memory(state: CalcState, op: MemoryOp): Edit & { message: string } {
  const caret = state.expr.length;
  if (op === 'mc') return { state: { ...state, memory: 0 }, caret, message: 'Memória limpa.' };
  if (op === 'mr') {
    const edit = insertText(state, state.memory < 0 ? '(' + exprNumber(state.memory) + ')' : exprNumber(state.memory));
    return { ...edit, message: 'Memória inserida: ' + formatNumber(state.memory, state.decimals) + '.' };
  }
  const live = state.done ? (state.ans !== null ? { ok: true as const, value: state.ans } : null) : preview(state);
  if (!live || !live.ok) return { state, caret, message: 'Calcule um valor válido antes de usar a memória.' };
  const next = Math.round((state.memory + (op === 'm+' ? live.value : -live.value)) * 1e12) / 1e12;
  return { state: { ...state, memory: next }, caret, message: 'Memória: ' + formatNumber(next, state.decimals) + '.' };
}

// ---------------------------------------------------------------- variáveis
export type VarResult = { ok: true; state: CalcState } | { ok: false; error: string };
/** Cria ou atualiza uma variável a partir de uma expressão (ex.: taxa = 0,01 ou 12*5). */
export function defineVariable(state: CalcState, rawName: string, valueExpr: string): VarResult {
  const name = rawName.trim().toLowerCase();
  if (!VAR_NAME.test(name)) return { ok: false, error: 'Use de 1 a 16 letras, números ou _, começando por letra (ex.: taxa).' };
  if (RESERVED_NAMES.includes(name)) return { ok: false, error: '“' + name + '” já é uma função ou constante da calculadora.' };
  const exists = state.vars.some((v) => v.name === name);
  if (!exists && state.vars.length >= MAX_VARS) return { ok: false, error: 'Limite de ' + MAX_VARS + ' variáveis.' };
  const result = tryCalculate(valueExpr, options(state));
  if (!result.ok) return { ok: false, error: result.error };
  const vars = exists ? state.vars.map((v) => (v.name === name ? { name, value: result.value } : v)) : [...state.vars, { name, value: result.value }];
  return { ok: true, state: { ...state, vars } };
}
export const removeVariable = (state: CalcState, name: string): CalcState => ({ ...state, vars: state.vars.filter((v) => v.name !== name) });

// ---------------------------------------------------------------- histórico
export function historyText(state: CalcState): string {
  const lines = [state.name, ''];
  for (const h of state.history) lines.push(h.expr + ' = ' + h.text);
  return lines.join('\n') + '\n';
}
