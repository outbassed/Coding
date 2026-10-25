import { describe, expect, it } from 'vitest';
import { fold, matchesQuery, parseSaved } from './pageState';

describe('estado de busca e filtros do Launcher', () => {
  it('começa vazio com conteúdo ausente ou inválido', () => {
    for (const raw of [null, '', '{', '[]', '"x"']) {
      const s = parseSaved(raw);
      expect(s.catalog).toBe('');
      expect(s.state).toBe('all');
      expect(s.offline).toBe('any');
    }
  });
  it('aceita só valores conhecidos para o filtro offline', () => {
    expect(parseSaved(JSON.stringify({ offline: 'yes' })).offline).toBe('yes');
    expect(parseSaved(JSON.stringify({ offline: 'no' })).offline).toBe('no');
    expect(parseSaved(JSON.stringify({ offline: 'talvez' })).offline).toBe('any');
  });
  it('limita o tamanho do texto guardado', () => {
    expect(parseSaved(JSON.stringify({ catalog: 'a'.repeat(500) })).catalog).toHaveLength(80);
  });
  it('busca sem acento, sem maiúsculas e com todos os termos', () => {
    expect(fold('PLANILHÁ')).toBe('planilha');
    expect(matchesQuery('planilha calc', 'Planilhas', 'Tabelas e cálculos')).toBe(true);
    expect(matchesQuery('planilha pdf', 'Planilhas', 'Tabelas')).toBe(false);
    expect(matchesQuery('   ', 'qualquer')).toBe(true);
  });
});
