/**
 * Balde de tinta: devolve a máscara (1 = pintar) da região contínua ao redor do ponto cujas cores estão dentro da
 * tolerância da cor clicada. Varredura por linhas com pilha própria (sem recursão), então não estoura a pilha
 * mesmo em telas grandes. `src` é RGBA (como em ImageData).
 */
export function floodMask(src: Uint8ClampedArray, width: number, height: number, startX: number, startY: number, tolerance: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const x0 = Math.floor(startX), y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return mask;
  const base = (y0 * width + x0) * 4;
  const tr = src[base]!, tg = src[base + 1]!, tb = src[base + 2]!, ta = src[base + 3]!;
  const tol = Math.max(0, Math.min(255, tolerance));
  const similar = (i: number): boolean => {
    const p = i * 4;
    return Math.max(Math.abs(src[p]! - tr), Math.abs(src[p + 1]! - tg), Math.abs(src[p + 2]! - tb), Math.abs(src[p + 3]! - ta)) <= tol;
  };
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    let left = x;
    while (left >= 0 && !mask[y * width + left] && similar(y * width + left)) left--;
    left++;
    let up = false, down = false;
    for (let cx = left; cx < width && !mask[y * width + cx] && similar(y * width + cx); cx++) {
      mask[y * width + cx] = 1;
      if (y > 0) {
        const ok = !mask[(y - 1) * width + cx] && similar((y - 1) * width + cx);
        if (ok && !up) { stack.push(cx, y - 1); up = true; } else if (!ok) up = false;
      }
      if (y < height - 1) {
        const ok = !mask[(y + 1) * width + cx] && similar((y + 1) * width + cx);
        if (ok && !down) { stack.push(cx, y + 1); down = true; } else if (!ok) down = false;
      }
    }
  }
  return mask;
}
/** Quantos pixels a máscara marca. */
export function maskSize(mask: Uint8Array): number { let n = 0; for (const v of mask) n += v; return n; }
/** Engorda a máscara em 1 pixel (4 vizinhos) `times` vezes: cobre o serrilhado nas bordas da região. */
export function growMask(mask: Uint8Array, width: number, height: number, times: number): Uint8Array {
  let cur = mask;
  for (let t = 0; t < times; t++) {
    const next = cur.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (cur[i]) continue;
      if ((x > 0 && cur[i - 1]) || (x < width - 1 && cur[i + 1]) || (y > 0 && cur[i - width]) || (y < height - 1 && cur[i + width])) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}
