import type { LabelsState } from './model';
import { cloneState, sameState } from './model';

/**
 * Desfazer/refazer por instantâneos do estado inteiro.
 * Digitação contínua no mesmo campo vira UM passo (mesma `key` em até `windowMs`).
 */
export class History {
  private past: LabelsState[] = [];
  private future: LabelsState[] = [];
  private lastKey = '';
  private lastAt = 0;
  private present: LabelsState;
  constructor(initial: LabelsState, private readonly limit = 100, private readonly windowMs = 900) { this.present = cloneState(initial); }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Registra a mudança. Devolve false se nada mudou de fato. */
  record(next: LabelsState, key = '', now = Date.now()): boolean {
    if (sameState(this.present, next)) return false;
    const merge = key !== '' && key === this.lastKey && now - this.lastAt <= this.windowMs && this.past.length > 0;
    if (!merge) {
      this.past.push(cloneState(this.present));
      if (this.past.length > this.limit) this.past.shift();
    }
    this.present = cloneState(next);
    this.future = [];
    this.lastKey = key; this.lastAt = now;
    return true;
  }
  undo(): LabelsState | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(cloneState(this.present));
    this.present = previous; this.lastKey = '';
    return cloneState(previous);
  }
  redo(): LabelsState | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneState(this.present));
    this.present = next; this.lastKey = '';
    return cloneState(next);
  }
  /** Recomeça a história (ao abrir outro documento). */
  reset(state: LabelsState): void { this.past = []; this.future = []; this.present = cloneState(state); this.lastKey = ''; }
}
