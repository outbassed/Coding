import { describe, expect, it } from 'vitest';
import { layoutText, lineLeft, lineMiddle } from './layout';

/** Cada caractere mede 10 px + espaçamento depois de cada um. */
const mk = (ls = 0) => (s: string): number => Array.from(s).length * (10 + ls);

describe('versos · layout de texto', () => {
  it('respeita quebras de linha explícitas e linhas vazias', () => {
    const l = layoutText('um\n\ndois', 1000, 20, 1.5, 0, mk());
    expect(l.lines.map((x) => x.text)).toEqual(['um', '', 'dois']);
    expect(l.lineHeight).toBe(30);
    expect(l.boxHeight).toBe(90);
  });
  it('quebra por palavras na largura da área', () => {
    const l = layoutText('aaa bbb ccc ddd', 70, 20, 1, 0, mk());
    expect(l.lines.map((x) => x.text)).toEqual(['aaa bbb', 'ccc ddd']);
    expect(l.lines[0]!.width).toBe(70);
  });
  it('palavra maior que a área quebra por caractere, sem perder letras', () => {
    const l = layoutText('abcdefghij', 40, 20, 1, 0, mk());
    expect(l.lines.map((x) => x.text).join('')).toBe('abcdefghij');
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(40);
    expect(l.lines.length).toBe(3);
  });
  it('espaçamento entre letras entra na medida mas o último não conta', () => {
    const l = layoutText('abc', 1000, 20, 1, 5, mk(5));
    expect(l.lines[0]!.width).toBe(3 * 15 - 5);
  });
  it('descarta espaços do fim da linha e preserva recuo do parágrafo', () => {
    const l = layoutText('  ab   cd', 1000, 20, 1, 0, mk());
    expect(l.lines[0]!.text).toBe('  ab   cd');
    const w = layoutText('ab   cd', 20, 20, 1, 0, mk());
    expect(w.lines.map((x) => x.text)).toEqual(['ab', 'cd']);
  });
  it('CRLF e tabs', () => {
    expect(layoutText('a\r\nb', 100, 10, 1, 0, mk()).lines).toHaveLength(2);
    expect(layoutText('\ta', 100, 10, 1, 0, mk()).lines[0]!.text).toBe('    a');
  });
  it('texto vazio gera uma linha vazia', () => {
    const l = layoutText('', 100, 10, 1, 0, mk());
    expect(l.lines).toHaveLength(1);
    expect(l.maxLineWidth).toBe(0);
  });
  it('emoji e acentos não são partidos ao meio', () => {
    const l = layoutText('😀😀😀😀', 20, 10, 1, 0, mk());
    expect(l.lines.map((x) => x.text)).toEqual(['😀😀', '😀😀']);
  });
  it('alinhamento e posição vertical', () => {
    expect(lineLeft(40, 100, 'left')).toBe(-50);
    expect(lineLeft(40, 100, 'right')).toBe(10);
    expect(lineLeft(40, 100, 'center')).toBe(-20);
    const l = layoutText('a\nb', 100, 20, 1, 0, mk());
    expect(lineMiddle(0, l)).toBe(-10);
    expect(lineMiddle(1, l)).toBe(10);
  });
});
