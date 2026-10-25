/**
 * Calculadora: leitor e avaliador de expressões SEGURO.
 *
 * Nada aqui usa `eval`, `new Function` ou qualquer forma de executar texto. A expressão é dividida em símbolos
 * (tokenizer), montada numa árvore (parser descendente recursivo) e calculada por uma função própria. Só existem
 * números, operadores, parênteses, constantes e as funções da tabela FUNCTIONS. Tudo o mais vira um erro em
 * português. Decimal: vírgula ou ponto. Argumentos de funções: ponto e vírgula (ex.: max(2;7)).
 */
export class CalcError extends Error {
  constructor(message: string) { super(message); this.name = 'CalcError'; }
}

export type AngleUnit = 'deg' | 'rad';
export interface EvalOptions {
  angle?: AngleUnit;
  /** Variáveis do usuário (nome → valor). */
  scope?: ReadonlyMap<string, number>;
  /** Resultado anterior, disponível como `ans`. */
  ans?: number;
  /** Fecha automaticamente parênteses que ficaram abertos no fim (útil enquanto se digita). */
  autoClose?: boolean;
}

export const MAX_EXPRESSION = 500;
const MAX_DEPTH = 60;
const MAX_TOKENS = 600;

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'end' };
type Node =
  | { k: 'num'; v: number }
  | { k: 'id'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'pct'; a: Node }
  | { k: 'fact'; a: Node }
  | { k: 'call'; name: string; args: Node[] };

const NUMBER = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?/;
const IDENT = /^[A-Za-zÀ-ÖØ-öø-ÿπ_][A-Za-zÀ-ÖØ-öø-ÿπ_0-9]*/;
const OP_ALIASES: Record<string, string> = { '−': '-', '–': '-', '—': '-', '×': '*', '·': '*', '÷': '/', '∕': '/', '＋': '+' };

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) { i++; continue; }
    const rest = source.slice(i);
    const num = NUMBER.exec(rest);
    if (num) {
      const text = num[0].replace(',', '.');
      const value = Number(text);
      if (!Number.isFinite(value)) throw new CalcError('Número grande demais.');
      out.push({ t: 'num', v: value });
      i += num[0].length;
    } else {
      const id = IDENT.exec(rest);
      if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; }
      else {
        const op = OP_ALIASES[ch] ?? ch;
        if ('+-*/^()!%;√'.includes(op)) { out.push({ t: 'op', v: op }); i++; }
        else throw new CalcError('Símbolo não reconhecido: “' + ch + '”.');
      }
    }
    if (out.length > MAX_TOKENS) throw new CalcError('Expressão longa demais.');
  }
  out.push({ t: 'end' });
  return out;
}

interface FnDef { min: number; max: number }
const FUNCTION_ARITY: Record<string, FnDef> = {
  sin: { min: 1, max: 1 }, cos: { min: 1, max: 1 }, tan: { min: 1, max: 1 },
  asin: { min: 1, max: 1 }, acos: { min: 1, max: 1 }, atan: { min: 1, max: 1 },
  sinh: { min: 1, max: 1 }, cosh: { min: 1, max: 1 }, tanh: { min: 1, max: 1 },
  ln: { min: 1, max: 1 }, log: { min: 1, max: 2 }, log2: { min: 1, max: 1 }, exp: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 }, cbrt: { min: 1, max: 1 }, abs: { min: 1, max: 1 },
  floor: { min: 1, max: 1 }, ceil: { min: 1, max: 1 }, trunc: { min: 1, max: 1 }, sign: { min: 1, max: 1 },
  round: { min: 1, max: 2 }, min: { min: 1, max: 20 }, max: { min: 1, max: 20 },
  mod: { min: 2, max: 2 }, pow: { min: 2, max: 2 }, fact: { min: 1, max: 1 }
};
/** Apelidos em português. */
const FUNCTION_ALIASES: Record<string, string> = { sen: 'sin', tg: 'tan', raiz: 'sqrt', arcsen: 'asin', arccos: 'acos', arctan: 'atan', asen: 'asin' };
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };
export const RESERVED_NAMES: readonly string[] = [...Object.keys(FUNCTION_ARITY), ...Object.keys(FUNCTION_ALIASES), ...Object.keys(CONSTANTS), 'ans'];
const canonicalFunction = (name: string): string | null => {
  const real = Object.hasOwn(FUNCTION_ALIASES, name) ? (FUNCTION_ALIASES[name] as string) : name;
  return Object.hasOwn(FUNCTION_ARITY, real) ? real : null;
};

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}
  private peek(): Token { return this.tokens[this.pos] as Token; }
  private next(): Token { return this.tokens[this.pos++] as Token; }
  private isOp(value: string): boolean { const t = this.peek(); return t.t === 'op' && t.v === value; }
  private enter(): void { if (++this.depth > MAX_DEPTH) throw new CalcError('Expressão aninhada demais.'); }
  private leave(): void { this.depth--; }

  parse(): Node {
    if (this.peek().t === 'end') throw new CalcError('Digite uma expressão.');
    const node = this.add();
    const t = this.peek();
    if (t.t !== 'end') {
      if (t.t === 'op' && t.v === ')') throw new CalcError('Há um parêntese fechado sem abertura.');
      if (t.t === 'op' && t.v === ';') throw new CalcError('O ponto e vírgula só separa argumentos dentro de uma função, como max(2;7).');
      if (t.t === 'num') throw new CalcError('Falta um operador antes de ' + String(t.v).replace('.', ',') + '.');
      throw new CalcError('Não entendi esta parte da expressão.');
    }
    return node;
  }
  private add(): Node {
    let left = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && (t.v === '+' || t.v === '-')) { this.next(); left = { k: 'bin', op: t.v, a: left, b: this.mul() }; }
      else return left;
    }
  }
  private startsImplicit(): boolean {
    const t = this.peek();
    return (t.t === 'op' && (t.v === '(' || t.v === '√')) || t.t === 'id';
  }
  private mul(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && (t.v === '*' || t.v === '/')) { this.next(); left = { k: 'bin', op: t.v, a: left, b: this.unary() }; }
      else if (this.startsImplicit()) left = { k: 'bin', op: '*', a: left, b: this.unary() };
      else return left;
    }
  }
  private unary(): Node {
    this.enter();
    try {
      const t = this.peek();
      if (t.t === 'op' && t.v === '-') { this.next(); return { k: 'neg', a: this.unary() }; }
      if (t.t === 'op' && t.v === '+') { this.next(); return this.unary(); }
      if (t.t === 'op' && t.v === '√') { this.next(); return { k: 'call', name: 'sqrt', args: [this.postfix()] }; }
      return this.power();
    } finally { this.leave(); }
  }
  private power(): Node {
    const base = this.postfix();
    if (this.isOp('^')) { this.next(); return { k: 'bin', op: '^', a: base, b: this.unary() }; }
    return base;
  }
  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.isOp('!')) { this.next(); node = { k: 'fact', a: node }; }
      else if (this.isOp('%')) { this.next(); node = { k: 'pct', a: node }; }
      else return node;
    }
  }
  private primary(): Node {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      const fn = canonicalFunction(t.v);
      if (fn) {
        if (!this.isOp('(')) throw new CalcError('“' + t.v + '” precisa de parênteses, por exemplo ' + t.v + '(30).');
        this.next();
        this.enter();
        const args: Node[] = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.add());
            if (this.isOp(';')) { this.next(); continue; }
            break;
          }
        }
        if (!this.isOp(')')) throw new CalcError('Falta fechar o parêntese de ' + t.v + '(.');
        this.next();
        this.leave();
        const def = FUNCTION_ARITY[fn] as FnDef;
        if (args.length < def.min || args.length > def.max) {
          throw new CalcError(t.v + ' recebe ' + (def.min === def.max ? String(def.min) : 'de ' + def.min + ' a ' + def.max) + ' argumento(s), mas recebeu ' + args.length + '.');
        }
        return { k: 'call', name: fn, args };
      }
      return { k: 'id', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      this.enter();
      if (this.isOp(')')) throw new CalcError('Há parênteses vazios.');
      const inner = this.add();
      if (!this.isOp(')')) throw new CalcError('Falta fechar um parêntese.');
      this.next();
      this.leave();
      return inner;
    }
    if (t.t === 'end') throw new CalcError('A expressão está incompleta.');
    if (t.t === 'op' && t.v === ')') throw new CalcError('Há um parêntese fechado sem abertura.');
    throw new CalcError('Não entendi o símbolo “' + (t.t === 'op' ? t.v : '?') + '” neste ponto.');
  }
}

/** Remove ruído de ponto flutuante (0,1 + 0,2 = 0,3) mantendo 15 dígitos significativos. */
export const clean = (value: number): number => (Number.isFinite(value) ? Number(value.toPrecision(15)) : value);

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError('O fatorial só existe para inteiros de 0 a 170.');
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function callFunction(name: string, args: number[], angle: AngleUnit): number {
  const a = args[0] as number;
  const toRad = (x: number): number => (angle === 'deg' ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number): number => (angle === 'deg' ? (x * 180) / Math.PI : x);
  const tiny = (x: number): number => (Math.abs(x) < 1e-14 ? 0 : x);
  switch (name) {
    case 'sin': return tiny(Math.sin(toRad(a)));
    case 'cos': return tiny(Math.cos(toRad(a)));
    case 'tan': {
      if (Math.abs(Math.cos(toRad(a))) < 1e-14) throw new CalcError('A tangente não existe neste ângulo.');
      return tiny(Math.tan(toRad(a)));
    }
    case 'asin': if (a < -1 || a > 1) throw new CalcError('O arco-seno só existe entre -1 e 1.'); return fromRad(Math.asin(a));
    case 'acos': if (a < -1 || a > 1) throw new CalcError('O arco-cosseno só existe entre -1 e 1.'); return fromRad(Math.acos(a));
    case 'atan': return fromRad(Math.atan(a));
    case 'sinh': return Math.sinh(a);
    case 'cosh': return Math.cosh(a);
    case 'tanh': return Math.tanh(a);
    case 'ln': if (a <= 0) throw new CalcError('O logaritmo só existe para números maiores que zero.'); return Math.log(a);
    case 'log': {
      if (a <= 0) throw new CalcError('O logaritmo só existe para números maiores que zero.');
      if (args.length === 2) {
        const base = args[1] as number;
        if (base <= 0 || base === 1) throw new CalcError('A base do logaritmo precisa ser maior que zero e diferente de 1.');
        return Math.log(a) / Math.log(base);
      }
      return Math.log10(a);
    }
    case 'log2': if (a <= 0) throw new CalcError('O logaritmo só existe para números maiores que zero.'); return Math.log2(a);
    case 'exp': return Math.exp(a);
    case 'sqrt': if (a < 0) throw new CalcError('Não existe raiz quadrada real de número negativo.'); return Math.sqrt(a);
    case 'cbrt': return Math.cbrt(a);
    case 'abs': return Math.abs(a);
    case 'floor': return Math.floor(a);
    case 'ceil': return Math.ceil(a);
    case 'trunc': return Math.trunc(a);
    case 'sign': return Math.sign(a);
    case 'round': {
      const digits = args.length === 2 ? Math.trunc(args[1] as number) : 0;
      if (digits < 0 || digits > 12) throw new CalcError('round aceita de 0 a 12 casas decimais.');
      const f = 10 ** digits;
      return Math.round((a + Number.EPSILON * Math.sign(a)) * f) / f;
    }
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    case 'mod': {
      const b = args[1] as number;
      if (b === 0) throw new CalcError('Divisão por zero.');
      return a - b * Math.floor(a / b);
    }
    case 'pow': return power(a, args[1] as number);
    case 'fact': return factorial(a);
    default: throw new CalcError('Função desconhecida: ' + name + '.');
  }
}

function power(base: number, exponent: number): number {
  if (base === 0 && exponent < 0) throw new CalcError('Divisão por zero.');
  const r = Math.pow(base, exponent);
  if (Number.isNaN(r)) throw new CalcError('Esta potência não tem resultado real.');
  return r;
}

function evaluate(node: Node, ctx: Required<Pick<EvalOptions, 'angle'>> & EvalOptions): number {
  switch (node.k) {
    case 'num': return node.v;
    case 'id': {
      if (Object.hasOwn(CONSTANTS, node.name)) return CONSTANTS[node.name] as number;
      if (node.name === 'ans') {
        if (typeof ctx.ans !== 'number') throw new CalcError('Ainda não há resultado anterior (ans).');
        return ctx.ans;
      }
      const v = ctx.scope?.get(node.name);
      if (typeof v === 'number') return v;
      throw new CalcError('Não conheço “' + node.name + '”. Use um número, uma constante (pi, e), ans ou uma variável criada por você.');
    }
    case 'neg': return -evaluate(node.a, ctx);
    case 'pct': return evaluate(node.a, ctx) / 100;
    case 'fact': return factorial(evaluate(node.a, ctx));
    case 'call': return clean(callFunction(node.name, node.args.map((arg) => evaluate(arg, ctx)), ctx.angle));
    case 'bin': {
      const a = evaluate(node.a, ctx);
      // 200 + 10% = 220 (o percentual é de 200); 200 × 10% = 20.
      if ((node.op === '+' || node.op === '-') && node.b.k === 'pct') {
        const part = (a * evaluate(node.b.a, ctx)) / 100;
        return clean(node.op === '+' ? a + part : a - part);
      }
      const b = evaluate(node.b, ctx);
      switch (node.op) {
        case '+': return clean(a + b);
        case '-': return clean(a - b);
        case '*': return clean(a * b);
        case '/': if (b === 0) throw new CalcError('Divisão por zero.'); return clean(a / b);
        case '^': return clean(power(a, b));
      }
    }
  }
}

/** Fecha parênteses abertos no fim, ignorando os que já estão fechados. */
export function closeParentheses(source: string): string {
  let open = 0;
  for (const ch of source) { if (ch === '(') open++; else if (ch === ')' && open > 0) open--; }
  return open > 0 ? source + ')'.repeat(Math.min(open, MAX_DEPTH)) : source;
}

/** Calcula uma expressão. Lança CalcError (mensagem em português) para qualquer problema. */
export function calculate(source: string, options: EvalOptions = {}): number {
  if (typeof source !== 'string') throw new CalcError('Digite uma expressão.');
  if (source.length > MAX_EXPRESSION) throw new CalcError('A expressão passou de ' + MAX_EXPRESSION + ' caracteres.');
  const text = options.autoClose ? closeParentheses(source) : source;
  const tree = new Parser(tokenize(text)).parse();
  const value = evaluate(tree, { ...options, angle: options.angle ?? 'deg' });
  if (Number.isNaN(value)) throw new CalcError('Esta operação não tem resultado.');
  if (!Number.isFinite(value)) throw new CalcError('O resultado é grande demais para ser mostrado.');
  return clean(value) + 0;
}

export type Outcome = { ok: true; value: number } | { ok: false; error: string };
export function tryCalculate(source: string, options: EvalOptions = {}): Outcome {
  try { return { ok: true, value: calculate(source, options) }; }
  catch (e) { return { ok: false, error: e instanceof CalcError ? e.message : 'Não foi possível calcular.' }; }
}
