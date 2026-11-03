/** Dinheiro sempre em centavos inteiros. Nada de ponto flutuante nos cálculos. */
export const MAX_CENTS = 99_999_999_999; // R$ 999.999.999,99

/** Lê "1.234,56", "1234,5", "1234.56", "R$ 10" → centavos. null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/\s|R\$/g, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  let intPart: string, frac = '';
  const sep = Math.max(lastComma, lastDot);
  // separador decimal: o último, se tiver 1 ou 2 dígitos depois; senão é separador de milhar
  if (sep >= 0 && s.length - sep - 1 <= 2 && s.length - sep - 1 > 0) {
    intPart = s.slice(0, sep).replace(/[.,]/g, '');
    frac = s.slice(sep + 1);
  } else {
    intPart = s.replace(/[.,]/g, '');
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null;
  const cents = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatMoney = (cents: number): string => fmt.format(cents / 100);
/** Texto editável (sem R$): 1234,5 → "1.234,50". */
export const moneyInput = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Divide `total` centavos proporcionalmente aos pesos inteiros, pelo maior resto.
 * A soma do resultado é SEMPRE exatamente `total`. Empates vão para quem vem primeiro.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = weights.map((w) => Math.floor((abs * Math.max(0, w)) / sum));
  let rest = abs - base.reduce((s, v) => s + v, 0);
  const order = weights.map((w, i) => ({ i, r: (abs * Math.max(0, w)) % sum })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++) {
    const idx = order[k]!.i;
    if (weights[idx]! > 0) { base[idx]! += 1; rest--; }
    if (k === order.length - 1 && rest > 0) k = -1;
  }
  return base.map((v) => v * sign);
}
