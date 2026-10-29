import { describe, expect, it } from 'vitest';
import { MediaPlayer, formatTime, mediaErrorMessage, mediaKindOf, type MediaElementLike, type PlayerEnv } from './player';

class FakeEl implements MediaElementLike {
  src = ''; volume = 1; muted = false; currentTime = 0; duration = NaN; paused = true; ended = false; error: { code: number } | null = null; preload = '';
  playCalls = 0; pauseCalls = 0; loads = 0; removed: string[] = [];
  private l = new Map<string, Set<() => void>>();
  playResult: 'ok' | 'notallowed' | 'abort' = 'ok';
  async play(): Promise<void> {
    this.playCalls++;
    if (this.playResult === 'notallowed') throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    if (this.playResult === 'abort') throw Object.assign(new Error('x'), { name: 'AbortError' });
    this.paused = false; this.emit('play'); this.emit('playing');
  }
  pause(): void { this.pauseCalls++; if (!this.paused) { this.paused = true; this.emit('pause'); } }
  load(): void { this.loads++; }
  removeAttribute(n: string): void { this.removed.push(n); if (n === 'src') this.src = ''; }
  canPlayType(): string { return 'maybe'; }
  addEventListener(t: string, fn: () => void): void { if (!this.l.has(t)) this.l.set(t, new Set()); this.l.get(t)!.add(fn); }
  removeEventListener(t: string, fn: () => void): void { this.l.get(t)?.delete(fn); }
  emit(t: string): void { for (const f of [...(this.l.get(t) ?? [])]) f(); }
  listeners(): number { let n = 0; for (const s of this.l.values()) n += s.size; return n; }
}
function setup() {
  const els: FakeEl[] = []; const urls: string[] = []; const revoked: string[] = []; let n = 0;
  const env: PlayerEnv = {
    create: () => { const e = new FakeEl(); els.push(e); return e; },
    createUrl: () => { const u = 'blob:fake/' + ++n; urls.push(u); return u; },
    revokeUrl: (u) => { revoked.push(u); }
  };
  return { p: new MediaPlayer(env), els, urls, revoked };
}
const file = (name: string, type = '', size = 1000): File => ({ name, type, size, lastModified: 0 }) as unknown as File;

describe('versos · player · tipos e formatação', () => {
  it('reconhece áudio e vídeo pelo MIME ou pela extensão', () => {
    expect(mediaKindOf({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio');
    expect(mediaKindOf({ name: 'a.M4A', type: '' })).toBe('audio');
    expect(mediaKindOf({ name: 'v.mp4', type: 'video/mp4' })).toBe('video');
    expect(mediaKindOf({ name: 'v.webm', type: '' })).toBe('video');
    expect(mediaKindOf({ name: 'x.txt', type: 'text/plain' })).toBeNull();
    expect(mediaKindOf({ name: 'x.png', type: 'image/png' })).toBeNull();
  });
  it('tempo e mensagens de erro', () => {
    expect(formatTime(0)).toBe('0:00'); expect(formatTime(65.9)).toBe('1:05'); expect(formatTime(3725)).toBe('1:02:05'); expect(formatTime(NaN)).toBe('0:00');
    expect(mediaErrorMessage(4, 'audio')).toContain('formato');
    expect(mediaErrorMessage(3, 'video')).toContain('codec');
  });
});

describe('versos · player · ciclo de vida', () => {
  it('carregar NÃO toca; só play() toca; pausar mantém a posição e play continua dali', async () => {
    const { p, els } = setup();
    expect(p.load(file('m.mp3', 'audio/mpeg'))).toBe(true);
    const el = els[0]!;
    expect(el.playCalls).toBe(0);
    expect(p.snapshot.status).toBe('loading');
    (el as { duration: number }).duration = 120; el.emit('loadedmetadata');
    expect(p.snapshot).toMatchObject({ status: 'ready', duration: 120, fileName: 'm.mp3', kind: 'audio' });
    await p.play();
    expect(p.snapshot.status).toBe('playing');
    el.currentTime = 42; el.emit('timeupdate');
    p.pause();
    expect(p.snapshot).toMatchObject({ status: 'paused', current: 42 });
    expect(el.currentTime).toBe(42);
    await p.play();
    expect(el.currentTime).toBe(42);
    expect(p.snapshot.status).toBe('playing');
  });
  it('vídeo usa um elemento de vídeo solto (só áudio, nunca na página)', () => {
    const { p, els } = setup();
    p.load(file('clip.mp4', 'video/mp4'));
    expect(p.snapshot.kind).toBe('video');
    expect(els).toHaveLength(1);
  });
  it('trocar o arquivo libera a URL e o elemento anteriores e ignora eventos atrasados', async () => {
    const { p, els, urls, revoked } = setup();
    p.load(file('a.mp3', 'audio/mpeg'));
    const first = els[0]!; (first as { duration: number }).duration = 10; first.emit('loadedmetadata');
    await p.play();
    p.load(file('b.wav', 'audio/wav'));
    expect(revoked).toEqual([urls[0]]);
    expect(first.pauseCalls).toBeGreaterThan(0);
    expect(first.removed).toContain('src');
    expect(first.listeners()).toBe(0);
    expect(p.snapshot).toMatchObject({ status: 'loading', fileName: 'b.wav', current: 0 });
    first.emit('error'); first.emit('timeupdate');
    expect(p.snapshot.status).toBe('loading');
  });
  it('remover e descartar liberam tudo; descartar não deixa nada tocando', async () => {
    const { p, els, urls, revoked } = setup();
    p.load(file('a.mp3', 'audio/mpeg')); await p.play();
    p.remove();
    expect(p.snapshot.status).toBe('empty');
    expect(revoked).toEqual([urls[0]]);
    p.load(file('b.mp3', 'audio/mpeg')); await p.play();
    const el = els[1]!;
    p.dispose();
    expect(el.paused).toBe(true);
    expect(revoked).toEqual([urls[0], urls[1]]);
    await p.play();
    expect(el.playCalls).toBe(1);
  });
  it('arquivo que não é mídia vira erro claro, sem criar elemento nem URL', () => {
    const { p, els, urls } = setup();
    expect(p.load(file('nota.txt', 'text/plain'))).toBe(false);
    expect(p.snapshot.status).toBe('error');
    expect(p.snapshot.error).toContain('áudio');
    expect(els).toHaveLength(0); expect(urls).toHaveLength(0);
  });
  it('arquivo de mídia incompatível: o erro do navegador aparece e play() não faz nada', async () => {
    const { p, els } = setup();
    p.load(file('quebrado.mp3', 'audio/mpeg'));
    const el = els[0]!; el.error = { code: 4 }; el.emit('error');
    expect(p.snapshot.status).toBe('error');
    expect(p.snapshot.error).toContain('formato');
    await p.play();
    expect(el.playCalls).toBe(0);
    p.load(file('bom.mp3', 'audio/mpeg'));
    expect(p.snapshot.status).toBe('loading');
    expect(p.snapshot.error).toBe('');
  });
  it('reprodução bloqueada pelo navegador vira aviso; AbortError é ignorado', async () => {
    const { p, els } = setup();
    p.load(file('a.mp3', 'audio/mpeg'));
    els[0]!.playResult = 'abort'; await p.play();
    expect(p.snapshot.status).not.toBe('error');
    els[0]!.playResult = 'notallowed'; await p.play();
    expect(p.snapshot.status).toBe('error');
    expect(p.snapshot.error).toContain('bloqueou');
  });
  it('fim da faixa: pausado no fim; play de novo é permitido', async () => {
    const { p, els } = setup();
    p.load(file('a.mp3', 'audio/mpeg')); const el = els[0]!; (el as { duration: number }).duration = 30; el.emit('loadedmetadata');
    await p.play(); el.emit('ended');
    expect(p.snapshot).toMatchObject({ status: 'paused', ended: true, current: 30 });
  });
  it('seek e volume', () => {
    const { p, els } = setup();
    p.load(file('a.mp3', 'audio/mpeg')); const el = els[0]!; (el as { duration: number }).duration = 100; el.emit('loadedmetadata');
    p.seek(250); expect(el.currentTime).toBe(100);
    p.seek(-5); expect(el.currentTime).toBe(0);
    p.seek(33.5); expect(p.snapshot.current).toBe(33.5);
    p.setVolume(0.4); expect(el.volume).toBe(0.4); expect(p.snapshot.muted).toBe(false);
    p.setMuted(true); expect(el.muted).toBe(true);
    p.setVolume(0); expect(p.snapshot.muted).toBe(true);
    p.setVolume(2); expect(p.snapshot.volume).toBe(1);
  });
  it('volume escolhido sobrevive à troca de arquivo', () => {
    const { p, els } = setup();
    p.setVolume(0.3);
    p.load(file('a.mp3', 'audio/mpeg'));
    expect(els[0]!.volume).toBe(0.3);
  });
});
