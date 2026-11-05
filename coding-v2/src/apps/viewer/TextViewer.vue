<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VIcon from './VIcon.vue';
import { decodeText, prettyJson, type ViewerFile } from './model';
import { lineMatches, splitLine } from './search';
import { textPage } from '../../shared/print/pages';
import { FONT_MAX, FONT_MIN, type ViewerPrefs } from './prefs';
import { clamp } from './media';
import type { PrintPage } from '../../shared/print/print';
import type { Detail, MenuGroup, ViewerAction, ViewerHandle } from './types';

/** Texto e código: leitura confortável, linhas numeradas, quebra opcional, pesquisa com destaque, zoom da letra e JSON formatado. */
const props = defineProps<{ file: ViewerFile; blob: Blob | null; prefs: ViewerPrefs; canOpenInCode: boolean }>();
const emit = defineEmits<{
  (e: 'meta', extra: string, details: Detail[]): void;
  (e: 'error', message: string): void;
  (e: 'notice', message: string): void;
  (e: 'action', action: ViewerAction): void;
  (e: 'open-menu', event: MouseEvent): void;
}>();

const CHUNK = 800;
const original = ref('');
const shown = ref(CHUNK);
const loading = ref(true);
const truncated = ref(false);
const pretty = ref(false);
const prettyText = ref('');
const scroller = ref<HTMLElement | null>(null);

const text = computed(() => (pretty.value ? prettyText.value : original.value));
const lines = computed(() => text.value.split(/\r?\n/));
const visible = computed(() => lines.value.slice(0, shown.value));
const gutterWidth = computed(() => String(Math.max(2, String(lines.value.length).length)) + 'ch');
const looksJson = computed(() => /\.json$/i.test(props.file.name) || /^\s*[[{]/.test(original.value.slice(0, 40)));

onMounted(async () => {
  try {
    if (!props.blob) throw new Error('Não foi possível abrir este arquivo.');
    const d = decodeText(new Uint8Array(await props.blob.arrayBuffer()));
    original.value = d.text; truncated.value = d.truncated;
    const n = lines.value.length;
    emit('meta', n.toLocaleString('pt-BR') + (n === 1 ? ' linha' : ' linhas'), [
      { label: 'Linhas', value: n.toLocaleString('pt-BR') }, { label: 'Codificação', value: d.encoding },
      ...(d.truncated ? [{ label: 'Aviso', value: 'Mostrando só os primeiros 4 MB' }] : [])
    ]);
    if (d.truncated) emit('notice', 'Arquivo grande: o início (4 MB) está sendo mostrado.');
  } catch (e) {
    emit('error', e instanceof Error && e.message ? e.message : 'Não foi possível abrir este arquivo de texto.');
  } finally { loading.value = false; }
});

function onScroll(): void {
  const s = scroller.value;
  if (s && shown.value < lines.value.length && s.scrollTop + s.clientHeight > s.scrollHeight - 800) shown.value = Math.min(lines.value.length, shown.value + CHUNK);
}

// ---------------------------------------------------------------- pesquisa
const searchOpen = ref(false);
const query = ref('');
const at = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const matches = computed(() => (searchOpen.value ? lineMatches(lines.value, query.value) : []));
const qLen = computed(() => query.value.trim().length);
const byLine = computed(() => {
  const m = new Map<number, number[]>();
  const index = new Map<number, number[]>();
  matches.value.forEach((x, i) => { (m.get(x.line) ?? m.set(x.line, []).get(x.line)!).push(x.col); (index.get(x.line) ?? index.set(x.line, []).get(x.line)!).push(i); });
  return { cols: m, index };
});
const status = computed(() => (!query.value.trim() ? '' : matches.value.length ? (at.value + 1) + ' de ' + matches.value.length : 'Nada encontrado.'));
function parts(i: number): { text: string; hit: number }[] | null {
  const cols = byLine.value.cols.get(i);
  return cols ? splitLine(lines.value[i] ?? '', cols, qLen.value) : null;
}
function isCurrent(i: number, hit: number): boolean { return byLine.value.index.get(i)?.[hit] === at.value; }
async function show(i: number): Promise<void> {
  if (!matches.value.length) return;
  at.value = ((i % matches.value.length) + matches.value.length) % matches.value.length;
  const line = matches.value[at.value]!.line;
  if (line >= shown.value) shown.value = Math.min(lines.value.length, line + CHUNK);
  await nextTick();
  document.querySelector('.tx-cur')?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
}
watch(query, () => { at.value = 0; void show(0); });
function openSearch(): void { searchOpen.value = true; void nextTick(() => { searchInput.value?.focus(); searchInput.value?.select(); }); }
function closeSearch(): void { searchOpen.value = false; }

// ---------------------------------------------------------------- ações
async function copyText(): Promise<void> {
  const sel = window.getSelection()?.toString();
  const value = sel && scroller.value?.contains(window.getSelection()?.anchorNode ?? null) ? sel : text.value;
  try { await navigator.clipboard.writeText(value); emit('notice', sel ? 'Trecho copiado.' : 'Texto copiado.'); }
  catch { emit('notice', 'O navegador não permitiu copiar. Selecione o texto e use Ctrl+C.'); }
}
function toggleJson(): void {
  if (pretty.value) { pretty.value = false; return; }
  const p = prettyJson(original.value);
  if (!p) { emit('notice', 'Este conteúdo não é um JSON válido.'); return; }
  prettyText.value = p; pretty.value = true; shown.value = CHUNK;
}
const setFont = (n: number): void => { props.prefs.fontSize = clamp(Math.round(n), FONT_MIN, FONT_MAX); };

const printReason = (): string => (loading.value ? 'Espere o arquivo terminar de abrir.' : '');
async function printPages(): Promise<PrintPage[]> {
  const r = textPage(props.file.name, text.value);
  if (r.truncated) emit('notice', 'Impressão limitada aos primeiros caracteres do arquivo.');
  return [r.page];
}

function menu(): MenuGroup[] {
  const groups: MenuGroup[] = [
    { title: 'Texto', items: [
      { id: 'copy-all', label: 'Copiar tudo', icon: 'copy', run: () => { void copyText(); } },
      { id: 'search', label: 'Pesquisar no texto…', icon: 'search', shortcut: 'Ctrl+F', run: openSearch },
      ...(looksJson.value ? [{ id: 'json', label: pretty.value ? 'Mostrar o original' : 'Formatar JSON', icon: 'json' as const, checked: pretty.value, run: toggleJson }] : [])
    ] },
    { title: 'Exibição', items: [
      { id: 'wrap', label: 'Quebrar linhas longas', icon: 'wrap', shortcut: 'W', checked: props.prefs.wrap, run: () => { props.prefs.wrap = !props.prefs.wrap; } },
      { id: 'gutter', label: 'Números de linha', icon: 'numbers', shortcut: 'N', checked: props.prefs.gutter, run: () => { props.prefs.gutter = !props.prefs.gutter; } },
      { id: 'font-up', label: 'Aumentar a letra', icon: 'fontPlus', shortcut: '+', disabled: props.prefs.fontSize >= FONT_MAX, run: () => setFont(props.prefs.fontSize + 2) },
      { id: 'font-down', label: 'Diminuir a letra', icon: 'fontMinus', shortcut: '−', disabled: props.prefs.fontSize <= FONT_MIN, run: () => setFont(props.prefs.fontSize - 2) }
    ] }
  ];
  if (props.canOpenInCode) groups.push({ items: [{ id: 'open-code', label: 'Abrir uma cópia no Código', icon: 'code', run: () => emit('action', 'open-code') }] });
  return groups;
}
function key(e: KeyboardEvent): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) { openSearch(); return true; }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  switch (e.key) {
    case 'Escape': if (searchOpen.value) { closeSearch(); return true; } return false;
    case 'F3': void show(at.value + (e.shiftKey ? -1 : 1)); return true;
    case '/': openSearch(); return true;
    case 'w': case 'W': props.prefs.wrap = !props.prefs.wrap; return true;
    case 'n': case 'N': props.prefs.gutter = !props.prefs.gutter; return true;
    case '+': case '=': setFont(props.prefs.fontSize + 2); return true;
    case '-': case '_': setFont(props.prefs.fontSize - 2); return true;
    case '0': setFont(14); return true;
    default: return false;
  }
}
defineExpose<ViewerHandle>({ menu, key, printPages, printReason });
</script>

<template>
  <div class="vw-body tx" data-testid="text-viewer">
    <div v-if="searchOpen" class="tx-search" role="search">
      <label class="sr-only" for="tx-q">Pesquisar no texto</label>
      <input id="tx-q" ref="searchInput" v-model="query" type="search" class="tx-q" placeholder="Pesquisar no texto" data-testid="text-search"
        @keydown.enter.prevent="show(at + ($event.shiftKey ? -1 : 1))" @keydown.esc.stop="closeSearch" />
      <span class="vw-time" role="status" data-testid="text-search-status">{{ status }}</span>
      <button type="button" class="vw-btn" aria-label="Resultado anterior" :disabled="!matches.length" @click="show(at - 1)"><VIcon name="chevronUp" /></button>
      <button type="button" class="vw-btn" aria-label="Próximo resultado" :disabled="!matches.length" @click="show(at + 1)"><VIcon name="chevronDown" /></button>
      <button type="button" class="vw-btn" aria-label="Fechar a pesquisa" @click="closeSearch"><VIcon name="close" /></button>
    </div>
    <div ref="scroller" class="tx-scroll" tabindex="0" :aria-label="'Conteúdo de ' + file.name" @scroll.passive="onScroll">
      <p v-if="loading" class="vw-spin" role="status">Abrindo…</p>
      <div v-else class="tx-body" :class="{ nowrap: !prefs.wrap, gutter: prefs.gutter }" :style="{ fontSize: prefs.fontSize + 'px', '--gw': gutterWidth }" data-testid="text-body">
        <div v-for="(line, i) in visible" :key="i" class="tx-row" :data-n="i + 1">
          <span class="tx-t"><template v-if="parts(i)"><template v-for="(p, k) in parts(i)!" :key="k"><mark v-if="p.hit >= 0" :class="{ 'tx-cur': isCurrent(i, p.hit) }">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></template><template v-else>{{ line }}</template></span>
        </div>
        <p v-if="shown < lines.length" class="tx-more">Mostrando {{ shown.toLocaleString('pt-BR') }} de {{ lines.length.toLocaleString('pt-BR') }} linhas; role para ver mais.</p>
        <p v-if="truncated" class="tx-more">Arquivo grande: só os primeiros 4 MB aparecem aqui.</p>
      </div>
    </div>
    <div class="vw-bar" role="toolbar" aria-label="Controles do texto">
      <div class="vw-group">
        <button type="button" class="vw-btn" :aria-pressed="prefs.wrap" aria-label="Quebrar linhas longas" title="Quebrar linhas (W)" data-testid="wrap" @click="prefs.wrap = !prefs.wrap"><VIcon name="wrap" /></button>
        <button type="button" class="vw-btn" :aria-pressed="prefs.gutter" aria-label="Números de linha" title="Números de linha (N)" data-testid="gutter" @click="prefs.gutter = !prefs.gutter"><VIcon name="numbers" /></button>
        <button type="button" class="vw-btn" aria-label="Diminuir a letra" title="Diminuir a letra (−)" data-testid="font-down" :disabled="prefs.fontSize <= FONT_MIN" @click="setFont(prefs.fontSize - 2)"><VIcon name="fontMinus" /></button>
        <span class="vw-readout" data-testid="font-size">{{ prefs.fontSize }} px</span>
        <button type="button" class="vw-btn" aria-label="Aumentar a letra" title="Aumentar a letra (+)" data-testid="font-up" :disabled="prefs.fontSize >= FONT_MAX" @click="setFont(prefs.fontSize + 2)"><VIcon name="fontPlus" /></button>
      </div>
      <span class="vw-sep vw-hide-sm" aria-hidden="true"></span>
      <div class="vw-group">
        <button type="button" class="vw-btn" :aria-pressed="searchOpen" aria-label="Pesquisar no texto" title="Pesquisar (Ctrl+F)" data-testid="text-search-toggle" @click="searchOpen ? closeSearch() : openSearch()"><VIcon name="search" /></button>
        <button type="button" class="vw-btn vw-hide-sm" aria-label="Copiar o texto" title="Copiar tudo ou a seleção" data-testid="text-copy" @click="copyText"><VIcon name="copy" /></button>
        <button v-if="looksJson" type="button" class="vw-btn vw-hide-sm" :aria-pressed="pretty" :aria-label="pretty ? 'Mostrar o JSON original' : 'Formatar JSON'" :title="pretty ? 'Mostrar o original' : 'Formatar JSON'" data-testid="format-json" @click="toggleJson"><VIcon name="json" /></button>
        <button v-if="canOpenInCode" type="button" class="vw-btn vw-hide-sm" aria-label="Abrir uma cópia no Código" title="Abrir uma cópia no Código" data-testid="open-in-code" @click="emit('action', 'open-code')"><VIcon name="code" /></button>
        <button type="button" class="vw-btn vw-only-sm" aria-label="Mais opções" data-testid="bar-more" @click="emit('open-menu', $event)"><VIcon name="more" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tx-scroll { flex: 1 1 0; min-height: 0; overflow: auto; background: #10151d; outline: none; }
.tx-scroll:focus-visible { box-shadow: inset 0 0 0 2px var(--app); }
.tx-body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.55; color: #e6eaf2; padding: 10px 0 24px; min-width: max-content; }
.tx-body:not(.nowrap) { min-width: 0; }
.tx-row { display: flex; align-items: flex-start; min-height: 1.55em; padding-right: 16px; }
.tx-row:hover { background: rgb(255 255 255 / 4%); }
.tx-body.gutter .tx-row::before { content: attr(data-n); flex: none; width: var(--gw); box-sizing: content-box; padding: 0 12px 0 14px; text-align: right; color: #6f7c93; user-select: none; font-variant-numeric: tabular-nums; border-right: 1px solid #263044; margin-right: 12px; }
.tx-body:not(.gutter) .tx-row { padding-left: 16px; }
.tx-t { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; }
.tx-body.nowrap .tx-t { white-space: pre; overflow-wrap: normal; }
mark { background: rgb(255 214 10 / 35%); color: inherit; border-radius: 2px; }
mark.tx-cur { background: #ff8c00; color: #000; outline: 2px solid #ff8c00; }
.tx-more { margin: 12px 16px; font-family: system-ui, sans-serif; font-size: 12.5px; color: var(--st-mut); }
.tx-search { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--st-bg2); border-bottom: 1px solid var(--st-line); flex-wrap: wrap; }
.tx-q { flex: 1 1 160px; min-width: 120px; min-height: 40px; padding: 0 10px; border: 1px solid var(--st-line); border-radius: 10px; background: var(--st-bg); color: var(--st-fg); font: inherit; }
.tx-q:focus-visible { outline: 2px solid var(--app); outline-offset: 1px; }
</style>
