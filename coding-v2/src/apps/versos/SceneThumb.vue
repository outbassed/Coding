<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { VersosView } from './controller';
import { canvasSize, renderScene, sceneSignature } from './render';
import type { Scene } from './model';

/**
 * Miniatura de uma cena. Só é desenhada quando aparece na tela (IntersectionObserver) e com atraso curto depois de cada
 * alteração, em escala pequena (nunca em resolução cheia). Fora da tela não custa nada: nem a assinatura é calculada.
 */
const props = withDefaults(defineProps<{ scene: Scene; v: VersosView; maxW?: number; maxH?: number }>(), { maxW: 132, maxH: 84 });
const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const visible = ref(typeof IntersectionObserver === 'undefined');
let io: IntersectionObserver | undefined;

const fitScale = computed(() => Math.min(props.maxW / props.scene.width, props.maxH / props.scene.height));
const cssW = computed(() => Math.max(1, Math.round(props.scene.width * fitScale.value)));
const cssH = computed(() => Math.max(1, Math.round(props.scene.height * fitScale.value)));
const signature = computed(() => (visible.value ? sceneSignature(props.scene) : ''));

let timer: ReturnType<typeof setTimeout> | undefined;
function draw(): void {
  const c = canvas.value;
  if (!c || !visible.value) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const k = fitScale.value * dpr;
  const size = canvasSize(props.scene, k);
  if (c.width !== size.width) c.width = size.width;
  if (c.height !== size.height) c.height = size.height;
  const ctx = c.getContext('2d');
  if (ctx) renderScene(ctx, props.scene, props.v.deps, { scale: k });
}
function schedule(): void { clearTimeout(timer); timer = setTimeout(draw, 120); }
watch([signature, () => props.v.imageTick, () => props.v.fontTick], schedule);
watch(visible, (now) => { if (now) draw(); });
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || !root.value) { draw(); return; }
  io = new IntersectionObserver((entries) => { for (const e of entries) visible.value = e.isIntersecting; }, { rootMargin: '120px' });
  io.observe(root.value);
});
onBeforeUnmount(() => { clearTimeout(timer); io?.disconnect(); });
</script>

<template>
  <span ref="root" class="th" :style="{ width: cssW + 'px', height: cssH + 'px' }">
    <canvas ref="canvas" class="th-c" :style="{ width: cssW + 'px', height: cssH + 'px' }" aria-hidden="true" data-testid="scene-thumb"></canvas>
  </span>
</template>

<style scoped>
.th { display: block; flex: none; position: relative; border-radius: 4px; overflow: hidden; box-shadow: 0 0 0 1px var(--border); background: repeating-conic-gradient(#c9ced8 0% 25%, #f4f6fa 0% 50%) 0 0 / 10px 10px; }
.th-c { display: block; }
</style>
