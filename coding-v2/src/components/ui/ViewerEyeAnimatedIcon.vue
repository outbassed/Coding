<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { EYE_PATH, offsetFor } from './eyeGeometry';

/**
 * Logo do Visualizador com olho vivo. Existe SOMENTE na página de detalhes do Visualizador (AppDetailsView);
 * em todo o resto do Coding o ícone continua sendo o SVG estático original.
 *
 * 1) Ao entrar: olha para a esquerda, depois para a direita e volta ao centro, uma única vez (animação CSS).
 * 2) Ao clicar (ou Enter/Espaço): a íris, a pupila e o reflexo acompanham o cursor. Um segundo clique desliga e centraliza.
 * A íris é limitada geometricamente (eyeGeometry.ts) e ainda recortada por uma máscara SVG com o formato do branco do olho.
 * Nada é gravado: a posição do cursor vive só na memória deste componente.
 */
const following = ref(false);
const announce = ref('');
const svg = ref<SVGSVGElement | null>(null);
const pupil = ref<SVGGElement | null>(null);
const uid = 'viewer-eye-' + Math.random().toString(36).slice(2, 8);

let current = { x: 0, y: 0 };
let target = { x: 0, y: 0 };
let frame = 0;
const reduced = (): boolean => document.documentElement.dataset.motion === 'reduce' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function paint(): void {
  if (pupil.value) pupil.value.style.transform = 'translate(' + current.x.toFixed(3) + 'px, ' + current.y.toFixed(3) + 'px)';
}
function step(): void {
  frame = 0;
  const dx = target.x - current.x, dy = target.y - current.y;
  if (Math.hypot(dx, dy) < 0.02) { current = { ...target }; paint(); return; }
  current = { x: current.x + dx * 0.22, y: current.y + dy * 0.22 };
  paint();
  frame = requestAnimationFrame(step);
}
function moveTo(next: { x: number; y: number }): void {
  target = next;
  if (reduced()) { current = { ...next }; paint(); return; } // sem suavização para quem pede menos movimento
  if (!frame) frame = requestAnimationFrame(step);
}

/** Posição do cursor (px da tela) → deslocamento da íris, já limitado à área branca (unidades do viewBox). */
function onPointerMove(event: PointerEvent): void {
  const box = svg.value?.getBoundingClientRect();
  if (!box || !box.width) return;
  const o = offsetFor(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2));
  moveTo({ x: o.x, y: o.y });
}
const recenter = (): void => moveTo({ x: 0, y: 0 });
function onVisibility(): void { if (document.visibilityState === 'hidden') recenter(); }

function listen(on: boolean): void {
  const m = on ? 'addEventListener' : 'removeEventListener';
  window[m]('pointermove', onPointerMove as EventListener, { passive: true } as AddEventListenerOptions);
  document.documentElement[m]('mouseleave', recenter); // o cursor saiu da janela
  window[m]('blur', recenter);
  document[m]('visibilitychange', onVisibility);
}

function stopIntro(): void {
  const animation = pupil.value?.getAnimations?.()[0];
  if (!animation) return;
  // parte da posição atual da animação, sem pulo
  const m = new DOMMatrixReadOnly(getComputedStyle(pupil.value!).transform);
  current = { x: m.m41, y: m.m42 };
  animation.cancel();
  paint();
}

function toggle(): void {
  following.value = !following.value;
  if (following.value) {
    stopIntro();
    listen(true);
    announce.value = 'O olho agora segue o cursor.';
  } else {
    listen(false);
    recenter();
    announce.value = 'O olho voltou ao centro.';
  }
}

onBeforeUnmount(() => {
  listen(false);
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <!-- A animação pertence exclusivamente à tela de detalhes do Visualizador.
       Nos demais lugares, a marca continua sendo o SVG estático original. -->
  <span class="app-icon viewer-eye-detail" :data-following="following ? 'true' : 'false'" data-testid="viewer-animated-icon">
    <button type="button" class="viewer-eye-button" :aria-pressed="following" aria-label="Logo do Visualizador: fazer o olho seguir o cursor"
      title="Clique para o olho seguir o cursor" data-testid="viewer-eye-toggle" @click="toggle">
      <svg ref="svg" class="viewer-eye-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient :id="uid + '-gradient'" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ecb6f5" />
            <stop offset="1" stop-color="#9a4fbd" />
          </linearGradient>
          <!-- Máscara com o formato do branco do olho: nada da íris, da pupila ou do reflexo aparece sobre a parte roxa. -->
          <mask :id="uid + '-mask'" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
            <path :d="EYE_PATH" fill="#fff" />
          </mask>
        </defs>
        <rect width="48" height="48" rx="12" :fill="'url(#' + uid + '-gradient)'" />
        <path :d="EYE_PATH" fill="#fff" />
        <g :mask="'url(#' + uid + '-mask)'">
          <!-- Íris, pupila e reflexo se deslocam juntos, sem deformar a marca. -->
          <g ref="pupil" class="viewer-eye-pupil" :class="{ 'is-following': following }" data-testid="viewer-eye-pupil">
            <circle cx="24" cy="24" r="8.5" fill="#7a3a9a" />
            <circle cx="24" cy="24" r="4" fill="#2a0f38" />
            <circle cx="26.6" cy="21.4" r="1.7" fill="#fff" />
          </g>
        </g>
      </svg>
    </button>
    <span class="sr-only" role="status" data-testid="viewer-eye-status">{{ announce }}</span>
  </span>
</template>

<style scoped>
.viewer-eye-detail {
  display: inline-grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  width: 80px;
  height: 80px;
  flex: 0 0 auto;
  border-radius: 25%;
}
.viewer-eye-button {
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 25%;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.viewer-eye-button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.viewer-eye-svg { display: block; width: 100%; height: 100%; overflow: hidden; border-radius: 25%; }
.viewer-eye-pupil {
  animation: viewer-look-around 2.8s ease-in-out 350ms 1 both;
}
.viewer-eye-pupil.is-following { animation: none; }
@keyframes viewer-look-around {
  0%, 12%, 85%, 100% { transform: translateX(0); }
  26%, 37% { transform: translateX(-4px); }
  56%, 68% { transform: translateX(4px); }
}
@media (prefers-reduced-motion: reduce) {
  .viewer-eye-pupil { animation: none; }
}
:global(:root[data-motion='reduce']) .viewer-eye-pupil { animation: none; }
</style>
