/**
 * Geometria do olho da logo do Visualizador (viewBox 48×48).
 * O branco do olho é a amêndoa abaixo; a íris tem raio fixo e nunca pode sair dela. Como a amêndoa é convexa, o conjunto
 * de centros onde a íris cabe inteira também é convexo: a partir do centro (24, 24), em qualquer direção, existe um
 * deslocamento máximo, que a busca binária abaixo encontra. Íris, pupila e reflexo andam juntos, então limitar a íris basta.
 */
export const EYE_PATH = 'M5 24s7-12 19-12 19 12 19 12-7 12-19 12S5 24 5 24z';
export const EYE_CENTER = { x: 24, y: 24 } as const;
export const IRIS_RADIUS = 8.5;
/** Folga para o contorno suavizado da íris não encostar na borda do branco. */
export const EDGE_MARGIN = 0.35;

type Pt = readonly [number, number];
/** Os quatro trechos cúbicos do EYE_PATH, já com os pontos de controle resolvidos (s/S reflexos incluídos). */
const SEGMENTS: readonly (readonly [Pt, Pt, Pt, Pt])[] = [
  [[5, 24], [5, 24], [12, 12], [24, 12]],
  [[24, 12], [36, 12], [43, 24], [43, 24]],
  [[43, 24], [43, 24], [36, 36], [24, 36]],
  [[24, 36], [12, 36], [5, 24], [5, 24]]
];

const bezier = (s: readonly [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
};

/** Contorno do olho como polilinha fechada (160 pontos). */
export const OUTLINE: readonly Pt[] = (() => {
  const out: Pt[] = [];
  for (const seg of SEGMENTS) for (let i = 0; i < 40; i++) out.push(bezier(seg, i / 40));
  return out;
})();

function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function inside(px: number, py: number): boolean {
  let hit = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i]!, [xj, yj] = OUTLINE[j]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** O círculo de centro (cx, cy) e raio r cabe inteiro dentro do branco do olho? */
export function fits(cx: number, cy: number, r: number = IRIS_RADIUS): boolean {
  if (!inside(cx, cy)) return false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) if (distToSegment(cx, cy, OUTLINE[j]!, OUTLINE[i]!) < r - 1e-9) return false;
  return true;
}

/** Maior deslocamento (em unidades do viewBox) da íris a partir do centro, na direção (dx, dy). */
export function maxTravel(dx: number, dy: number, r: number = IRIS_RADIUS + EDGE_MARGIN): number {
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const ux = dx / len, uy = dy / len;
  if (!fits(EYE_CENTER.x, EYE_CENTER.y, r)) return 0;
  let lo = 0, hi = 24;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (fits(EYE_CENTER.x + ux * mid, EYE_CENTER.y + uy * mid, r)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Converte a posição do cursor (em px da tela, relativa ao centro do olho) no deslocamento da íris:
 * a direção é a do cursor e a intensidade cresce com a distância (suave, sem passar do limite geométrico).
 */
export function offsetFor(vx: number, vy: number, reach = 160): { x: number; y: number } {
  const dist = Math.hypot(vx, vy);
  if (dist < 0.5 || !Number.isFinite(dist)) return { x: 0, y: 0 };
  const strength = 1 - Math.exp(-dist / (reach / 2));
  const t = maxTravel(vx, vy) * Math.min(1, strength);
  return { x: (vx / dist) * t, y: (vy / dist) * t };
}
