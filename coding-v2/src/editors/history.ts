/**
 * Desfazer/refazer genérico por instantâneos JSON do estado inteiro.
 * Mudanças em sequência com a mesma chave (digitação) dentro de `windowMs` viram um passo só.
 */
export class StateHistory<T> {
  private past: string[] = [];
  private future: string[] = [];
  private present: string;
  /** Só a parte do estado que conta como alteração (ex.: sem a aba aberta); vazio = o estado inteiro. */
  private presentView: string;
  private lastKey = '';
  private lastAt = 0;
  /** `project` escolhe o que conta como alteração: mudar só o que ele ignora (aba aberta, rolagem…) não cria passo de desfazer. */
  constructor(initial: T, private readonly limit = 100, private readonly windowMs = 800, private readonly maxChars = 20_000_000, private readonly project?: (state: T) => unknown) {
    this.present = JSON.stringify(initial);
    this.presentView = this.viewOf(initial, this.present);
  }
  private viewOf(state: T, full: string): string { return this.project ? JSON.stringify(this.project(state)) : full; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  record(next: T, key = '', now = Date.now()): boolean {
    const value = JSON.stringify(next);
    if (value === this.present) return false;
    const view = this.viewOf(next, value);
    if (view === this.presentView) { this.present = value; return false; } // só mudou algo que não conta (ex.: aba aberta)
    const merge = key !== '' && key === this.lastKey && now - this.lastAt <= this.windowMs && this.past.length > 0;
    if (!merge) {
      this.past.push(this.present);
      while (this.past.length > this.limit || (this.past.length > 1 && this.size() > this.maxChars)) this.past.shift();
    }
    this.present = value; this.presentView = view; this.future = []; this.lastKey = key; this.lastAt = now;
    return true;
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present); this.present = prev; this.lastKey = '';
    const state = JSON.parse(prev) as T; this.presentView = this.viewOf(state, prev);
    return state;
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present); this.present = next; this.lastKey = '';
    const state = JSON.parse(next) as T; this.presentView = this.viewOf(state, next);
    return state;
  }
  reset(state: T): void { this.past = []; this.future = []; this.present = JSON.stringify(state); this.presentView = this.viewOf(state, this.present); this.lastKey = ''; }
  private size(): number { return this.past.reduce((s, p) => s + p.length, 0); }
}
