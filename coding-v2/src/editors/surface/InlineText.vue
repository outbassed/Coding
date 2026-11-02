<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { caretOffset, editableMode, leftOnPurpose, markIntentionalLeave, normalizeSurfaceText, pasteText, placeCaret, trackIntent } from './text';

/**
 * Texto editável direto na superfície (folha, cena, prévia). Segue o contrato de EDICAO-DIRETA.md:
 * o modelo do app é a fonte da verdade; aqui o navegador só cuida do cursor, da seleção e do teclado.
 */
const props = withDefaults(defineProps<{
  modelValue: string;
  /** Nome acessível do campo (leitores de tela). */
  label: string;
  multiline?: boolean;
  maxLength?: number;
  /** Aparece só enquanto o campo está vazio e com o foco. */
  placeholder?: string;
  /** `false`: fora da ordem do Tab (continua clicável). Em itens repetidos, só o primeiro entra no Tab. */
  tabbable?: boolean;
  /** Identifica este campo para devolver o foco se a folha for redesenhada. */
  editKey?: string;
  describedBy?: string;
}>(), { multiline: false, maxLength: 2000, placeholder: '', tabbable: true, editKey: '', describedBy: '' });
const emit = defineEmits<{
  'update:modelValue': [value: string];
  start: [];
  /** `settled`: a saída foi desejada. `false`: o campo perdeu o foco porque a folha foi redesenhada. */
  end: [info: { caret: number; settled: boolean }];
  undo: [];
  redo: [];
  /** Posição do cursor, para o app devolver o foco no mesmo ponto se a superfície for redesenhada. */
  caret: [offset: number];
}>();

const el = ref<HTMLElement | null>(null);
const hasText = ref(Boolean(props.modelValue));
let lastEmitted: string | null = null;
let startValue = props.modelValue;
let composing = false;
let lastCaret = 0;
let leaving = false;
let lastInputAt = 0;
const rules = (): { multiline: boolean; maxLength: number } => ({ multiline: props.multiline, maxLength: props.maxLength });

function read(): string {
  const node = el.value;
  return node ? normalizeSurfaceText(node.innerText ?? node.textContent ?? '', rules()) : '';
}
function write(value: string): void {
  const node = el.value;
  if (!node) return;
  node.textContent = value;
  hasText.value = value !== '';
  lastEmitted = null;
}
onMounted(() => {
  const node = el.value;
  if (!node) return;
  node.contentEditable = editableMode();
  node.setAttribute('autocorrect', 'off');
  node.setAttribute('autocapitalize', 'off');
  node.textContent = props.modelValue;
  hasText.value = props.modelValue !== '';
  trackIntent();
});
// Mudança vinda de fora (painel, desfazer/refazer, outra cópia do mesmo item). A que o próprio campo acabou de enviar não é reescrita:
// regravar o texto enquanto a pessoa digita moveria o cursor.
watch(() => props.modelValue, (value) => {
  if (value === lastEmitted) return;
  if (composing) return;
  if (read() === value) { hasText.value = value !== ''; return; }
  write(value);
});

function commitFromDom(): void {
  const node = el.value;
  if (!node || composing) return;
  const raw = node.innerText ?? node.textContent ?? '';
  const text = normalizeSurfaceText(raw, rules());
  hasText.value = text !== '';
  lastInputAt = performance.now();
  const caret = caretOffset(node);
  // O texto passou do limite de caracteres: o campo passa a mostrar o que o modelo vai guardar.
  if (normalizeSurfaceText(raw, { multiline: props.multiline, maxLength: Number.MAX_SAFE_INTEGER }) !== text) { write(text); placeCaret(node, Math.min(caret, text.length)); }
  lastCaret = Math.min(caret, text.length);
  emit('caret', lastCaret);
  if (text === lastEmitted || text === props.modelValue) return;
  lastEmitted = text;
  emit('update:modelValue', text);
}

function leave(): void { leaving = true; markIntentionalLeave(); el.value?.blur(); }
function cancel(): void {
  write(startValue);
  if (startValue !== props.modelValue) { lastEmitted = startValue; emit('update:modelValue', startValue); }
  leave();
}
function onFocus(): void {
  startValue = props.modelValue;
  leaving = false;
  lastCaret = el.value ? caretOffset(el.value) : 0;
  emit('start');
  window.setTimeout(() => el.value?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }), 280); // depois do teclado virtual
}
function onBlur(event: FocusEvent): void {
  const node = el.value;
  const caret = lastCaret;
  // Se o texto ficou diferente do que o modelo guarda (por exemplo, quebras no fim), o campo volta a mostrar o modelo.
  if (node && node.isConnected && read() !== props.modelValue) write(props.modelValue);
  const settled = leaving || event.relatedTarget !== null || leftOnPurpose() || performance.now() - lastInputAt > 600;
  leaving = false;
  emit('end', { caret, settled });
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
  if (event.key === 'Enter' && !event.isComposing) {
    if (!props.multiline || event.ctrlKey || event.metaKey) { event.preventDefault(); leave(); }
  }
}
function onBeforeInput(event: InputEvent): void {
  const type = event.inputType;
  if (type === 'historyUndo') { event.preventDefault(); emit('undo'); return; }
  if (type === 'historyRedo') { event.preventDefault(); emit('redo'); return; }
  if (type.startsWith('format') || type === 'insertFromDrop' || type === 'insertFromYank') { event.preventDefault(); return; }
  if (!props.multiline && (type === 'insertParagraph' || type === 'insertLineBreak')) { event.preventDefault(); leave(); }
}
function insertAtCursor(text: string): void {
  const node = el.value;
  const sel = window.getSelection();
  if (!node || !sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!node.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const piece = document.createTextNode(text);
  range.insertNode(piece);
  range.setStartAfter(piece);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  node.normalize();
  commitFromDom();
}
function onPaste(event: ClipboardEvent): void {
  event.preventDefault();
  const text = pasteText(event.clipboardData?.getData('text/plain') ?? '', props.multiline);
  if (text) insertAtCursor(text);
}
function onCaretMove(): void { if (el.value) { lastCaret = caretOffset(el.value); emit('caret', lastCaret); } }
function onCompositionEnd(): void { composing = false; commitFromDom(); }
onBeforeUnmount(() => { composing = false; });
</script>

<template>
  <span ref="el" class="inline-text" :class="{ empty: !hasText }" role="textbox" :aria-label="label" :aria-multiline="multiline ? 'true' : 'false'"
    :aria-describedby="describedBy || undefined" :tabindex="tabbable ? 0 : -1" :data-edit-key="editKey || undefined" :data-placeholder="placeholder" spellcheck="false"
    @focus="onFocus" @blur="onBlur" @input="commitFromDom" @keydown="onKeydown" @beforeinput="onBeforeInput" @paste="onPaste" @drop.prevent @dragover.prevent
    @keyup="onCaretMove" @pointerup="onCaretMove" @compositionstart="composing = true" @compositionend="onCompositionEnd"></span>
</template>

<style scoped>
.inline-text { cursor: text; outline: none; border-radius: .8mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; transition: box-shadow .12s; }
.inline-text:hover { box-shadow: 0 0 0 .9mm color-mix(in srgb, var(--accent, #2563eb) 32%, transparent); background: color-mix(in srgb, var(--accent, #2563eb) 7%, transparent); }
.inline-text:focus { box-shadow: 0 0 0 .9mm var(--accent, #2563eb); background: color-mix(in srgb, var(--accent, #2563eb) 9%, transparent); }
.inline-text.empty:focus::before { content: attr(data-placeholder); opacity: .5; font-weight: 400; font-style: italic; }
@media (prefers-reduced-motion: reduce) { .inline-text { transition: none; } }
@media print { .inline-text { box-shadow: none !important; background: none !important; } }
</style>
