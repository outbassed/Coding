<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadText, safeFileName } from '../../shared/files/download';
import {
  bestText, cssCmyk, cssHsl, cssHsv, cssRgb, extractPalette, hslToRgb, parseColor, rgbToHsl, SCHEMES, suggestForeground, toHex, wcag
} from './color';
import {
  addColors, hexOf, importFromText, MAX_SWATCHES, moveSwatch, paletteCss, paletteJson, paletteSvg, paletteText, removeSwatch, renameSwatch, schemeHexes, type ColorsState
} from './model';
import { colorsKind, colorsTemplates } from './kind';

const doc = useDocument({ kind: colorsKind, templates: colorsTemplates, path: '/apps/cores/' });
const { state } = doc;
const tabs = [
  { id: 'cor', label: 'Cor' }, { id: 'harmonias', label: 'Harmonias' }, { id: 'contraste', label: 'Contraste' },
  { id: 'imagem', label: 'Imagem' }, { id: 'paleta', label: 'Paleta' }, { id: 'arquivo', label: 'Arquivo' }
];
const tab = ref('cor');

function set(patch: Partial<ColorsState>): void { Object.assign(state.value, patch); }
/** Sempre cor válida (o estado é normalizado ao carregar). */
const baseRgb = computed(() => parseColor(state.value.base) ?? { r: 51, g: 102, b: 204, a: 1 });
const hsl = computed(() => rgbToHsl(baseRgb.value));
const onBase = computed(() => toHex(bestText(baseRgb.value)));
const formats = computed(() => [
  { id: 'hex', label: 'HEX', value: toHex(baseRgb.value) },
  { id: 'rgb', label: 'RGB', value: cssRgb(baseRgb.value) },
  { id: 'hsl', label: 'HSL', value: cssHsl(baseRgb.value) },
  { id: 'hsv', label: 'HSV', value: cssHsv(baseRgb.value) },
  { id: 'cmyk', label: 'CMYK', value: cssCmyk(baseRgb.value) }
]);

// ---- cor
const hexDraft = ref(state.value.base);
const hexError = ref('');
watch(() => state.value.base, (v) => { hexDraft.value = v; hexError.value = ''; });
function onHexInput(): void {
  const hex = hexOf(hexDraft.value);
  if (hex) { set({ base: hex }); hexError.value = ''; }
  else hexError.value = 'Use um código de cor válido, como #3366CC, rgb(51, 102, 204) ou hsl(220, 60%, 50%).';
}
function onPicker(event: Event): void { const v = hexOf((event.target as HTMLInputElement).value); if (v) set({ base: v }); }
function setHsl(part: 'h' | 's' | 'l', value: number): void {
  const cur = hsl.value;
  const next = { h: cur.h, s: cur.s, l: cur.l, [part]: value };
  set({ base: toHex(hslToRgb(next)) });
}
const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
async function pickFromScreen(): Promise<void> {
  try {
    const Ctor = (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
    const result = await new Ctor().open();
    const v = hexOf(result.sRGBHex);
    if (v) { set({ base: v }); doc.say('Cor capturada da tela: ' + v); }
  } catch { doc.say('Captura cancelada.'); }
}
async function copy(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); doc.say('Copiado: ' + text); }
  catch { doc.say('Não foi possível copiar automaticamente. O valor é ' + text + '.'); }
}
function report(r: { added: number; skipped: number; full: boolean }, what = 'cor'): void {
  if (r.added === 0 && r.full) doc.say('A paleta está cheia (máximo de ' + MAX_SWATCHES + ' cores).');
  else if (r.added === 0) doc.say(r.skipped ? 'Essa ' + what + ' já está na paleta.' : 'Nenhuma cor nova.');
  else doc.say(r.added + (r.added === 1 ? ' cor adicionada' : ' cores adicionadas') + ' à paleta' + (r.skipped ? ' (' + r.skipped + ' já existia' + (r.skipped === 1 ? '' : 'm') + ' ou não coube)' : '') + '.');
}
function add(hexes: string[], names: string[] = []): void {
  const r = addColors(state.value, hexes, names);
  set({ palette: r.state.palette });
  report(r);
}
function useAsBase(hex: string): void { set({ base: hex }); tab.value = 'cor'; doc.say('Cor ' + hex + ' em edição.'); }

// ---- harmonias
const harmony = computed(() => schemeHexes(state.value.base, state.value.scheme));
const schemeHelp = computed(() => SCHEMES.find((s) => s.id === state.value.scheme)?.help ?? '');

// ---- contraste
const fgRgb = computed(() => parseColor(state.value.fg) ?? { r: 20, g: 25, b: 34, a: 1 });
const bgRgb = computed(() => parseColor(state.value.bg) ?? { r: 255, g: 255, b: 255, a: 1 });
const report2 = computed(() => wcag(fgRgb.value, bgRgb.value));
const ratioText = computed(() => report2.value.ratio.toFixed(2).replace('.', ',') + ' : 1');
const suggestion = computed(() => {
  if (report2.value.aaNormal) return null;
  const s = suggestForeground(fgRgb.value, bgRgb.value, 4.5);
  return s ? toHex(s) : null;
});
const fgDraft = ref(state.value.fg), bgDraft = ref(state.value.bg);
watch(() => state.value.fg, (v) => { fgDraft.value = v; });
watch(() => state.value.bg, (v) => { bgDraft.value = v; });
function onPair(which: 'fg' | 'bg'): void {
  const hex = hexOf(which === 'fg' ? fgDraft.value : bgDraft.value);
  if (hex) set(which === 'fg' ? { fg: hex } : { bg: hex });
}
function pickPair(which: 'fg' | 'bg', event: Event): void { const v = hexOf((event.target as HTMLInputElement).value); if (v) set(which === 'fg' ? { fg: v } : { bg: v }); }
function swapPair(): void { set({ fg: state.value.bg, bg: state.value.fg }); }
function useBaseIn(which: 'fg' | 'bg'): void { set(which === 'fg' ? { fg: state.value.base } : { bg: state.value.base }); }
function applySuggestion(): void { if (suggestion.value) { set({ fg: suggestion.value }); doc.say('Texto ajustado para ' + suggestion.value + '.'); } }
const checks = computed(() => [
  { id: 'aa', label: 'AA, texto normal (4,5)', ok: report2.value.aaNormal },
  { id: 'aa-large', label: 'AA, texto grande (3)', ok: report2.value.aaLarge },
  { id: 'aaa', label: 'AAA, texto normal (7)', ok: report2.value.aaaNormal },
  { id: 'aaa-large', label: 'AAA, texto grande (4,5)', ok: report2.value.aaaLarge },
  { id: 'ui', label: 'Componentes e gráficos (3)', ok: report2.value.ui }
]);

// ---- imagem
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const imageUrl = ref('');
const imageName = ref('');
const imageError = ref('');
const extractCount = ref(6);
const extracted = ref<string[]>([]);
let imageData: Uint8ClampedArray | null = null;
function runExtract(): void {
  extracted.value = imageData ? extractPalette(imageData, extractCount.value).map((c) => toHex(c)) : [];
}
let imageW = 0, imageH = 0;
async function loadImage(file: Blob, label: string): Promise<void> {
  imageError.value = '';
  if (!/^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.type)) { imageError.value = 'Escolha uma imagem PNG, JPG, WebP, GIF ou BMP.'; return; }
  if (file.size > MAX_IMAGE_BYTES) { imageError.value = 'A imagem passa de 25 MB. Escolha uma menor.'; return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, w, h);
    imageData = ctx.getImageData(0, 0, w, h).data;
    imageW = w; imageH = h;
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = url; imageName.value = label;
    runExtract();
    if (!extracted.value.length) imageError.value = 'A imagem é transparente: não há cores para extrair.';
    else doc.say(extracted.value.length + ' cores extraídas de ' + label + '.');
  } catch {
    URL.revokeObjectURL(url);
    imageError.value = 'Não foi possível ler essa imagem. Tente outro arquivo.';
  }
}
async function onImage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await loadImage(file, file.name);
}
function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes((el as HTMLInputElement).type);
  return el.isContentEditable;
}
/** Ctrl+V com uma imagem na área de transferência: abre a aba Imagem e extrai as cores (colar texto nos campos segue normal). */
function onPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || isTextTarget(event.target)) return;
  const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  tab.value = 'imagem';
  void loadImage(file, file.name && file.name !== 'image.png' ? file.name : 'Imagem colada');
}
function onDropFile(event: DragEvent): void {
  const file = Array.from(event.dataTransfer?.files ?? [])[0];
  if (!file) return;
  event.preventDefault();
  tab.value = 'imagem';
  void loadImage(file, file.name);
}
async function pasteButton(): Promise<void> {
  imageError.value = '';
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) { const blob = await item.getType(type); await loadImage(blob, 'Imagem colada'); return; }
    }
    imageError.value = 'A área de transferência não tem uma imagem.';
  } catch { imageError.value = 'O navegador não deixou ler a área de transferência. Clique na página e use Ctrl+V.'; }
}
/** Clicar na imagem copia a cor exata do ponto clicado para o editor. */
function pickFromImage(event: MouseEvent): void {
  const img = event.currentTarget as HTMLImageElement;
  if (!imageData || !imageW || !imageH) return;
  const r = img.getBoundingClientRect();
  const x = Math.min(imageW - 1, Math.max(0, Math.floor(((event.clientX - r.left) / r.width) * imageW)));
  const y = Math.min(imageH - 1, Math.max(0, Math.floor(((event.clientY - r.top) / r.height) * imageH)));
  const i = (y * imageW + x) * 4;
  if (imageData[i + 3]! < 8) { imageError.value = 'Esse ponto é transparente: não há cor para pegar.'; return; }
  imageError.value = '';
  useAsBase(toHex({ r: imageData[i]!, g: imageData[i + 1]!, b: imageData[i + 2]!, a: 1 }));
}
const dragOver = (event: DragEvent): void => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); };
onMounted(() => { window.addEventListener('paste', onPaste); window.addEventListener('dragover', dragOver); window.addEventListener('drop', onDropFile); });
onBeforeUnmount(() => { window.removeEventListener('paste', onPaste); window.removeEventListener('dragover', dragOver); window.removeEventListener('drop', onDropFile); });
watch(extractCount, runExtract);

// ---- paleta
const importText = ref('');
const importMsg = ref('');
function doImport(): void {
  const r = importFromText(state.value, importText.value);
  if (r.added === 0 && !r.skipped) { importMsg.value = 'Nenhuma cor encontrada no texto. Use códigos como #FF8800, rgb(255, 136, 0) ou hsl(32, 100%, 50%).'; return; }
  importMsg.value = '';
  set({ palette: r.state.palette });
  report(r);
  importText.value = '';
}
function rename(id: string, event: Event): void { set({ palette: renameSwatch(state.value, id, (event.target as HTMLInputElement).value).palette }); }
function move(id: string, d: -1 | 1): void { set({ palette: moveSwatch(state.value, id, d).palette }); }
function drop(id: string, label: string): void { set({ palette: removeSwatch(state.value, id).palette }); doc.say('Cor ' + label + ' removida.'); }
function clearPalette(): void { set({ palette: [] }); doc.say('Paleta esvaziada.'); }
const textOn = (hex: string): string => toHex(bestText(parseColor(hex) ?? baseRgb.value));

// ---- exportar
function exportAs(kind: 'css' | 'json' | 'txt' | 'svg'): void {
  const file = safeFileName(state.value.name, 'paleta');
  if (kind === 'css') downloadText(paletteCss(state.value), file + '.css', 'text/css;charset=utf-8');
  else if (kind === 'json') downloadText(paletteJson(state.value), file + '.json', 'application/json;charset=utf-8');
  else if (kind === 'svg') downloadText(paletteSvg(state.value), file + '.svg', 'image/svg+xml;charset=utf-8');
  else downloadText(paletteText(state.value), file + '.txt');
  doc.say('Paleta exportada em ' + kind.toUpperCase() + '.');
}
</script>

<template>
  <EditorShell v-model:tab="tab" app="colors" :doc="doc" :tabs="tabs" :history="false">
    <template #panel="{ tab: current }">
      <div v-if="current === 'cor'" class="ed-group">
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Seletor</span><input type="color" class="picker" :value="state.base" aria-label="Escolher a cor no seletor" data-testid="base-picker" @input="onPicker" /></label>
          <label class="ed-field grow"><span class="ed-label">Código da cor</span>
            <input v-model="hexDraft" class="inp mono" maxlength="60" spellcheck="false" autocomplete="off" aria-label="Código da cor" :aria-invalid="hexError ? 'true' : undefined" :aria-describedby="hexError ? 'hex-err' : undefined" data-testid="base-hex" @input="onHexInput" /></label>
        </div>
        <p v-if="hexError" id="hex-err" class="ed-error" role="alert" data-testid="hex-error">{{ hexError }}</p>
        <label class="ed-field"><span class="ed-label">Matiz: {{ Math.round(hsl.h) }}°</span><input type="range" min="0" max="360" step="1" :value="Math.round(hsl.h)" aria-label="Matiz" data-testid="slider-h" @input="setHsl('h', Number(($event.target as HTMLInputElement).value))" /></label>
        <label class="ed-field"><span class="ed-label">Saturação: {{ Math.round(hsl.s) }}%</span><input type="range" min="0" max="100" step="1" :value="Math.round(hsl.s)" aria-label="Saturação" data-testid="slider-s" @input="setHsl('s', Number(($event.target as HTMLInputElement).value))" /></label>
        <label class="ed-field"><span class="ed-label">Luminosidade: {{ Math.round(hsl.l) }}%</span><input type="range" min="0" max="100" step="1" :value="Math.round(hsl.l)" aria-label="Luminosidade" data-testid="slider-l" @input="setHsl('l', Number(($event.target as HTMLInputElement).value))" /></label>
        <div class="ed-row">
          <button type="button" class="btn btn-app" data-testid="add-base" @click="add([state.base])">Adicionar à paleta</button>
          <button v-if="hasEyeDropper" type="button" class="btn" data-testid="eyedropper" @click="pickFromScreen">Capturar da tela</button>
        </div>
        <p v-if="!hasEyeDropper" class="ed-hint">A captura de cor da tela depende do navegador (Chrome e Edge no computador). Aqui você pode usar o seletor ou digitar o código.</p>
      </div>

      <div v-else-if="current === 'harmonias'" class="ed-group">
        <label class="ed-field"><span class="ed-label">Tipo de harmonia</span>
          <select v-model="state.scheme" class="inp" data-testid="scheme-select"><option v-for="s in SCHEMES" :key="s.id" :value="s.id">{{ s.label }}</option></select></label>
        <p class="ed-hint">{{ schemeHelp }} Baseada em <code>{{ state.base }}</code>.</p>
        <ul class="chips" data-testid="harmony-list">
          <li v-for="(hex, i) in harmony" :key="hex + i">
            <button type="button" class="chip" :style="{ background: hex, color: textOn(hex) }" :aria-label="'Editar a cor ' + hex" @click="useAsBase(hex)">{{ hex }}</button>
          </li>
        </ul>
        <div class="ed-row"><button type="button" class="btn btn-app" data-testid="add-harmony" @click="add(harmony)">Adicionar todas à paleta</button></div>
      </div>

      <div v-else-if="current === 'contraste'" class="ed-group">
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Texto</span><span class="pair"><input type="color" class="picker" :value="state.fg" aria-label="Cor do texto no seletor" @input="pickPair('fg', $event)" /><input v-model="fgDraft" class="inp mono" maxlength="60" spellcheck="false" aria-label="Código da cor do texto" data-testid="contrast-fg" @input="onPair('fg')" /></span></label>
          <label class="ed-field"><span class="ed-label">Fundo</span><span class="pair"><input type="color" class="picker" :value="state.bg" aria-label="Cor do fundo no seletor" @input="pickPair('bg', $event)" /><input v-model="bgDraft" class="inp mono" maxlength="60" spellcheck="false" aria-label="Código da cor do fundo" data-testid="contrast-bg" @input="onPair('bg')" /></span></label>
        </div>
        <div class="ed-row">
          <button type="button" class="btn" data-testid="contrast-swap" @click="swapPair">Inverter</button>
          <button type="button" class="btn" data-testid="contrast-base-fg" @click="useBaseIn('fg')">Usar a cor atual no texto</button>
          <button type="button" class="btn" data-testid="contrast-base-bg" @click="useBaseIn('bg')">Usar a cor atual no fundo</button>
        </div>
        <p class="ratio" data-testid="contrast-ratio">Contraste {{ ratioText }}</p>
        <ul class="checks" data-testid="contrast-checks">
          <li v-for="c in checks" :key="c.id" :data-testid="'check-' + c.id" :data-ok="c.ok ? 'sim' : 'nao'"><span class="mark" aria-hidden="true">{{ c.ok ? '✓' : '✕' }}</span> {{ c.label }}: <strong>{{ c.ok ? 'passa' : 'não passa' }}</strong></li>
        </ul>
        <div v-if="suggestion" class="ed-row">
          <p class="ed-hint grow">Para passar em AA, o texto poderia ser <code>{{ suggestion }}</code>.</p>
          <button type="button" class="btn" data-testid="contrast-suggest" @click="applySuggestion">Aplicar sugestão</button>
        </div>
        <p v-else-if="!report2.aaNormal" class="ed-hint">Não há como chegar a 4,5 só ajustando a luminosidade do texto. Mude também o fundo.</p>
      </div>

      <div v-else-if="current === 'imagem'" class="ed-group">
        <label class="ed-field"><span class="ed-label">Imagem</span>
          <input type="file" class="inp" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="Escolher uma imagem para extrair cores" data-testid="image-input" @change="onImage" /></label>
        <div class="ed-row"><button type="button" class="btn" data-testid="paste-image" @click="pasteButton">Colar imagem da área de transferência</button></div>
        <label class="ed-field"><span class="ed-label">Quantidade de cores: {{ extractCount }}</span><input v-model.number="extractCount" type="range" min="2" max="12" step="1" aria-label="Quantidade de cores a extrair" data-testid="extract-count" /></label>
        <p v-if="imageError" class="ed-error" role="alert" data-testid="image-error">{{ imageError }}</p>
        <template v-if="imageUrl">
          <img :src="imageUrl" class="thumb pickable" :alt="'Imagem escolhida: ' + imageName + '. Clique para pegar a cor de um ponto.'" data-testid="image-preview" @click="pickFromImage" />
          <ul class="chips" data-testid="extracted-list">
            <li v-for="hex in extracted" :key="hex"><button type="button" class="chip" :style="{ background: hex, color: textOn(hex) }" :aria-label="'Editar a cor ' + hex" @click="useAsBase(hex)">{{ hex }}</button></li>
          </ul>
          <div class="ed-row"><button type="button" class="btn btn-app" :disabled="!extracted.length" data-testid="add-extracted" @click="add(extracted)">Adicionar todas à paleta</button></div>
        </template>
        <p v-else class="ed-hint">A imagem é lida só neste aparelho, nada é enviado. Escolha um arquivo, cole com Ctrl+V ou solte aqui. As cores dominantes são calculadas e você escolhe quais guardar; depois clique na imagem para pegar a cor exata de um ponto.</p>
      </div>

      <div v-else-if="current === 'paleta'" class="ed-group">
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!state.palette.length" data-testid="clear-palette" @click="clearPalette">Esvaziar paleta</button>
        </div>
        <ul v-if="state.palette.length" class="plist" data-testid="palette-list">
          <li v-for="(p, i) in state.palette" :key="p.id" :data-testid="'swatch-' + i">
            <button type="button" class="dot" :style="{ background: p.hex }" :aria-label="'Editar a cor ' + p.hex" @click="useAsBase(p.hex)" />
            <span class="pcode mono">{{ p.hex }}</span>
            <input class="inp pname" :value="p.name" maxlength="40" placeholder="Nome" :aria-label="'Nome da cor ' + p.hex" @change="rename(p.id, $event)" />
            <button type="button" class="btn" :disabled="i === 0" :aria-label="'Mover ' + p.hex + ' para cima'" @click="move(p.id, -1)">↑</button>
            <button type="button" class="btn" :disabled="i === state.palette.length - 1" :aria-label="'Mover ' + p.hex + ' para baixo'" @click="move(p.id, 1)">↓</button>
            <button type="button" class="btn" :aria-label="'Copiar ' + p.hex" @click="copy(p.hex)">Copiar</button>
            <button type="button" class="btn" :aria-label="'Remover ' + p.hex" :data-testid="'remove-' + i" @click="drop(p.id, p.hex)">Remover</button>
          </li>
        </ul>
        <p v-else class="ed-hint">A paleta está vazia. Adicione cores nas abas Cor, Harmonias ou Imagem, ou cole códigos abaixo.</p>
        <label class="ed-field"><span class="ed-label">Importar de um texto</span>
          <textarea v-model="importText" class="inp" rows="3" maxlength="20000" placeholder="#FF8800, rgb(0, 128, 0), hsl(240, 100%, 50%)" aria-label="Texto com códigos de cor" data-testid="import-text" /></label>
        <p v-if="importMsg" class="ed-error" role="alert" data-testid="import-error">{{ importMsg }}</p>
        <div class="ed-row"><button type="button" class="btn btn-app" :disabled="!importText.trim()" data-testid="import-run" @click="doImport">Importar cores</button></div>
      </div>

      <FileTab v-else :templates="colorsTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!state.palette.length" data-testid="export-css" @click="exportAs('css')">CSS (variáveis)</button>
        <button type="button" class="btn" :disabled="!state.palette.length" data-testid="export-json" @click="exportAs('json')">JSON</button>
        <button type="button" class="btn" :disabled="!state.palette.length" data-testid="export-svg" @click="exportAs('svg')">Imagem SVG</button>
        <button type="button" class="btn" :disabled="!state.palette.length" data-testid="export-txt" @click="exportAs('txt')">Texto (TXT)</button>
      </FileTab>
    </template>

    <div class="stage" data-testid="colors-stage">
      <section class="hero" :style="{ background: state.base, color: onBase }" aria-label="Cor atual">
        <strong class="hero-hex" data-testid="hero-hex">{{ toHex(baseRgb) }}</strong>
        <span>{{ cssHsl(baseRgb) }}</span>
      </section>
      <section aria-labelledby="values-h">
        <h2 id="values-h" class="sh">Valores</h2>
        <ul class="vals" data-testid="color-values">
          <li v-for="f in formats" :key="f.id">
            <span class="vl">{{ f.label }}</span><code class="vv" :data-testid="'value-' + f.id">{{ f.value }}</code>
            <button type="button" class="btn" :aria-label="'Copiar ' + f.label" :data-testid="'copy-' + f.id" @click="copy(f.value)">Copiar</button>
          </li>
        </ul>
      </section>
      <section aria-labelledby="pal-h">
        <h2 id="pal-h" class="sh">Paleta ({{ state.palette.length }}/{{ MAX_SWATCHES }})</h2>
        <ul v-if="state.palette.length" class="strip" data-testid="palette-strip">
          <li v-for="p in state.palette" :key="p.id"><button type="button" class="chip" :style="{ background: p.hex, color: textOn(p.hex) }" :aria-label="'Editar a cor ' + (p.name || p.hex)" @click="useAsBase(p.hex)">{{ p.name || p.hex }}</button></li>
        </ul>
        <p v-else class="ed-hint" data-testid="palette-empty">Nenhuma cor guardada ainda.</p>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.stage { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; width: min(100%, 640px); margin: 0 auto; padding: 14px max(14px, var(--sa-r)) 28px max(14px, var(--sa-l)); box-sizing: border-box; }
.hero { display: grid; gap: 4px; align-content: end; min-height: 160px; padding: 16px; border-radius: 20px; border: 1px solid var(--border); font-weight: 650; }
.hero-hex { font-size: clamp(28px, 8vw, 40px); font-weight: 800; letter-spacing: .02em; }
.sh { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.vals { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.vals li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 4px 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.vl { font-size: 12px; font-weight: 800; color: var(--muted); }
.vv { overflow-wrap: anywhere; font-size: 14px; }
.strip, .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-width: 44px; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid #00000033; font-size: 13px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.picker { width: 52px; height: 44px; padding: 2px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.pair { display: flex; gap: 8px; align-items: center; }
.grow { flex: 1 1 140px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ratio { margin: 0; font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.checks li { display: flex; gap: 8px; align-items: baseline; min-height: 28px; }
.mark { font-weight: 900; width: 1.2em; }
.checks li[data-ok="sim"] .mark { color: var(--ok); }
.checks li[data-ok="nao"] .mark { color: var(--danger); }
.pickable { cursor: crosshair; }
.thumb { max-width: 100%; max-height: 160px; border-radius: 12px; border: 1px solid var(--border); object-fit: contain; justify-self: start; }
.plist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 50vh; overflow: auto; }
.plist li { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.dot { width: 44px; height: 44px; border-radius: 10px; border: 1px solid #00000033; }
.pcode { font-size: 13px; font-weight: 700; }
.pname { flex: 1 1 100px; min-width: 0; }
textarea.inp { resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
