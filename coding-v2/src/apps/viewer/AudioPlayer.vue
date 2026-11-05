<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VIcon from './VIcon.vue';
import { coverFromBlob } from './cover';
import { useObjectUrl } from './resources';
import { useMediaElement } from './useMediaElement';
import { formatClock, formatRate, stepRate } from './media';
import { RATES, type ViewerPrefs } from './prefs';
import type { PrintPage } from '../../shared/print/print';
import type { ViewerFile } from './model';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Player de áudio próprio: capa (quando o arquivo traz uma), lista de faixas e passagem automática para a próxima. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs; playlist: ViewerFile[] }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
  (e: 'select', id: string): void;
}>();

const linked = computed(() => !!props.file.sourceUrl);
const { set: setObjectUrl } = useObjectUrl();
const { url: coverUrl, set: setCover } = useObjectUrl();
const src = ref(props.file.sourceUrl ?? '');
const ready = ref(false);

const index = computed(() => props.playlist.findIndex((f) => f.id === props.file.id));
const nextTrack = computed(() => (index.value >= 0 ? props.playlist[index.value + 1] : undefined));
const prevTrack = computed(() => (index.value > 0 ? props.playlist[index.value - 1] : undefined));
const trackText = computed(() => (props.playlist.length > 1 && index.value >= 0 ? 'Faixa ' + (index.value + 1) + ' de ' + props.playlist.length : ''));

const m = useMediaElement({
  kind: 'audio', linked: () => linked.value, prefs: props.prefs,
  onError: (message) => emit('error', message),
  onMeta: (extra, details) => { ready.value = true; emit('meta', extra, details); },
  onEnded: () => { if (props.prefs.autoNext && nextTrack.value) emit('select', nextTrack.value.id); }
});
if (!props.file.sourceUrl && props.blob) src.value = setObjectUrl(props.blob);
onMounted(async () => {
  if (props.file.sourceUrl || !props.blob) return;
  const cover = await coverFromBlob(props.blob);
  if (cover) setCover(new Blob([cover.bytes as BlobPart], { type: cover.mime }));
});
onBeforeUnmount(() => m.release());
watch(() => m.playing.value, (p) => { if (p) ready.value = true; });

const timeText = computed(() => formatClock(m.time.value) + ' / ' + formatClock(m.duration.value));
const playedPct = computed(() => (m.duration.value ? Math.min(100, (m.time.value / m.duration.value) * 100) : 0));
const seekStyle = computed(() => ({ '--played': playedPct.value + '%' }));
const onSeek = (e: Event): void => m.seekTo(Number((e.target as HTMLInputElement).value));
const onVolume = (e: Event): void => m.setVolume(Number((e.target as HTMLInputElement).value));
const onRate = (e: Event): void => m.setRate(Number((e.target as HTMLSelectElement).value));
const pick = (id: string): void => { if (id !== props.file.id) emit('select', id); };

const printReason = (): string => 'Áudio não tem conteúdo visual para imprimir.';
async function printPages(): Promise<PrintPage[]> { throw new Error(printReason()); }

function menu(): MenuGroup[] {
  return [
    { title: 'Reprodução', items: [
      { id: 'play', label: m.playing.value ? 'Pausar' : 'Reproduzir', icon: m.playing.value ? 'pause' : 'play', shortcut: 'Espaço', run: m.toggle },
      { id: 'prev-track', label: 'Faixa anterior', icon: 'prev', disabled: !prevTrack.value, run: () => { if (prevTrack.value) emit('select', prevTrack.value.id); } },
      { id: 'next-track', label: 'Próxima faixa', icon: 'next', disabled: !nextTrack.value, run: () => { if (nextTrack.value) emit('select', nextTrack.value.id); } },
      { id: 'back', label: 'Voltar 10 segundos', icon: 'back10', shortcut: 'J', run: () => m.seekBy(-10) },
      { id: 'fwd', label: 'Avançar 10 segundos', icon: 'fwd10', shortcut: 'L', run: () => m.seekBy(10) },
      { id: 'loop', label: 'Repetir esta faixa', icon: 'repeat', shortcut: 'R', checked: m.loop.value, run: m.toggleLoop },
      { id: 'auto-next', label: 'Tocar a próxima automaticamente', icon: 'playlist', checked: props.prefs.autoNext, run: () => { props.prefs.autoNext = !props.prefs.autoNext; } },
      { id: 'mute', label: m.muted.value ? 'Ativar o som' : 'Silenciar', icon: m.muted.value ? 'mute' : 'volume', shortcut: 'M', run: m.toggleMute }
    ] },
    { title: 'Velocidade', items: RATES.map((r) => ({ id: 'rate-' + r, label: formatRate(r), icon: 'speed' as const, checked: m.rate.value === r, run: () => m.setRate(r) })) }
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
  <div class="vw-body ap" data-testid="audio-viewer">
    <div class="ap-main">
      <div class="ap-art" :class="{ playing: m.playing.value }" data-testid="audio-cover" aria-hidden="true">
        <img v-if="coverUrl" :src="coverUrl" alt="" class="ap-cover" />
        <span v-else class="ap-disc"><VIcon name="audio" :size="64" /></span>
      </div>
      <div class="ap-info">
        <p class="ap-track" data-testid="audio-title">{{ file.name }}</p>
        <p v-if="trackText" class="ap-sub">{{ trackText }}</p>
        <p v-if="linked" class="ap-sub">Reproduzindo de um link: precisa de internet.</p>
        <audio :ref="(el) => { m.el.value = el as HTMLAudioElement | null; }" :src="src" data-testid="media-player" preload="metadata" class="ap-audio"
          :aria-label="'Áudio ' + file.name"
          @loadstart="m.events.onLoadStart" @loadedmetadata="m.events.onMeta" @durationchange="m.events.onDuration" @play="m.events.onPlay"
          @pause="m.events.onPause" @timeupdate="m.events.onTime" @progress="m.events.onProgress" @ended="m.events.onEnded" @error="m.events.onError"></audio>
      </div>
      <ol v-if="playlist.length > 1" class="ap-list" aria-label="Faixas de áudio" data-testid="audio-playlist">
        <li v-for="(f, i) in playlist" :key="f.id">
          <button type="button" class="ap-item" :class="{ on: f.id === file.id }" :aria-current="f.id === file.id ? 'true' : undefined" @click="pick(f.id)">
            <span class="ap-n">{{ i + 1 }}</span><span class="ap-name">{{ f.name }}</span>
            <VIcon v-if="f.id === file.id && m.playing.value" name="volume" :size="16" />
          </button>
        </li>
      </ol>
    </div>
    <div class="vw-bar ap-bar" role="toolbar" aria-label="Controles do áudio">
      <div class="ap-seekrow">
        <span class="vw-time" data-testid="media-time">{{ timeText }}</span>
        <label class="sr-only" for="ap-seek">Posição do áudio</label>
        <input id="ap-seek" type="range" class="vw-range ap-seek" data-testid="media-seek" min="0" :max="m.duration.value || 0" step="0.1" :value="m.time.value" :style="seekStyle"
          :disabled="!ready" :aria-valuetext="timeText" @input="onSeek" />
      </div>
      <div class="vw-group">
        <button type="button" class="vw-btn" aria-label="Faixa anterior" data-testid="audio-prev" :disabled="!prevTrack" @click="prevTrack && emit('select', prevTrack.id)"><VIcon name="prev" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Voltar 10 segundos" data-testid="media-back" @click="m.seekBy(-10)"><VIcon name="back10" /></button>
        <button type="button" class="vw-btn primary" :aria-label="m.playing.value ? 'Pausar' : 'Reproduzir'" data-testid="media-play" @click="m.toggle"><VIcon :name="m.playing.value ? 'pause' : 'play'" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Avançar 10 segundos" data-testid="media-fwd" @click="m.seekBy(10)"><VIcon name="fwd10" /></button>
        <button type="button" class="vw-btn" aria-label="Próxima faixa" data-testid="audio-next" :disabled="!nextTrack" @click="nextTrack && emit('select', nextTrack.id)"><VIcon name="next" /></button>
      </div>
      <div class="vw-group vw-hide-sm">
        <button type="button" class="vw-btn" :aria-label="m.muted.value ? 'Ativar o som' : 'Silenciar'" data-testid="media-mute" @click="m.toggleMute"><VIcon :name="m.muted.value || m.volume.value === 0 ? 'mute' : 'volume'" /></button>
        <label class="sr-only" for="ap-vol">Volume</label>
        <input id="ap-vol" type="range" class="vw-range ap-vol" data-testid="media-volume" min="0" max="1" step="0.05" :value="m.muted.value ? 0 : m.volume.value" @input="onVolume" />
      </div>
      <div class="vw-group">
        <label class="sr-only" for="ap-rate">Velocidade</label>
        <select id="ap-rate" class="vw-sel" data-testid="rate" :value="m.rate.value" @change="onRate">
          <option v-for="r in RATES" :key="r" :value="r">{{ formatRate(r) }}</option>
        </select>
        <button type="button" class="vw-btn" aria-label="Repetir" data-testid="loop" :aria-pressed="m.loop.value" @click="m.toggleLoop"><VIcon name="repeat" /></button>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap-main { flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 22px 16px;
  background: radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--app) 22%, var(--st-bg)) 0%, var(--st-bg) 72%); }
.ap-art { flex: none; width: min(300px, 62vw, 38vh); aspect-ratio: 1; border-radius: 22px; overflow: hidden; display: grid; place-items: center;
  background: linear-gradient(145deg, #232d40, #121823); border: 1px solid var(--st-line); box-shadow: 0 18px 50px rgb(0 0 0 / 50%); }
.ap-cover { width: 100%; height: 100%; object-fit: cover; }
.ap-disc { color: var(--app); display: grid; place-items: center; width: 62%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, #2c3750 0 28%, #1a2232 29% 100%); border: 1px solid var(--st-line); }
.ap-art.playing .ap-disc { animation: ap-spin 9s linear infinite; }
@keyframes ap-spin { to { transform: rotate(360deg); } }
.ap-info { text-align: center; max-width: min(640px, 100%); min-width: 0; }
.ap-track { margin: 0; font-size: 18px; font-weight: 800; overflow-wrap: anywhere; }
.ap-sub { margin: 4px 0 0; font-size: 13px; color: var(--st-mut); }
.ap-audio { display: none; }
.ap-list { list-style: none; margin: 4px 0 0; padding: 0; width: min(640px, 100%); display: grid; gap: 2px; }
.ap-item { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--st-fg); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.ap-item:hover { background: var(--st-hover); }
.ap-item:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
.ap-item.on { background: color-mix(in srgb, var(--app) 24%, transparent); border-color: var(--app); font-weight: 700; }
.ap-n { flex: none; width: 24px; text-align: right; color: var(--st-mut); font-variant-numeric: tabular-nums; }
.ap-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-bar { justify-content: space-between; gap: 0 8px; }
.ap-seekrow { flex: 1 1 100%; order: -1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.ap-seek { flex: 1 1 auto; }
.ap-vol { flex: 0 0 90px; min-width: 60px; }
@media (max-width: 599px) { .ap-bar { justify-content: space-around; } }
</style>
