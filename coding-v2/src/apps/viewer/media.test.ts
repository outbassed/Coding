import { describe, expect, it } from 'vitest';
import { clamp, formatClock, formatRate, frameName, mediaErrorMessage, stepRate } from './media';
import { RATES } from './prefs';

describe('Visualizador · tempo e velocidade', () => {
  it('formata o relógio em minutos e horas', () => {
    expect(formatClock(2)).toBe('0:02');
    expect(formatClock(62)).toBe('1:02');
    expect(formatClock(3723)).toBe('1:02:03');
  });
  it('valores inválidos viram 0:00', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
  it('mostra a velocidade em português', () => {
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(1.5)).toBe('1,5×');
  });
  it('limita valores', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('anda pela lista de velocidades sem passar das pontas', () => {
    expect(stepRate(1, RATES, 1)).toBe(1.25);
    expect(stepRate(1, RATES, -1)).toBe(0.75);
    expect(stepRate(2, RATES, 1)).toBe(2);
    expect(stepRate(0.5, RATES, -1)).toBe(0.5);
    expect(stepRate(1.1, RATES, 1)).toBe(1.25);
  });
  it('nomeia o quadro capturado com o tempo', () => {
    expect(frameName('Meu filme.mp4', 65)).toBe('Meu-filme-quadro-1m05s.png');
    expect(frameName('???.mp4', 3)).toBe('video-quadro-0m03s.png');
  });
});

describe('Visualizador · mensagens de erro de mídia', () => {
  it('explica o link sem prometer contornar bloqueios', () => {
    const m = mediaErrorMessage(4, true, 'video');
    expect(m).toContain('Não foi possível reproduzir este link');
    expect(m).not.toMatch(/contornamos|burlamos/i);
    expect(mediaErrorMessage(2, true, 'audio')).toContain('servidor bloqueou');
  });
  it('arquivo local sugere formatos aceitos do tipo certo', () => {
    expect(mediaErrorMessage(3, false, 'video')).toContain('MP4');
    expect(mediaErrorMessage(4, false, 'audio')).toContain('MP3');
    expect(mediaErrorMessage(4, false, 'audio')).toContain('não consegue reproduzir');
  });
});
