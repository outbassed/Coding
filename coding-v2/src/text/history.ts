/** Histórico de desfazer/refazer do Texto: guarda o HTML e onde estava o cursor. */
export interface TextSnap { html: string; start: number; end: number }

export class TextHistory {
  private present: TextSnap;
  private undoStack: TextSnap[] = [];
  private redoStack: TextSnap[] = [];
  private lastKey = '';
  private lastAt = 0;
  /** Teto de memória: o HTML pode ter milhões de caracteres (imagens), então o limite é por tamanho total. */
  constructor(initial: TextSnap, private readonly maxEntries = 80, private readonly maxChars = 24_000_000, private readonly windowMs = 900) {
    this.present = { ...initial };
  }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get current(): TextSnap { return this.present; }

  /** Registra uma mudança. Digitação seguida (mesma `key`) vira um único passo. Devolve false se nada mudou. */
  record(next: TextSnap, key = '', now = Date.now()): boolean {
    if (next.html === this.present.html) { this.present = { ...this.present, start: next.start, end: next.end }; return false; }
    const merge = key !== '' && key === this.lastKey && now - this.lastAt < this.windowMs && this.undoStack.length > 0;
    if (!merge) {
      this.undoStack.push(this.present);
      this.trim();
    }
    this.present = { ...next };
    this.redoStack = [];
    this.lastKey = key;
    this.lastAt = now;
    return true;
  }
  /** Atualiza só a posição do cursor do estado atual (para o "refazer" voltar ao lugar certo). */
  moveCursor(start: number, end: number): void { this.present = { ...this.present, start, end }; }
  undo(): TextSnap | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(this.present);
    this.present = previous;
    this.lastKey = '';
    return { ...previous };
  }
  redo(): TextSnap | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(this.present);
    this.present = next;
    this.lastKey = '';
    return { ...next };
  }
  reset(snap: TextSnap): void { this.present = { ...snap }; this.undoStack = []; this.redoStack = []; this.lastKey = ''; }
  get size(): number { return this.undoStack.length; }
  private trim(): void {
    let total = this.undoStack.reduce((sum, s) => sum + s.html.length, 0) + this.present.html.length;
    while (this.undoStack.length > this.maxEntries || (total > this.maxChars && this.undoStack.length > 1)) {
      const dropped = this.undoStack.shift();
      total -= dropped?.html.length ?? 0;
    }
  }
}
