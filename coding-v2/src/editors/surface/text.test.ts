import { describe, expect, it } from 'vitest';
import { normalizeSurfaceText, pasteText } from './text';

const line = { multiline: false, maxLength: 160 };
const lines = { multiline: true, maxLength: 2000 };

describe('normalizeSurfaceText', () => {
  it('mantém o texto digitado como está', () => {
    expect(normalizeSurfaceText('ABC-123', line)).toBe('ABC-123');
    expect(normalizeSurfaceText('  com espaço no começo e no fim  ', lines)).toBe('  com espaço no começo e no fim  ');
  });
  it('troca espaço sem quebra por espaço comum', () => {
    expect(normalizeSurfaceText('A B', line)).toBe('A B');
  });
  it('remove as quebras de linha do fim (o navegador duplica a última) e preserva as do meio', () => {
    expect(normalizeSurfaceText('linha 1\nlinha 2\n\n', lines)).toBe('linha 1\nlinha 2');
    expect(normalizeSurfaceText('a\n\nb', lines)).toBe('a\n\nb');
    expect(normalizeSurfaceText('\n\n', lines)).toBe('');
  });
  it('em campo de uma linha, quebras viram um espaço', () => {
    expect(normalizeSurfaceText('A\nB', line)).toBe('A B');
    expect(normalizeSurfaceText('A \r\n B', line)).toBe('A B');
  });
  it('respeita o limite de caracteres', () => {
    expect(normalizeSurfaceText('x'.repeat(200), line)).toHaveLength(160);
    expect(normalizeSurfaceText('x'.repeat(2500), lines)).toHaveLength(2000);
    expect(normalizeSurfaceText('abc', { multiline: false, maxLength: 0 })).toBe('');
  });
});

describe('pasteText', () => {
  it('uma linha: quebras viram espaço; várias linhas: mantém', () => {
    expect(pasteText('a\r\nb\nc', false)).toBe('a b c');
    expect(pasteText('a\r\nb\nc', true)).toBe('a\nb\nc');
  });
});
