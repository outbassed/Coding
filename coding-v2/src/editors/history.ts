/**
 * Desfazer/refazer genérico por instantâneos JSON do estado inteiro.
 * Mudanças em sequência com a mesma chave (digitação) dentro de `windowMs` viram um passo só.
 */
export class StateHistory<T> {
  private past: string[] = [];
  private future: string[] = [];
  private present: string;
  private lastKey = '';
  private lastAt = 0;
  constructor(initial: T, private readonly limit = 100, private readonly windowMs = 800, private readonly maxChars = 20_000_000) {
    this.present = JSON.stringify(initial);
  }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  record(next: T, key = '', now = Date.now()): boolean {
    const value = JSON.stringify(next);
    if (value === this.present) return false;
    const merge = key !== '' && key === this.lastKey && now - this.lastAt <= this.windowMs && this.past.length > 0;
    if (!merge) {
      this.past.push(this.present);
      while (this.past.length > this.limit || (this.past.length > 1 && this.size() > this.maxChars)) this.past.shift();
    }
    this.present = value; this.future = []; this.lastKey = key; this.lastAt = now;
    return true;
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present); this.present = prev; this.lastKey = '';
    return JSON.parse(prev) as T;
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present); this.present = next; this.lastKey = '';
    return JSON.parse(next) as T;
  }
  reset(state: T): void { this.past = []; this.future = []; this.present = JSON.stringify(state); this.lastKey = ''; }
  private size(): number { return this.past.reduce((s, p) => s + p.length, 0); }
}
