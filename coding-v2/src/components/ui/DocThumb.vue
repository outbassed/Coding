<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { CopySummary } from '../../storage/documents';
import { toolIdForType } from '../../library/model';
import { cachedPreview, loadPreview } from '../../previews/loader';
import { previewable, type Preview } from '../../previews/model';
import { MARGIN_X_MM, MARGIN_Y_MM, PAPER } from '../../labels/model';
import LabelEntry from '../../labels/components/LabelEntry.vue';
import AppIcon from './AppIcon.vue';

/** Miniatura decorativa (aria-hidden): o nome do documento já é anunciado pelo cartão que a contém. */
const props = defineProps<{ copy: Pick<CopySummary, 'id' | 'revision' | 'type'> }>();
type State = 'idle' | 'loading' | 'ready' | 'fallback';
const PX_PER_MM = 96 / 25.4;
const root = ref<HTMLElement | null>(null);
const preview = shallowRef<Preview | null>(cachedPreview(props.copy) ?? null);
const state = ref<State>(preview.value ? 'ready' : previewable(props.copy.type) ? 'idle' : 'fallback');
const boxWidth = ref(0);
const tool = computed(() => toolIdForType(props.copy.type));
const paper = computed(() => {
  const p = preview.value;
  return p?.kind === 'labels' ? PAPER[p.state.orientation] : PAPER.portrait;
});
const scale = computed(() => (boxWidth.value > 0 ? boxWidth.value : 120) / (paper.value.w * PX_PER_MM));
const sheetStyle = computed(() => {
  const boxHeight = (boxWidth.value > 0 ? boxWidth.value : 120) * PAPER.portrait.h / PAPER.portrait.w;
  const top = Math.max(0, (boxHeight - paper.value.h * PX_PER_MM * scale.value) / 2);
  return { width: paper.value.w + 'mm', height: paper.value.h + 'mm', top: top + 'px', transform: 'scale(' + scale.value + ')' };
});
const labelStyle = computed(() => {
  const p = preview.value;
  if (p?.kind !== 'labels') return {};
  const cols = p.state.cols;
  return {
    padding: MARGIN_Y_MM + 'mm ' + MARGIN_X_MM + 'mm',
    gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))',
    gap: p.state.gap + 'mm'
  };
});
const blocks = computed(() => {
  const p = preview.value;
  if (p?.kind !== 'labels') return [];
  return p.state.items.flatMap((item) => Array.from({ length: item.copies }, (_, n) => ({ key: item.id + ':' + n, item })));
});

let observer: IntersectionObserver | undefined;
let resizer: ResizeObserver | undefined;
let alive = true;
let visible = false;
let requestVersion = 0;

// Os cartões continuam montados enquanto a biblioteca recebe atualizações de outra aba.
// Trocar ID/revisão precisa invalidar a miniatura, mesmo com o mesmo componente Vue.
watch(() => [props.copy.id, props.copy.revision, props.copy.type] as const, () => {
  requestVersion++;
  const cached = cachedPreview(props.copy);
  preview.value = cached ?? null;
  state.value = cached ? 'ready' : previewable(props.copy.type) ? 'idle' : 'fallback';
  if (visible && state.value === 'idle') void start();
});

async function start(): Promise<void> {
  if (state.value !== 'idle') return;
  state.value = 'loading';
  const expected = requestVersion;
  try {
    const result = await loadPreview({ ...props.copy });
    if (!alive || expected !== requestVersion) return;
    preview.value = result;
    state.value = 'ready';
  } catch {
    if (alive && expected === requestVersion) state.value = 'fallback';
  }
}
onMounted(() => {
  const el = root.value;
  if (!el) return;
  boxWidth.value = el.clientWidth;
  if (typeof ResizeObserver !== 'undefined') {
    resizer = new ResizeObserver((entries) => { boxWidth.value = entries[0]?.contentRect.width ?? el.clientWidth; });
    resizer.observe(el);
  }
  if (state.value !== 'idle') return;
  if (typeof IntersectionObserver === 'undefined') { visible = true; void start(); return; }
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { visible = true; observer?.disconnect(); observer = undefined; void start(); }
  }, { rootMargin: '240px' });
  observer.observe(el);
});
onBeforeUnmount(() => { alive = false; requestVersion++; observer?.disconnect(); resizer?.disconnect(); });
</script>

<template>
  <span ref="root" class="thumb" :data-state="state" :data-kind="preview?.kind ?? 'none'" data-testid="doc-thumb" aria-hidden="true">
    <span v-if="state === 'ready' && preview" class="sheet" :class="preview.kind" :style="sheetStyle">
      <span v-if="preview.kind === 'labels'" class="labels" :style="labelStyle">
        <LabelEntry v-for="b in blocks" :key="b.key" :item="b.item" :state="preview.state" />
      </span>
      <!-- eslint-disable-next-line vue/no-v-html -- HTML já saneado por sanitizeTextHtml em previews/model.ts -->
      <span v-else-if="preview.kind === 'text'" class="doc" v-html="preview.html"></span>
      <span v-else-if="preview.kind === 'table'" class="mini-table"><span v-for="(row, r) in preview.rows" :key="r" class="mt-row"><span v-for="(v, c) in row" :key="c" class="mt-cell" :class="{ b: preview.bold[r]?.[c] }">{{ v }}</span></span></span>
      <!-- SVG gerado localmente pelo app QR / Barras (textos escapados) -->
      <span v-else-if="preview.kind === 'codes'" class="codes"><span v-for="(svg, i) in preview.svgs" :key="i" class="code" v-html="svg"></span></span>
      <span v-else class="summary"><strong class="sum-title">{{ preview.title }}</strong><span v-for="(l, i) in preview.lines" :key="i" class="sum-line"><span>{{ l[0] }}</span><b>{{ l[1] }}</b></span></span>
    </span>
    <span v-else-if="state === 'fallback'" class="fallback"><AppIcon v-if="tool" :id="tool" size="md" /><span v-else class="plain"></span></span>
    <span v-else class="skeleton"></span>
  </span>
</template>

<style scoped>
.thumb { position: relative; display: block; width: 100%; aspect-ratio: 210 / 297; overflow: hidden; border-radius: 8px; background: var(--raised, #e9edf3); border: 1px solid var(--border); contain: strict; }
.sheet { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: #fff; color: #171c25; display: block; overflow: hidden; pointer-events: none; user-select: none; }
.labels { display: grid; box-sizing: border-box; width: 100%; height: 100%; align-content: start; overflow: hidden; }
.doc { display: block; box-sizing: border-box; width: 100%; height: 100%; padding: 20mm; overflow: hidden; overflow-wrap: anywhere; font: 16px/1.6 Georgia, serif; }
.doc :deep(h1) { font-size: 28px; line-height: 1.2; margin: 0 0 .5em; }
.doc :deep(h2) { font-size: 22px; line-height: 1.3; margin: 0 0 .5em; }
.doc :deep(h3) { font-size: 18px; line-height: 1.35; margin: 0 0 .5em; }
.doc :deep(p), .doc :deep(ul), .doc :deep(ol) { margin: 0 0 .8em; }
.doc :deep(img) { max-width: 100%; height: auto; display: block; }
.doc :deep(blockquote) { border-left: 3px solid #8da5d9; padding-left: 15px; margin: 0 0 .8em; color: #36475c; }
.mini-table { display: grid; align-content: start; box-sizing: border-box; width: 100%; height: 100%; padding: 12mm 10mm; font: 15px/1.3 Arial, sans-serif; }
.mt-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-bottom: 1px solid #c9d1de; }
.mt-cell { padding: 6px 6px; border-right: 1px solid #e1e6ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mt-cell.b { font-weight: 700; background: #eef1f6; }
.codes { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; padding: 15mm; box-sizing: border-box; width: 100%; height: 100%; align-content: start; }
.code :deep(svg) { width: 100%; height: auto; display: block; }
.summary { display: grid; align-content: start; gap: 10px; box-sizing: border-box; width: 100%; height: 100%; padding: 18mm 16mm; font: 22px/1.3 Arial, sans-serif; }
.sum-title { font-size: 34px; margin-bottom: 10px; overflow-wrap: anywhere; }
.sum-line { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #dfe4ec; padding-bottom: 6px; }
.sum-line span { color: #4a5568; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sum-line b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.fallback { position: absolute; inset: 0; display: grid; place-items: center; background: var(--surface); }
.plain { width: 40%; height: 55%; border-radius: 4px; background: var(--border); }
.skeleton { position: absolute; inset: 0; background: linear-gradient(100deg, var(--raised, #e9edf3) 30%, color-mix(in srgb, var(--raised, #e9edf3) 60%, #fff) 50%, var(--raised, #e9edf3) 70%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
</style>
