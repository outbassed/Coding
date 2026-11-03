/**
 * Comparador de Arquivos: motor de diferenças (sem DOM).
 * Linhas: algoritmo de Myers (diferença mínima). Palavras: o mesmo algoritmo nas linhas alteradas.
 * Binários: tamanho, SHA-256 e primeira/total de diferenças byte a byte.
 */
export type OpType = 'eq' | 'del' | 'add';
export interface Op { t: OpType; a: number; b: number }

export interface TextOptions { ignoreCase: boolean; ignoreSpace: boolean; ignoreBlank: boolean }
export const DEFAULT_OPTIONS: TextOptions = { ignoreCase: false, ignoreSpace: false, ignoreBlank: false };
export const MAX_LINES = 50_000;
/** Número máximo de diferenças calculadas com exatidão; acima disso o trecho é tratado como substituído por inteiro. */
const MAX_D = 2000;

interface Snapshot { lo: number; arr: Int32Array }
const at = (s: Snapshot, k: number): number => s.arr[k - s.lo] as number;

/** Roteiro de edição mínimo entre duas sequências. `null` se passar do limite de diferenças. */
export function myersOps(a: readonly string[], b: readonly string[], maxD = MAX_D): Op[] | null {
  const n = a.length, m = b.length;
  if (n === 0 && m === 0) return [];
  const max = Math.min(n + m, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Snapshot[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push({ lo: -(d + 1), arr: v.slice(off - d - 1, off + d + 2) });
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[off + k - 1] as number) < (v[off + k + 1] as number)) ? (v[off + k + 1] as number) : (v[off + k - 1] as number) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
  }
  if (found < 0) return null;
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = found; d >= 0; d--) {
    const snap = trace[d] as Snapshot;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(snap, k - 1) < at(snap, k + 1)) ? k + 1 : k - 1;
    const prevX = at(snap, prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ t: 'eq', a: x - 1, b: y - 1 }); x--; y--; }
    if (d > 0) ops.push(x === prevX ? { t: 'add', a: prevX, b: prevY } : { t: 'del', a: prevX, b: prevY });
    x = prevX; y = prevY;
  }
  return ops.reverse();
}

/** Igual a myersOps, mas tira o começo e o fim iguais antes e nunca devolve nulo (o excesso vira "tudo trocado"). */
export function diffSequences(a: readonly string[], b: readonly string[]): { ops: Op[]; approximate: boolean } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ t: 'eq', a: i, b: i });
  const midA = a.slice(start, endA), midB = b.slice(start, endB);
  const inner = myersOps(midA, midB);
  let approximate = false;
  if (inner) for (const op of inner) ops.push({ t: op.t, a: op.a + start, b: op.b + start });
  else {
    approximate = true;
    for (let i = 0; i < midA.length; i++) ops.push({ t: 'del', a: start + i, b: start });
    for (let j = 0; j < midB.length; j++) ops.push({ t: 'add', a: endA, b: start + j });
  }
  for (let i = 0; i < a.length - endA; i++) ops.push({ t: 'eq', a: endA + i, b: endB + i });
  return { ops, approximate };
}

// ------------------------------------------------------------ texto
export type Eol = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';
export function detectEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length;
  if (kinds === 0) return 'none';
  if (kinds > 1) return 'mixed';
  return crlf ? 'crlf' : lf ? 'lf' : 'cr';
}
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}
const keyOf = (line: string, o: TextOptions): string => {
  let k = line;
  if (o.ignoreSpace) k = k.replace(/\s+/g, ' ').trim();
  if (o.ignoreCase) k = k.toLocaleLowerCase('pt-BR');
  return k;
};

export interface Seg { text: string; changed: boolean }
export interface Side { n: number; text: string }
export type RowKind = 'eq' | 'del' | 'add' | 'chg';
export interface Row { kind: RowKind; a?: Side; b?: Side; segA?: Seg[]; segB?: Seg[] }
export interface TextStats { added: number; removed: number; changed: number; same: number; linesA: number; linesB: number; similarity: number; differences: number }
export interface TextResult { rows: Row[]; stats: TextStats; identical: boolean; approximate: boolean; eolA: Eol; eolB: Eol; tooLarge: boolean }

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
/** Diferença por palavras entre duas linhas. */
export function wordDiff(a: string, b: string): { a: Seg[]; b: Seg[] } {
  const ta = a.match(TOKEN) ?? [], tb = b.match(TOKEN) ?? [];
  const ops = myersOps(ta, tb, 400);
  if (!ops) return { a: [{ text: a, changed: true }], b: [{ text: b, changed: true }] };
  const sa: Seg[] = [], sb: Seg[] = [];
  const push = (list: Seg[], text: string, changed: boolean): void => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text; else list.push({ text, changed });
  };
  for (const op of ops) {
    if (op.t === 'eq') { push(sa, ta[op.a] as string, false); push(sb, tb[op.b] as string, false); }
    else if (op.t === 'del') push(sa, ta[op.a] as string, true);
    else push(sb, tb[op.b] as string, true);
  }
  return { a: sa, b: sb };
}

export function compareText(textA: string, textB: string, options: TextOptions = DEFAULT_OPTIONS): TextResult {
  const eolA = detectEol(textA), eolB = detectEol(textB);
  const rawA = splitLines(textA), rawB = splitLines(textB);
  const empty: TextStats = { added: 0, removed: 0, changed: 0, same: 0, linesA: rawA.length, linesB: rawB.length, similarity: 100, differences: 0 };
  if (rawA.length > MAX_LINES || rawB.length > MAX_LINES) return { rows: [], stats: empty, identical: false, approximate: false, eolA, eolB, tooLarge: true };
  const lineA: Side[] = [], lineB: Side[] = [];
  rawA.forEach((text, i) => { if (!options.ignoreBlank || keyOf(text, options) !== '') lineA.push({ n: i + 1, text }); });
  rawB.forEach((text, i) => { if (!options.ignoreBlank || keyOf(text, options) !== '') lineB.push({ n: i + 1, text }); });
  const { ops, approximate } = diffSequences(lineA.map((l) => keyOf(l.text, options)), lineB.map((l) => keyOf(l.text, options)));

  const rows: Row[] = [];
  let i = 0;
  let same = 0, differences = 0, removed = 0, added = 0, changed = 0;
  while (i < ops.length) {
    const op = ops[i] as Op;
    if (op.t === 'eq') { rows.push({ kind: 'eq', a: lineA[op.a], b: lineB[op.b] }); same++; i++; continue; }
    const dels: Side[] = [], adds: Side[] = [];
    while (i < ops.length && (ops[i] as Op).t !== 'eq') {
      const o = ops[i] as Op;
      if (o.t === 'del') dels.push(lineA[o.a] as Side); else adds.push(lineB[o.b] as Side);
      i++;
    }
    differences++;
    const pairs = Math.min(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      const w = wordDiff((dels[p] as Side).text, (adds[p] as Side).text);
      rows.push({ kind: 'chg', a: dels[p], b: adds[p], segA: w.a, segB: w.b });
      changed++;
    }
    for (let p = pairs; p < dels.length; p++) { rows.push({ kind: 'del', a: dels[p] }); removed++; }
    for (let p = pairs; p < adds.length; p++) { rows.push({ kind: 'add', b: adds[p] }); added++; }
  }
  const total = lineA.length + lineB.length;
  const stats: TextStats = {
    added, removed, changed, same, linesA: rawA.length, linesB: rawB.length, differences,
    similarity: total === 0 ? 100 : Math.floor((same * 2 * 100) / total)
  };
  return { rows, stats, identical: differences === 0, approximate, eolA, eolB, tooLarge: false };
}

/** Texto no formato "unified diff" (o mesmo do `diff -u`), com 3 linhas de contexto. */
export function unifiedDiff(textA: string, textB: string, nameA: string, nameB: string, options: TextOptions = DEFAULT_OPTIONS, context = 3): string {
  const result = compareText(textA, textB, options);
  const out = ['--- ' + nameA, '+++ ' + nameB];
  if (result.identical || result.tooLarge) return out.join('\n') + '\n';
  interface Line { t: ' ' | '-' | '+'; text: string; a?: number; b?: number }
  // Em cada bloco de mudanças, primeiro todas as remoções e depois todas as adições.
  const lines: Line[] = [];
  let adds: Line[] = [];
  for (const r of result.rows) {
    if (r.kind === 'eq') {
      lines.push(...adds); adds = [];
      lines.push({ t: ' ', text: (r.a as Side).text, a: (r.a as Side).n, b: (r.b as Side).n });
      continue;
    }
    if (r.a) lines.push({ t: '-', text: r.a.text, a: r.a.n });
    if (r.b) adds.push({ t: '+', text: r.b.text, b: r.b.n });
  }
  lines.push(...adds);
  const changed = lines.map((l, i) => (l.t === ' ' ? -1 : i)).filter((i) => i >= 0);
  let h = 0;
  while (h < changed.length) {
    const first = changed[h] as number;
    let last = first;
    while (h + 1 < changed.length && (changed[h + 1] as number) - last <= context * 2 + 1) { h++; last = changed[h] as number; }
    h++;
    const from = Math.max(0, first - context), to = Math.min(lines.length - 1, last + context);
    const slice = lines.slice(from, to + 1);
    const sideA = slice.filter((l) => l.t !== '+'), sideB = slice.filter((l) => l.t !== '-');
    out.push('@@ -' + header(sideA.map((l) => l.a as number), lines, from, 'a') + ' +' + header(sideB.map((l) => l.b as number), lines, from, 'b') + ' @@');
    for (const l of slice) out.push(l.t + l.text);
  }
  return out.join('\n') + '\n';
}
/** "início,quantidade" de um trecho; quando está vazio, o início é a linha anterior (como no diff -u). */
function header(numbers: number[], lines: { a?: number; b?: number }[], from: number, side: 'a' | 'b'): string {
  if (numbers.length === 0) {
    for (let i = from - 1; i >= 0; i--) { const n = (lines[i] as { a?: number; b?: number })[side]; if (n !== undefined) return n + ',0'; }
    return '0,0';
  }
  return numbers.length === 1 ? String(numbers[0]) : numbers[0] + ',' + numbers.length;
}

// ------------------------------------------------------------ binário
export interface BinaryResult {
  identical: boolean; sizeA: number; sizeB: number;
  firstDifference: number; differentBytes: number; comparedBytes: number;
  windowA: number[]; windowB: number[]; windowStart: number;
}
export function compareBytes(a: Uint8Array, b: Uint8Array): BinaryResult {
  const common = Math.min(a.length, b.length);
  let first = -1, different = 0;
  for (let i = 0; i < common; i++) {
    if (a[i] !== b[i]) { different++; if (first < 0) first = i; }
  }
  if (first < 0 && a.length !== b.length) first = common;
  const start = first < 0 ? 0 : Math.max(0, first - (first % 16));
  return {
    identical: first < 0, sizeA: a.length, sizeB: b.length, firstDifference: first,
    differentBytes: different + Math.abs(a.length - b.length), comparedBytes: common,
    windowStart: start, windowA: Array.from(a.subarray(start, start + 48)), windowB: Array.from(b.subarray(start, start + 48))
  };
}
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}
/** Hexadecimal de uma janela de bytes, "ab 01 ff". */
export const hexWindow = (bytes: readonly number[]): string => bytes.map((x) => x.toString(16).padStart(2, '0')).join(' ');
/** Texto UTF-8 válido? Devolve nulo para binário (byte nulo ou UTF-8 inválido). */
export function decodeText(bytes: Uint8Array): string | null {
  const sample = bytes.subarray(0, 8192);
  if (sample.includes(0)) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); } catch { return null; }
}
