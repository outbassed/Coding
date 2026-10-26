const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const one = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * Tamanho legível em pt-BR (base 1024): bytes inteiros; KB, MB, GB e TB com uma casa decimal.
 * Valores ausentes, negativos ou inválidos viram “não informado”. Nunca arredonda para uma unidade grande demais
 * (1023,97 KB vira “1,0 MB”) e nunca mostra “0 MB” para algo pequeno (abaixo de 1 KB aparece em bytes).
 */
export function formatBytes(bytes: number | null | undefined, unknown = 'não informado'): string {
  if (bytes === null || bytes === undefined || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return unknown;
  if (bytes < 1024) return whole.format(Math.round(bytes)) + ' B';
  let unit = 0;
  let value = bytes;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++; }
  if (Math.round(value * 10) / 10 >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++; }
  return one.format(value) + ' ' + UNITS[unit];
}

/** Porcentagem segura (0–100) para barras de progresso: nunca divide por zero nem passa de 100. */
export function percentOf(used: number | null | undefined, total: number | null | undefined): number | null {
  if (typeof used !== 'number' || typeof total !== 'number' || !Number.isFinite(used) || !Number.isFinite(total) || total <= 0 || used < 0) return null;
  return Math.min(100, (used / total) * 100);
}
