/** Funções puras do áudio e do vídeo: tempo, velocidade, mensagens de erro e nomes de captura. */

const pad = (n: number): string => String(n).padStart(2, '0');

/** "0:02", "12:05" ou "1:02:03". Valores inválidos viram "0:00". */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

/** "1×", "1,5×". */
export const formatRate = (rate: number): string => rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '×';

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Texto do erro de reprodução. `code` é o MediaError.code do navegador (1 abortado, 2 rede, 3 decodificação, 4 formato sem suporte).
 * Links externos nunca prometem contornar bloqueios do servidor.
 */
export function mediaErrorMessage(code: number | undefined, linked: boolean, kind: 'video' | 'audio'): string {
  if (linked) {
    if (code === 2) return 'Não foi possível reproduzir este link: a conexão falhou ou o servidor bloqueou o carregamento (login, bloqueio de origem e proteção DRM não são contornados).';
    if (code === 4) return 'Não foi possível reproduzir este link: o endereço não parece ser um arquivo de mídia direto ou o formato não é aceito pelo navegador.';
    return 'Não foi possível reproduzir este link. Confira se aponta diretamente para um arquivo público de mídia e se o formato é aceito pelo navegador.';
  }
  const formats = kind === 'video' ? 'MP4 (H.264 + AAC) ou WebM' : 'MP3, AAC ou WAV';
  if (code === 3) return 'O navegador não consegue reproduzir este arquivo: ele parece corrompido ou usa um codec que não é decodificado aqui. Converta para ' + formats + ' ou baixe o original.';
  return 'O navegador não consegue reproduzir este arquivo (formato ou codec sem suporte). Converta para ' + formats + ' ou baixe o original.';
}

/** Nome do PNG de um quadro capturado: "filme-quadro-1m05s.png". */
export function frameName(fileName: string, seconds: number): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'video';
  return base + '-quadro-' + formatClock(seconds).replace(':', 'm') + 's.png';
}

/** Próxima velocidade da lista (dá a volta). */
export function stepRate(current: number, rates: readonly number[], delta: 1 | -1): number {
  const i = rates.findIndex((r) => r === current);
  const at = i < 0 ? rates.findIndex((r) => r >= 1) : i;
  return rates[clamp(at + delta, 0, rates.length - 1)] ?? 1;
}
