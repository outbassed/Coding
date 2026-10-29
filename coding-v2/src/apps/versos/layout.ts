/**
 * Quebra de linhas e posicionamento do texto. Puro (sem DOM): quem desenha informa como medir uma string.
 *
 * Convenção de `measure`: largura de uma string INCLUINDO o espaçamento entre letras depois de cada caractere
 * (é assim que o canvas mede). O layout desconta o espaçamento final, para o alinhamento ficar exato.
 *
 * Mesma função para prévia, miniaturas e exportação: por isso as quebras de linha são idênticas em todas.
 */
import type { Align } from './model';

export interface LayoutLine { text: string; width: number }
export interface TextLayout {
  lines: LayoutLine[];
  /** Altura de cada linha, em px da cena. */
  lineHeight: number;
  /** Largura da área de texto (a mesma pedida). */
  boxWidth: number;
  /** Altura total da área de texto. */
  boxHeight: number;
  /** Maior largura entre as linhas. */
  maxLineWidth: number;
}

export function layoutText(text: string, boxWidth: number, size: number, lineHeightFactor: number, letterSpacing: number, measureRaw: (s: string) => number): TextLayout {
  const maxW = Math.max(1, boxWidth);
  const cache = new Map<string, number>();
  const measure = (s: string): number => {
    if (!s) return 0;
    let w = cache.get(s);
    if (w === undefined) { w = Math.max(0, measureRaw(s) - letterSpacing); cache.set(s, w); }
    return w;
  };
  const lines: LayoutLine[] = [];
  const push = (s: string): void => { const t = s.replace(/\s+$/u, ''); lines.push({ text: t, width: measure(t) }); };

  const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push({ text: '', width: 0 }); continue; }
    let cur = '';
    for (const token of para.match(/\S+|\s+/gu) ?? []) {
      if (/^\s/u.test(token)) {
        cur += token; // após uma quebra automática `cur` nunca fica vazio, então só o recuo do parágrafo é preservado
        continue;
      }
      const attempt = cur + token;
      if (!cur.trim() || measure(attempt.replace(/\s+$/u, '')) <= maxW) { cur = attempt; }
      else { push(cur); cur = token; }
      // palavra maior que a largura: quebra por caractere
      while (measure(cur) > maxW && Array.from(cur).length > 1) {
        const chars = Array.from(cur);
        let n = chars.length - 1;
        while (n > 1 && measure(chars.slice(0, n).join('')) > maxW) n--;
        push(chars.slice(0, n).join(''));
        cur = chars.slice(n).join('');
      }
    }
    push(cur);
  }
  const lineHeight = Math.max(0.01, size * lineHeightFactor);
  let maxLineWidth = 0;
  for (const l of lines) if (l.width > maxLineWidth) maxLineWidth = l.width;
  return { lines, lineHeight, boxWidth: maxW, boxHeight: lines.length * lineHeight, maxLineWidth };
}

/** X (relativo ao centro da área de texto) do começo de uma linha, conforme o alinhamento. */
export function lineLeft(lineWidth: number, boxWidth: number, align: Align): number {
  if (align === 'left') return -boxWidth / 2;
  if (align === 'right') return boxWidth / 2 - lineWidth;
  return -lineWidth / 2;
}
/** Y (relativo ao centro da área de texto) do meio de uma linha. */
export function lineMiddle(index: number, layout: Pick<TextLayout, 'lineHeight' | 'boxHeight'>): number {
  return -layout.boxHeight / 2 + (index + 0.5) * layout.lineHeight;
}
