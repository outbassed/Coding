export interface Pt { x: number; y: number }
/** Linha presa em múltiplos de 45° (tecla Shift). */
export function constrainLine(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return b;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len };
}
/** Caixa a partir de dois cantos; com `square`, vira quadrado/círculo mantendo o canto de partida. */
export function boxFrom(a: Pt, b: Pt, square = false): { x: number; y: number; w: number; h: number } {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}
/** Pontos de uma linha entre dois pontos a cada `spacing` pixels (para pincéis com carimbo). */
export function stamps(a: Pt, b: Pt, spacing: number): Pt[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(dist / Math.max(0.5, spacing)));
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n }));
}
