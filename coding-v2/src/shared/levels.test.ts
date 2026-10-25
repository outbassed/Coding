import { describe, expect, it } from 'vitest';
import { getTool } from './catalog';
import { levelsFor } from './levels';

describe('níveis de disponibilidade', () => {
  it('separa ativação, offline e instalação', () => {
    const levels = levelsFor(getTool('labels'), true);
    expect(levels.map((level) => level.key)).toEqual(['activation', 'offline', 'install']);
  });
  it('ativar nunca implica offline: sem registro de instalação o estado não é "instalado"', () => {
    for (const enabled of [true, false]) {
      const [, offline] = levelsFor(getTool('texts'), enabled, { supported: true, state: 'not-installed' });
      expect(offline?.state).toBe('off');
      expect(offline?.label).toBe('Não instalado');
    }
  });
  it('só mostra "Instalado offline" quando o registro real diz que está instalado', () => {
    expect(levelsFor(getTool('calc'), false, { supported: true, state: 'installed', bytes: 1024 })[1]?.state).toBe('on');
    expect(levelsFor(getTool('calc'), true, { supported: true })[1]?.state).toBe('unverified');
  });
  it('cobre falha, atualização, andamento e ambiente sem suporte', () => {
    const at = (state: 'failed' | 'update-available' | 'installing') => levelsFor(getTool('pdf'), true, { supported: true, state })[1];
    expect(at('failed')?.label).toBe('Falhou');
    expect(at('update-available')?.label).toBe('Atualização disponível');
    expect(at('installing')?.state).toBe('busy');
    const none = levelsFor(getTool('pdf'), true, { supported: false, reason: 'Modo privado.' })[1];
    expect(none?.state).toBe('unavailable');
    expect(none?.text).toContain('Modo privado.');
  });
  it('mostra o tamanho em unidades legíveis', () => {
    const text = levelsFor(getTool('images'), false, { supported: true, state: 'not-installed', bytes: 3 * 1024 * 1024 })[1]?.text ?? '';
    expect(text).toContain('3,0 MB');
  });
  it('a instalação no aparelho é opcional e separada', () => {
    for (const id of ['calc', 'images', 'pdf', 'codes', 'draw', 'split'] as const) {
      const states = levelsFor(getTool(id), false).map((level) => level.key + ':' + level.state);
      expect(states[0]).toBe('activation:off');
      expect(states[2]).toBe('install:unproven');
    }
  });
  it('reflete a ativação', () => {
    expect(levelsFor(getTool('labels'), true)[0]?.state).toBe('on');
    expect(levelsFor(getTool('labels'), false)[0]?.state).toBe('off');
  });
});
