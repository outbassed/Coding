import { MAX_BLOCKS } from './model';

export interface PaginationInput {
  /** Altura medida (px) da etiqueta de cada item com conteúdo. */
  heights: readonly number[];
  /** Cópias de cada item com conteúdo. */
  copies: readonly number[];
  cols: number;
  gapPx: number;
  /** Altura imprimível (px) já com a tolerância de arredondamento. */
  capacityPx: number;
}
export interface Pagination {
  /** pages[página][linha] = índices (dentro dos itens com conteúdo) das etiquetas da linha. */
  pages: number[][][];
  labelCount: number;
  total: number;
  /** Índices (dentro dos itens com conteúdo) cuja etiqueta é maior que a folha. */
  oversized: number[];
}

/** Mesma regra do Coding atual: nunca separa uma etiqueta e agrupa em linhas de `cols`. */
export function paginate(input: PaginationInput): Pagination {
  const { heights, copies, cols, gapPx, capacityPx } = input;
  const sequence: number[] = [];
  let total = 0;
  copies.forEach((count, idx) => {
    total += count;
    for (let k = 0; k < count && sequence.length < MAX_BLOCKS; k++) sequence.push(idx);
  });
  const oversized: number[] = [];
  heights.forEach((height, idx) => { if (height > capacityPx) oversized.push(idx); });
  const pages: number[][][] = [];
  let current: number[][] = [];
  let used = 0;
  for (let i = 0; i < sequence.length; i += cols) {
    const row = sequence.slice(i, i + cols);
    const rowHeight = Math.max(...row.map((idx) => heights[idx] ?? 0));
    const need = (current.length ? gapPx : 0) + rowHeight;
    if (current.length && used + need > capacityPx) { pages.push(current); current = []; used = 0; }
    used += (current.length ? gapPx : 0) + rowHeight;
    current.push(row);
  }
  if (current.length) pages.push(current);
  if (!pages.length) pages.push([]);
  return { pages, labelCount: sequence.length, total, oversized };
}
