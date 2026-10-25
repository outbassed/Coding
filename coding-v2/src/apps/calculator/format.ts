const grouped = (digits: number | null) => new Intl.NumberFormat('pt-BR', {
  useGrouping: true, maximumFractionDigits: digits ?? 10, minimumFractionDigits: digits ?? 0
});
const cache = new Map<number | null, Intl.NumberFormat>();
const fmt = (digits: number | null): Intl.NumberFormat => {
  let f = cache.get(digits);
  if (!f) { f = grouped(digits); cache.set(digits, f); }
  return f;
};

/** Mostra um número no padrão brasileiro (1.234,5). `decimals` fixa as casas; null deixa automático. */
export function formatNumber(value: number, decimals: number | null = null): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return decimals ? '0,' + '0'.repeat(decimals) : '0';
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) {
    const [mantissa = '', exp = ''] = value.toExponential(decimals ?? 9).split('e');
    const trimmed = decimals === null && mantissa.includes('.') ? mantissa.replace(/0+$/, '').replace(/\.$/, '') : mantissa;
    return trimmed.replace('.', ',') + 'e' + exp;
  }
  const text = fmt(decimals === null ? null : Math.max(0, Math.min(10, Math.trunc(decimals)))).format(value);
  return /^-0(?:,0*)?$/.test(text) ? text.slice(1) : text;
}

/** Texto do número como pode voltar para a expressão: sem separador de milhar, vírgula decimal. */
export function plainNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Object.is(value, -0)) return '0';
  return String(Number(value.toPrecision(15))).replace('.', ',').replace('e+', 'e');
}
