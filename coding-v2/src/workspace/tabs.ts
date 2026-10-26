/**
 * Abas de projeto de UM app (nunca misturam apps). Cada aba aponta para um documento salvo da Biblioteca, pelo id estável.
 * Guardamos só metadados mínimos: o documento é carregado sob demanda, um por vez, então abrir centenas de abas não cria centenas de editores.
 *
 * Regras:
 *  - no máximo 5 abas visíveis (as 5 primeiras da lista); as demais ficam no "+N", com N = abertas − 5;
 *  - escolher uma aba escondida troca por ela a aba visível menos recentemente ACESSADA (não a menos editada nem a mais antiga);
 *  - o instante de acesso é separado do instante de edição e muda ao selecionar ou abrir, mesmo sem editar;
 *  - fechar uma aba só a tira da lista: o documento continua salvo.
 */
export const VISIBLE_MAX = 5;
export const OPEN_MAX = 1024;

export interface TabMeta { id: string; title: string; accessedAt: number }
export interface TabsState { v: 1; open: TabMeta[]; active: string | null }
export const emptyTabs = (): TabsState => ({ v: 1, open: [], active: null });

export const visibleTabs = (s: TabsState): TabMeta[] => s.open.slice(0, VISIBLE_MAX);
export const overflowTabs = (s: TabsState): TabMeta[] => s.open.slice(VISIBLE_MAX);
export const overflowCount = (s: TabsState): number => Math.max(0, s.open.length - VISIBLE_MAX);
export const hasTab = (s: TabsState, id: string): boolean => s.open.some((t) => t.id === id);

const cleanTitle = (title: unknown): string => (typeof title === 'string' ? title.replace(/[\u0000-\u001f]/g, ' ').trim() : '').slice(0, 250) || 'Sem título';

/** A aba visível menos recentemente acessada (a aba ativa só é candidata se for a única). */
export function lruVisible(s: TabsState, ignoreId?: string): TabMeta | null {
  const candidates = visibleTabs(s).filter((t) => t.id !== ignoreId);
  const pool = candidates.filter((t) => t.id !== s.active);
  const list = pool.length ? pool : candidates;
  let best: TabMeta | null = null;
  for (const t of list) if (!best || t.accessedAt < best.accessedAt) best = t;
  return best;
}

/** Seleciona uma aba aberta e atualiza o acesso. Se estava no "+N", ela assume o lugar da visível menos acessada. */
export function selectTab(s: TabsState, id: string, now: number): TabsState {
  const index = s.open.findIndex((t) => t.id === id);
  if (index < 0) return s;
  const open = s.open.map((t) => (t.id === id ? { ...t, accessedAt: now } : t));
  if (index >= VISIBLE_MAX) {
    const lru = lruVisible(s, id);
    if (lru) {
      const at = s.open.findIndex((t) => t.id === lru.id);
      const moved = open[index] as TabMeta;
      open[index] = open[at] as TabMeta;
      open[at] = moved;
    }
  }
  return { ...s, open, active: id };
}

/** Abre (ou seleciona, se já estiver aberto). Uma aba nova entra visível; com 5 visíveis, troca a menos acessada. */
export function openTab(s: TabsState, meta: { id: string; title: string }, now: number): TabsState {
  if (hasTab(s, meta.id)) {
    const refreshed = { ...s, open: s.open.map((t) => (t.id === meta.id ? { ...t, title: cleanTitle(meta.title) } : t)) };
    return selectTab(refreshed, meta.id, now);
  }
  if (s.open.length >= OPEN_MAX) return s;
  const next: TabsState = { ...s, open: [...s.open, { id: meta.id, title: cleanTitle(meta.title), accessedAt: now }] };
  return selectTab(next, meta.id, now);
}

const mostRecent = (tabs: readonly TabMeta[]): TabMeta | null => {
  let best: TabMeta | null = null;
  for (const t of tabs) if (!best || t.accessedAt > best.accessedAt) best = t;
  return best;
};

/** Fecha as abas (o documento continua salvo). Se havia abas escondidas, as mais recentes ocupam as vagas liberadas. */
export function closeMany(s: TabsState, ids: readonly string[]): TabsState {
  const drop = new Set(ids);
  if (!s.open.some((t) => drop.has(t.id))) return s;
  const open = s.open.filter((t) => !drop.has(t.id));
  // As visíveis que sobraram ficam no começo; o resto da lista são as escondidas.
  let p = s.open.slice(0, VISIBLE_MAX).filter((t) => !drop.has(t.id)).length;
  while (p < VISIBLE_MAX && p < open.length) {
    let best = p;
    for (let k = p + 1; k < open.length; k++) if ((open[k] as TabMeta).accessedAt > (open[best] as TabMeta).accessedAt) best = k;
    const pick = open[best] as TabMeta;
    open[best] = open[p] as TabMeta;
    open[p] = pick;
    p++;
  }
  const active = s.active && open.some((t) => t.id === s.active) ? s.active : (mostRecent(open)?.id ?? null);
  return { ...s, open, active };
}
export const closeTab = (s: TabsState, id: string): TabsState => closeMany(s, [id]);

export function renameTab(s: TabsState, id: string, title: string): TabsState {
  if (!hasTab(s, id)) return s;
  const clean = cleanTitle(title);
  return { ...s, open: s.open.map((t) => (t.id === id ? { ...t, title: clean } : t)) };
}

/** Reordena entre as abas visíveis (alternativa ao arrastar). */
export function moveTab(s: TabsState, id: string, delta: -1 | 1): TabsState {
  const i = s.open.findIndex((t) => t.id === id);
  const j = i + delta;
  const visible = Math.min(VISIBLE_MAX, s.open.length);
  if (i < 0 || i >= visible || j < 0 || j >= visible) return s;
  const open = s.open.slice();
  [open[i], open[j]] = [open[j] as TabMeta, open[i] as TabMeta];
  return { ...s, open };
}

const fold = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
export function searchOverflow(s: TabsState, query: string): TabMeta[] {
  const q = fold(query.trim());
  const list = overflowTabs(s);
  return q ? list.filter((t) => fold(t.title).includes(q)) : list;
}

/** Busca entre TODAS as abas abertas (lista do celular). */
export function searchAll(s: TabsState, query: string): TabMeta[] {
  const q = fold(query.trim());
  return q ? s.open.filter((t) => fold(t.title).includes(q)) : s.open;
}

/** Tira das abas os documentos que não existem mais (ex.: excluídos em outra janela). */
export function pruneMissing(s: TabsState, existing: ReadonlySet<string>): { state: TabsState; dropped: TabMeta[] } {
  const dropped = s.open.filter((t) => !existing.has(t.id));
  return dropped.length ? { state: closeMany(s, dropped.map((t) => t.id)), dropped } : { state: s, dropped };
}

export function normalizeTabs(raw: unknown): TabsState {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const open: TabMeta[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.open)) {
    for (const item of o.open) {
      if (open.length >= OPEN_MAX) break;
      const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      if (typeof t.id !== 'string' || !t.id || t.id.length > 80 || seen.has(t.id)) continue;
      seen.add(t.id);
      open.push({ id: t.id, title: cleanTitle(t.title), accessedAt: typeof t.accessedAt === 'number' && Number.isFinite(t.accessedAt) && t.accessedAt >= 0 ? t.accessedAt : 0 });
    }
  }
  const active = typeof o.active === 'string' && seen.has(o.active) ? o.active : (mostRecent(open)?.id ?? null);
  return { v: 1, open, active };
}
