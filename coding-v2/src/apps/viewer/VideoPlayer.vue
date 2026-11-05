<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import VIcon from './VIcon.vue';
import { canvasToPng, useObjectUrl } from './resources';
import { useMediaElement } from './useMediaElement';
import { formatClock, formatRate, frameName, stepRate } from './media';
import { videoFramePage } from './print';
import { RATES, type ViewerPrefs } from './prefs';
import type { PrintPage } from '../../shared/print/print';
import type { ViewerFile } from './model';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Player de vídeo próprio: sem a barra nativa do navegador, com os mesmos comandos em teclado, toque e menu de contexto. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();

const linked = computed(() => !!props.file.sourceUrl);
const { set: setObjectUrl } = useObjectUrl();
const src = ref(props.file.sourceUrl ?? '');
const ready = ref(false);
const m = useMediaElement({
  kind: 'video', linked: () => linked.value, prefs: props.prefs,
  onError: (message) => emit('error', message),
  onMeta: (extra, details) => { ready.value = true; emit('meta', extra, details); }
});
if (!props.file.sourceUrl && props.blob) src.value = setObjectUrl(props.blob);
watch(() => props.prefs.volume, (v) => { if (Math.abs(v - m.volume.value) > 0.001) m.volume.value = v; });
onBeforeUnmount(() => m.release());

const playedPct = computed(() => (m.duration.value ? Math.min(100, (m.time.value / m.duration.value) * 100) : 0));
const bufferedPct = computed(() => (m.duration.value ? Math.min(100, (m.buffered.value / m.duration.value) * 100) : 0));
const seekStyle = computed(() => ({ '--played': playedPct.value + '%', '--buffered': bufferedPct.value + '%' }));
const timeText = computed(() => formatClock(m.time.value) + ' / ' + formatClock(m.duration.value));
const scrubbing = ref(false);
const onSeek = (e: Event): void => m.seekTo(Number((e.target as HTMLInputElement).value));
const onVolume = (e: Event): void => m.setVolume(Number((e.target as HTMLInputElement).value));
const onRate = (e: Event): void => m.setRate(Number((e.target as HTMLSelectElement).value));

async function capture(): Promise<void> {
  const video = m.el.value as HTMLVideoElement | null;
  if (!video || !video.videoWidth) { emit('notice', 'Espere o vídeo carregar para capturar um quadro.'); return; }
  try {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    const png = await canvasToPng(c);
    const url = URL.createObjectURL(png);
    const a = document.createElement('a');
    a.href = url; a.download = frameName(props.file.name, video.currentTime);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    emit('notice', 'Quadro salvo como imagem.');
  } catch (e) {
    emit('notice', e instanceof Error ? e.message : 'Não foi possível capturar o quadro.');
  }
}

function printReason(): string {
  if (m.failed.value) return 'Este vídeo não abriu, então não há quadro para imprimir.';
  return ready.value ? '' : 'Espere o vídeo carregar para imprimir o quadro atual.';
}
async function printPages(): Promise<PrintPage[]> {
  const video = m.el.value as HTMLVideoElement | null;
  const page = video ? videoFramePage(video) : null;
  if (!page) throw new Error('Não há quadro de vídeo para imprimir ainda.');
  return [page];
}

function menu(): MenuGroup[] {
  return [
    { title: 'Reprodução', items: [
      { id: 'play', label: m.playing.value ? 'Pausar' : 'Reproduzir', icon: m.playing.value ? 'pause' : 'play', shortcut: 'Espaço', run: m.toggle },
      { id: 'back', label: 'Voltar 10 segundos', icon: 'back10', shortcut: 'J', run: () => m.seekBy(-10) },
      { id: 'fwd', label: 'Avançar 10 segundos', icon: 'fwd10', shortcut: 'L', run: () => m.seekBy(10) },
      { id: 'loop', label: 'Repetir', icon: 'repeat', shortcut: 'R', checked: m.loop.value, run: m.toggleLoop },
      { id: 'mute', label: m.muted.value ? 'Ativar o som' : 'Silenciar', icon: m.muted.value ? 'mute' : 'volume', shortcut: 'M', run: m.toggleMute }
    ] },
    { title: 'Velocidade', items: RATES.map((r) => ({ id: 'rate-' + r, label: formatRate(r), icon: 'speed' as const, checked: m.rate.value === r, run: () => m.setRate(r) })) },
    { items: [{ id: 'capture', label: 'Capturar quadro como imagem', icon: 'camera', disabled: !ready.value, run: () => { void capture(); } }] }
  ];
}
function key(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  switch (e.key) {
    case ' ': case 'k': case 'K': m.toggle(); return true;
    case 'ArrowLeft': m.seekBy(e.shiftKey ? -10 : -5); return true;
    case 'ArrowRight': m.seekBy(e.shiftKey ? 10 : 5); return true;
    case 'j': case 'J': m.seekBy(-10); return true;
    case 'l': case 'L': m.seekBy(10); return true;
    case 'ArrowUp': m.setVolume(m.volume.value + 0.05); return true;
    case 'ArrowDown': m.setVolume(m.volume.value - 0.05); return true;
    case 'm': case 'M': m.toggleMute(); return true;
    case 'r': case 'R': m.toggleLoop(); return true;
    case '<': m.setRate(stepRate(m.rate.value, RATES, -1)); return true;
    case '>': m.setRate(stepRate(m.rate.value, RATES, 1)); return true;
    case 'Home': m.seekTo(0); return true;
    case 'End': m.seekTo(m.duration.value); return true;
    default: return false;
  }
}
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
</script>

<template>
  <div class="vw-body vp" data-testid="video-viewer">
    <div class="vp-stage" @click="m.toggle">
      <video :ref="(el) => { m.el.value = el as HTMLVideoElement | null; }" :src="src" class="vp-video" data-testid="media-player" playsinline preload="metadata"
        :aria-label="'Vídeo ' + file.name"
        @loadstart="m.events.onLoadStart" @loadedmetadata="m.events.onMeta" @durationchange="m.events.onDuration" @play="m.events.onPlay"
        @pause="m.events.onPause" @timeupdate="m.events.onTime" @progress="m.events.onProgress" @ended="m.events.onEnded" @error="m.events.onError"></video>
      <p v-if="!ready && !m.failed.value" class="vw-spin vp-loading" role="status">Carregando vídeo…</p>
      <button v-if="ready && !m.playing.value" type="button" class="vp-big" aria-label="Reproduzir" @click.stop="m.toggle"><VIcon name="play" :size="34" /></button>
    </div>
    <div class="vw-bar vp-bar" role="toolbar" aria-label="Controles do vídeo">
      <div class="vp-seekrow">
        <span class="vw-time" data-testid="media-time" aria-live="off">{{ timeText }}</span>
        <label class="sr-only" for="vp-seek">Posição do vídeo</label>
        <input id="vp-seek" type="range" class="vw-range vp-seek" data-testid="media-seek" min="0" :max="m.duration.value || 0" step="0.1" :value="m.time.value" :style="seekStyle"
          :disabled="!ready" :aria-valuetext="timeText" @input="onSeek" @pointerdown="scrubbing = true" @pointerup="scrubbing = false" />
      </div>
      <div class="vw-group">
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Voltar 10 segundos" title="Voltar 10 s (J)" data-testid="media-back" @click="m.seekBy(-10)"><VIcon name="back10" /></button>
        <button type="button" class="vw-btn primary" :aria-label="m.playing.value ? 'Pausar' : 'Reproduzir'" :title="m.playing.value ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'" data-testid="media-play" @click="m.toggle"><VIcon :name="m.playing.value ? 'pause' : 'play'" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Avançar 10 segundos" title="Avançar 10 s (L)" data-testid="media-fwd" @click="m.seekBy(10)"><VIcon name="fwd10" /></button>
      </div>
      <div class="vw-group vw-hide-sm">
        <button type="button" class="vw-btn" :aria-label="m.muted.value ? 'Ativar o som' : 'Silenciar'" title="Silenciar (M)" data-testid="media-mute" @click="m.toggleMute"><VIcon :name="m.muted.value || m.volume.value === 0 ? 'mute' : 'volume'" /></button>
        <label class="sr-only" for="vp-vol">Volume</label>
        <input id="vp-vol" type="range" class="vw-range vp-vol" data-testid="media-volume" min="0" max="1" step="0.05" :value="m.muted.value ? 0 : m.volume.value" @input="onVolume" />
      </div>
      <div class="vw-group">
        <label class="sr-only" for="vp-rate">Velocidade</label>
        <select id="vp-rate" class="vw-sel" data-testid="rate" :value="m.rate.value" @change="onRate">
          <option v-for="r in RATES" :key="r" :value="r">{{ formatRate(r) }}</option>
        </select>
        <button type="button" class="vw-btn" aria-label="Repetir" title="Repetir (R)" data-testid="loop" :aria-pressed="m.loop.value" @click="m.toggleLoop"><VIcon name="repeat" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Capturar quadro" title="Capturar quadro como imagem" data-testid="media-capture" :disabled="!ready" @click="capture"><VIcon name="camera" /></button>
        <button type="button" class="vw-btn" aria-label="Tela cheia" title="Tela cheia (F)" data-testid="media-fullscreen" @click="emit('action', 'fullscreen')"><VIcon name="fullscreen" /></button>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vp-stage { position: relative; flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; background: #000; cursor: pointer; }
.vp-video { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; background: #000; }
.vp-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; pointer-events: none; }
.vp-big { position: absolute; inset: 0; margin: auto; width: 76px; height: 76px; border-radius: 50%; border: 2px solid rgb(255 255 255 / 60%); background: rgb(13 17 23 / 62%); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.vp-big:hover { background: color-mix(in srgb, var(--app) 55%, #0d1117); }
.vp-big:focus-visible { outline: 3px solid var(--app); outline-offset: 3px; }
.vp-bar { justify-content: space-between; gap: 0 8px; }
.vp-seekrow { flex: 1 1 100%; order: -1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.vp-seek { --played: 0%; --buffered: 0%; flex: 1 1 auto; }
.vp-vol { flex: 0 0 90px; min-width: 60px; }
@media (max-width: 599px) { .vp-bar { justify-content: space-around; } .vp-big { width: 64px; height: 64px; } }
</style>
