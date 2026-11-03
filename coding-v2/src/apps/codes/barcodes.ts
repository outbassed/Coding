/**
 * Codificadores 1D sem dependências. Cada um devolve módulos (1 = barra, 0 = espaço), sem zonas de silêncio,
 * mais o texto legível. Tabelas iguais às especificações (ISO/IEC 15417 Code 128, 16388 Code 39, 15420 EAN/UPC).
 */
export type Symbology = 'qr' | 'code128' | 'ean13' | 'ean8' | 'upca' | 'code39';
export interface Linear { modules: number[]; text: string; /** posições (em módulos) das barras-guia mais longas, para EAN/UPC */ guards: [number, number][] }
export class CodeError extends Error { constructor(message: string) { super(message); this.name = 'CodeError'; } }

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;
function widths(pattern: string, out: number[]): void {
  let bar = true;
  for (const ch of pattern) { for (let i = 0; i < Number(ch); i++) out.push(bar ? 1 : 0); bar = !bar; }
}
const digitRun = (s: string, i: number): number => { let n = 0; while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++; return n; };

/** Code 128 (conjuntos B e C, com troca automática para sequências de dígitos). */
export function code128(text: string): Linear {
  if (!text) throw new CodeError('Digite o conteúdo do código.');
  if (text.length > 80) throw new CodeError('Code 128 aceita até 80 caracteres aqui.');
  for (const ch of text) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new CodeError('Code 128 aceita só letras sem acento, números e sinais comuns (ASCII). “' + ch + '” não é aceito.'); }
  const codes: number[] = [];
  let set: 'B' | 'C';
  let i = 0;
  const first = digitRun(text, 0);
  if (first >= 4 || (first === text.length && first >= 2 && first % 2 === 0)) { set = 'C'; codes.push(START_C); }
  else { set = 'B'; codes.push(START_B); }
  while (i < text.length) {
    const run = digitRun(text, i);
    if (set === 'C') {
      if (run >= 2) { codes.push(Number(text.slice(i, i + 2))); i += 2; continue; }
      codes.push(CODE_B); set = 'B'; continue;
    }
    const atEnd = i + run === text.length;
    if (run >= 6 || (run >= 4 && atEnd)) {
      // número par de dígitos em C; um dígito ímpar sobra em B antes da troca
      if (run % 2 === 1) { codes.push(text.charCodeAt(i) - 32); i++; }
      codes.push(CODE_C); set = 'C'; continue;
    }
    codes.push(text.charCodeAt(i) - 32); i++;
  }
  let sum = codes[0]!;
  for (let k = 1; k < codes.length; k++) sum += codes[k]! * k;
  codes.push(sum % 103, STOP);
  const modules: number[] = [];
  for (const c of codes) widths(C128[c]!, modules);
  return { modules, text, guards: [] };
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
/** Dígito verificador GTIN (EAN-8, EAN-13, UPC-A). */
export function gtinCheck(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}
function gtin(text: string, size: number, label: string): string {
  const s = text.replace(/\s/g, '');
  if (!/^\d+$/.test(s)) throw new CodeError(label + ' aceita só números.');
  if (s.length === size - 1) return s + gtinCheck(s);
  if (s.length !== size) throw new CodeError(label + ' precisa de ' + (size - 1) + ' dígitos (o verificador é calculado) ou ' + size + ' com o verificador.');
  const check = gtinCheck(s.slice(0, -1));
  if (Number(s[size - 1]) !== check) throw new CodeError('Dígito verificador incorreto: para ' + s.slice(0, -1) + ' o último dígito deve ser ' + check + '.');
  return s;
}
const bits = (pattern: string, out: number[]): void => { for (const b of pattern) out.push(b === '1' ? 1 : 0); };
export function ean13(text: string): Linear {
  const s = gtin(text, 13, 'EAN-13');
  const m: number[] = [];
  const guards: [number, number][] = [];
  guards.push([0, 3]); bits('101', m);
  const parity = PARITY[Number(s[0])]!;
  for (let i = 1; i <= 6; i++) bits((parity[i - 1] === 'L' ? L : G)[Number(s[i])]!, m);
  guards.push([m.length, 5]); bits('01010', m);
  for (let i = 7; i <= 12; i++) bits(R[Number(s[i])]!, m);
  guards.push([m.length, 3]); bits('101', m);
  return { modules: m, text: s, guards };
}
export function upca(text: string): Linear {
  const s = gtin(text, 12, 'UPC-A');
  const r = ean13('0' + s);
  return { ...r, text: s };
}
export function ean8(text: string): Linear {
  const s = gtin(text, 8, 'EAN-8');
  const m: number[] = [];
  const guards: [number, number][] = [[0, 3]];
  bits('101', m);
  for (let i = 0; i < 4; i++) bits(L[Number(s[i])]!, m);
  guards.push([m.length, 5]); bits('01010', m);
  for (let i = 4; i < 8; i++) bits(R[Number(s[i])]!, m);
  guards.push([m.length, 3]); bits('101', m);
  return { modules: m, text: s, guards };
}
/** Code 39: n = estreito, w = largo; elementos alternam barra/espaço começando por barra. */
const C39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn'
};
export function code39(text: string): Linear {
  const s = text.toUpperCase();
  if (!s) throw new CodeError('Digite o conteúdo do código.');
  if (s.length > 40) throw new CodeError('Code 39 aceita até 40 caracteres aqui.');
  for (const ch of s) if (!C39[ch] || ch === '*') throw new CodeError('Code 39 aceita A–Z, 0–9, espaço e - . $ / + %. “' + ch + '” não é aceito.');
  const m: number[] = [];
  const all = '*' + s + '*';
  [...all].forEach((ch, k) => {
    const p = C39[ch]!;
    for (let i = 0; i < 9; i++) { const w = p[i] === 'w' ? 3 : 1; for (let j = 0; j < w; j++) m.push(i % 2 === 0 ? 1 : 0); }
    if (k < all.length - 1) m.push(0); // espaço entre caracteres
  });
  return { modules: m, text: s, guards: [] };
}
export function encodeLinear(kind: Exclude<Symbology, 'qr'>, value: string): Linear {
  switch (kind) {
    case 'code128': return code128(value);
    case 'ean13': return ean13(value);
    case 'ean8': return ean8(value);
    case 'upca': return upca(value);
    case 'code39': return code39(value);
  }
}
