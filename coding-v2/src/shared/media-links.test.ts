import { describe, expect, it } from 'vitest';
import { isLinkedMediaKind, normalizeMediaUrl, parseMediaLink } from './media-links';

describe('links de mídia', () => {
  it('reconhece imagens, vídeos e áudios, mesmo com parâmetros na URL', () => {
    expect(parseMediaLink('https://cdn.example.com/a/Foto%20Azul.PNG?token=123')).toEqual({
      url: 'https://cdn.example.com/a/Foto%20Azul.PNG?token=123',
      name: 'Foto Azul.PNG', kind: 'image', mime: 'image/png'
    });
    expect(parseMediaLink('https://cdn.example.com/v/filme.mp4').kind).toBe('video');
    expect(parseMediaLink('https://cdn.example.com/s/musica.mp3').kind).toBe('audio');
    expect(parseMediaLink('https://cdn.example.com/a/logo.svg').kind).toBe('svg');
  });

  it('permite links sem extensão quando a pessoa escolhe o tipo', () => {
    expect(parseMediaLink('https://cdn.example.com/asset?id=42', 'video').kind).toBe('video');
    expect(() => parseMediaLink('https://cdn.example.com/asset?id=42')).toThrow(/Escolha Imagem/);
  });

  it('rejeita protocolos perigosos, HTTP inseguro, credenciais e páginas HTML', () => {
    for (const url of [
      'javascript:alert(1)', 'data:image/png;base64,aaa', 'blob:abc',
      'file:///foto.png', 'http://cdn.example.com/foto.png',
      'https://usuario:senha@cdn.example.com/foto.png',
      'nada', 'https://cdn.example.com/a'.padEnd(4200, 'a')
    ]) expect(normalizeMediaUrl(url), url).toBeNull();
    expect(() => parseMediaLink('https://cdn.example.com/watch.html', 'video')).toThrow(/página/);
    expect(isLinkedMediaKind('pdf')).toBe(false);
    expect(isLinkedMediaKind('svg')).toBe(true);
  });
});
