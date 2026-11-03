/** Cache LRU somente em memória: nada é gravado em disco, então nenhum dado de documento é duplicado. */
export class LruCache<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max = 80) {}
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  clear(): void { this.map.clear(); }
  get size(): number { return this.map.size; }
}

/** Fila com concorrência limitada: miniaturas nunca disputam o thread principal com a interface. */
export class TaskQueue {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly limit = 2) {}
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        this.running++;
        task().then(resolve, reject).finally(() => {
          this.running--;
          this.waiting.shift()?.();
        });
      };
      if (this.running < this.limit) start(); else this.waiting.push(start);
    });
  }
  get pending(): number { return this.waiting.length; }
}
