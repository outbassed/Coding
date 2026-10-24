import { describe, expect, it } from 'vitest';
import { getTool } from './catalog';
import { levelsFor } from './levels';

describe('níveis de disponibilidade', () => {
  it('separa ativação, offline e instalação', () => {
    const levels = levelsFor(getTool('labels'), true);
    expect(levels.map((level) => level.key)).toEqual(['activation', 'offline', 'install']);
  });
  it('ativar nunca implica offline nem instalado', () => {
    for (const enabled of [true, false]) {
      const [, offline, install] = levelsFor(getTool('texts'), enabled);
      expect(offline?.state).toBe('unverified');
      expect(install?.state).toBe('unproven');
    }
  });
  it('os apps novos do 2.0 também separam ativação de offline e instalação', () => {
    for (const id of ['calc', 'images', 'pdf', 'codes', 'sheet-labels', 'draw', 'split'] as const) {
      const states = levelsFor(getTool(id), false).map((level) => level.state);
      expect(states).toEqual(['off', 'unverified', 'unproven']);
    }
  });
  it('reflete a ativação', () => {
    expect(levelsFor(getTool('labels'), true)[0]?.state).toBe('on');
    expect(levelsFor(getTool('labels'), false)[0]?.state).toBe('off');
  });
});
