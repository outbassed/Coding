import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { countSavedByApp, getCopy, saveCopyRevision } from '../storage/documents';
import { appKeyForType, canAdd, effectiveLimit, type Effective } from '../workspace/limits';
import { loadLimitSettings, loadRecommended, loadTabs, TABS_PREFIX, updateTabs } from '../workspace/prefs';
import { closeMany, moveTab, overflowCount, overflowTabs, renameTab, selectTab, visibleTabs, openTab, type TabMeta, type TabsState } from '../workspace/tabs';
import { friendlyError } from '../library/errors';

export interface ProjectTabsOptions {
  /** Tipo do documento gravado (ex.: 'calc'): define a chave do app. */
  type: string;
  /** Endereço do app (ex.: '/apps/planilhas/'). */
  path: string;
  /** Id do documento aberto agora (nulo enquanto for um projeto novo, ainda não salvo). */
  currentId: () => string | null;
  /** Salva o que está na tela e diz se é seguro sair desta página (pergunta ao usuário se não for). */
  canLeave: () => Promise<boolean>;
  /** Renomeia o documento aberto (o salvamento automático grava). */
  renameCurrent: (name: string) => void;
  /** Troca de página; separado para os testes. */
  navigate?: (url: string) => void;
}

export interface ProjectTabsController {
  appKey: string;
  tabs: Ref<TabsState>;
  visible: ComputedRef<TabMeta[]>;
  overflow: ComputedRef<TabMeta[]>;
  overflowCount: ComputedRef<number>;
  activeId: ComputedRef<string | null>;
  saved: Ref<number | null>;
  limit: ComputedRef<Effective | null>;
  /** Texto que explica por que não dá para criar outro projeto (ou vazio). */
  blockedReason: ComputedRef<string>;
  message: Ref<string>;
  register(id: string, title: string): void;
  retitle(id: string, title: string): void;
  select(id: string): Promise<void>;
  close(id: string): Promise<void>;
  create(): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  move(id: string, delta: -1 | 1): void;
  refreshCount(): Promise<void>;
  reload(): void;
}

export const newProjectUrl = (path: string): string => path + '?novo=1';
export const openProjectUrl = (path: string, id: string): string => path + '?doc=' + encodeURIComponent(id);

/**
 * Abas de projeto de um app. Só metadados mínimos ficam em localStorage; trocar de aba salva o documento atual
 * e abre o outro na mesma página do app, então existe um único editor vivo por vez, mesmo com centenas de abas abertas.
 */
export function useProjectTabs(options: ProjectTabsOptions): ProjectTabsController {
  const appKey = appKeyForType(options.type);
  const navigate = options.navigate ?? ((url: string) => location.assign(url));
  const tabs = ref<TabsState>(loadTabs(appKey));
  const saved = ref<number | null>(null);
  const message = ref('');
  const activeId = computed(() => options.currentId() ?? null);
  const visible = computed(() => visibleTabs(tabs.value));
  const overflow = computed(() => overflowTabs(tabs.value));
  const overflowN = computed(() => overflowCount(tabs.value));
  const limit = computed<Effective | null>(() => (saved.value === null ? null : effectiveLimit(loadLimitSettings(), appKey, saved.value, loadRecommended())));
  const blockedReason = computed(() => {
    const l = limit.value;
    if (!l || canAdd(l)) return '';
    return 'Limite de ' + l.limit + ' projetos salvos neste app atingido. Exclua projetos na Biblioteca ou aumente o limite em Ajustes.';
  });

  function reload(): void { tabs.value = loadTabs(appKey); }
  function onStorage(event: StorageEvent): void { if (event.key === null || event.key === TABS_PREFIX + appKey) reload(); }

  async function refreshCount(): Promise<void> {
    try { saved.value = (await countSavedByApp())[appKey] ?? 0; } catch { saved.value = null; }
  }

  function register(id: string, title: string): void {
    tabs.value = updateTabs(appKey, (s) => openTab(s, { id, title }, Date.now()));
  }
  function retitle(id: string, title: string): void {
    tabs.value = updateTabs(appKey, (s) => renameTab(s, id, title));
  }

  async function select(id: string): Promise<void> {
    if (id === activeId.value) { tabs.value = updateTabs(appKey, (s) => selectTab(s, id, Date.now())); return; }
    if (!(await options.canLeave())) return;
    tabs.value = updateTabs(appKey, (s) => selectTab(s, id, Date.now()));
    navigate(openProjectUrl(options.path, id));
  }

  async function close(id: string): Promise<void> {
    const closingCurrent = id === activeId.value;
    if (closingCurrent && !(await options.canLeave())) return;
    const next = updateTabs(appKey, (s) => closeMany(s, [id]));
    tabs.value = next;
    if (!closingCurrent) return;
    // Fechar a aba aberta leva à aba mais recente que sobrou, ou a um projeto novo em branco.
    navigate(next.active ? openProjectUrl(options.path, next.active) : newProjectUrl(options.path));
  }

  async function create(): Promise<void> {
    if (blockedReason.value) { message.value = blockedReason.value; return; }
    if (!(await options.canLeave())) return;
    navigate(newProjectUrl(options.path));
  }

  async function rename(id: string, name: string): Promise<void> {
    const clean = name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 250);
    if (!clean) { message.value = 'O nome não pode ficar vazio.'; return; }
    if (id === activeId.value) { options.renameCurrent(clean); retitle(id, clean); return; }
    try {
      const record = await getCopy(id);
      if (!record) { message.value = 'Este projeto não existe mais neste aparelho.'; reload(); return; }
      const state = { ...(record.snapshot.doc.state as object), name: clean };
      await saveCopyRevision(record.id, record.revision, {
        label: clean,
        snapshot: { ...record.snapshot, doc: { ...record.snapshot.doc, updatedAt: Date.now(), state } }
      });
      retitle(id, clean);
      message.value = '';
    } catch (err) { message.value = friendlyError(err); }
  }

  function move(id: string, delta: -1 | 1): void { tabs.value = updateTabs(appKey, (s) => moveTab(s, id, delta)); }

  onMounted(() => {
    window.addEventListener('storage', onStorage);
    void refreshCount();
  });
  onBeforeUnmount(() => window.removeEventListener('storage', onStorage));

  return { appKey, tabs, visible, overflow, overflowCount: overflowN, activeId, saved, limit, blockedReason, message, register, retitle, select, close, create, rename, move, refreshCount, reload };
}
