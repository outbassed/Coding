/** Tipos de arquivo que o Visualizador sabe mostrar. */
export type ViewKind = 'image' | 'svg' | 'video' | 'audio' | 'model' | 'pdf' | 'text' | 'unknown';

export const KIND_LABELS: Record<ViewKind, string> = {
  image: 'Imagem', svg: 'SVG', video: 'Vídeo', audio: 'Áudio', model: 'Modelo 3D', pdf: 'PDF', text: 'Texto', unknown: 'Outro arquivo'
};

const EXT: Record<string, ViewKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', ico: 'image',
  svg: 'svg',
  mp4: 'video', webm: 'video', ogv: 'video', mov: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
  stl: 'model', obj: 'model', glb: 'model',
  pdf: 'pdf',
  txt: 'text', md: 'text', markdown: 'text', json: 'text', csv: 'text', tsv: 'text', log: 'text', xml: 'text', html: 'text', htm: 'text', css: 'text',
  js: 'text', mjs: 'text', ts: 'text', tsx: 'text', jsx: 'text', yml: 'text', yaml: 'text', ini: 'text', toml: 'text', sh: 'text', py: 'text',
  java: 'text', c: 'text', h: 'text', cpp: 'text', cs: 'text', go: 'text', rs: 'text', sql: 'text', vue: 'text', php: 'text', rb: 'text', srt: 'text', vtt: 'text'
};
export const extensionOf = (name: string): string => { const dot = name.lastIndexOf('.'); return dot < 0 ? '' : name.slice(dot + 1).toLowerCase(); };

const startsWith = (b: Uint8Array, sig: number[], at = 0): boolean => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...Array.from(b.subarray(at, at + n)));

/** Formato pelos primeiros bytes (não confia só no nome). Nulo quando não reconhece. */
export function sniff(head: Uint8Array): ViewKind | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return 'image';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image';
  if (ascii(head, 0, 4) === 'GIF8') return 'image';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'image';
  if (ascii(head, 0, 2) === 'BM' && head.length > 14) return 'image';
  if (startsWith(head, [0x00, 0x00, 0x01, 0x00])) return 'image';
  if (ascii(head, 4, 4) === 'ftyp') return ascii(head, 8, 4) === 'M4A ' ? 'audio' : 'video';
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'video';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return 'audio';
  if (ascii(head, 0, 4) === 'fLaC' || ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return 'audio';
  if (ascii(head, 0, 4) === 'OggS') return null; // áudio ou vídeo: decide pela extensão
  if (ascii(head, 0, 5) === '%PDF-') return 'pdf';
  if (ascii(head, 0, 4) === 'glTF') return 'model';
  return null;
}
/** Parece texto? Sem bytes nulos e quase sem caracteres de controle. */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return true;
  let bad = 0;
  for (const v of head) { if (v === 0) return false; if (v < 9 || (v > 13 && v < 32)) bad++; }
  return bad / head.length < 0.02;
}
export function detectKind(name: string, head: Uint8Array): ViewKind {
  const byBytes = sniff(head);
  if (byBytes) return byBytes;
  const ext = EXT[extensionOf(name)];
  if (ext === 'svg') return 'svg';
  if (ext && ext !== 'text' && ext !== 'image' && ext !== 'pdf' && ext !== 'model') return ext; // vídeo/áudio por extensão (ogg, mp3 sem etiqueta…)
  if (ext === 'model') return 'model'; // STL e OBJ não têm assinatura
  if (ext === 'text') return looksLikeText(head) ? 'text' : 'unknown';
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(ascii(head, 0, Math.min(head.length, 400)))) return 'svg';
  return looksLikeText(head) && head.length > 0 ? 'text' : 'unknown';
}
export function mimeFor(kind: ViewKind, name: string, declared: string): string {
  const ext = extensionOf(name);
  if (kind === 'svg') return 'image/svg+xml';
  if (kind === 'pdf') return 'application/pdf';
  if (declared && declared !== 'application/octet-stream') return declared;
  const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg' };
  return map[ext] ?? (kind === 'text' ? 'text/plain' : 'application/octet-stream');
}
