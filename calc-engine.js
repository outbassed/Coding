/* Coding — motor de fórmulas das Planilhas (sem dependências; funciona no navegador e no Node para testes) */
(function (root) {
  "use strict";

  class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const E = (code) => new XErr(code);

  const MAXC = 52;
  const MAXR = 500;

  /* ---------- Colunas e referências ---------- */

  function colName(i) {
    let n = i + 1;
    let s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function colIndex(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }
  const REF_RE = /^(\$?)([A-Za-z]{1,2})(\$?)(\d{1,6})$/;
  function parseRef(text) {
    const m = REF_RE.exec(text);
    if (!m) return null;
    const c = colIndex(m[2]);
    const r = Number(m[4]) - 1;
    if (r < 0 || c < 0 || c >= MAXC || r >= MAXR) return null;
    return { r, c, ra: m[3] === "$", ca: m[1] === "$" };
  }
  const refText = (r, c, ra, ca) => (ca ? "$" : "") + colName(c) + (ra ? "$" : "") + (r + 1);

  /* ---------- Números e textos ---------- */

  function parseNum(input) {
    let s = String(input).trim();
    if (!s) return NaN;
    s = s.replace(/^R\$\s*/i, "");
    let pct = false;
    if (s.endsWith("%")) { pct = true; s = s.slice(0, -1).trim(); }
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(",", ".");
    else if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    const n = Number(s);
    return pct ? n / 100 : n;
  }

  function literal(raw) {
    if (raw === undefined || raw === null || raw === "") return null;
    const s = String(raw);
    if (s[0] === "'") return s.slice(1);
    const t = s.trim();
    if (t === "") return s;
    const up = t.toUpperCase();
    if (up === "VERDADEIRO" || up === "TRUE") return true;
    if (up === "FALSO" || up === "FALSE") return false;
    if (/^[+-]?(R\$\s*)?[\d.,]+\s*%?$/i.test(t)) { const n = parseNum(t); if (!Number.isNaN(n)) return n; }
    return s;
  }

  const fmtCache = {};
  function nf(kind) {
    if (!fmtCache[kind]) {
      const opt = kind === "brl" ? { style: "currency", currency: "BRL" }
        : kind === "pct" ? { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
      fmtCache[kind] = new Intl.NumberFormat("pt-BR", opt);
    }
    return fmtCache[kind];
  }
  function generalNum(n) {
    if (!Number.isFinite(n)) return n > 0 ? "#NÚM!" : "#NÚM!";
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    let s = String(Number(n.toPrecision(12)));
    if (/e/i.test(s)) s = Number(n.toPrecision(10)).toExponential().replace("e+", "E+").replace("e-", "E-");
    return s.replace(".", ",");
  }
  function fmtNum(n, kind) {
    if (kind === "num" || kind === "brl" || kind === "pct") {
      if (!Number.isFinite(n)) return "#NÚM!";
      return nf(kind).format(n).replace(/ /g, " ");
    }
    return generalNum(n);
  }
  function showValue(v, kind) {
    if (v === null || v === undefined) return "";
    if (v instanceof XErr) return v.code;
    if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
    if (typeof v === "number") return fmtNum(v, kind);
    return String(v);
  }
  const toText = (v) => (v === null || v === undefined ? "" : v instanceof XErr ? v.code : typeof v === "boolean" ? (v ? "VERDADEIRO" : "FALSO") : typeof v === "number" ? generalNum(v) : String(v));

  /* ---------- Tokens ---------- */

  const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  function tokenize(src) {
    const semi = src.includes(";");
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let j = i + 1;
        let s = "";
        for (;;) {
          if (j >= src.length) throw E("#ERRO!");
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
          s += src[j++];
        }
        toks.push({ t: "str", v: s });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
        let j = i;
        let s = "";
        while (j < src.length && (/[0-9]/.test(src[j]) || src[j] === "." || (semi && src[j] === ","))) { s += src[j] === "," ? "." : src[j]; j++; }
        const n = Number(s);
        if (Number.isNaN(n)) throw E("#ERRO!");
        toks.push({ t: "num", v: n });
        i = j;
        continue;
      }
      if (/[A-Za-z_$À-ÿ]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_.$À-ÿ]/.test(src[j])) j++;
        const word = src.slice(i, j);
        let k = j;
        while (k < src.length && /\s/.test(src[k])) k++;
        if (src[k] === "(") { toks.push({ t: "fn", v: word }); i = j; continue; }
        const ref = parseRef(word);
        if (ref) { toks.push({ t: "ref", ref, text: word }); i = j; continue; }
        const up = strip(word);
        if (up === "VERDADEIRO" || up === "TRUE") { toks.push({ t: "bool", v: true }); i = j; continue; }
        if (up === "FALSO" || up === "FALSE") { toks.push({ t: "bool", v: false }); i = j; continue; }
        throw E("#NOME?");
      }
      const two = src.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "<>") { toks.push({ t: "op", v: two }); i += 2; continue; }
      if ("+-*/^&=<>%():".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
      if (ch === ";" || ch === ",") { toks.push({ t: "sep" }); i++; continue; }
      throw E("#ERRO!");
    }
    return toks;
  }

  /* ---------- Parser ---------- */

  const astCache = new Map();
  function parse(src) {
    if (astCache.has(src)) { const hit = astCache.get(src); if (hit instanceof XErr) throw hit; return hit; }
    let ast;
    try { ast = parseTokens(tokenize(src)); } catch (e) { const err = e instanceof XErr ? e : E("#ERRO!"); if (astCache.size > 4000) astCache.clear(); astCache.set(src, err); throw err; }
    if (astCache.size > 4000) astCache.clear();
    astCache.set(src, ast);
    return ast;
  }

  function parseTokens(toks) {
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].t === "op" && toks[p].v === v;
    function expr() { return cmp(); }
    function cmp() {
      let l = concat();
      while (peek() && peek().t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v)) { const op = toks[p++].v; l = { t: "bin", op, l, r: concat() }; }
      return l;
    }
    function concat() { let l = add(); while (isOp("&")) { p++; l = { t: "bin", op: "&", l, r: add() }; } return l; }
    function add() { let l = mul(); while (isOp("+") || isOp("-")) { const op = toks[p++].v; l = { t: "bin", op, l, r: mul() }; } return l; }
    function mul() { let l = pow(); while (isOp("*") || isOp("/")) { const op = toks[p++].v; l = { t: "bin", op, l, r: pow() }; } return l; }
    function pow() { let l = unary(); while (isOp("^")) { p++; l = { t: "bin", op: "^", l, r: unary() }; } return l; }
    function unary() {
      if (isOp("-")) { p++; return { t: "neg", e: unary() }; }
      if (isOp("+")) { p++; return unary(); }
      let e = prim();
      while (isOp("%")) { p++; e = { t: "pct", e }; }
      return e;
    }
    function prim() {
      const t = toks[p++];
      if (!t) throw E("#ERRO!");
      if (t.t === "num" || t.t === "str" || t.t === "bool") return { t: "lit", v: t.v };
      if (t.t === "ref") {
        if (isOp(":") && toks[p + 1] && toks[p + 1].t === "ref") {
          const b = toks[p + 1].ref;
          p += 2;
          return { t: "range", a: t.ref, b };
        }
        return { t: "ref", ref: t.ref };
      }
      if (t.t === "fn") {
        if (!isOp("(")) throw E("#ERRO!");
        p++;
        const args = [];
        if (isOp(")")) { p++; return { t: "fn", name: t.v, args }; }
        for (;;) {
          if (toks[p] && toks[p].t === "sep") args.push({ t: "lit", v: null }); else args.push(expr());
          if (toks[p] && toks[p].t === "sep") { p++; if (isOp(")")) { args.push({ t: "lit", v: null }); p++; break; } continue; }
          if (isOp(")")) { p++; break; }
          throw E("#ERRO!");
        }
        return { t: "fn", name: t.v, args };
      }
      if (t.t === "op" && t.v === "(") {
        const e = expr();
        if (!isOp(")")) throw E("#ERRO!");
        p++;
        return e;
      }
      throw E("#ERRO!");
    }
    const ast = expr();
    if (p < toks.length) throw E("#ERRO!");
    return ast;
  }

  /* ---------- Avaliação ---------- */

  class Rng {
    constructor(cx, a, b) {
      this.cx = cx;
      this.r1 = Math.min(a.r, b.r); this.r2 = Math.max(a.r, b.r);
      this.c1 = Math.min(a.c, b.c); this.c2 = Math.max(a.c, b.c);
    }
    get rows() { return this.r2 - this.r1 + 1; }
    get cols() { return this.c2 - this.c1 + 1; }
    at(i, j) { return this.cx.get(this.r1 + i, this.c1 + j); }
    each(cb) {
      if (this.rows * this.cols > 200000) throw E("#VALOR!");
      for (let r = this.r1; r <= this.r2; r++) for (let c = this.c1; c <= this.c2; c++) cb(this.cx.get(r, c));
    }
  }

  const scalar = (v) => {
    if (v instanceof Rng) { if (v.rows === 1 && v.cols === 1) return v.at(0, 0); throw E("#VALOR!"); }
    return v;
  };
  const checkErr = (v) => { if (v instanceof XErr) throw v; return v; };
  function num(v) {
    v = checkErr(scalar(v));
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const n = parseNum(v);
    if (Number.isNaN(n)) throw E("#VALOR!");
    return n;
  }
  const text = (v) => toText(checkErr(scalar(v)));
  const bool = (v) => {
    v = checkErr(scalar(v));
    if (typeof v === "boolean") return v;
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return v !== 0;
    const up = strip(String(v));
    if (up === "VERDADEIRO" || up === "TRUE") return true;
    if (up === "FALSO" || up === "FALSE") return false;
    throw E("#VALOR!");
  };

  function compare(a, b) {
    const rank = (v) => (typeof v === "number" ? 1 : typeof v === "string" ? 2 : typeof v === "boolean" ? 3 : 0);
    if (a === null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
    if (b === null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function evalNode(n, cx) {
    switch (n.t) {
      case "lit": return n.v;
      case "ref": return checkErr(cx.get(n.ref.r, n.ref.c));
      case "range": return new Rng(cx, n.a, n.b);
      case "neg": return -num(evalNode(n.e, cx));
      case "pct": return num(evalNode(n.e, cx)) / 100;
      case "bin": {
        const a = evalNode(n.l, cx);
        const b = evalNode(n.r, cx);
        switch (n.op) {
          case "+": return num(a) + num(b);
          case "-": return num(a) - num(b);
          case "*": return num(a) * num(b);
          case "/": { const d = num(b); if (d === 0) throw E("#DIV/0!"); return num(a) / d; }
          case "^": { const r = Math.pow(num(a), num(b)); if (!Number.isFinite(r)) throw E("#NÚM!"); return r; }
          case "&": return text(a) + text(b);
          default: {
            const c = compare(checkErr(scalar(a)), checkErr(scalar(b)));
            return n.op === "=" ? c === 0 : n.op === "<>" ? c !== 0 : n.op === "<" ? c < 0 : n.op === ">" ? c > 0 : n.op === "<=" ? c <= 0 : c >= 0;
          }
        }
      }
      case "fn": return callFn(n, cx);
      default: throw E("#ERRO!");
    }
  }

  /* ---------- Funções ---------- */

  const FN = {};
  const EN_NAME = {};
  const PT_NAME = {};
  function def(pt, en, f, lazy) {
    const key = strip(pt);
    FN[key] = { f, lazy: !!lazy, pt, en };
    FN[strip(en)] = FN[key];
    EN_NAME[key] = en;
    PT_NAME[strip(en)] = pt;
  }

  function nums(args, direct) {
    const out = [];
    for (const a of args) {
      if (a instanceof Rng) a.each((v) => { if (v instanceof XErr) throw v; if (typeof v === "number") out.push(v); });
      else if (a === null && direct !== false) continue;
      else out.push(num(a));
    }
    return out;
  }
  function allValues(args) {
    const out = [];
    for (const a of args) { if (a instanceof Rng) a.each((v) => { if (v instanceof XErr) throw v; out.push(v); }); else out.push(checkErr(a)); }
    return out;
  }
  function roundTo(x, d, mode) {
    const f = Math.pow(10, d);
    const y = x * f;
    const r = mode === "up" ? (y < 0 ? -Math.ceil(-y - 1e-9) : Math.ceil(y - 1e-9)) : mode === "down" ? (y < 0 ? -Math.floor(-y + 1e-9) : Math.floor(y + 1e-9)) : (y < 0 ? -Math.round(-y + 1e-9) : Math.round(y + 1e-9));
    return r / f;
  }
  function matcher(crit) {
    crit = checkErr(scalar(crit));
    if (typeof crit === "number" || typeof crit === "boolean") return (v) => v !== null && compare(v, crit) === 0 && typeof v === typeof crit;
    const s = String(crit === null ? "" : crit);
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s);
    const op = m[1] || "=";
    const rest = m[2];
    const n = parseNum(rest);
    const isNum = rest.trim() !== "" && !Number.isNaN(n);
    return (v) => {
      if (isNum) {
        if (typeof v !== "number") return op === "<>";
        return op === "=" ? v === n : op === "<>" ? v !== n : op === "<" ? v < n : op === ">" ? v > n : op === "<=" ? v <= n : v >= n;
      }
      const sv = v === null ? "" : toText(v).toLowerCase();
      const sr = rest.toLowerCase();
      if (op === "<>") return sv !== sr;
      if (op === "=") {
        if (sr.includes("*") || sr.includes("?")) return new RegExp("^" + sr.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$").test(sv);
        return sv === sr;
      }
      return op === "<" ? sv < sr : op === ">" ? sv > sr : op === "<=" ? sv <= sr : sv >= sr;
    };
  }

  def("SOMA", "SUM", (a) => nums(a).reduce((x, y) => x + y, 0));
  def("MÉDIA", "AVERAGE", (a) => { const n = nums(a); if (!n.length) throw E("#DIV/0!"); return n.reduce((x, y) => x + y, 0) / n.length; });
  def("MÁXIMO", "MAX", (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; });
  def("MÍNIMO", "MIN", (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; });
  def("MAIOR", "LARGE", (a) => { const n = nums([a[0]]).sort((x, y) => y - x); const k = num(a[1]); if (k < 1 || k > n.length) throw E("#NÚM!"); return n[k - 1]; });
  def("MENOR", "SMALL", (a) => { const n = nums([a[0]]).sort((x, y) => x - y); const k = num(a[1]); if (k < 1 || k > n.length) throw E("#NÚM!"); return n[k - 1]; });
  def("CONT.NÚM", "COUNT", (a) => { let n = 0; a.forEach((x) => { if (x instanceof Rng) x.each((v) => { if (typeof v === "number") n++; }); else if (typeof x === "number") n++; }); return n; });
  def("CONT.VALORES", "COUNTA", (a) => { let n = 0; a.forEach((x) => { if (x instanceof Rng) x.each((v) => { if (v !== null) n++; }); else if (x !== null) n++; }); return n; });
  def("CONT.VAZIO", "COUNTBLANK", (a) => { let n = 0; a.forEach((x) => { if (x instanceof Rng) x.each((v) => { if (v === null || v === "") n++; }); }); return n; });
  def("SOMASE", "SUMIF", (a) => {
    if (!(a[0] instanceof Rng)) throw E("#VALOR!");
    const ok = matcher(a[1]);
    const sumR = a[2] instanceof Rng ? a[2] : a[0];
    let t = 0;
    for (let i = 0; i < a[0].rows; i++) for (let j = 0; j < a[0].cols; j++) {
      const v = a[0].at(i, j);
      if (v instanceof XErr) throw v;
      if (ok(v)) { const s = sumR.at(i, j); if (s instanceof XErr) throw s; if (typeof s === "number") t += s; }
    }
    return t;
  });
  def("CONT.SE", "COUNTIF", (a) => {
    if (!(a[0] instanceof Rng)) throw E("#VALOR!");
    const ok = matcher(a[1]);
    let n = 0;
    a[0].each((v) => { if (ok(v)) n++; });
    return n;
  });
  def("MÉDIASE", "AVERAGEIF", (a) => {
    if (!(a[0] instanceof Rng)) throw E("#VALOR!");
    const ok = matcher(a[1]);
    const avgR = a[2] instanceof Rng ? a[2] : a[0];
    let t = 0, n = 0;
    for (let i = 0; i < a[0].rows; i++) for (let j = 0; j < a[0].cols; j++) {
      if (ok(a[0].at(i, j))) { const s = avgR.at(i, j); if (typeof s === "number") { t += s; n++; } }
    }
    if (!n) throw E("#DIV/0!");
    return t / n;
  });
  def("SOMARPRODUTO", "SUMPRODUCT", (a) => {
    const rs = a.map((x) => { if (!(x instanceof Rng)) throw E("#VALOR!"); return x; });
    if (!rs.length) throw E("#VALOR!");
    if (rs.some((x) => x.rows !== rs[0].rows || x.cols !== rs[0].cols)) throw E("#VALOR!");
    let t = 0;
    for (let i = 0; i < rs[0].rows; i++) for (let j = 0; j < rs[0].cols; j++) {
      let p = 1;
      for (const r of rs) { const v = r.at(i, j); if (v instanceof XErr) throw v; p *= typeof v === "number" ? v : 0; }
      t += p;
    }
    return t;
  });
  def("SE", "IF", (a, cx) => {
    if (a.length < 2 || a.length > 3) throw E("#VALOR!");
    const c = bool(evalNode(a[0], cx));
    if (c) return a[1].t === "lit" && a[1].v === null ? 0 : evalNode(a[1], cx);
    if (a.length < 3) return false;
    return a[2].t === "lit" && a[2].v === null ? 0 : evalNode(a[2], cx);
  }, true);
  def("SEERRO", "IFERROR", (a, cx) => {
    if (a.length !== 2) throw E("#VALOR!");
    try { const v = evalNode(a[0], cx); const s = scalar(v); if (s instanceof XErr) throw s; return v; } catch (e) { if (e instanceof XErr) return evalNode(a[1], cx); throw e; }
  }, true);
  def("E", "AND", (a) => { const v = allValues(a).filter((x) => x !== null && x !== ""); if (!v.length) throw E("#VALOR!"); return v.every((x) => bool(x)); });
  def("OU", "OR", (a) => { const v = allValues(a).filter((x) => x !== null && x !== ""); if (!v.length) throw E("#VALOR!"); return v.some((x) => bool(x)); });
  def("NÃO", "NOT", (a) => !bool(a[0]));
  def("ARRED", "ROUND", (a) => roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, "round"));
  def("ARREDONDAR.PARA.CIMA", "ROUNDUP", (a) => roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, "up"));
  def("ARREDONDAR.PARA.BAIXO", "ROUNDDOWN", (a) => roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, "down"));
  def("ABS", "ABS", (a) => Math.abs(num(a[0])));
  def("INT", "INT", (a) => Math.floor(num(a[0])));
  def("TRUNCAR", "TRUNC", (a) => roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, "down"));
  def("RAIZ", "SQRT", (a) => { const n = num(a[0]); if (n < 0) throw E("#NÚM!"); return Math.sqrt(n); });
  def("POTÊNCIA", "POWER", (a) => { const r = Math.pow(num(a[0]), num(a[1])); if (!Number.isFinite(r)) throw E("#NÚM!"); return r; });
  def("MOD", "MOD", (a) => { const d = num(a[1]); if (d === 0) throw E("#DIV/0!"); const n = num(a[0]); return n - d * Math.floor(n / d); });
  def("PI", "PI", () => Math.PI);
  def("ALEATÓRIO", "RAND", () => Math.random());
  def("ALEATÓRIOENTRE", "RANDBETWEEN", (a) => { const lo = Math.ceil(num(a[0])), hi = Math.floor(num(a[1])); if (hi < lo) throw E("#NÚM!"); return lo + Math.floor(Math.random() * (hi - lo + 1)); });
  def("CONCATENAR", "CONCATENATE", (a) => allValues(a).map(toText).join(""));
  def("CONCAT", "CONCAT", (a) => allValues(a).map(toText).join(""));
  def("MAIÚSCULA", "UPPER", (a) => text(a[0]).toUpperCase());
  def("MINÚSCULA", "LOWER", (a) => text(a[0]).toLowerCase());
  def("PRI.MAIÚSCULA", "PROPER", (a) => text(a[0]).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()));
  def("ESQUERDA", "LEFT", (a) => text(a[0]).slice(0, a.length > 1 ? Math.max(0, Math.trunc(num(a[1]))) : 1));
  def("DIREITA", "RIGHT", (a) => { const s = text(a[0]); const n = a.length > 1 ? Math.max(0, Math.trunc(num(a[1]))) : 1; return n === 0 ? "" : s.slice(-n); });
  def("EXT.TEXTO", "MID", (a) => { const s = text(a[0]); const st = Math.trunc(num(a[1])); const n = Math.trunc(num(a[2])); if (st < 1 || n < 0) throw E("#VALOR!"); return s.substr(st - 1, n); });
  def("NÚM.CARACT", "LEN", (a) => text(a[0]).length);
  def("ARRUMAR", "TRIM", (a) => text(a[0]).replace(/\s+/g, " ").trim());
  def("SUBSTITUIR", "SUBSTITUTE", (a) => { const s = text(a[0]); const from = text(a[1]); return from ? s.split(from).join(text(a[2])) : s; });
  def("VALOR", "VALUE", (a) => { const v = checkErr(scalar(a[0])); if (typeof v === "number") return v; const n = parseNum(toText(v)); if (Number.isNaN(n)) throw E("#VALOR!"); return n; });
  def("TEXTO", "TEXT", (a) => { const n = num(a[0]); const f = text(a[1]); const d = (f.split(".")[1] || f.split(",")[1] || "").replace(/[^0#]/g, "").length; if (/%/.test(f)) return nf("pct").format(n); return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: /[#.,]\s*[#0]{3}/.test(f) && /#,##|#\.##/.test(f) }).format(n); });
  function clockText(withTime) {
    const c = api.clock || {};
    const ts = c.now ? c.now() : Date.now();
    const o = { day: "2-digit", month: "2-digit", year: "numeric" };
    if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
    let fmt;
    try { fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: c.zone || "America/Sao_Paulo", ...o }); } catch (_) { fmt = new Intl.DateTimeFormat("pt-BR", o); }
    return fmt.format(new Date(ts)).replace(", ", " ");
  }
  def("HOJE", "TODAY", () => clockText(false));
  def("AGORA", "NOW", () => clockText(true));
  def("ÉNÚM", "ISNUMBER", (a) => typeof scalar(a[0]) === "number");
  def("ÉTEXTO", "ISTEXT", (a) => typeof scalar(a[0]) === "string");
  def("ÉCÉL.VAZIA", "ISBLANK", (a) => scalar(a[0]) === null);
  def("ÉERRO", "ISERROR", (a) => scalar(a[0]) instanceof XErr);
  def("PROCV", "VLOOKUP", (a) => {
    const key = checkErr(scalar(a[0]));
    const t = a[1];
    if (!(t instanceof Rng)) throw E("#VALOR!");
    const idx = Math.trunc(num(a[2]));
    if (idx < 1 || idx > t.cols) throw E("#REF!");
    const exact = a.length > 3 && a[3] !== null && !bool(a[3]);
    let best = -1;
    for (let i = 0; i < t.rows; i++) {
      const v = t.at(i, 0);
      if (v instanceof XErr) continue;
      if (exact) { if (v !== null && compare(v, key) === 0 && typeof v === typeof key) { best = i; break; } }
      else if (v !== null && typeof v === typeof key && compare(v, key) <= 0) best = i;
    }
    if (best < 0) throw E("#N/D");
    const r = t.at(best, idx - 1);
    if (r instanceof XErr) throw r;
    return r === null ? 0 : r;
  });

  function callFn(n, cx) {
    const d = FN[strip(n.name)];
    if (!d) throw E("#NOME?");
    if (d.lazy) return d.f(n.args, cx);
    const args = n.args.map((a) => evalNode(a, cx));
    return d.f(args, cx);
  }

  /* ---------- Contexto de avaliação de uma planilha ---------- */

  function makeCx(cells) {
    const cache = new Map();
    const stack = new Set();
    const cx = {
      get(r, c) {
        const k = r + "," + c;
        if (cache.has(k)) return cache.get(k);
        if (stack.has(k)) return E("#CICLO!");
        const cell = cells[k];
        let val;
        if (!cell || cell.v === undefined || cell.v === "") val = null;
        else if (cell.v[0] === "=") {
          stack.add(k);
          try {
            let v = evalNode(parse(cell.v.slice(1)), cx);
            if (v instanceof Rng) v = scalar(v);
            if (typeof v === "number" && !Number.isFinite(v)) v = E("#NÚM!");
            val = v === undefined ? null : v;
          } catch (e) {
            val = e instanceof XErr ? e : E("#ERRO!");
          }
          stack.delete(k);
        } else val = literal(cell.v);
        cache.set(k, val);
        return val;
      }
    };
    return cx;
  }

  /* ---------- Reescrita de referências (colar, preencher, inserir e excluir) ---------- */

  const CELL_RE = /(\$?)([A-Za-z]{1,2})(\$?)(\d{1,6})(?::(\$?)([A-Za-z]{1,2})(\$?)(\d{1,6}))?/g;

  function mapFormula(formula, fn) {
    const parts = formula.split(/("(?:[^"]|"")*")/);
    return parts.map((part, idx) => {
      if (idx % 2 === 1) return part;
      return part.replace(CELL_RE, (m, d1, l1, d2, n1, d3, l2, d4, n2, offset, whole) => {
        const before = whole[offset - 1] || "";
        const after = whole[offset + m.length] || "";
        if (/[A-Za-z0-9_.]/.test(before) || /[A-Za-z0-9_(]/.test(after)) return m;
        const a = parseRef(d1 + l1 + d2 + n1);
        if (!a) return m;
        const b = l2 ? parseRef(d3 + l2 + d4 + n2) : null;
        if (l2 && !b) return m;
        return fn(a, b) ?? "#REF!";
      });
    }).join("");
  }

  function shiftFormula(formula, dr, dc) {
    if (!formula || formula[0] !== "=") return formula;
    const one = (x) => {
      const r = x.ra ? x.r : x.r + dr;
      const c = x.ca ? x.c : x.c + dc;
      return r < 0 || c < 0 || r >= MAXR || c >= MAXC ? null : { r, c, ra: x.ra, ca: x.ca };
    };
    return "=" + mapFormula(formula.slice(1), (a, b) => {
      const x = one(a);
      if (!x) return null;
      if (!b) return refText(x.r, x.c, x.ra, x.ca);
      const y = one(b);
      if (!y) return null;
      return refText(x.r, x.c, x.ra, x.ca) + ":" + refText(y.r, y.c, y.ra, y.ca);
    });
  }

  /* axis: "r" ou "c"; at: índice; kind: "ins" | "del" */
  function remapFormula(formula, axis, at, kind) {
    if (!formula || formula[0] !== "=") return formula;
    const idx = (x) => x[axis];
    const set = (x, v) => (axis === "r" ? { ...x, r: v } : { ...x, c: v });
    return "=" + mapFormula(formula.slice(1), (a, b) => {
      let x, y;
      if (kind === "ins") {
        x = idx(a) >= at ? set(a, idx(a) + 1) : a;
        y = b ? (idx(b) >= at ? set(b, idx(b) + 1) : b) : null;
      } else if (!b) {
        if (idx(a) === at) return null;
        x = idx(a) > at ? set(a, idx(a) - 1) : a;
      } else {
        const lo = Math.min(idx(a), idx(b)), hi = Math.max(idx(a), idx(b));
        if (lo === at && hi === at) return null;
        const nl = lo > at ? lo - 1 : lo;
        const nh = hi >= at ? hi - 1 : hi;
        if (nh < nl) return null;
        x = set(idx(a) <= idx(b) ? a : b, nl);
        y = set(idx(a) <= idx(b) ? b : a, nh);
      }
      const lim = axis === "r" ? MAXR : MAXC;
      if (idx(x) >= lim || (y && idx(y) >= lim)) return null;
      return refText(x.r, x.c, x.ra, x.ca) + (y ? ":" + refText(y.r, y.c, y.ra, y.ca) : "");
    });
  }

  /* ---------- Conversão entre português (;) e inglês (,) para .xlsx ---------- */

  function reemit(formula, lang) {
    const toks = tokenize(formula);
    const semi = lang === "pt";
    let out = "";
    toks.forEach((t) => {
      if (t.t === "num") out += semi ? String(t.v).replace(".", ",") : String(t.v);
      else if (t.t === "str") out += '"' + t.v.replace(/"/g, '""') + '"';
      else if (t.t === "bool") out += semi ? (t.v ? "VERDADEIRO" : "FALSO") : (t.v ? "TRUE" : "FALSE");
      else if (t.t === "ref") out += t.text.toUpperCase();
      else if (t.t === "fn") {
        const d = FN[strip(t.v)];
        out += d ? (lang === "pt" ? d.pt : d.en) : t.v;
      } else if (t.t === "sep") out += semi ? ";" : ",";
      else out += t.v;
    });
    return out;
  }

  function previewFormula(formula, cells) {
    const temp = { ...cells };
    temp["99999,0"] = { v: formula };
    const v = makeCx(temp).get(99999, 0);
    return v;
  }
  function functionNames() { const seen = new Set(); const out = []; Object.values(FN).forEach((d) => { if (!seen.has(d.pt)) { seen.add(d.pt); out.push({ pt: d.pt, en: d.en, key: strip(d.pt) }); } }); return out.sort((a, b) => a.pt.localeCompare(b.pt, "pt-BR")); }

  const api = { clock: { now: () => Date.now(), zone: "America/Sao_Paulo" }, previewFormula, functionNames, strip, XErr, E, MAXC, MAXR, colName, colIndex, parseRef, refText, parseNum, literal, makeCx, showValue, fmtNum, generalNum, toText, shiftFormula, remapFormula, reemit, parse, tokenize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CodingCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
