/** Pintar: desenho em camadas. Os pixels de cada camada ficam em arquivos PNG na Biblioteca; aqui só os metadados. */
export interface PaintLayer { id: string; name: string; visible: boolean; opacity: number; blobId: string }
export interface PaintState { name: string; width: number; height: number; background: string; layers: PaintLayer[]; activeId: string }
export const MIN_SIDE = 16, MAX_SIDE = 4096, MAX_LAYERS = 20;
export const layerId = (): string => 'p' + Math.random().toString(36).slice(2, 10);

const num = (v: unknown, min: number, max: number, d: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function normalizePaint(raw: unknown): PaintState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const layers: PaintLayer[] = [];
  const ids = new Set<string>();
  if (Array.isArray(s.layers)) {
    for (const item of s.layers) {
      if (layers.length >= MAX_LAYERS) break;
      const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      let id = typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? o.id : layerId();
      if (ids.has(id)) id = layerId();
      ids.add(id);
      layers.push({
        id, name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 60) : 'Camada ' + (layers.length + 1),
        visible: o.visible !== false, opacity: num(o.opacity, 0, 1, 1),
        blobId: typeof o.blobId === 'string' ? o.blobId.slice(0, 80) : ''
      });
    }
  }
  if (!layers.length) layers.push({ id: layerId(), name: 'Camada 1', visible: true, opacity: 1, blobId: '' });
  const bg = typeof s.background === 'string' && (s.background === 'transparent' || /^#[0-9a-f]{6}$/i.test(s.background)) ? s.background.toLowerCase() : '#ffffff';
  const activeId = typeof s.activeId === 'string' && ids.has(s.activeId) ? s.activeId : layers[layers.length - 1]!.id;
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Desenho',
    width: Math.round(num(s.width, MIN_SIDE, MAX_SIDE, 1280)), height: Math.round(num(s.height, MIN_SIDE, MAX_SIDE, 720)),
    background: bg, layers, activeId: layers.some((l) => l.id === activeId) ? activeId : layers[layers.length - 1]!.id
  };
}
export function blankPaint(width = 1280, height = 720, background = '#ffffff', name = 'Desenho'): PaintState {
  const id = layerId();
  return { name, width, height, background, layers: [{ id, name: 'Camada 1', visible: true, opacity: 1, blobId: '' }], activeId: id };
}
export const hexToRgba = (hex: string, alpha = 255): [number, number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, alpha];
};
