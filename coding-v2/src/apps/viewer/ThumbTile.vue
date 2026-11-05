<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import VIcon from './VIcon.vue';
import { KIND_ICON } from './icons';
import { requestThumb, thumbOf } from './thumbs';
import type { ViewerFile } from './model';

/** Miniatura de um arquivo da biblioteca. A figura só é preparada quando o cartão aparece na tela. */
const props = defineProps<{ file: ViewerFile; blobOf: (file: ViewerFile) => Blob | null; size?: number }>();
const host = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

const thumb = computed(() => thumbOf(props.file));
const linkedImage = computed(() => !!props.file.sourceUrl && (props.file.kind === 'image' || props.file.kind === 'svg'));
const broken = ref(false);

function ask(): void { requestThumb(props.file, props.blobOf(props.file)); }
onMounted(() => {
  if (linkedImage.value || props.file.sourceUrl) return;
  if (typeof IntersectionObserver === 'undefined' || !host.value) { ask(); return; }
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { ask(); observer?.disconnect(); }
  }, { rootMargin: '120px' });
  observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <span ref="host" class="tt" :class="'k-' + file.kind" :style="size ? { width: size + 'px', height: size + 'px' } : undefined" aria-hidden="true">
    <img v-if="linkedImage && !broken" :src="file.sourceUrl" alt="" class="tt-img" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="broken = true" />
    <img v-else-if="thumb?.url" :src="thumb.url" alt="" class="tt-img" decoding="async" />
    <pre v-else-if="thumb?.text" class="tt-text">{{ thumb.text }}</pre>
    <VIcon v-else :name="KIND_ICON[file.kind]" :size="size && size < 48 ? 20 : 30" />
    <span v-if="file.sourceUrl" class="tt-link" title="Link externo"><VIcon name="link" :size="12" /></span>
  </span>
</template>

<style scoped>
.tt { position: relative; flex: none; display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; border-radius: 10px; background: var(--st-bg2); color: var(--st-mut); }
.tt-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.k-svg .tt-img, .k-model .tt-img { object-fit: contain; }
.tt-text { margin: 0; align-self: stretch; padding: 6px 7px; overflow: hidden; font: 9.5px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #b8c3d6; white-space: pre; text-align: left; background: #10151d; }
.tt-link { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: rgb(13 17 23 / 78%); color: #fff; }
.k-image { color: #8fb8ff; } .k-svg { color: #ffb36b; } .k-video { color: #ff8fa3; } .k-audio { color: #7be0a8; } .k-pdf { color: #ff9a9a; } .k-model { color: #c9a8ff; } .k-text { color: #9fd0ff; }
</style>
