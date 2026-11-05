import { ref } from 'vue';
import { clamp, formatClock, mediaErrorMessage } from './media';
import type { ViewerPrefs } from './prefs';
import type { Detail } from './types';

export interface MediaOptions {
  kind: 'video' | 'audio';
  linked: () => boolean;
  prefs: ViewerPrefs;
  onError: (message: string) => void;
  onMeta: (extra: string, details: Detail[]) => void;
  /** Chamado quando a mídia chega ao fim (e não está em repetição). */
  onEnded?: () => void;
}

/**
 * Estado e comandos de um <video> ou <audio> sem controles nativos. O visualizador de vídeo e o de áudio usam a mesma lógica
 * e só mudam a aparência. Volume, velocidade e repetição vêm das preferências do Visualizador.
 */
export function useMediaElement(opts: MediaOptions) {
  const el = ref<HTMLMediaElement | null>(null);
  const playing = ref(false);
  const time = ref(0);
  const duration = ref(0);
  const buffered = ref(0);
  const volume = ref(opts.prefs.volume);
  const muted = ref(opts.prefs.muted);
  const rate = ref(opts.prefs.rate);
  const loop = ref(opts.prefs.loop);
  const failed = ref(false);
  let released = false;

  function apply(): void {
    const m = el.value;
    if (!m) return;
    m.volume = volume.value; m.muted = muted.value; m.playbackRate = rate.value; m.loop = loop.value;
  }
  function toggle(): void {
    const m = el.value;
    if (!m) return;
    if (m.paused) void m.play().catch(() => { /* o navegador pode exigir um toque antes de tocar */ });
    else m.pause();
  }
  function play(): void { const m = el.value; if (m && m.paused) void m.play().catch(() => undefined); }
  function pause(): void { el.value?.pause(); }
  function seekTo(seconds: number): void {
    const m = el.value;
    if (!m) return;
    const max = Number.isFinite(m.duration) ? m.duration : Math.max(seconds, 0);
    m.currentTime = clamp(seconds, 0, max);
    time.value = m.currentTime;
  }
  function seekBy(delta: number): void { seekTo((el.value?.currentTime ?? 0) + delta); }
  function setRate(value: number): void { rate.value = value; opts.prefs.rate = value; apply(); }
  function toggleLoop(): void { loop.value = !loop.value; opts.prefs.loop = loop.value; apply(); }
  function setVolume(value: number): void {
    volume.value = clamp(value, 0, 1); opts.prefs.volume = volume.value;
    if (volume.value > 0 && muted.value) { muted.value = false; opts.prefs.muted = false; }
    apply();
  }
  function toggleMute(): void { muted.value = !muted.value; opts.prefs.muted = muted.value; apply(); }

  const events = {
    onLoadStart(): void { apply(); },
    onMeta(): void {
      const m = el.value;
      if (!m) return;
      apply();
      duration.value = Number.isFinite(m.duration) ? m.duration : 0;
      const details: Detail[] = [{ label: 'Duração', value: formatClock(duration.value) }];
      let extra = formatClock(duration.value);
      if (m instanceof HTMLVideoElement && m.videoWidth) {
        const size = m.videoWidth + ' × ' + m.videoHeight + ' px';
        details.unshift({ label: 'Resolução', value: size });
        extra = size + ' · ' + extra;
      }
      opts.onMeta(extra, details);
    },
    onDuration(): void { const m = el.value; if (m) duration.value = Number.isFinite(m.duration) ? m.duration : 0; },
    onPlay(): void { playing.value = true; },
    onPause(): void { playing.value = false; },
    onTime(): void { const m = el.value; if (m) time.value = m.currentTime; },
    onProgress(): void {
      const m = el.value;
      if (!m || !m.buffered.length) return;
      buffered.value = m.buffered.end(m.buffered.length - 1);
    },
    onEnded(): void { playing.value = false; if (!loop.value) opts.onEnded?.(); },
    onError(): void {
      if (released) return;
      failed.value = true;
      opts.onError(mediaErrorMessage(el.value?.error?.code, opts.linked(), opts.kind));
    }
  };

  /** Solta o arquivo: para a reprodução e esvazia a fonte para o navegador liberar o decodificador. */
  function release(): void {
    released = true;
    const m = el.value;
    if (!m) return;
    try { m.pause(); m.removeAttribute('src'); m.load(); } catch { /* já liberado */ }
  }

  return { el, playing, time, duration, buffered, volume, muted, rate, loop, failed, toggle, play, pause, seekTo, seekBy, setRate, toggleLoop, setVolume, toggleMute, events, release };
}
