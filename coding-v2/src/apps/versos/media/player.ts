/**
 * Player de mídia de REFERÊNCIA do Versos (música opcional). Independe das cenas e do editor:
 *  - uma única instância por página, fora de qualquer componente de cena (trocar/editar/duplicar/excluir cenas não a toca);
 *  - só toca depois de um clique do usuário (nunca há `play()` automático, nem ao carregar o arquivo);
 *  - vídeo: usa um <video> SEM inseri-lo na página, então só o áudio é usado e nenhuma imagem aparece;
 *  - arquivo local por URL temporária (`URL.createObjectURL`), liberada ao trocar, remover, sair da página ou desmontar;
 *  - o arquivo nunca é copiado para o documento nem lido inteiro em memória JavaScript;
 *  - ao recarregar ou sair de /versos/ a reprodução termina e não é retomada.
 *
 * O núcleo não depende do DOM: o criador do elemento e das URLs é injetado (testável sem navegador).
 */
export type MediaKind = 'audio' | 'video';
export type PlayerStatus = 'empty' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface MediaElementLike {
  src: string;
  volume: number;
  muted: boolean;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly error: { code: number; message?: string } | null;
  preload: string;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  canPlayType(type: string): string;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}
export interface PlayerSnapshot {
  status: PlayerStatus;
  fileName: string;
  kind: MediaKind | null;
  size: number;
  current: number;
  duration: number;
  volume: number;
  muted: boolean;
  ended: boolean;
  error: string;
}
export interface PlayerEnv {
  create(kind: MediaKind): MediaElementLike;
  createUrl(file: Blob): string;
  revokeUrl(url: string): void;
}

const AUDIO_EXT = ['mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba'];
const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'];
export const ACCEPT = 'audio/*,video/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.aac,.flac,.opus';

/** Tipo da mídia pelo MIME e, na falta dele, pela extensão. `null` = não parece áudio nem vídeo. */
export function mediaKindOf(file: { name: string; type: string }): MediaKind | null {
  const t = (file.type || '').toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t === 'application/ogg') return 'audio';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return null;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
}
/** Mensagem clara para o erro do elemento de mídia (códigos de MediaError). */
export function mediaErrorMessage(code: number | undefined, kind: MediaKind | null): string {
  const what = kind === 'video' ? 'vídeo' : 'áudio';
  switch (code) {
    case 2: return 'Não foi possível ler o arquivo de ' + what + '. Ele foi movido ou o aparelho ficou sem acesso.';
    case 3: return 'O arquivo de ' + what + ' parece corrompido ou usa um codec que este navegador não decodifica.';
    case 4: return 'Este navegador não consegue tocar esse formato de ' + what + '. Tente MP3, M4A, WAV, OGG ou MP4/WebM.';
    default: return 'Não foi possível carregar o ' + what + '.';
  }
}

const EMPTY: PlayerSnapshot = { status: 'empty', fileName: '', kind: null, size: 0, current: 0, duration: 0, volume: 1, muted: false, ended: false, error: '' };

export class MediaPlayer {
  private el: MediaElementLike | null = null;
  private url = '';
  private snap: PlayerSnapshot;
  private readonly subs = new Set<() => void>();
  private readonly cleanups: (() => void)[] = [];
  private token = 0;

  constructor(private readonly env: PlayerEnv, initialVolume = 1) {
    this.snap = { ...EMPTY, volume: Math.min(1, Math.max(0, initialVolume)) };
  }

  get snapshot(): PlayerSnapshot { return this.snap; }
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private set(patch: Partial<PlayerSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of [...this.subs]) fn();
  }

  /** Carrega um arquivo (substituindo o anterior). Não inicia a reprodução. */
  load(file: File): boolean {
    const kind = mediaKindOf(file);
    this.release();
    if (!kind) {
      this.set({ ...EMPTY, volume: this.snap.volume, muted: this.snap.muted, status: 'error', fileName: file.name, size: file.size, error: 'Este arquivo não parece ser de áudio nem de vídeo.' });
      return false;
    }
    const id = ++this.token;
    let el: MediaElementLike;
    try {
      el = this.env.create(kind);
      this.url = this.env.createUrl(file);
    } catch {
      this.set({ ...EMPTY, volume: this.snap.volume, status: 'error', fileName: file.name, size: file.size, kind, error: 'O navegador não conseguiu preparar o arquivo para tocar.' });
      return false;
    }
    this.el = el;
    el.preload = 'metadata';
    el.volume = this.snap.volume;
    el.muted = this.snap.muted;
    const on = (type: string, fn: () => void): void => { el.addEventListener(type, fn); this.cleanups.push(() => el.removeEventListener(type, fn)); };
    const live = (fn: () => void) => (): void => { if (this.token === id && this.el === el) fn(); };
    on('loadedmetadata', live(() => this.set({ status: this.snap.status === 'loading' ? 'ready' : this.snap.status, duration: Number.isFinite(el.duration) ? el.duration : 0, error: '' })));
    on('durationchange', live(() => this.set({ duration: Number.isFinite(el.duration) ? el.duration : 0 })));
    on('timeupdate', live(() => this.set({ current: el.currentTime })));
    on('play', live(() => this.set({ status: 'playing', ended: false })));
    on('playing', live(() => this.set({ status: 'playing', ended: false })));
    on('pause', live(() => { if (this.snap.status === 'playing') this.set({ status: 'paused', current: el.currentTime }); }));
    on('ended', live(() => this.set({ status: 'paused', ended: true, current: Number.isFinite(el.duration) ? el.duration : el.currentTime })));
    on('error', live(() => {
      const code = el.error?.code;
      if (code === 1) return; // interrompido por nós mesmos
      this.set({ status: 'error', error: mediaErrorMessage(code, kind) });
    }));
    this.set({ ...EMPTY, volume: this.snap.volume, muted: this.snap.muted, status: 'loading', fileName: file.name, size: file.size, kind });
    el.src = this.url;
    try { el.load(); } catch { /* o evento "error" informa */ }
    return true;
  }

  /** Só deve ser chamado a partir de um gesto do usuário (clique/toque/tecla). */
  async play(): Promise<void> {
    const el = this.el;
    if (!el || this.snap.status === 'error' || this.snap.status === 'empty') return;
    try { await el.play(); }
    catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'AbortError') return; // pausado/trocado durante o carregamento: normal
      if (this.el === el) this.set({ status: 'error', error: name === 'NotAllowedError' ? 'O navegador bloqueou a reprodução. Toque em Tocar novamente.' : mediaErrorMessage(el.error?.code ?? 4, this.snap.kind) });
    }
  }
  pause(): void {
    if (this.el && this.snap.status === 'playing') this.el.pause();
  }
  toggle(): Promise<void> | void { return this.snap.status === 'playing' ? this.pause() : this.play(); }
  seek(seconds: number): void {
    const el = this.el;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : 0;
    const t = Math.min(max || seconds, Math.max(0, seconds));
    try { el.currentTime = t; } catch { return; }
    this.set({ current: t, ended: false });
  }
  setVolume(v: number): void {
    const volume = Math.min(1, Math.max(0, v));
    if (this.el) this.el.volume = volume;
    this.set({ volume, muted: volume === 0 ? true : false });
    if (this.el) this.el.muted = this.snap.muted;
  }
  setMuted(muted: boolean): void {
    if (this.el) this.el.muted = muted;
    this.set({ muted });
  }
  /** Lê a posição real (para a barra de progresso animar suave durante a reprodução). */
  tick(): void {
    if (this.el && this.snap.status === 'playing' && this.el.currentTime !== this.snap.current) this.set({ current: this.el.currentTime });
  }

  /** Para tudo e libera o elemento e a URL temporária. */
  private release(): void {
    this.token++;
    for (const c of this.cleanups.splice(0)) c();
    const el = this.el;
    this.el = null;
    if (el) {
      try { el.pause(); } catch { /* ignora */ }
      try { el.removeAttribute('src'); el.load(); } catch { /* ignora */ }
    }
    if (this.url) { this.env.revokeUrl(this.url); this.url = ''; }
  }
  /** Remove o arquivo atual. */
  remove(): void {
    this.release();
    this.set({ ...EMPTY, volume: this.snap.volume, muted: this.snap.muted });
  }
  /** Fim de vida (sair da página, recarregar, desmontar). */
  dispose(): void {
    this.release();
    this.subs.clear();
    this.snap = { ...EMPTY, volume: this.snap.volume, muted: this.snap.muted };
  }
}

export function browserEnv(): PlayerEnv {
  return {
    create(kind) {
      const el = document.createElement(kind);
      // nunca é inserido na página: no vídeo, só o áudio é usado
      if (kind === 'video') { const v = el as HTMLVideoElement; v.playsInline = true; v.disablePictureInPicture = true; }
      (el as HTMLMediaElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
      return el as unknown as MediaElementLike;
    },
    createUrl: (file) => URL.createObjectURL(file),
    revokeUrl: (url) => URL.revokeObjectURL(url)
  };
}
