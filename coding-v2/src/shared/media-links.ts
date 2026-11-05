/** Links de arquivos de mídia. O endereço é usado diretamente pelo navegador, sem proxy ou cópia oculta. */
export type MediaLinkChoice = 'auto' | 'image' | 'video' | 'audio';
export type LinkedMediaKind = 'image' | 'svg' | 'video' | 'audio';

const MEDIA_EXT: Record<string, LinkedMediaKind> = {
  jpg: 'image', jpeg: 'image', jpe: 'image', jfif: 'image', png: 'image',
  webp: 'image', gif: 'image', avif: 'image', bmp: 'image', ico: 'image',
  svg: 'svg',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio',
  aac: 'audio', flac: 'audio', opus: 'audio'
};
const MIME_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', svg: 'image/svg+xml',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg'
};

export const isLinkedMediaKind = (kind: string): kind is LinkedMediaKind =>
  kind === 'image' || kind === 'svg' || kind === 'video' || kind === 'audio';

/** Apenas HTTPS, sem credenciais na URL e com comprimento limitado. Nunca aceita javascript:, data:, blob: ou file:. */
export function normalizeMediaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export interface ParsedMediaLink {
  url: string;
  name: string;
  kind: LinkedMediaKind;
  mime: string;
}

/** Um link de página (ex.: watch?v=...) não equivale ao arquivo de áudio/vídeo. */
export function parseMediaLink(raw: string, choice: MediaLinkChoice = 'auto'): ParsedMediaLink {
  const valid = normalizeMediaUrl(raw);
  if (!valid) throw new Error('Cole um link HTTPS válido para a mídia (sem usuário ou senha no endereço).');
  const url = new URL(valid);
  const encoded = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let name = encoded;
  try { name = decodeURIComponent(encoded); } catch { /* conserva o nome codificado */ }
  name = name.replace(/[\/\\?#\u0000-\u001f]/g, '').trim().slice(0, 160) || 'mídia por link';
  const extension = /\.([a-z0-9]{1,10})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (extension === 'html' || extension === 'htm' || extension === 'php') {
    throw new Error('Esse endereço parece ser uma página, não um arquivo de mídia direto.');
  }
  const detected = MEDIA_EXT[extension];
  if (choice === 'auto' && !detected) {
    throw new Error('Não reconheci o formato do endereço. Escolha Imagem, Vídeo ou Áudio.');
  }
  const kind: LinkedMediaKind = choice === 'auto' ? detected! :
    (choice === 'image' && detected === 'svg' ? 'svg' : choice);
  return { url: valid, name, kind, mime: MIME_EXT[extension] ?? '' };
}
