/** Pilha de desfazer/refazer com orçamento de memória: apaga os passos mais antigos quando passa do limite. */
export interface UndoEntry { label: string; undo(): void; redo(): void; /** custo aproximado (pixels guardados) */ cost: number }
export class UndoStack {
  private done: UndoEntry[] = [];
  private undone: UndoEntry[] = [];
  constructor(private readonly budget = 64_000_000, private readonly maxSteps = 100) {}
  private total(list: readonly UndoEntry[]): number { return list.reduce((s, e) => s + e.cost, 0); }
  push(entry: UndoEntry): void {
    this.done.push(entry);
    this.undone = [];
    while (this.done.length > this.maxSteps || (this.done.length > 1 && this.total(this.done) > this.budget)) this.done.shift();
  }
  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }
  get size(): number { return this.done.length; }
  undo(): string | null { const e = this.done.pop(); if (!e) return null; e.undo(); this.undone.push(e); return e.label; }
  redo(): string | null { const e = this.undone.pop(); if (!e) return null; e.redo(); this.done.push(e); return e.label; }
  clear(): void { this.done = []; this.undone = []; }
}
