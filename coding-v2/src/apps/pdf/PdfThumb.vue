<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderPage, viewDoc } from './engine';

/** Miniatura de página: desenhada só quando aparece na tela. */
const props = defineProps<{ src: string; index: number; rotate: number; bytes: (src: string) => Promise<Uint8Array>; width?: number }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const state = ref<'idle' | 'ready' | 'error'>('idle');
let io: IntersectionObserver | undefined;
let seen = false;
async function draw(): Promise<void> {
  if (!canvas.value || !seen) return;
  try { const doc = await viewDoc(props.src, () => props.bytes(props.src)); await renderPage(doc, props.index, props.rotate, canvas.value, props.width ?? 96); state.value = 'ready'; }
  catch { state.value = 'error'; }
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') { seen = true; void draw(); return; }
  io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { seen = true; io?.disconnect(); void draw(); } }, { rootMargin: '200px' });
  if (canvas.value) io.observe(canvas.value);
});
watch(() => [props.src, props.index, props.rotate], () => { void draw(); });
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <span class="thumb" :data-state="state"><canvas ref="canvas" :width="width ?? 96" :height="Math.round((width ?? 96) * 1.414)" aria-hidden="true"></canvas><span v-if="state === 'error'" class="bad">!</span></span>
</template>

<style scoped>
.thumb { position: relative; display: inline-block; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 25%); line-height: 0; }
canvas { display: block; max-width: 100%; height: auto; }
.bad { position: absolute; inset: 0; display: grid; place-items: center; color: #b12f2f; font-weight: 800; line-height: 1; }
</style>
