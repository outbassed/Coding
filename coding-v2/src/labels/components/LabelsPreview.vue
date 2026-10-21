<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import ZoomControl from '../../components/editor/ZoomControl.vue';
import LabelEntry from './LabelEntry.vue';
import { MARGIN_X_MM, MARGIN_Y_MM, MAX_BLOCKS, PAPER, activeItems, type LabelsState } from '../model';
import { paginate, type Pagination } from '../paginate';

const props = defineProps<{ state: LabelsState; roomy: boolean }>();
const emit = defineEmits<{ layout: [info: LayoutInfo] }>();
export interface LayoutInfo { pageCount: number; labelCount: number; itemCount: number; rowsOnFirstPage: number; warning: string }

const FALLBACK_PX_PER_MM = 96 / 25.4;
const zoom = ref(1);
const area = ref<HTMLElement | null>(null);
const measure = ref<HTMLElement | null>(null);
const ruler = ref<HTMLElement | null>(null);
const pagesEl = ref<HTMLElement | null>(null);
const pagination = ref<Pagination>({ pages: [[]], labelCount: 0, total: 0, oversized: [] });
const currentPage = ref(0);
const areaSize = ref({ w: 600, h: 600 });
const scale = ref(0.5);

const active = computed(() => activeItems(props.state));
const paper = computed(() => PAPER[props.state.orientation]);
const contentWidth = computed(() => paper.value.w - 2 * MARGIN_X_MM);
const colWidthMm = computed(() => (props.state.cols === 1 ? contentWidth.value : (contentWidth.value - props.state.gap * (props.state.cols - 1)) / props.state.cols));
const pageCount = computed(() => pagination.value.pages.length);

/** Mede a altura real de cada etiqueta no navegador (o texto quebra conforme a fonte) e distribui nas folhas. */
function recompute(): void {
  const host = measure.value;
  if (!host) return;
  const pxPerMm = (ruler.value?.getBoundingClientRect().height ?? 0) / 100 || FALLBACK_PX_PER_MM;
  const entries = Array.from(host.querySelectorAll<HTMLElement>(':scope > .entry'));
  const heights = entries.map((el) => el.getBoundingClientRect().height);
  const capacity = (paper.value.h - 2 * MARGIN_Y_MM) * pxPerMm - 3; // tolerância contra arredondamento
  pagination.value = paginate({
    heights, copies: active.value.map((item) => item.copies), cols: props.state.cols, gapPx: props.state.gap * pxPerMm, capacityPx: capacity
  });
  currentPage.value = Math.min(currentPage.value, pagination.value.pages.length - 1);
  updateScale();
  emitLayout();
}
function warningText(): string {
  const p = pagination.value;
  if (!active.value.length) return 'Preencha o código ou a descrição de ao menos um item para ver as etiquetas.';
  if (p.oversized.length) {
    const numbers = p.oversized.map((idx) => props.state.items.indexOf(active.value[idx] as never) + 1);
    return (numbers.length === 1 ? 'A etiqueta do item ' : 'As etiquetas dos itens ') + numbers.join(', ') + (numbers.length === 1 ? ' é maior' : ' são maiores')
      + ' que a área imprimível. Reduza a fonte ou o texto' + (props.state.cols > 1 ? ', ou use menos colunas' : '') + '.';
  }
  if (p.total > MAX_BLOCKS) return 'O documento tem ' + p.total + ' etiquetas. O limite é ' + MAX_BLOCKS + '; reduza as cópias.';
  return '';
}
function emitLayout(): void {
  emit('layout', {
    pageCount: pageCount.value, labelCount: pagination.value.labelCount, itemCount: active.value.length,
    rowsOnFirstPage: pagination.value.pages[0]?.length ?? 0, warning: warningText()
  });
}

let raf = 0;
function schedule(): void { cancelAnimationFrame(raf); raf = requestAnimationFrame(recompute); }
watch(() => props.state, async () => { await nextTick(); recompute(); }, { deep: true, flush: 'post' });

function updateScale(): void {
  const el = area.value;
  if (!el) return;
  const pad = props.roomy ? 28 : 16;
  const naturalW = (paper.value.w) * FALLBACK_PX_PER_MM;
  const naturalH = (paper.value.h) * FALLBACK_PX_PER_MM;
  const pxPerMm = (ruler.value?.getBoundingClientRect().height ?? 0) / 100 || FALLBACK_PX_PER_MM;
  const nw = paper.value.w * pxPerMm || naturalW;
  const nh = paper.value.h * pxPerMm || naturalH;
  areaSize.value = { w: el.clientWidth, h: el.clientHeight };
  const fitW = Math.max(180, el.clientWidth - pad * 2) / nw;
  const fitH = Math.max(180, el.clientHeight - pad * 2) / nh;
  scale.value = Math.min(1.8, props.roomy ? Math.min(fitW, fitH) : fitW) * zoom.value;
  naturalSize.value = { w: nw, h: nh };
}
const naturalSize = ref({ w: 210 * FALLBACK_PX_PER_MM, h: 297 * FALLBACK_PX_PER_MM });
watch([zoom, () => props.roomy, () => props.state.orientation], updateScale);

let observer: ResizeObserver | undefined;
onMounted(() => {
  recompute();
  if (typeof ResizeObserver !== 'undefined' && area.value) { observer = new ResizeObserver(() => updateScale()); observer.observe(area.value); }
  void document.fonts?.ready.then(schedule);
});
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(raf); });

const wideStack = computed(() => props.roomy);
const visiblePages = computed(() => pagination.value.pages.map((rows, index) => ({ rows, index })).filter((p) => wideStack.value || p.index === currentPage.value));
function go(delta: number): void {
  currentPage.value = Math.max(0, Math.min(pageCount.value - 1, currentPage.value + delta));
  if (wideStack.value) void nextTick(() => pagesEl.value?.children[currentPage.value]?.scrollIntoView?.({ block: 'start' }));
}
const frameStyle = computed(() => ({ width: naturalSize.value.w * scale.value + 'px', height: naturalSize.value.h * scale.value + 'px' }));
const paperStyle = computed(() => ({
  width: paper.value.w + 'mm', height: paper.value.h + 'mm', padding: MARGIN_Y_MM + 'mm ' + MARGIN_X_MM + 'mm', transform: 'scale(' + scale.value + ')'
}));
defineExpose({ go });
</script>

<template>
  <div class="preview">
    <div ref="area" class="area" tabindex="0" role="region" aria-label="Pré-visualização da folha A4" data-testid="canvas">
      <div ref="pagesEl" class="pages" data-testid="pages">
        <div v-for="page in visiblePages" :key="page.index" class="frame" :style="frameStyle" :aria-label="'Folha ' + (page.index + 1)" role="group" :data-testid="page.index === 0 ? 'sheet' : undefined">
          <div class="paper" :style="paperStyle">
            <div class="body" :style="{ gap: state.gap + 'mm' }">
              <div v-for="(row, r) in page.rows" :key="r" class="row" :style="{ gridTemplateColumns: 'repeat(' + state.cols + ', minmax(0, 1fr))', columnGap: state.gap + 'mm' }">
                <LabelEntry v-for="(idx, c) in row" :key="c" :item="active[idx]!" :state="state" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="bar">
      <div class="pager" role="group" aria-label="Folhas">
        <button type="button" class="pb" aria-label="Folha anterior" :disabled="currentPage === 0" @click="go(-1)"><NavIcon name="chevron-up" /></button>
        <span class="pi" data-testid="page-indicator">Folha {{ currentPage + 1 }} de {{ pageCount }}</span>
        <button type="button" class="pb" aria-label="Próxima folha" :disabled="currentPage >= pageCount - 1" @click="go(1)"><NavIcon name="chevron-down" /></button>
      </div>
      <ZoomControl v-model="zoom" />
    </div>
    <!-- Área de medição: fora da tela, com a largura real de uma coluna. -->
    <div class="measure" aria-hidden="true">
      <div ref="ruler" class="ruler"></div>
      <div ref="measure" class="host" :style="{ width: colWidthMm + 'mm' }">
        <LabelEntry v-for="item in active" :key="item.id" :item="item" :state="state" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--raised); }
.area { flex: 1; min-height: 0; overflow: auto; padding: 28px max(16px, var(--sa-r)) 28px max(16px, var(--sa-l)); }
.pages { display: flex; flex-direction: column; align-items: center; gap: 24px; width: max-content; min-width: 100%; }
.frame { flex: none; position: relative; }
.paper { position: absolute; left: 0; top: 0; box-sizing: border-box; background: #fff; color: #101010; transform-origin: top left; box-shadow: 0 10px 36px rgb(0 0 0 / 22%); overflow: hidden; }
.body { width: 100%; height: 100%; display: flex; flex-direction: column; }
.row { flex: none; display: grid; align-items: stretch; }
.bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px max(12px, var(--sa-r)) 6px max(12px, var(--sa-l)); background: var(--surface); border-top: 1px solid var(--border); }
.pager { display: inline-flex; align-items: center; gap: 2px; }
.pb { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.pb:hover:not(:disabled) { background: var(--panel); }
.pb:disabled { opacity: .4; }
.pi { font-size: 13px; font-weight: 700; min-width: 92px; text-align: center; }
.measure { position: absolute; left: -99999px; top: 0; visibility: hidden; pointer-events: none; }
.ruler { height: 100mm; width: 1mm; }
@media (max-width: 599px) { .area { padding: 16px 12px; } }
</style>
