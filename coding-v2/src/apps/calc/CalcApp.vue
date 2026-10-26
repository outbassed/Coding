<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { downloadBlob, downloadText, safeFileName } from '../../shared/files/download';
import { friendlyError } from '../../library/errors';
import { FUNCTION_NAMES, cellName, indexToCol, isError } from './formula';
import { applyColor, clearColors, deleteCols, deleteRows, display, effectiveColor, Evaluator, fillRange, insertCols, insertRows, key, MAX_SHEETS, parseKey, rangeName, renameSheet, sheetId, shownColors, sortRows, type Align, type Cell, type CellFormat, type StyleProp } from './model';
import { exportCsv, exportXlsx, importFile } from './io';
import { calcKind, calcTemplates } from './kind';

const doc = useDocument({ kind: calcKind, templates: calcTemplates, path: '/apps/planilhas/' });
const { state } = doc;
const tab = ref('inicio');
const tabs = [{ id: 'inicio', label: 'Início' }, { id: 'inserir', label: 'Linhas e abas' }, { id: 'formulas', label: 'Fórmulas' }, { id: 'arquivo', label: 'Arquivo' }];
const version = ref(0);
watch(state, () => { version.value++; }, { deep: true });
const evaluator = computed(() => { void version.value; return new Evaluator(state.value); });
const si = computed(() => Math.min(state.value.active, state.value.sheets.length - 1));
const sheet = computed(() => state.value.sheets[si.value]!);

// ---- seleção ----
const anchor = ref({ r: 0, c: 0 });
const focus = ref({ r: 0, c: 0 });
const range = computed(() => ({ r1: Math.min(anchor.value.r, focus.value.r), c1: Math.min(anchor.value.c, focus.value.c), r2: Math.max(anchor.value.r, focus.value.r), c2: Math.max(anchor.value.c, focus.value.c) }));
const inRange = (r: number, c: number) => r >= range.value.r1 && r <= range.value.r2 && c >= range.value.c1 && c <= range.value.c2;
const activeCell = computed<Cell | undefined>(() => sheet.value.cells[key(focus.value.r, focus.value.c)]);
const editing = ref(false);
const draft = ref('');
watch([focus, si], () => { if (!editing.value) draft.value = activeCell.value?.v ?? ''; }, { immediate: true });
watch(() => activeCell.value?.v, (v) => { if (!editing.value) draft.value = v ?? ''; });
watch(sheet, (s) => { if (focus.value.r >= s.rows || focus.value.c >= s.cols) select(0, 0); });

function clampPos(r: number, c: number) { return { r: Math.max(0, Math.min(sheet.value.rows - 1, r)), c: Math.max(0, Math.min(sheet.value.cols - 1, c)) }; }
function select(r: number, c: number, extend = false): void {
  const p = clampPos(r, c);
  focus.value = p;
  if (!extend) anchor.value = p;
  void nextTick(() => scrollIntoView(p.r, p.c));
}
/** Seleção de colunas/linhas inteiras: a célula ativa fica no topo/à esquerda, como nas planilhas de mercado. */
function selectColumns(c: number, extend = false): void {
  if (editing.value) commit();
  const from = extend ? Math.min(sheet.value.cols - 1, Math.max(0, anchor.value.c)) : c;
  anchor.value = { r: sheet.value.rows - 1, c: from };
  focus.value = { r: 0, c };
  void nextTick(() => scrollIntoView(0, c));
}
function selectRows(r: number, extend = false): void {
  if (editing.value) commit();
  const from = extend ? Math.min(sheet.value.rows - 1, Math.max(0, anchor.value.r)) : r;
  anchor.value = { r: from, c: sheet.value.cols - 1 };
  focus.value = { r, c: 0 };
}
function selectAll(): void {
  if (editing.value) commit();
  anchor.value = { r: sheet.value.rows - 1, c: sheet.value.cols - 1 };
  focus.value = { r: 0, c: 0 };
  void nextTick(() => tableEl.value?.focus({ preventScroll: true }));
}
function setCell(r: number, c: number, patch: Partial<Cell>): void {
  const k = key(r, c);
  const current = sheet.value.cells[k] ?? { v: '' };
  const next: Cell = { ...current, ...patch };
  if (!next.v && !next.f && !next.b && !next.a && !next.fg && !next.bg) delete sheet.value.cells[k];
  else sheet.value.cells[k] = next;
}
function commit(move: 'down' | 'right' | 'none' = 'none'): void {
  if (editing.value || draft.value !== (activeCell.value?.v ?? '')) {
    doc.setChangeKey('');
    setCell(focus.value.r, focus.value.c, { v: draft.value.slice(0, 5000) });
  }
  editing.value = false;
  if (move === 'down') select(focus.value.r + 1, focus.value.c);
  else if (move === 'right') select(focus.value.r, focus.value.c + 1);
  void nextTick(() => tableEl.value?.focus({ preventScroll: true }));
}
function cancel(): void { editing.value = false; draft.value = activeCell.value?.v ?? ''; void nextTick(() => tableEl.value?.focus({ preventScroll: true })); }
function startEdit(initial?: string): void {
  editing.value = true;
  if (initial !== undefined) draft.value = initial;
  void nextTick(() => { const el = document.getElementById('cell-editor') as HTMLInputElement | null; el?.focus(); if (el) el.setSelectionRange(el.value.length, el.value.length); });
}
function clearRange(): void {
  const { r1, c1, r2, c2 } = range.value;
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (sheet.value.cells[key(r, c)]) setCell(r, c, { v: '' });
  draft.value = '';
}
function onGridKey(event: KeyboardEvent): void {
  if (editing.value) return;
  const { r, c } = focus.value;
  const ext = event.shiftKey;
  const mod = event.ctrlKey || event.metaKey;
  switch (event.key) {
    case 'ArrowUp': event.preventDefault(); select(r - 1, c, ext); return;
    case 'ArrowDown': event.preventDefault(); select(r + 1, c, ext); return;
    case 'ArrowLeft': event.preventDefault(); select(r, c - 1, ext); return;
    case 'ArrowRight': event.preventDefault(); select(r, c + 1, ext); return;
    case 'Tab': event.preventDefault(); select(r, c + (ext ? -1 : 1)); return;
    case 'Enter': event.preventDefault(); if (ext) select(r - 1, c); else startEdit(); return;
    case 'F2': event.preventDefault(); startEdit(); return;
    case 'Delete': case 'Backspace': event.preventDefault(); clearRange(); return;
    case 'Home': event.preventDefault(); select(mod ? 0 : r, 0, ext); return;
    case 'End': event.preventDefault(); select(r, sheet.value.cols - 1, ext); return;
  }
  if (mod && event.key === ' ') { event.preventDefault(); selectColumns(c); return; }
  if (!mod && ext && event.key === ' ') { event.preventDefault(); selectRows(r); return; }
  if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return; }
  if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleBold(); return; }
  if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); fill('down'); return; }
  if (!mod && !event.altKey && event.key.length === 1) { event.preventDefault(); startEdit(event.key); }
}
function onEditorKey(event: KeyboardEvent): void {
  if (event.key === 'Enter') { event.preventDefault(); commit('down'); }
  else if (event.key === 'Tab') { event.preventDefault(); commit('right'); }
  else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
}
let dragging = false;
function onCellDown(event: PointerEvent, r: number, c: number): void {
  if (editing.value) commit();
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  select(r, c, event.shiftKey);
  dragging = event.pointerType === 'mouse';
}
function onCellEnter(r: number, c: number): void { if (dragging) select(r, c, true); }
const stopDrag = () => { dragging = false; };
onMounted(() => window.addEventListener('pointerup', stopDrag));
onBeforeUnmount(() => window.removeEventListener('pointerup', stopDrag));

// ---- grade com janela de linhas (desempenho em planilhas grandes) ----
const ROW_H = 32;
const gridEl = ref<HTMLElement | null>(null);
const tableEl = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewH = ref(600);
const firstRow = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - 10));
const lastRow = computed(() => Math.min(sheet.value.rows, Math.ceil((scrollTop.value + viewH.value) / ROW_H) + 10));
const rowsShown = computed(() => Array.from({ length: Math.max(0, lastRow.value - firstRow.value) }, (_, i) => firstRow.value + i));
const colsShown = computed(() => Array.from({ length: sheet.value.cols }, (_, i) => i));
function onScroll(): void { const el = gridEl.value; if (!el) return; scrollTop.value = el.scrollTop; viewH.value = el.clientHeight; }
let resize: ResizeObserver | undefined;
onMounted(() => { onScroll(); if (typeof ResizeObserver !== 'undefined' && gridEl.value) { resize = new ResizeObserver(onScroll); resize.observe(gridEl.value); } });
onBeforeUnmount(() => resize?.disconnect());
const width = (c: number) => sheet.value.widths[String(c)] ?? 100;
function scrollIntoView(r: number, c: number): void {
  const el = gridEl.value; if (!el) return;
  const top = (r + 1) * ROW_H, bottom = top + ROW_H;
  if (top < el.scrollTop + ROW_H) el.scrollTop = Math.max(0, top - ROW_H);
  else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  let left = 48; for (let i = 0; i < c; i++) left += width(i);
  const right = left + width(c);
  if (left < el.scrollLeft + 48) el.scrollLeft = Math.max(0, left - 48);
  else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
}
function shown(r: number, c: number): string { void version.value; return display(evaluator.value.value(si.value, r, c), sheet.value.cells[key(r, c)]?.f); }
function isNum(r: number, c: number): boolean { void version.value; const v = evaluator.value.value(si.value, r, c); return typeof v === 'number'; }
function isErr(r: number, c: number): boolean { void version.value; return isError(evaluator.value.value(si.value, r, c)); }
function cellAlign(r: number, c: number): string { const a = sheet.value.cells[key(r, c)]?.a; return a || (isNum(r, c) || isErr(r, c) ? 'right' : 'left'); }
const activeName = computed(() => rangeName(range.value.r1, range.value.c1, range.value.r2, range.value.c2));
const activeError = computed(() => { void version.value; return evaluator.value.syntaxError(si.value, focus.value.r, focus.value.c); });
const selectionStats = computed(() => {
  void version.value;
  const { r1, c1, r2, c2 } = range.value;
  if (r1 === r2 && c1 === c2) return '';
  let sum = 0, count = 0;
  for (let r = r1; r <= r2 && count < 50000; r++) for (let c = c1; c <= c2; c++) { const v = evaluator.value.value(si.value, r, c); if (typeof v === 'number') { sum += v; count++; } }
  return count ? 'Soma ' + display(sum, 'general') + ' · Média ' + display(sum / count, 'general') + ' · ' + count + ' números' : '';
});

// ---- formatação ----
function eachInRange(fn: (r: number, c: number) => void): void { const { r1, c1, r2, c2 } = range.value; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) fn(r, c); }
function setFormat(f: CellFormat): void { eachInRange((r, c) => setCell(r, c, { f: f === 'general' ? undefined : f })); doc.say('Formato aplicado: ' + formatNames[f] + '.'); }
const allBold = computed(() => { let all = true; eachInRange((r, c) => { if (!sheet.value.cells[key(r, c)]?.b) all = false; }); return all; });
function toggleBold(): void { const on = !allBold.value; eachInRange((r, c) => setCell(r, c, { b: on || undefined })); }
function setAlign(a: Align): void { eachInRange((r, c) => setCell(r, c, { a: a || undefined })); }
function clearFormats(): void {
  const { r1, c1, r2, c2 } = range.value;
  // só as células que existem (uma coluna inteira não vira milhares de células vazias)
  for (const k of Object.keys(sheet.value.cells)) {
    const [r, c] = parseKey(k);
    if (r >= r1 && r <= r2 && c >= c1 && c <= c2) setCell(r, c, { f: undefined, b: undefined, a: undefined });
  }
  clearColors(sheet.value, range.value);
  doc.say('Formatação removida da seleção.');
}

// ---- cores de fonte e de preenchimento ----
const PALETTE: { name: string; hex: string }[] = [
  { name: 'Preto', hex: '#000000' }, { name: 'Branco', hex: '#ffffff' }, { name: 'Cinza', hex: '#a6a6a6' },
  { name: 'Vermelho', hex: '#c00000' }, { name: 'Laranja', hex: '#ed7d31' }, { name: 'Amarelo', hex: '#ffd966' },
  { name: 'Verde', hex: '#70ad47' }, { name: 'Azul', hex: '#4472c4' }, { name: 'Roxo', hex: '#7030a0' }, { name: 'Rosa', hex: '#ff99cc' }
];
const propNames: Record<StyleProp, string> = { fg: 'Cor da fonte', bg: 'Preenchimento' };
function colorOf(prop: StyleProp): string { return effectiveColor(sheet.value, focus.value.r, focus.value.c, prop) ?? (prop === 'fg' ? '#000000' : '#ffffff'); }
function paint(prop: StyleProp, color: string | null): void {
  const n = applyColor(sheet.value, range.value, prop, color);
  if (!n) return;
  const whole = n === range.value.c2 - range.value.c1 + 1 && range.value.r1 === 0 && range.value.r2 === sheet.value.rows - 1;
  doc.say(propNames[prop] + (color ? ' aplicada' : ' removida') + (whole ? ' em ' + n + (n === 1 ? ' coluna inteira.' : ' colunas inteiras.') : ' em ' + n + (n === 1 ? ' célula.' : ' células.')));
}
function cellStyle(r: number, c: number): Record<string, string> {
  const colors = shownColors(sheet.value, r, c);
  const out: Record<string, string> = { textAlign: cellAlign(r, c) };
  if (colors.bg) out['--cell-bg'] = colors.bg;
  if (colors.fg) out['--cell-fg'] = colors.fg;
  return out;
}
function printStyle(r: number, c: number): Record<string, string> {
  const colors = shownColors(sheet.value, r, c);
  return { textAlign: cellAlign(r, c), fontWeight: sheet.value.cells[key(r, c)]?.b ? '700' : '400', ...(colors.bg ? { backgroundColor: colors.bg } : {}), ...(colors.fg ? { color: colors.fg } : {}) };
}
const formatNames: Record<CellFormat, string> = { general: 'Geral', number: 'Número (2 casas)', integer: 'Inteiro', currency: 'Moeda (R$)', percent: 'Porcentagem', text: 'Texto' };
const currentFormat = computed<CellFormat>(() => activeCell.value?.f ?? 'general');
const colWidth = computed({ get: () => width(focus.value.c), set: (w: number) => { if (Number.isFinite(w)) sheet.value.widths[String(focus.value.c)] = Math.min(600, Math.max(40, Math.round(w))); } });

// ---- preencher e classificar ----
function fill(dir: 'down' | 'right'): void {
  const { r1, c1, r2, c2 } = range.value;
  if ((dir === 'down' && r1 === r2) || (dir === 'right' && c1 === c2)) { doc.say('Selecione mais de uma ' + (dir === 'down' ? 'linha' : 'coluna') + ' para preencher.'); return; }
  const n = fillRange(state.value, si.value, r1, c1, r2, c2, dir);
  doc.say(n + ' célula(s) preenchida(s).');
}
function sort(desc: boolean): void {
  let { r1, r2 } = range.value;
  if (r1 === r2) {
    // sem seleção de várias linhas: ordena tudo abaixo do cabeçalho até a última linha usada
    let last = 0; for (const [k, cell] of Object.entries(sheet.value.cells)) if (cell.v) last = Math.max(last, Number(k.split(':')[0]));
    r1 = 1; r2 = last;
  }
  if (r2 <= r1) { doc.say('Nada para classificar.'); return; }
  sortRows(state.value, si.value, r1, r2, focus.value.c, desc);
  doc.say('Linhas ' + (r1 + 1) + ' a ' + (r2 + 1) + ' classificadas pela coluna ' + indexToCol(focus.value.c) + (desc ? ' (Z→A).' : ' (A→Z).'));
}

// ---- linhas, colunas e abas ----
function rowsOp(op: 'above' | 'below' | 'delete'): void {
  const { r1, r2 } = range.value; const n = r2 - r1 + 1;
  const ok = op === 'delete' ? deleteRows(state.value, si.value, r1, n) : insertRows(state.value, si.value, op === 'above' ? r1 : r2 + 1, n);
  doc.say(ok ? (op === 'delete' ? n + ' linha(s) excluída(s).' : n + ' linha(s) inserida(s).') : 'Limite de linhas atingido.');
  if (ok && op === 'delete') select(Math.min(r1, sheet.value.rows - 1), focus.value.c);
}
function colsOp(op: 'left' | 'right' | 'delete'): void {
  const { c1, c2 } = range.value; const n = c2 - c1 + 1;
  const ok = op === 'delete' ? deleteCols(state.value, si.value, c1, n) : insertCols(state.value, si.value, op === 'left' ? c1 : c2 + 1, n);
  doc.say(ok ? (op === 'delete' ? n + ' coluna(s) excluída(s).' : n + ' coluna(s) inserida(s).') : 'Limite de colunas atingido.');
  if (ok && op === 'delete') select(focus.value.r, Math.min(c1, sheet.value.cols - 1));
}
function addSheet(): void {
  if (state.value.sheets.length >= MAX_SHEETS) { doc.say('Limite de ' + MAX_SHEETS + ' abas.'); return; }
  let n = state.value.sheets.length + 1; while (state.value.sheets.some((s) => s.name === 'Planilha ' + n)) n++;
  state.value.sheets.push({ id: sheetId(), name: 'Planilha ' + n, rows: 50, cols: 12, cells: {}, widths: {} });
  state.value.active = state.value.sheets.length - 1; select(0, 0);
}
function duplicateSheet(): void {
  if (state.value.sheets.length >= MAX_SHEETS) { doc.say('Limite de ' + MAX_SHEETS + ' abas.'); return; }
  const copy = JSON.parse(JSON.stringify(sheet.value)) as typeof sheet.value;
  copy.id = sheetId(); let name = (copy.name.slice(0, 24) + ' (2)'); let n = 3; while (state.value.sheets.some((s) => s.name === name)) name = copy.name.slice(0, 24) + ' (' + n++ + ')';
  copy.name = name;
  state.value.sheets.splice(si.value + 1, 0, copy); state.value.active = si.value + 1;
}
function removeSheet(): void {
  if (state.value.sheets.length <= 1) { doc.say('A planilha precisa de pelo menos uma aba.'); return; }
  if (!confirm('Excluir a aba “' + sheet.value.name + '”? Fórmulas de outras abas que apontam para ela mostrarão #REF!.')) return;
  state.value.sheets.splice(si.value, 1); state.value.active = Math.max(0, si.value - 1); select(0, 0);
}
const sheetName = ref('');
watch(sheet, (s) => { sheetName.value = s.name; }, { immediate: true });
const renameError = ref('');
function applyRename(): void { const e = renameSheet(state.value, si.value, sheetName.value); renameError.value = e ?? ''; if (!e) doc.say('Aba renomeada.'); }
function pickSheet(i: number): void { if (editing.value) commit(); state.value.active = i; select(0, 0); }

// ---- fórmulas ----
function insertFunction(name: string): void {
  const { r1, c1, r2, c2 } = range.value;
  const many = r1 !== r2 || c1 !== c2;
  if (many && ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO', 'CONT.NÚM'].includes(name)) {
    // como a "Soma automática": resultado logo abaixo (coluna única) ou à direita (linha única)
    const target = c1 === c2 ? { r: r2 + 1, c: c1 } : r1 === r2 ? { r: r1, c: c2 + 1 } : { r: r2 + 1, c: c1 };
    if (target.r >= sheet.value.rows) insertRows(state.value, si.value, sheet.value.rows, 1);
    if (target.c >= sheet.value.cols) insertCols(state.value, si.value, sheet.value.cols, 1);
    setCell(target.r, target.c, { v: '=' + name + '(' + rangeName(r1, c1, r2, c2) + ')' });
    select(target.r, target.c);
    doc.say('Fórmula ' + name + ' inserida em ' + cellName(target.r, target.c) + '.');
    return;
  }
  startEdit((draft.value.startsWith('=') ? draft.value : '=') + name + '(');
}

// ---- área de transferência ----
function onCopy(event: ClipboardEvent): void {
  if (editing.value) return;
  const { r1, c1, r2, c2 } = range.value;
  const lines: string[] = [];
  for (let r = r1; r <= r2; r++) { const row: string[] = []; for (let c = c1; c <= c2; c++) row.push(shown(r, c)); lines.push(row.join('\t')); }
  event.clipboardData?.setData('text/plain', lines.join('\n'));
  event.preventDefault(); doc.say('Copiado: ' + activeName.value + '.');
}
function onPaste(event: ClipboardEvent): void {
  if (editing.value) return;
  const text = event.clipboardData?.getData('text/plain'); if (!text) return;
  event.preventDefault();
  const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
  const { r, c } = focus.value;
  let skipped = false;
  rows.forEach((row, i) => row.forEach((v, j) => { if (r + i < sheet.value.rows && c + j < sheet.value.cols) setCell(r + i, c + j, { v: v.slice(0, 5000) }); else skipped = true; }));
  focus.value = clampPos(r + rows.length - 1, c + Math.max(...rows.map((x) => x.length)) - 1);
  doc.say(skipped ? 'Colado; parte ficou fora da área da aba.' : 'Colado.');
}

// ---- menu contextual da grade (mesma seleção usada por teclado e painel) ----
function onGridContextMenu(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const col = target.closest<HTMLElement>('[data-col]');
  const row = target.closest<HTMLElement>('[data-row]');
  const cell = target.closest<HTMLElement>('[data-cell]');
  if (col?.dataset.col) {
    const c = indexFromLetter(col.dataset.col);
    if (c >= 0) selectColumns(c);
  } else if (row?.dataset.row) {
    selectRows(Number(row.dataset.row) - 1);
  } else if (cell?.dataset.cell) {
    const match = /^([A-Z]+)([0-9]+)$/.exec(cell.dataset.cell);
    if (match) {
      const c = indexFromLetter(match[1]!);
      const r = Number(match[2]!) - 1;
      if (c >= 0 && !inRange(r, c)) select(r, c);
    }
  }
}
function indexFromLetter(label: string): number {
  let value = 0;
  for (const letter of label) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}
function selectionTsv(): string {
  const { r1, c1, r2, c2 } = range.value;
  const lines: string[] = [];
  for (let r = r1; r <= r2; r++) {
    const cells: string[] = [];
    for (let c = c1; c <= c2; c++) cells.push(sheet.value.cells[key(r, c)]?.v ?? '');
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}
async function copySelection(): Promise<boolean> {
  if (editing.value) commit();
  const text = selectionTsv();
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(temp);
      temp.select();
      const ok = document.execCommand('copy');
      temp.remove();
      if (!ok) throw new Error('clipboard');
    }
    doc.say('Copiado: ' + activeName.value + '.');
    return true;
  } catch {
    doc.say('O navegador bloqueou a cópia. Selecione a grade e pressione Ctrl+C.');
    return false;
  }
}
async function pasteSelection(): Promise<void> {
  if (editing.value) commit();
  try {
    if (!navigator.clipboard?.readText) throw new Error('clipboard');
    const text = await navigator.clipboard.readText();
    if (!text) { doc.say('A área de transferência está vazia.'); return; }
    pasteTsv(text);
  } catch { doc.say('O navegador bloqueou o acesso. Selecione a grade e pressione Ctrl+V.'); }
}
function pasteTsv(text: string): void {
  const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
  const { r, c } = focus.value;
  let skipped = false;
  for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines[i]!.length; j++) {
    if (r + i >= sheet.value.rows || c + j >= sheet.value.cols) { skipped = true; continue; }
    setCell(r + i, c + j, { v: lines[i]![j]!.slice(0, 5000) });
  }
  doc.say(skipped ? 'Colado parcialmente: ultrapassou o tamanho da aba.' : 'Dados colados.');
}
function duplicateSelectionAxis(axis: 'column' | 'row'): void {
  const { r1, r2, c1, c2 } = range.value;
  if (axis === 'column') {
    const count = c2 - c1 + 1;
    const snapshots = Array.from({ length: count }, (_, n) =>
      Array.from({ length: sheet.value.rows }, (_, r) => sheet.value.cells[key(r, c1 + n)] ? { ...sheet.value.cells[key(r, c1 + n)]! } : null));
    if (!insertCols(state.value, si.value, c2 + 1, count)) { doc.say('Não há espaço para duplicar colunas.'); return; }
    snapshots.forEach((column, n) => column.forEach((cell, r) => { if (cell) sheet.value.cells[key(r, c2 + 1 + n)] = cell; }));
    selectColumns(c2 + 1);
    doc.say(count + ' coluna(s) duplicada(s).');
  } else {
    const count = r2 - r1 + 1;
    const snapshots = Array.from({ length: count }, (_, n) =>
      Array.from({ length: sheet.value.cols }, (_, c) => sheet.value.cells[key(r1 + n, c)] ? { ...sheet.value.cells[key(r1 + n, c)]! } : null));
    if (!insertRows(state.value, si.value, r2 + 1, count)) { doc.say('Não há espaço para duplicar linhas.'); return; }
    snapshots.forEach((row, n) => row.forEach((cell, c) => { if (cell) sheet.value.cells[key(r2 + 1 + n, c)] = cell; }));
    selectRows(r2 + 1);
    doc.say(count + ' linha(s) duplicada(s).');
  }
}
async function sheetContextAction(event: Event): Promise<void> {
  const detail = (event as CustomEvent<{ command: string }>).detail;
  if (!detail) return;
  switch (detail.command) {
    case 'copy': await copySelection(); break;
    case 'cut': if (await copySelection()) clearRange(); break;
    case 'paste': await pasteSelection(); break;
    case 'duplicate-column': duplicateSelectionAxis('column'); break;
    case 'duplicate-row': duplicateSelectionAxis('row'); break;
    case 'insert-column-left': colsOp('left'); break;
    case 'insert-column-right': colsOp('right'); break;
    case 'delete-column': if (confirm('Excluir a(s) coluna(s) selecionada(s)?')) colsOp('delete'); break;
    case 'insert-row-above': rowsOp('above'); break;
    case 'insert-row-below': rowsOp('below'); break;
    case 'delete-row': if (confirm('Excluir a(s) linha(s) selecionada(s)?')) rowsOp('delete'); break;
    case 'clear': clearRange(); doc.say('Conteúdo limpo.'); break;
    case 'format': break;
  }
}
onMounted(() => document.addEventListener('coding:sheet-context-action', sheetContextAction));
onBeforeUnmount(() => document.removeEventListener('coding:sheet-context-action', sheetContextAction));

// ---- arquivo ----
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const fileMessage = ref('');
async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  busy.value = true; fileMessage.value = '';
  try {
    const r = await importFile(file, state.value);
    fileMessage.value = r.added ? r.added + ' aba(s) importada(s) de “' + file.name + '”' + (r.truncated ? ' (parte do conteúdo passou do limite e ficou de fora).' : '.') : 'Nada foi importado: limite de abas atingido.';
    select(0, 0);
  } catch (e) { fileMessage.value = 'Não foi possível importar: ' + friendlyError(e); }
  finally { busy.value = false; doc.say(fileMessage.value); }
}
async function onExportXlsx(): Promise<void> {
  busy.value = true;
  try { const bytes = await exportXlsx(state.value); downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeFileName(state.value.name, 'planilha') + '.xlsx'); doc.say('Arquivo XLSX gerado com ' + state.value.sheets.length + ' aba(s).'); }
  catch (e) { doc.say('Não foi possível gerar o XLSX: ' + friendlyError(e)); }
  finally { busy.value = false; }
}
function printSheet(): void { window.print(); }
function onExportCsv(): void { downloadText(exportCsv(state.value, si.value), safeFileName(state.value.name + ' - ' + sheet.value.name, 'planilha') + '.csv', 'text/csv;charset=utf-8'); doc.say('CSV da aba “' + sheet.value.name + '” exportado.'); }
const printRange = computed(() => {
  let rows = 0, cols = 0;
  for (const [k, cell] of Object.entries(sheet.value.cells)) if (cell.v) { const [r, c] = k.split(':').map(Number); rows = Math.max(rows, r! + 1); cols = Math.max(cols, c! + 1); }
  return { rows: Array.from({ length: rows }, (_, i) => i), cols: Array.from({ length: cols }, (_, i) => i) };
});
</script>

<template>
  <EditorShell v-model:tab="tab" app="calc" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'inicio'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Formato</span>
          <select class="inp" :value="currentFormat" data-testid="cell-format" @change="setFormat(($event.target as HTMLSelectElement).value as CellFormat)"><option v-for="(label, f) in formatNames" :key="f" :value="f">{{ label }}</option></select></label>
        <div class="ed-field"><span class="ed-label">Estilo</span>
          <div class="seg" role="group" aria-label="Estilo e alinhamento">
            <button type="button" class="ib" :aria-pressed="allBold" aria-label="Negrito" title="Negrito (Ctrl+B)" data-testid="bold" @click="toggleBold"><b>N</b></button>
            <button type="button" class="ib" :aria-pressed="activeCell?.a === 'left'" aria-label="Alinhar à esquerda" @click="setAlign('left')">⯇</button>
            <button type="button" class="ib" :aria-pressed="activeCell?.a === 'center'" aria-label="Centralizar" @click="setAlign('center')">≡</button>
            <button type="button" class="ib" :aria-pressed="activeCell?.a === 'right'" aria-label="Alinhar à direita" @click="setAlign('right')">⯈</button>
          </div></div>
        <div v-for="prop in (['fg', 'bg'] as StyleProp[])" :key="prop" class="ed-field" role="group" :aria-label="propNames[prop]" :data-testid="prop + '-group'">
          <span class="ed-label">{{ propNames[prop] }}</span>
          <div class="swatches">
            <button v-for="p in PALETTE" :key="p.hex" type="button" class="sw" :style="{ background: p.hex }" :aria-label="propNames[prop] + ': ' + p.name" :title="p.name"
              :data-testid="prop + '-' + p.hex.slice(1)" @click="paint(prop, p.hex)"></button>
            <label class="sw-custom"><span class="sr-only">{{ propNames[prop] }} personalizada</span>
              <input type="color" :value="colorOf(prop)" :data-testid="prop + '-custom'" @change="paint(prop, ($event.target as HTMLInputElement).value)" /></label>
            <button type="button" class="btn sw-none" :data-testid="prop + '-none'" @click="paint(prop, null)">Sem cor</button>
          </div>
        </div>
        <div class="ed-field"><span class="ed-label">Selecionar</span>
          <div class="seg" role="group" aria-label="Selecionar">
            <button type="button" class="btn" data-testid="select-column" title="Ctrl+Espaço" @click="selectColumns(focus.c)">Coluna</button>
            <button type="button" class="btn" data-testid="select-row" title="Shift+Espaço" @click="selectRows(focus.r)">Linha</button>
            <button type="button" class="btn" data-testid="select-all" title="Ctrl+A" @click="selectAll">Tudo</button>
          </div></div>
        <label class="ed-field"><span class="ed-label">Largura da coluna {{ indexToCol(focus.c) }} (px)</span><input v-model.number="colWidth" class="inp inp-num" type="number" min="40" max="600" step="10" /></label>
        <button type="button" class="btn" data-testid="fill-down" title="Ctrl+D" @click="fill('down')">Preencher para baixo</button>
        <button type="button" class="btn" @click="fill('right')">Preencher à direita</button>
        <button type="button" class="btn" data-testid="sort-asc" @click="sort(false)">Classificar A→Z</button>
        <button type="button" class="btn" @click="sort(true)">Classificar Z→A</button>
        <button type="button" class="btn" @click="clearRange">Limpar conteúdo</button>
        <button type="button" class="btn" @click="clearFormats">Limpar formatação</button>
      </div>
      <div v-else-if="current === 'inserir'" class="grid-ops">
        <div class="ed-row">
          <button type="button" class="btn" data-testid="row-above" @click="rowsOp('above')">Linha acima</button>
          <button type="button" class="btn" data-testid="row-below" @click="rowsOp('below')">Linha abaixo</button>
          <button type="button" class="btn" data-testid="row-delete" @click="rowsOp('delete')">Excluir linha(s)</button>
          <button type="button" class="btn" @click="colsOp('left')">Coluna à esquerda</button>
          <button type="button" class="btn" @click="colsOp('right')">Coluna à direita</button>
          <button type="button" class="btn" data-testid="col-delete" @click="colsOp('delete')">Excluir coluna(s)</button>
        </div>
        <div class="ed-row">
          <label class="ed-field"><span class="ed-label">Nome da aba</span><input v-model="sheetName" class="inp" maxlength="31" data-testid="sheet-name" @keydown.enter="applyRename" /></label>
          <button type="button" class="btn" data-testid="rename-sheet" @click="applyRename">Renomear</button>
          <button type="button" class="btn" data-testid="add-sheet" @click="addSheet">Nova aba</button>
          <button type="button" class="btn" @click="duplicateSheet">Duplicar aba</button>
          <button type="button" class="btn" @click="removeSheet">Excluir aba</button>
        </div>
        <p v-if="renameError" class="ed-error" role="alert">{{ renameError }}</p>
      </div>
      <div v-else-if="current === 'formulas'" class="ed-group">
        <div class="ed-row">
          <button v-for="f in ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO', 'CONT.NÚM', 'SE', 'ARRED', 'SOMASE']" :key="f" type="button" class="btn" :data-fn="f" @click="insertFunction(f)">{{ f }}</button>
        </div>
        <p class="ed-hint">Selecione um intervalo e toque em SOMA, MÉDIA, MÍNIMO, MÁXIMO ou CONT.NÚM para pôr o resultado logo abaixo. Também vale digitar, por exemplo, <code>=SOMA(B2:B8)</code>, <code>=B2*C2</code> ou <code>='Outra aba'!A1</code>. Funções: {{ FUNCTION_NAMES.join(', ') }}. Nomes em inglês (SUM, AVERAGE…) também funcionam.</p>
      </div>
      <FileTab v-else :templates="calcTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="busy" data-testid="import-file" @click="fileInput?.click()">Importar CSV ou XLSX</button>
        <input ref="fileInput" type="file" class="sr-only" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Escolher planilha CSV ou XLSX para importar" data-testid="import-input" @change="onImport" />
        <button type="button" class="btn" :disabled="busy" data-testid="export-xlsx" @click="onExportXlsx">Baixar XLSX</button>
        <button type="button" class="btn" data-testid="export-csv" @click="onExportCsv">Baixar CSV (aba atual)</button>
        <button type="button" class="btn" @click="printSheet">Imprimir aba</button>
        <template #after><p v-if="fileMessage" class="ed-hint" role="status" data-testid="file-message">{{ fileMessage }}</p></template>
      </FileTab>
    </template>

    <template #inspector>
      <div class="calc-properties" data-testid="calc-properties">
        <p class="ed-hint">Seleção ativa: <strong>{{ activeName }}</strong></p>
        <label class="ed-field"><span class="ed-label">Formato da seleção</span>
          <select class="inp" :value="currentFormat" aria-label="Formato nas propriedades" @change="setFormat(($event.target as HTMLSelectElement).value as CellFormat)">
            <option v-for="(label, f) in formatNames" :key="f" :value="f">{{ label }}</option>
          </select>
        </label>
        <div class="ed-field"><span class="ed-label">Alinhamento e estilo</span>
          <div class="prop-buttons">
            <button type="button" class="btn" :aria-pressed="allBold" @click="toggleBold">Negrito</button>
            <button type="button" class="btn" @click="setAlign('left')">Esquerda</button>
            <button type="button" class="btn" @click="setAlign('center')">Centro</button>
            <button type="button" class="btn" @click="setAlign('right')">Direita</button>
          </div>
        </div>
        <div class="prop-colors">
          <label class="ed-field"><span class="ed-label">Cor da fonte</span><input type="color" :value="colorOf('fg')" aria-label="Cor da fonte nas propriedades" @input="paint('fg', ($event.target as HTMLInputElement).value)" /></label>
          <label class="ed-field"><span class="ed-label">Preenchimento</span><input type="color" :value="colorOf('bg')" aria-label="Preenchimento nas propriedades" @input="paint('bg', ($event.target as HTMLInputElement).value)" /></label>
        </div>
        <label class="ed-field"><span class="ed-label">Largura da coluna {{ indexToCol(focus.c) }} (px)</span><input v-model.number="colWidth" class="inp inp-num" type="number" min="40" max="600" step="10" /></label>
        <div class="prop-buttons">
          <button type="button" class="btn" @click="selectColumns(focus.c)">Selecionar coluna</button>
          <button type="button" class="btn" @click="selectRows(focus.r)">Selecionar linha</button>
          <button type="button" class="btn" @click="copySelection()">Copiar seleção</button>
          <button type="button" class="btn" @click="pasteSelection()">Colar</button>
          <button type="button" class="btn" @click="clearRange()">Limpar conteúdo</button>
        </div>
        <p v-if="selectionStats" class="ed-hint">{{ selectionStats }}</p>
      </div>
    </template>
    <div class="calc">
      <div class="fbar">
        <span class="addr" data-testid="cell-address" aria-live="off">{{ activeName }}</span>
        <label class="sr-only" for="formula-bar">Conteúdo da célula {{ cellName(focus.r, focus.c) }}</label>
        <input id="formula-bar" v-model="draft" class="inp fx" autocomplete="off" spellcheck="false" enterkeyhint="done" data-testid="formula-bar"
          @focus="editing = true" @keydown="onEditorKey" @blur="editing && commit()" />
        <button type="button" class="ib ok" aria-label="Confirmar célula" @pointerdown.prevent @click="commit('down')">✓</button>
      </div>
      <p v-if="activeError" class="ed-error ferr" role="status">Fórmula com erro: {{ activeError }}</p>
      <div ref="gridEl" class="grid" data-testid="grid" @scroll="onScroll">
        <table ref="tableEl" tabindex="0" role="grid" @contextmenu="onGridContextMenu" :aria-label="'Aba ' + sheet.name" :aria-rowcount="sheet.rows + 1" :aria-colcount="sheet.cols + 1"
          :aria-activedescendant="'cell-' + focus.r + '-' + focus.c" :style="{ width: 48 + colsShown.reduce((s, c) => s + width(c), 0) + 'px' }"
          @keydown="onGridKey" @copy="onCopy" @paste="onPaste">
          <colgroup><col style="width: 48px" /><col v-for="c in colsShown" :key="c" :style="{ width: width(c) + 'px' }" /></colgroup>
          <thead><tr role="row" aria-rowindex="1"><th class="corner" role="columnheader" title="Selecionar tudo" data-testid="corner" @click="selectAll"><span class="sr-only">Selecionar tudo</span></th><th v-for="c in colsShown" :key="c" role="columnheader" :class="{ hl: c >= range.c1 && c <= range.c2, hd: true }" scope="col" :data-col="indexToCol(c)" :title="'Selecionar coluna ' + indexToCol(c)" @click="selectColumns(c, $event.shiftKey)">{{ indexToCol(c) }}</th></tr></thead>
          <tbody>
            <tr v-if="firstRow > 0" aria-hidden="true" class="spacer" :style="{ height: firstRow * ROW_H + 'px' }"><td :colspan="sheet.cols + 1"></td></tr>
            <tr v-for="r in rowsShown" :key="r" role="row" :aria-rowindex="r + 2">
              <th role="rowheader" scope="row" class="hd" :class="{ hl: r >= range.r1 && r <= range.r2 }" :data-row="r + 1" :title="'Selecionar linha ' + (r + 1)" @click="selectRows(r, $event.shiftKey)">{{ r + 1 }}</th>
              <td v-for="c in colsShown" :id="'cell-' + r + '-' + c" :key="c" role="gridcell" :aria-colindex="c + 2" :aria-selected="inRange(r, c)"
                :class="{ sel: inRange(r, c), act: r === focus.r && c === focus.c, b: sheet.cells[key(r, c)]?.b, err: isErr(r, c) }" :style="cellStyle(r, c)"
                :data-cell="cellName(r, c)" @pointerdown="onCellDown($event, r, c)" @pointerenter="onCellEnter(r, c)" @dblclick="startEdit()">
                <input v-if="editing && r === focus.r && c === focus.c" id="cell-editor" v-model="draft" class="cell-editor" autocomplete="off" spellcheck="false" :aria-label="'Editar ' + cellName(r, c)" @keydown="onEditorKey" @blur="commit()" />
                <template v-else>{{ shown(r, c) }}</template>
              </td>
            </tr>
            <tr v-if="lastRow < sheet.rows" aria-hidden="true" class="spacer" :style="{ height: (sheet.rows - lastRow) * ROW_H + 'px' }"><td :colspan="sheet.cols + 1"></td></tr>
          </tbody>
        </table>
      </div>
      <div class="foot">
        <div class="sheets" role="tablist" aria-label="Abas da planilha" data-testid="sheet-tabs">
          <button v-for="(s, i) in state.sheets" :key="s.id" type="button" role="tab" class="sheet-tab" :aria-selected="i === si" @click="pickSheet(i)">{{ s.name }}</button>
        </div>
        <button type="button" class="ib" aria-label="Nova aba" @click="addSheet">+</button>
        <span class="stats muted" data-testid="selection-stats">{{ selectionStats }}</span>
      </div>
      <table class="print-only" aria-hidden="true">
        <tbody><tr v-for="r in printRange.rows" :key="r"><td v-for="c in printRange.cols" :key="c" :style="printStyle(r, c)">{{ shown(r, c) }}</td></tr></tbody>
      </table>
    </div>
  </EditorShell>
</template>

<style scoped>
.calc-properties { display: grid; align-content: start; gap: 15px; }
.prop-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.prop-buttons .btn { min-height: 36px; }
.prop-colors { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.prop-colors input { width: 100%; min-height: 38px; cursor: pointer; background: transparent; border: 1px solid var(--border); border-radius: 8px; }
.seg { display: inline-flex; gap: 2px; }
.swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 360px; }
.sw { width: 28px; height: 28px; min-width: 28px; padding: 0; border-radius: 8px; border: 1px solid var(--border); box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 18%, transparent); }
.sw-custom input { width: 36px; height: 32px; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: transparent; cursor: pointer; }
.sw-none { min-height: 32px; padding: 0 10px; font-size: 12.5px; }
@media (pointer: coarse) { .sw { width: 44px; height: 44px; min-width: 44px; } .sw-custom input { width: 48px; height: 44px; } .sw-none { min-height: 44px; } }
.seg .ib { border: 1px solid var(--border); }
.grid-ops { display: grid; gap: 10px; }
.calc { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--surface); }
.fbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); background: var(--surface); }
.addr { min-width: 64px; padding: 0 8px; font: 700 13px ui-monospace, monospace; color: var(--muted); text-align: center; }
.fx { flex: 1; font-family: ui-monospace, Consolas, monospace; }
.ok { flex: none; }
.ferr { padding: 2px 10px; }
.grid { flex: 1; min-height: 0; overflow: auto; position: relative; outline: none; background: var(--bg); }
table:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
table { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 14px; }
th, td { height: 31px; box-sizing: border-box; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
td { background: var(--cell-bg, var(--surface)); color: var(--cell-fg, inherit); cursor: cell; user-select: none; position: relative; }
thead th { position: sticky; top: 0; z-index: 2; background: var(--panel); font-size: 12px; font-weight: 700; color: var(--muted); text-align: center; }
tbody th { position: sticky; left: 0; z-index: 1; background: var(--panel); font-size: 12px; color: var(--muted); text-align: center; font-weight: 600; }
.corner { left: 0; z-index: 3; }
th.hl { background: color-mix(in srgb, var(--app) 30%, var(--panel)); color: var(--text); }
td.sel::after { content: ''; position: absolute; inset: 0; background: color-mix(in srgb, var(--app) 22%, transparent); pointer-events: none; }
th.hd { cursor: pointer; user-select: none; }
td.act { box-shadow: inset 0 0 0 2px var(--app); }
td.b { font-weight: 700; }
td.err { color: var(--cell-fg, var(--danger)); }
.spacer td { border: 0; background: transparent; padding: 0; }
.cell-editor { position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box; border: 2px solid var(--accent); padding: 0 5px; font: inherit; background: var(--surface); color: var(--text); outline: none; z-index: 1; }
.foot { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--border); background: var(--panel); min-height: 44px; }
.sheets { display: flex; overflow-x: auto; flex: 1; min-width: 0; }
.sheet-tab { flex: none; min-height: 44px; padding: 0 14px; border: 0; border-right: 1px solid var(--border); background: transparent; font-weight: 600; color: var(--muted); }
.sheet-tab[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: inset 0 -3px var(--app); }
.stats { padding-right: 12px; font-size: 12.5px; white-space: nowrap; }
.print-only { display: none; }
@media (max-width: 599px) { .stats { display: none; } }
@media print {
  .fbar, .ferr, .grid, .foot { display: none !important; }
  .print-only { display: table; border-collapse: collapse; font-size: 11pt; }
  .print-only { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-only td { border: 1px solid #999; padding: 2px 6px; height: auto; white-space: normal; color: #000; background: #fff; }
}
</style>
