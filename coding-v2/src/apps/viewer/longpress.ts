/**
 * Toque prolongado (celular e caneta) para abrir o menu de contexto. O botão direito e a tecla de menu usam o evento
 * `contextmenu` do navegador; este módulo cobre os aparelhos que não o disparam e evita abrir duas vezes.
 */
export interface PressOptions {
  /** Tempo de espera até abrir (ms). */
  delay?: number;
  /** Quanto o dedo pode se mexer sem cancelar (px). */
  slop?: number;
  onOpen: (x: number, y: number, target: HTMLElement) => void;
  /** Chamado depois que um toque prolongado abriu o menu, para o "soltar" não virar clique. */
  onFired?: () => void;
}

export function createLongPress(o: PressOptions) {
  const delay = o.delay ?? 520, slop = o.slop ?? 10;
  let timer = 0;
  let start: { x: number; y: number; target: HTMLElement } | null = null;
  let lastOpen = 0;

  const cancel = (): void => { clearTimeout(timer); timer = 0; start = null; };
  function down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    cancel();
    start = { x: e.clientX, y: e.clientY, target };
    timer = window.setTimeout(() => {
      const s = start;
      if (!s) return;
      start = null;
      lastOpen = Date.now();
      o.onFired?.();
      o.onOpen(s.x, s.y, s.target);
    }, delay);
  }
  function move(e: PointerEvent): void {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > slop) cancel();
  }
  /** Evita um segundo menu: o Android dispara `contextmenu` junto com o toque prolongado. */
  const recentlyOpened = (): boolean => Date.now() - lastOpen < 700;
  return { down, move, up: cancel, cancel, recentlyOpened };
}
