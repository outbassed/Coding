/**
 * Contrato de edição direta (EDICAO-DIRETA.md): regras puras e utilitários de DOM compartilhados pelos campos
 * editáveis dentro de folhas, cenas, telas e prévias.
 */
export interface SurfaceTextRules {
  /** `false`: campo de uma linha (Enter confirma, quebras viram espaço). `true`: várias linhas (Enter quebra a linha). */
  multiline: boolean;
  maxLength: number;
}

/**
 * Texto que o campo entrega ao modelo. Só o que o navegador acrescenta na edição é removido: espaços sem quebra,
 * quebras de linha no fim (o Chromium duplica a última quebra para poder mostrar o cursor) e, em campos de uma linha,
 * qualquer quebra. Nada além disso é alterado.
 */
export function normalizeSurfaceText(raw: string, rules: SurfaceTextRules): string {
  let text = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  if (!rules.multiline) text = text.replace(/[ \t]*\n+[ \t]*/g, ' ');
  text = text.replace(/\n+$/, '');
  return text.slice(0, Math.max(0, rules.maxLength));
}

/** Texto colado: em campos de uma linha as quebras viram espaço; o limite é aplicado depois, por `normalizeSurfaceText`. */
export function pasteText(raw: string, multiline: boolean): string {
  const text = raw.replace(/\r\n?/g, '\n');
  return multiline ? text : text.replace(/[ \t]*\n+[ \t]*/g, ' ');
}

/** `plaintext-only` impede que o navegador guarde HTML formatado dentro do campo; sem suporte, cai em `true` e o app sanea. */
export function editableMode(): 'plaintext-only' | 'true' {
  if (typeof document === 'undefined') return 'true';
  const probe = document.createElement('div');
  try { probe.contentEditable = 'plaintext-only'; } catch { return 'true'; }
  return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
}

/** Posição do cursor (em caracteres) dentro do campo. 0 quando não há seleção dentro dele. */
export function caretOffset(el: HTMLElement): number {
  const sel = typeof window === 'undefined' ? null : window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return 0;
  const before = range.cloneRange();
  before.selectNodeContents(el);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
}

/** Coloca o cursor numa posição (em caracteres); além do fim, vai para o fim. */
export function placeCaret(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  let placed = false;
  const walk = (node: Node): void => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).data.length;
      if (remaining <= length) { range.setStart(node, remaining); placed = true; return; }
      remaining -= length;
      return;
    }
    if ((node as Element).tagName === 'BR') {
      if (remaining <= 0) { range.setStartBefore(node); placed = true; return; }
      remaining -= 1;
      return;
    }
    node.childNodes.forEach((child) => walk(child));
  };
  walk(el);
  if (!placed) { range.selectNodeContents(el); range.collapse(false); } else range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Saber se a saída do campo foi desejada (Tab, Esc, Enter, clique ou toque fora, botão "Concluir") ou se o campo
 * perdeu o foco porque a folha foi redesenhada com ele dentro. No segundo caso o app devolve o foco.
 */
let intentAt = 0;
let tracking = false;
export const markIntentionalLeave = (): void => { intentAt = performance.now(); };
export const leftOnPurpose = (windowMs = 400): boolean => performance.now() - intentAt <= windowMs;
export function trackIntent(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener('pointerdown', markIntentionalLeave, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Tab' || event.key === 'Escape') markIntentionalLeave(); }, true);
}
