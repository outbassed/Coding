/** Preferências de navegação da biblioteca. Só guardam posição e modo de exibição, nunca conteúdo de documentos. */
export type ViewMode = 'grid' | 'list';
export interface LibraryMemory { positions: Record<string, number>; tool: string }
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const MEMORY_KEY = 'coding-v2:library:memory';
const VIEW_KEY = 'coding-v2:library:view';
const KEY_PATTERN = /^[a-z0-9:-]{1,48}$/;
const MAX_KEYS = 40;

function safeStore(kind: 'session' | 'local'): Storage | undefined {
  try { return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage; } catch { return undefined; }
}

export function readMemory(store: Reader | undefined = safeStore('session')): LibraryMemory {
  const empty: LibraryMemory = { positions: {}, tool: 'all' };
  try {
    const raw = store?.getItem(MEMORY_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as { positions?: unknown; tool?: unknown };
    const positions: Record<string, number> = {};
    if (data.positions && typeof data.positions === 'object') {
      for (const [key, value] of Object.entries(data.positions as Record<string, unknown>).slice(0, MAX_KEYS)) {
        if (KEY_PATTERN.test(key) && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000) positions[key] = value;
      }
    }
    const tool = typeof data.tool === 'string' && KEY_PATTERN.test(data.tool) ? data.tool : 'all';
    return { positions, tool };
  } catch { return empty; }
}
export function writeMemory(memory: LibraryMemory, store: Writer | undefined = safeStore('session')): void {
  try { store?.setItem(MEMORY_KEY, JSON.stringify(memory)); } catch { /* armazenamento indisponível: a navegação continua normal */ }
}
export function readView(store: Reader | undefined = safeStore('local')): ViewMode {
  try { return store?.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}
export function writeView(mode: ViewMode, store: Writer | undefined = safeStore('local')): void {
  try { store?.setItem(VIEW_KEY, mode); } catch { /* preferência opcional */ }
}
/** Posição de uma lista: devolve sempre um número de página existente. */
export function positionFor(memory: LibraryMemory, key: string, totalPages: number): number {
  const stored = memory.positions[key] ?? 1;
  return Math.max(1, Math.min(Math.max(1, totalPages), stored));
}
export function withPosition(memory: LibraryMemory, key: string, page: number): LibraryMemory {
  const positions = { ...memory.positions };
  if (page <= 1) delete positions[key]; else positions[key] = page;
  return { ...memory, positions };
}
