/**
 * Motor de fórmulas das Planilhas. Aceita a sintaxe brasileira (=SOMA(A1:A3; 2,5)) e a inglesa (=SUM(A1:A3, 2.5)).
 * Avalia com detecção de referência circular e erros no padrão das planilhas (#DIV/0!, #REF!, #NOME?, #VALOR!, #CIRC!).
 */
export type ErrorCode = '#DIV/0!' | '#REF!' | '#NOME?' | '#VALOR!' | '#CIRC!' | '#N/D' | '#NÚM!';
export interface CellError { error: ErrorCode }
export type Value = number | string | boolean | CellError;
export const isError = (v: unknown): v is CellError => !!v && typeof v === 'object' && 'error' in (v as object);
const err = (e: ErrorCode): CellError => ({ error: e });

// ---------- tokens ----------
export type Token =
  | { t: 'num'; v: number; raw: string } | { t: 'str'; v: string } | { t: 'bool'; v: boolean; raw: string }
  | { t: 'ref'; sheet: string | null; c1: number; r1: number; a1: [boolean, boolean]; c2?: number; r2?: number; a2?: [boolean, boolean]; raw: string }
  | { t: 'fn'; name: string; raw: string } | { t: 'op'; v: string } | { t: '('} | { t: ')' } | { t: 'sep' } | { t: 'err'; v: string };

export const colToIndex = (letters: string): number => { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
export const indexToCol = (i: number): string => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const cellName = (r: number, c: number): string => indexToCol(c) + (r + 1);
const unaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const REF = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/;
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const semicolonMode = src.includes(';');
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1, s = '';
      for (; j < src.length; j++) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j++; continue; } break; } s += src[j]; }
      if (j >= src.length) throw new SyntaxError('Aspas sem fechamento.');
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (ch === '#') { const m = /^#(DIV\/0!|REF!|NOME\?|NAME\?|VALOR!|VALUE!|CIRC!|N\/D|N\/A|NÚM!|NUM!)/i.exec(src.slice(i)); if (m) { out.push({ t: 'err', v: m[0] }); i += m[0].length; continue; } }
    // número
    const numRe = semicolonMode ? /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/ : /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
    const nm = /^[\d]/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? '')) ? numRe.exec(src.slice(i)) ?? /^\.\d+/.exec(src.slice(i)) : null;
    // um número só conta se não for o começo de uma referência (A1 começa com letra, então não colide)
    if (nm) { out.push({ t: 'num', v: Number(nm[0].replace(',', '.')), raw: nm[0] }); i += nm[0].length; continue; }
    // referência a outra aba: 'Nome com espaço'!A1 ou Nome!A1
    let sheet: string | null = null;
    let j = i;
    if (ch === "'") {
      let k = i + 1, s = '';
      for (; k < src.length; k++) { if (src[k] === "'") { if (src[k + 1] === "'") { s += "'"; k++; continue; } break; } s += src[k]; }
      if (src[k + 1] === '!') { sheet = s; j = k + 2; } else throw new SyntaxError('Nome de aba inválido.');
    } else {
      const sm = /^([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)!/.exec(src.slice(i));
      if (sm) { sheet = sm[1]!; j = i + sm[0].length; }
    }
    const rm = REF.exec(src.slice(j));
    if (rm && !/[A-Za-z0-9_(]/.test(src[j + rm[0].length] ?? '')) {
      const c1 = colToIndex(rm[2]!), r1 = Number(rm[4]) - 1;
      let k = j + rm[0].length;
      const tok: Extract<Token, { t: 'ref' }> = { t: 'ref', sheet, c1, r1, a1: [rm[1] === '$', rm[3] === '$'], raw: '' };
      if (src[k] === ':') {
        const r2m = REF.exec(src.slice(k + 1));
        if (r2m) { tok.c2 = colToIndex(r2m[2]!); tok.r2 = Number(r2m[4]) - 1; tok.a2 = [r2m[1] === '$', r2m[3] === '$']; k += 1 + r2m[0].length; }
      }
      tok.raw = src.slice(i, k);
      out.push(tok); i = k; continue;
    }
    if (sheet !== null) throw new SyntaxError('Referência de aba incompleta.');
    const wm = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(src.slice(i));
    if (wm) {
      const word = unaccent(wm[0]);
      const after = src.slice(i + wm[0].length).trimStart();
      if (after.startsWith('(')) { out.push({ t: 'fn', name: word, raw: wm[0] }); i += wm[0].length; continue; }
      if (word === 'VERDADEIRO' || word === 'TRUE') { out.push({ t: 'bool', v: true, raw: wm[0] }); i += wm[0].length; continue; }
      if (word === 'FALSO' || word === 'FALSE') { out.push({ t: 'bool', v: false, raw: wm[0] }); i += wm[0].length; continue; }
      throw new SyntaxError('Nome desconhecido: ' + wm[0]);
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>%'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(') { out.push({ t: '(' }); i++; continue; }
    if (ch === ')') { out.push({ t: ')' }); i++; continue; }
    if (ch === ';' || (ch === ',' && !semicolonMode)) { out.push({ t: 'sep' }); i++; continue; }
    throw new SyntaxError('Caractere inesperado: ' + ch);
  }
  return out;
}

// ---------- AST ----------
export type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'bool'; v: boolean } | { k: 'err'; v: ErrorCode }
  | { k: 'ref'; sheet: string | null; r: number; c: number } | { k: 'range'; sheet: string | null; r1: number; c1: number; r2: number; c2: number }
  | { k: 'call'; name: string; args: Node[] } | { k: 'bin'; op: string; a: Node; b: Node } | { k: 'neg'; a: Node } | { k: 'pct'; a: Node };

const ERR_MAP: Record<string, ErrorCode> = { '#DIV/0!': '#DIV/0!', '#REF!': '#REF!', '#NOME?': '#NOME?', '#NAME?': '#NOME?', '#VALOR!': '#VALOR!', '#VALUE!': '#VALOR!', '#CIRC!': '#CIRC!', '#N/D': '#N/D', '#N/A': '#N/D', '#NÚM!': '#NÚM!', '#NUM!': '#NÚM!' };
export function parse(tokens: Token[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => { const t = peek(); return !!t && t.t === 'op' && t.v === v; };
  function primary(): Node {
    const t = tokens[p++];
    if (!t) throw new SyntaxError('Fórmula incompleta.');
    switch (t.t) {
      case 'num': return { k: 'num', v: t.v };
      case 'str': return { k: 'str', v: t.v };
      case 'bool': return { k: 'bool', v: t.v };
      case 'err': return { k: 'err', v: ERR_MAP[t.v.toUpperCase()] ?? '#VALOR!' };
      case 'ref':
        if (t.c2 !== undefined && t.r2 !== undefined) return { k: 'range', sheet: t.sheet, r1: Math.min(t.r1, t.r2), c1: Math.min(t.c1, t.c2), r2: Math.max(t.r1, t.r2), c2: Math.max(t.c1, t.c2) };
        return { k: 'ref', sheet: t.sheet, r: t.r1, c: t.c1 };
      case 'fn': {
        if (tokens[p]?.t !== '(') throw new SyntaxError('Esperado “(”.');
        p++;
        const args: Node[] = [];
        if (tokens[p]?.t === ')') { p++; return { k: 'call', name: t.name, args }; }
        for (;;) {
          args.push(compare());
          const n = tokens[p++];
          if (n?.t === ')') break;
          if (n?.t !== 'sep') throw new SyntaxError('Esperado “;” ou “)”.');
        }
        return { k: 'call', name: t.name, args };
      }
      case '(': { const e = compare(); if (tokens[p++]?.t !== ')') throw new SyntaxError('Parêntese sem fechamento.'); return e; }
      case 'op':
        if (t.v === '-') return { k: 'neg', a: unary() };
        if (t.v === '+') return unary();
        throw new SyntaxError('Operador fora do lugar: ' + t.v);
      default: throw new SyntaxError('Fórmula inválida.');
    }
  }
  function postfix(): Node { let n = primary(); while (isOp('%')) { p++; n = { k: 'pct', a: n }; } return n; }
  function unary(): Node { if (isOp('-')) { p++; return { k: 'neg', a: unary() }; } if (isOp('+')) { p++; return unary(); } return postfix(); }
  function power(): Node { let n = unary(); while (isOp('^')) { p++; n = { k: 'bin', op: '^', a: n, b: unary() }; } return n; }
  function mul(): Node { let n = power(); while (isOp('*') || isOp('/')) { const op = (tokens[p++] as { v: string }).v; n = { k: 'bin', op, a: n, b: power() }; } return n; }
  function add(): Node { let n = mul(); while (isOp('+') || isOp('-')) { const op = (tokens[p++] as { v: string }).v; n = { k: 'bin', op, a: n, b: mul() }; } return n; }
  function concat(): Node { let n = add(); while (isOp('&')) { p++; n = { k: 'bin', op: '&', a: n, b: add() }; } return n; }
  function compare(): Node {
    let n = concat();
    while (['=', '<>', '<', '>', '<=', '>='].some(isOp)) { const op = (tokens[p++] as { v: string }).v; n = { k: 'bin', op, a: n, b: concat() }; }
    return n;
  }
  const tree = compare();
  if (p < tokens.length) throw new SyntaxError('Sobrou algo no fim da fórmula.');
  return tree;
}

// ---------- avaliação ----------
export interface EvalContext {
  /** Valor de uma célula; `sheet` null = aba atual. Devolve '#REF!' para aba inexistente. */
  cell(sheet: string | null, r: number, c: number): Value | null;
  maxRows: number; maxCols: number;
}
type Arg = Value | Value[][];
const toNum = (v: Value | null): number | CellError => {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isError(v)) return v;
  const n = parseNumber(v);
  return n === null ? err('#VALOR!') : n;
};
const toText = (v: Value | null): string => (v === null ? '' : typeof v === 'number' ? formatGeneral(v) : typeof v === 'boolean' ? (v ? 'VERDADEIRO' : 'FALSO') : isError(v) ? v.error : v);
const truthy = (v: Value | null): boolean | CellError => { if (isError(v)) return v; if (typeof v === 'string') { const u = unaccent(v); if (u === 'VERDADEIRO' || u === 'TRUE') return true; if (u === 'FALSO' || u === 'FALSE' || u === '') return false; const n = toNum(v); return isError(n) ? n : n !== 0; } const n = toNum(v); return isError(n) ? n : n !== 0; };

function flatten(args: Arg[], numericOnlyFromRanges = true): { nums: number[]; values: (Value | null)[]; error: CellError | null } {
  const nums: number[] = [], values: (Value | null)[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const row of a) for (const v of row) {
        values.push(v);
        if (isError(v)) return { nums, values, error: v };
        if (typeof v === 'number') nums.push(v);
        else if (!numericOnlyFromRanges && typeof v === 'string') { const n = parseNumber(v); if (n !== null) nums.push(n); }
      }
    } else {
      values.push(a);
      if (isError(a)) return { nums, values, error: a };
      const n = toNum(a);
      if (isError(n)) return { nums, values, error: n };
      nums.push(n);
    }
  }
  return { nums, values, error: null };
}
function criteria(spec: Value | null): (v: Value | null) => boolean {
  const s = toText(spec);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!;
  const op = m[1] ?? '=', rhs = m[2] ?? '';
  const n = parseNumber(rhs);
  return (v) => {
    if (n !== null && typeof v === 'number') {
      switch (op) { case '<': return v < n; case '>': return v > n; case '<=': return v <= n; case '>=': return v >= n; case '<>': return v !== n; default: return v === n; }
    }
    const a = unaccent(toText(v)), b = unaccent(rhs);
    return op === '<>' ? a !== b : op === '=' ? a === b : false;
  };
}
const ALIASES: Record<string, string> = {
  SUM: 'SOMA', AVERAGE: 'MEDIA', COUNT: 'CONT.NUM', COUNTA: 'CONT.VALORES', ROUND: 'ARRED', ROUNDUP: 'ARREDONDAR.PARA.CIMA', ROUNDDOWN: 'ARREDONDAR.PARA.BAIXO',
  IF: 'SE', AND: 'E', OR: 'OU', NOT: 'NAO', POWER: 'POTENCIA', SQRT: 'RAIZ', CONCAT: 'CONCATENAR', CONCATENATE: 'CONCATENAR', PRODUCT: 'PRODUTO',
  SUMIF: 'SOMASE', COUNTIF: 'CONT.SE', AVERAGEIF: 'MEDIASE', IFERROR: 'SEERRO', UPPER: 'MAIUSCULA', LOWER: 'MINUSCULA', LEN: 'NUM.CARACT', TRUNC: 'TRUNCAR'
};
export const FUNCTION_NAMES = ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO', 'CONT.NÚM', 'CONT.VALORES', 'ARRED', 'SE', 'E', 'OU', 'NÃO', 'ABS', 'INT', 'MOD', 'POTÊNCIA', 'RAIZ', 'PRODUTO', 'CONCATENAR', 'SOMASE', 'CONT.SE', 'MÉDIASE', 'SEERRO', 'MAIÚSCULA', 'MINÚSCULA', 'NÚM.CARACT', 'TRUNCAR', 'ARREDONDAR.PARA.CIMA', 'ARREDONDAR.PARA.BAIXO'];
const roundTo = (x: number, d: number, mode: 'near' | 'up' | 'down') => {
  const f = 10 ** d;
  const v = x * f;
  const eps = Math.abs(v) * Number.EPSILON * 4;
  const r = mode === 'near' ? Math.sign(v) * Math.round(Math.abs(v) + eps) : mode === 'up' ? Math.sign(v) * Math.ceil(Math.abs(v) - eps) : Math.sign(v) * Math.floor(Math.abs(v) + eps);
  return r / f;
};

export function evaluate(node: Node, ctx: EvalContext): Value {
  const v = evalNode(node, ctx);
  if (Array.isArray(v)) return v[0]?.[0] ?? 0; // intervalo solto: primeira célula
  return v === null ? 0 : v;
}
function evalNode(node: Node, ctx: EvalContext): Arg | null {
  switch (node.k) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'err': return err(node.v);
    case 'ref':
      if (node.r >= ctx.maxRows || node.c >= ctx.maxCols) return err('#REF!');
      return ctx.cell(node.sheet, node.r, node.c);
    case 'range': {
      if (node.r2 >= ctx.maxRows || node.c2 >= ctx.maxCols) return err('#REF!');
      if ((node.r2 - node.r1 + 1) * (node.c2 - node.c1 + 1) > 200_000) return err('#VALOR!');
      const out: Value[][] = [];
      for (let r = node.r1; r <= node.r2; r++) {
        const row: Value[] = [];
        for (let c = node.c1; c <= node.c2; c++) { const v = ctx.cell(node.sheet, r, c); row.push(v === null ? '' : v); }
        out.push(row);
      }
      return out;
    }
    case 'neg': { const a = scalar(evalNode(node.a, ctx)); const n = toNum(a); return isError(n) ? n : -n; }
    case 'pct': { const a = scalar(evalNode(node.a, ctx)); const n = toNum(a); return isError(n) ? n : n / 100; }
    case 'bin': return binary(node.op, scalar(evalNode(node.a, ctx)), scalar(evalNode(node.b, ctx)));
    case 'call': return call(node.name, node.args, ctx);
  }
}
const scalar = (v: Arg | null): Value | null => (Array.isArray(v) ? (v.length === 1 && v[0]!.length === 1 ? v[0]![0]! : err('#VALOR!')) : v);
function binary(op: string, a: Value | null, b: Value | null): Value {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === '&') return toText(a) + toText(b);
  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    let x: number | string, y: number | string;
    const na = typeof a === 'number' || typeof a === 'boolean' || a === null || a === '' ? toNum(a) : null;
    const nb = typeof b === 'number' || typeof b === 'boolean' || b === null || b === '' ? toNum(b) : null;
    if (na !== null && nb !== null && !isError(na) && !isError(nb)) { x = na; y = nb; }
    else { x = unaccent(toText(a)); y = unaccent(toText(b)); }
    switch (op) { case '=': return x === y; case '<>': return x !== y; case '<': return x < y; case '>': return x > y; case '<=': return x <= y; default: return x >= y; }
  }
  const x = toNum(a), y = toNum(b);
  if (isError(x)) return x;
  if (isError(y)) return y;
  let r: number;
  switch (op) {
    case '+': r = x + y; break;
    case '-': r = x - y; break;
    case '*': r = x * y; break;
    case '/': if (y === 0) return err('#DIV/0!'); r = x / y; break;
    case '^': r = x ** y; break;
    default: return err('#VALOR!');
  }
  return Number.isFinite(r) ? r : err('#NÚM!');
}
function call(rawName: string, args: Node[], ctx: EvalContext): Arg {
  const name = ALIASES[rawName] ?? rawName.replace(/^MINIMO$/, 'MIN').replace(/^MAXIMO$/, 'MAX');
  const vals = (): Arg[] => args.map((a) => evalNode(a, ctx) ?? '');
  const need = (n: number, max = n) => args.length >= n && args.length <= max;
  const num1 = (i: number): number | CellError => toNum(scalar(evalNode(args[i]!, ctx)));
  switch (name) {
    case 'SOMA': { const f = flatten(vals()); return f.error ?? f.nums.reduce((s, n) => s + n, 0); }
    case 'PRODUTO': { const f = flatten(vals()); return f.error ?? f.nums.reduce((s, n) => s * n, 1); }
    case 'MEDIA': { const f = flatten(vals()); if (f.error) return f.error; return f.nums.length ? f.nums.reduce((s, n) => s + n, 0) / f.nums.length : err('#DIV/0!'); }
    case 'MIN': { const f = flatten(vals()); return f.error ?? (f.nums.length ? Math.min(...f.nums) : 0); }
    case 'MAX': { const f = flatten(vals()); return f.error ?? (f.nums.length ? Math.max(...f.nums) : 0); }
    case 'CONT.NUM': { const f = flatten(vals()); return f.nums.length; }
    case 'CONT.VALORES': { const f = flatten(vals(), false); return f.values.filter((v) => v !== null && v !== '').length; }
    case 'ABS': { if (!need(1)) return err('#VALOR!'); const n = num1(0); return isError(n) ? n : Math.abs(n); }
    case 'INT': { if (!need(1)) return err('#VALOR!'); const n = num1(0); return isError(n) ? n : Math.floor(n); }
    case 'TRUNCAR': { if (!need(1, 2)) return err('#VALOR!'); const n = num1(0); const d = args[1] ? num1(1) : 0; if (isError(n)) return n; if (isError(d)) return d; return roundTo(n, Math.trunc(d), 'down'); }
    case 'RAIZ': { if (!need(1)) return err('#VALOR!'); const n = num1(0); return isError(n) ? n : n < 0 ? err('#NÚM!') : Math.sqrt(n); }
    case 'POTENCIA': { if (!need(2)) return err('#VALOR!'); const a = num1(0), b = num1(1); return isError(a) ? a : isError(b) ? b : binary('^', a, b); }
    case 'MOD': { if (!need(2)) return err('#VALOR!'); const a = num1(0), b = num1(1); if (isError(a)) return a; if (isError(b)) return b; if (b === 0) return err('#DIV/0!'); return a - b * Math.floor(a / b); }
    case 'ARRED': case 'ARREDONDAR.PARA.CIMA': case 'ARREDONDAR.PARA.BAIXO': {
      if (!need(1, 2)) return err('#VALOR!');
      const n = num1(0), d = args[1] ? num1(1) : 0;
      if (isError(n)) return n; if (isError(d)) return d;
      return roundTo(n, Math.trunc(d), name === 'ARRED' ? 'near' : name === 'ARREDONDAR.PARA.CIMA' ? 'up' : 'down');
    }
    case 'SE': {
      if (!need(2, 3)) return err('#VALOR!');
      const c = truthy(scalar(evalNode(args[0]!, ctx)));
      if (isError(c)) return c;
      return c ? (evalNode(args[1]!, ctx) ?? 0) : args[2] ? (evalNode(args[2], ctx) ?? 0) : false;
    }
    case 'SEERRO': { if (!need(2)) return err('#VALOR!'); const v = scalar(evalNode(args[0]!, ctx)); return isError(v) ? (evalNode(args[1]!, ctx) ?? '') : (v ?? 0); }
    case 'E': case 'OU': {
      const f = flatten(vals(), true);
      if (f.error) return f.error;
      const list = f.values.filter((v) => v !== '' && v !== null).map(truthy);
      for (const x of list) if (isError(x)) return x;
      if (!list.length) return err('#VALOR!');
      return name === 'E' ? list.every(Boolean) : list.some(Boolean);
    }
    case 'NAO': { if (!need(1)) return err('#VALOR!'); const t = truthy(scalar(evalNode(args[0]!, ctx))); return isError(t) ? t : !t; }
    case 'CONCATENAR': { const out: string[] = []; for (const a of vals()) { if (Array.isArray(a)) for (const r of a) for (const v of r) { if (isError(v)) return v; out.push(toText(v)); } else { if (isError(a)) return a; out.push(toText(a)); } } return out.join(''); }
    case 'MAIUSCULA': case 'MINUSCULA': { if (!need(1)) return err('#VALOR!'); const v = scalar(evalNode(args[0]!, ctx)); if (isError(v)) return v; const s = toText(v); return name === 'MAIUSCULA' ? s.toLocaleUpperCase('pt-BR') : s.toLocaleLowerCase('pt-BR'); }
    case 'NUM.CARACT': { if (!need(1)) return err('#VALOR!'); const v = scalar(evalNode(args[0]!, ctx)); return isError(v) ? v : toText(v).length; }
    case 'SOMASE': case 'CONT.SE': case 'MEDIASE': {
      if (!need(2, 3)) return err('#VALOR!');
      const range = evalNode(args[0]!, ctx);
      if (!Array.isArray(range)) return err('#VALOR!');
      const test = criteria(scalar(evalNode(args[1]!, ctx)));
      const sumRange = args[2] ? evalNode(args[2], ctx) : range;
      if (!Array.isArray(sumRange)) return err('#VALOR!');
      let sum = 0, count = 0;
      range.forEach((row, r) => row.forEach((v, c) => {
        if (!test(v)) return;
        count++;
        const s = sumRange[r]?.[c];
        if (typeof s === 'number') sum += s;
      }));
      if (name === 'CONT.SE') return count;
      if (name === 'SOMASE') return sum;
      return count ? sum / count : err('#DIV/0!');
    }
    default: return err('#NOME?');
  }
}

// ---------- números ----------
/** Converte texto digitado (pt-BR ou en) em número: "1.234,56", "12,5", "12.5", "50%", "R$ 10". */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  let n: number;
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^[-+]?\d+(,\d+)?$/.test(s)) n = Number(s.replace(',', '.'));
  else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) n = Number(s);
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else return null;
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}
const general = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 });
export function formatGeneral(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6).replace('.', ',');
  return general.format(Number(n.toPrecision(12))).replace(/\./g, '');
}

// ---------- reescrita (inserir/excluir linhas e colunas, exportar para Excel) ----------
export type Shift = { axis: 'row' | 'col'; at: number; delta: number; sheet: string };
const ref1 = (c: number, r: number, a: [boolean, boolean]) => (a[0] ? '$' : '') + indexToCol(c) + (a[1] ? '$' : '') + (r + 1);
const sheetPrefix = (s: string | null) => (s === null ? '' : /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*$/.test(s) ? s + '!' : "'" + s.replace(/'/g, "''") + "'!");
/** Serializa tokens de volta para texto (mantém o estilo do separador). */
function serialize(tokens: Token[], sep: string, decimal: string, translate?: (name: string) => string): string {
  return tokens.map((t) => {
    switch (t.t) {
      case 'num': return String(t.v).replace('.', decimal);
      case 'str': return '"' + t.v.replace(/"/g, '""') + '"';
      case 'bool': return translate ? (t.v ? 'TRUE' : 'FALSE') : t.raw;
      case 'ref': return t.raw;
      case 'fn': return translate ? translate(t.name) : t.raw;
      case 'op': return t.v;
      case '(': return '(';
      case ')': return ')';
      case 'sep': return sep;
      case 'err': return t.v;
    }
  }).join('');
}
/** Ajusta referências de uma fórmula quando linhas/colunas são inseridas (delta>0) ou excluídas (delta<0). */
export function shiftFormula(formula: string, ownSheet: string, shift: Shift): string {
  let tokens: Token[];
  try { tokens = tokenize(formula); } catch { return formula; }
  const semicolon = formula.includes(';');
  let changed = false;
  for (const t of tokens) {
    if (t.t !== 'ref') continue;
    const target = t.sheet ?? ownSheet;
    if (target !== shift.sheet) continue;
    const move = (v: number): number | null => {
      if (shift.delta > 0) return v >= shift.at ? v + shift.delta : v;
      const gone = -shift.delta;
      if (v >= shift.at && v < shift.at + gone) return null;
      return v >= shift.at + gone ? v - gone : v;
    };
    const isRow = shift.axis === 'row';
    const a = move(isRow ? t.r1 : t.c1);
    const b = t.c2 !== undefined ? move(isRow ? t.r2! : t.c2) : undefined;
    let raw: string;
    if (t.c2 === undefined) {
      if (a === null) raw = '#REF!';
      else { if (isRow) t.r1 = a; else t.c1 = a; raw = sheetPrefix(t.sheet) + ref1(t.c1, t.r1, t.a1); }
    } else {
      // intervalo: encolhe se uma ponta foi excluída
      let lo = isRow ? t.r1 : t.c1, hi = isRow ? t.r2! : t.c2;
      const nlo = move(lo), nhi = move(hi);
      if (nlo === null && nhi === null) {
        const inside = shift.delta < 0 && lo >= shift.at && hi < shift.at - shift.delta;
        if (inside) { raw = '#REF!'; t.raw = raw; changed = true; continue; }
      }
      lo = nlo ?? shift.at; hi = nhi ?? shift.at - 1;
      if (hi < lo) { raw = '#REF!'; }
      else {
        if (isRow) { t.r1 = lo; t.r2 = hi; } else { t.c1 = lo; t.c2 = hi; }
        raw = sheetPrefix(t.sheet) + ref1(t.c1, t.r1, t.a1) + ':' + ref1(t.c2!, t.r2!, t.a2 ?? [false, false]);
      }
      void a; void b;
    }
    if (raw !== t.raw) { t.raw = raw; changed = true; }
  }
  if (!changed) return formula;
  return serialize(tokens, semicolon ? ';' : ',', semicolon ? ',' : '.');
}
const TO_EXCEL: Record<string, string> = Object.fromEntries(Object.entries(ALIASES).map(([en, pt]) => [pt, en]));
TO_EXCEL.MIN = 'MIN'; TO_EXCEL.MAX = 'MAX'; TO_EXCEL.MINIMO = 'MIN'; TO_EXCEL.MAXIMO = 'MAX';
TO_EXCEL.ABS = 'ABS'; TO_EXCEL.INT = 'INT'; TO_EXCEL.MOD = 'MOD';
/** Fórmula no dialeto do Excel (nomes em inglês, separador vírgula, ponto decimal), sem o "=". */
export function toExcelFormula(formula: string): string | null {
  try {
    const tokens = tokenize(formula);
    parse(tokens);
    return serialize(tokens, ',', '.', (name) => TO_EXCEL[name] ?? name);
  } catch { return null; }
}

/** Copia uma fórmula para outra célula: referências relativas andam junto (como arrastar no Excel); $ fixa. */
export function offsetFormula(formula: string, dr: number, dc: number): string {
  let tokens: Token[];
  try { tokens = tokenize(formula); } catch { return formula; }
  const semicolon = formula.includes(';');
  for (const t of tokens) {
    if (t.t !== 'ref') continue;
    const move = (c: number, r: number, a: [boolean, boolean]): [number, number] => [a[0] ? c : c + dc, a[1] ? r : r + dr];
    const [c1, r1] = move(t.c1, t.r1, t.a1);
    if (c1 < 0 || r1 < 0) { t.raw = '#REF!'; continue; }
    let raw = sheetPrefix(t.sheet) + ref1(c1, r1, t.a1);
    if (t.c2 !== undefined && t.r2 !== undefined) {
      const [c2, r2] = move(t.c2, t.r2, t.a2 ?? [false, false]);
      if (c2 < 0 || r2 < 0) { t.raw = '#REF!'; continue; }
      raw += ':' + ref1(c2, r2, t.a2 ?? [false, false]);
    }
    t.raw = raw;
  }
  return serialize(tokens, semicolon ? ';' : ',', semicolon ? ',' : '.');
}
