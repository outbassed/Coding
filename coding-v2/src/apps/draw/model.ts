/** Sorteios com aleatoriedade criptográfica e sem viés (rejeição de amostras). */
export type Rng = () => number; // inteiro uniforme em [0, 2^32)
export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
};
/** Inteiro uniforme em [0, n). */
export function randomBelow(n: number, rng: Rng = cryptoRng): number {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('Intervalo inválido.');
  const limit = Math.floor(2 ** 32 / n) * n;
  for (;;) { const v = rng(); if (v < limit) return v % n; }
}
export function randomInt(min: number, max: number, rng: Rng = cryptoRng): number { return min + randomBelow(max - min + 1, rng); }
export function shuffle<T>(list: readonly T[], rng: Rng = cryptoRng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randomBelow(i + 1, rng); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

export type DrawMode = 'wheel' | 'numbers' | 'dice' | 'teams';
export interface DrawResult { at: number; mode: DrawMode; text: string }
export interface DrawState {
  name: string;
  mode: DrawMode;
  participants: string[];
  excludeDrawn: boolean;
  drawn: string[];
  numbers: { min: number; max: number; count: number; unique: boolean };
  dice: { count: number; sides: number };
  teams: { count: number };
  history: DrawResult[];
}
export const MAX_PARTICIPANTS = 500;
export const MAX_HISTORY = 100;
const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function normalizeDraw(raw: unknown): DrawState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<DrawState>;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, max) : []);
  const mode: DrawMode = s.mode === 'numbers' || s.mode === 'dice' || s.mode === 'teams' ? s.mode : 'wheel';
  const n = (s.numbers ?? {}) as Partial<DrawState['numbers']>;
  const d = (s.dice ?? {}) as Partial<DrawState['dice']>;
  const min = clampInt(n.min, -1_000_000, 1_000_000, 1);
  return {
    name: typeof s.name === 'string' ? s.name.slice(0, 250) : 'Sorteio',
    mode, participants: list(s.participants, MAX_PARTICIPANTS), excludeDrawn: s.excludeDrawn !== false,
    drawn: list(s.drawn, MAX_PARTICIPANTS),
    numbers: { min, max: clampInt(n.max, min, 1_000_000, Math.max(min, 100)), count: clampInt(n.count, 1, 100, 1), unique: n.unique !== false },
    dice: { count: clampInt(d.count, 1, 12, 2), sides: clampInt(d.sides, 2, 100, 6) },
    teams: { count: clampInt(s.teams?.count, 2, 50, 2) },
    history: Array.isArray(s.history) ? s.history.filter((h) => h && typeof h.text === 'string').slice(-MAX_HISTORY).map((h) => ({ at: Number(h.at) || 0, mode: h.mode ?? 'wheel', text: h.text.slice(0, 2000) })) : []
  };
}
/** Nomes válidos (sem vazios), mantendo duplicatas que o usuário digitou de propósito. */
export const cleanNames = (list: readonly string[]): string[] => list.map((x) => x.trim()).filter(Boolean);
export function available(state: DrawState): string[] {
  const names = cleanNames(state.participants);
  if (!state.excludeDrawn) return names;
  const left = [...state.drawn];
  return names.filter((n) => { const i = left.indexOf(n); if (i >= 0) { left.splice(i, 1); return false; } return true; });
}
export function pickName(pool: readonly string[], rng: Rng = cryptoRng): { name: string; index: number } {
  if (!pool.length) throw new Error('Não há nomes disponíveis para sortear.');
  const index = randomBelow(pool.length, rng);
  return { name: pool[index]!, index };
}
export function drawNumbers(o: DrawState['numbers'], rng: Rng = cryptoRng): number[] {
  const range = o.max - o.min + 1;
  if (range < 1) throw new Error('O número final precisa ser maior ou igual ao inicial.');
  if (o.unique && o.count > range) throw new Error('Não dá para sortear ' + o.count + ' números diferentes entre ' + o.min + ' e ' + o.max + '.');
  if (!o.unique) return Array.from({ length: o.count }, () => randomInt(o.min, o.max, rng));
  const chosen = new Set<number>();
  while (chosen.size < o.count) chosen.add(randomInt(o.min, o.max, rng));
  return [...chosen];
}
export function rollDice(o: DrawState['dice'], rng: Rng = cryptoRng): number[] {
  return Array.from({ length: o.count }, () => randomInt(1, o.sides, rng));
}
/** Equipes equilibradas: embaralha e distribui em rodízio (tamanhos diferem no máximo em 1). */
export function makeTeams(names: readonly string[], count: number, rng: Rng = cryptoRng): string[][] {
  if (count < 2) throw new Error('Escolha pelo menos 2 equipes.');
  if (names.length < count) throw new Error('São necessários pelo menos ' + count + ' nomes para ' + count + ' equipes.');
  const teams: string[][] = Array.from({ length: count }, () => []);
  shuffle(names, rng).forEach((n, i) => teams[i % count]!.push(n));
  return teams;
}
/** Rotação final da roleta (graus) para parar no segmento `index`, com voltas extras. */
export function wheelAngle(index: number, total: number, current: number, turns = 5): number {
  const seg = 360 / total;
  const target = 360 - (index * seg + seg / 2); // ponteiro no topo
  const base = current - (current % 360);
  return base + turns * 360 + target;
}

export function demoDraw(): DrawState {
  return normalizeDraw({ name: 'Amigo secreto da equipe', mode: 'wheel', participants: ['Ana', 'Bruno', 'Carla', 'Davi', 'Elisa', 'Fábio', 'Gabi', 'Hugo'], excludeDrawn: true });
}
