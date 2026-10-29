<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { checkImport, loadImportLimits } from '../../workspace/importLimits';
import { ACCEPT, formatTime, mediaKindOf } from './media/player';
import { disposePlayer, saveVolume, usePlayer } from './media/usePlayer';

/**
 * Música de referência (opcional): áudio ou vídeo local. De vídeo só o áudio toca; nenhuma imagem aparece.
 * Nada é salvo no projeto. Mudar de cena, editar ou exportar não interrompe a reprodução.
 */
const emit = defineEmits<{ announce: [text: string] }>();
const { player, snap } = usePlayer();
const open = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const notice = ref('');
const hasFile = computed(() => snap.value.status !== 'empty');
const playing = computed(() => snap.value.status === 'playing');
const ready = computed(() => snap.value.status === 'ready' || snap.value.status === 'paused' || snap.value.status === 'playing');
const duration = computed(() => (snap.value.duration > 0 ? snap.value.duration : 0));
const progressText = computed(() => formatTime(snap.value.current) + ' de ' + formatTime(duration.value));
const kindLabel = computed(() => (snap.value.kind === 'video' ? 'vídeo (só o áudio toca)' : 'áudio'));

// a barra anda suave durante a reprodução (timeupdate só chega ~4x por segundo)
let raf = 0;
function loop(): void { player.tick(); raf = requestAnimationFrame(loop); }
watch(playing, (on) => { cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(loop); }, { immediate: true });
onBeforeUnmount(() => { cancelAnimationFrame(raf); disposePlayer(); }); // sair do editor encerra a reprodução

function pick(): void { fileInput.value?.click(); }
function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  notice.value = '';
  const kind = mediaKindOf(file);
  if (!kind) { notice.value = '“' + file.name + '” não parece ser de áudio nem de vídeo.'; emit('announce', notice.value); return; }
  const check = checkImport(kind, file.size, loadImportLimits());
  if (check.level === 'block') { notice.value = check.message; emit('announce', check.message); return; }
  if (check.level === 'warn') notice.value = check.message;
  if (player.load(file)) {
    // No celular a música é secundária: carregar não deve esconder a composição com controles grandes.
    open.value = !window.matchMedia('(max-width: 899px)').matches;
    emit('announce', 'Arquivo de referência carregado: ' + file.name + '. Use Tocar para ouvir.');
  }
}
function toggle(): void { void player.toggle(); }
function onSeek(event: Event): void { player.seek(Number((event.target as HTMLInputElement).value)); }
function onVolume(event: Event): void {
  const v = Number((event.target as HTMLInputElement).value) / 100;
  player.setVolume(v); saveVolume(v);
}
function remove(): void { player.remove(); notice.value = ''; emit('announce', 'Arquivo de referência removido.'); }
</script>

<template>
  <section class="pl" :class="{ open }" aria-label="Música de referência" data-testid="player">
    <div class="pl-head">
      <button v-if="hasFile && ready" type="button" class="ib pl-quick" :aria-label="playing ? 'Pausar' : 'Tocar'" data-testid="player-quick" @click="toggle">
        <svg v-if="!playing" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
      </button>
      <button type="button" class="pl-toggle" :aria-expanded="open" aria-controls="pl-body" :aria-label="hasFile ? 'Detalhes da música: ' + snap.fileName : 'Adicionar música de referência'" data-testid="player-toggle" @click="open = !open">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>
        <span v-if="!hasFile" class="pl-title">Música (opcional)</span>
        <span v-else class="pl-file" :title="snap.fileName">{{ snap.fileName }}</span>
        <span v-if="hasFile" class="pl-mini-time" aria-live="off">{{ formatTime(snap.current) }} / {{ formatTime(duration) }}</span>
        <span v-if="playing" class="pl-live" aria-label="Tocando">●</span>
        <svg class="pl-chevron" :class="{ expanded: open }" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </div>
    <div v-if="hasFile" class="pl-mini-progress" aria-hidden="true"><span :style="{ width: (duration ? Math.min(100, Math.max(0, snap.current / duration * 100)) : 0) + '%' }"></span></div>

    <div v-show="open" id="pl-body" class="pl-body">
      <template v-if="!hasFile">
        <p class="pl-hint">Opcional: toque uma música ou um vídeo (só o áudio) enquanto edita. Nada é enviado nem salvo no projeto, e as cenas não seguem o tempo da música.</p>
        <button type="button" class="btn btn-app" data-testid="media-open" @click="pick">Escolher áudio ou vídeo…</button>
      </template>
      <template v-else>
        <div class="pl-row">
          <button type="button" class="btn btn-app pl-play" :disabled="!ready" :aria-label="playing ? 'Pausar' : 'Tocar'" data-testid="player-play" @click="toggle">
            <svg v-if="!playing" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
            <span>{{ playing ? 'Pausar' : 'Tocar' }}</span>
          </button>
          <div class="pl-info">
            <strong class="pl-name" :title="snap.fileName" data-testid="player-name">{{ snap.fileName }}</strong>
            <small class="muted">{{ kindLabel }}</small>
          </div>
          <span class="pl-time" data-testid="player-time" aria-live="off">{{ formatTime(snap.current) }} / {{ formatTime(duration) }}</span>
        </div>
        <label class="pl-seek"><span class="sr-only">Posição da música</span>
          <input type="range" min="0" :max="duration || 1" step="0.1" :value="snap.current" :disabled="!ready || !duration" :aria-valuetext="progressText" aria-label="Posição da música" data-testid="player-seek" @input="onSeek" />
        </label>
        <div class="pl-row">
          <label class="pl-vol"><span class="pl-vl">Volume</span>
            <input type="range" min="0" max="100" step="1" :value="snap.muted ? 0 : Math.round(snap.volume * 100)" aria-label="Volume" data-testid="player-volume" @input="onVolume" />
          </label>
          <button type="button" class="btn small" :aria-pressed="snap.muted" data-testid="player-mute" @click="player.setMuted(!snap.muted)">{{ snap.muted ? 'Ativar som' : 'Silenciar' }}</button>
          <button type="button" class="btn small" data-testid="media-replace" @click="pick">Trocar arquivo</button>
          <button type="button" class="btn small" data-testid="media-remove" @click="remove">Remover</button>
        </div>
        <p v-if="snap.status === 'loading'" class="pl-hint" role="status">Carregando o arquivo…</p>
        <p v-if="snap.status === 'error'" class="ed-error" role="alert" data-testid="player-error">{{ snap.error }}</p>
      </template>
      <p v-if="notice" class="pl-hint" :class="{ bad: !hasFile }" role="status" data-testid="player-notice">{{ notice }}</p>
      <input ref="fileInput" type="file" class="sr-only" :accept="ACCEPT" aria-label="Escolher arquivo de áudio ou vídeo de referência" data-testid="media-input" @change="onFile" />
    </div>
  </section>
</template>

<style scoped>
.pl { min-width: 0; }
.pl-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pl-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font-weight: 700; font-size: 13px; text-align: left; }
.pl.open .pl-toggle { border-color: var(--app); }
.pl-title { flex: none; }
.pl-file { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--text); }
.pl-live { color: var(--app); font-size: 11px; animation: pulse 1.4s ease-in-out infinite; }
.pl-quick { flex: none; width: 44px; height: 44px; border: 0; border-radius: 12px; background: var(--app); color: var(--ink); display: grid; place-items: center; }
.pl-quick:hover { filter: brightness(1.06); }
.pl-mini-time { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 500; }
.pl-chevron { flex: none; color: var(--muted); transition: transform .16s ease; }
.pl-chevron.expanded { transform: rotate(180deg); }
.pl-mini-progress { height: 3px; margin: 3px 0 0 50px; overflow: hidden; background: var(--border); border-radius: 99px; }
.pl-mini-progress > span { display: block; height: 100%; background: var(--app); transition: width .14s linear; }
@media (max-width: 420px) { .pl-head { gap: 4px; } .pl-toggle { gap: 6px; padding: 0 8px; } .pl-mini-time { font-size: 10px; } }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .pl-live { animation: none; } }
.pl-body { display: grid; gap: 8px; padding: 10px 2px 4px; min-width: 0; }
.pl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.pl-play { min-width: 112px; }
.pl-info { flex: 1 1 120px; min-width: 0; display: grid; }
.pl-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.pl-info small { font-size: 12px; }
.pl-time { flex: none; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--muted); }
.pl-seek input { width: 100%; min-height: 36px; accent-color: var(--accent); }
.pl-vol { display: flex; align-items: center; gap: 8px; flex: 1 1 140px; min-width: 0; font-size: 12.5px; color: var(--muted); font-weight: 700; }
.pl-vol input { flex: 1; min-width: 60px; accent-color: var(--accent); min-height: 36px; }
.pl-hint { margin: 0; font-size: 12.5px; color: var(--muted); }
.pl-hint.bad { color: var(--danger); font-weight: 600; }
.small { min-height: 40px; padding: 4px 10px; font-size: 13px; }
</style>
