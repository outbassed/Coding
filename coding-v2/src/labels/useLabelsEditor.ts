import { mergeBulk, type BulkRow } from './bulk';
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import type { CopyRecord } from '../storage/documents';
import { RevisionConflict, watchCopies } from '../storage/documents';
import { friendlyError } from '../library/errors';
import {
  cloneState, clamp, defaults, normalize, normalizeItem, uid,
  MAX_COPIES, MAX_ITEMS, type LabelItem, type LabelsState
} from './model';
import { History } from './history';
import * as realStore from './store';

export type LabelsSaveState = 'new' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export interface LabelsStoreApi {
  create(state: LabelsState): Promise<CopyRecord>;
  open(copyId: string): Promise<{ record: CopyRecord; state: LabelsState }>;
  save(base: CopyRecord, state: LabelsState): Promise<CopyRecord>;
  saveAsNew(state: LabelsState): Promise<CopyRecord>;
}
export const realApi: LabelsStoreApi = {
  create: realStore.createLabelsDocument, open: realStore.openLabelsDocument,
  save: realStore.saveLabelsDocument, saveAsNew: realStore.saveAsNewLabelsDocument
};

export interface EditorOptions {
  api?: LabelsStoreApi;
  debounceMs?: number;
  /** Chamado quando o documento passa a ter um id definitivo (primeira gravação). */
  onIdentified?: (copyId: string) => void;
  announce?: (text: string) => void;
}

/** Estado, histórico e salvamento do editor. O indicador de salvamento só afirma o que o banco confirmou. */
export function useLabelsEditor(options: EditorOptions = {}) {
  const api = options.api ?? realApi;
  const debounceMs = options.debounceMs ?? 1200;
  const say = (text: string): void => options.announce?.(text);

  const state = ref<LabelsState>(defaults());
  const history = new History(cloneState(state.value));
  const historyTick = ref(0); // faz canUndo/canRedo reagirem
  const copyId = ref<string | null>(null);
  const saveState = ref<LabelsSaveState>('new');
  const saveError = ref('');
  const loading = ref(false);
  const loadError = ref('');
  const lastSavedAt = ref<number | null>(null);
  const baseRecord = shallowRef<CopyRecord | null>(null);
  let savedJson = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;

  const dirty = computed(() => saveState.value !== 'saved' && saveState.value !== 'new');
  const canUndo = computed(() => { void historyTick.value; return history.canUndo; });
  const canRedo = computed(() => { void historyTick.value; return history.canRedo; });
  const json = (value: LabelsState): string => JSON.stringify(value);

  function adopt(record: CopyRecord | null, next: LabelsState, saved: boolean): void {
    baseRecord.value = record;
    copyId.value = record?.id ?? null;
    state.value = next;
    history.reset(next);
    historyTick.value += 1;
    savedJson = saved ? json(next) : '';
    saveState.value = saved ? 'saved' : 'new';
    saveError.value = '';
    clearTimeout(timer);
  }

  async function load(id: string): Promise<void> {
    loading.value = true; loadError.value = '';
    try {
      const { record, state: opened } = await api.open(id);
      adopt(record, opened, true);
      lastSavedAt.value = record.updatedAt;
    } catch (err) { loadError.value = friendlyError(err); }
    finally { loading.value = false; }
  }
  function startNew(initial?: LabelsState): void { adopt(null, initial ?? defaults(), false); lastSavedAt.value = null; }

  function markChanged(): void {
    if (copyId.value ? json(state.value) === savedJson : !history.canUndo) {
      // voltou ao que já está salvo (ou ao modelo inicial de um documento novo): nada a gravar
      clearTimeout(timer);
      if (saveState.value !== 'conflict' && saveState.value !== 'saving') saveState.value = copyId.value ? 'saved' : 'new';
      return;
    }
    if (saveState.value === 'conflict') return; // a decisão do usuário vem antes de qualquer nova gravação
    if (saveState.value !== 'saving') saveState.value = 'pending';
    schedule();
  }
  function schedule(): void {
    clearTimeout(timer);
    if (saveState.value === 'conflict') return;
    timer = setTimeout(() => { void saveNow(); }, debounceMs);
  }

  /** Aplica uma mudança, registra no histórico e agenda o salvamento. */
  function change(mutate: (draft: LabelsState) => void, key = ''): void {
    const draft = cloneState(state.value);
    mutate(draft);
    const next = normalize(draft);
    // normalize preserva os ids; a identidade dos itens digitados não pode mudar a cada tecla
    if (!history.record(next, key)) return;
    state.value = next;
    historyTick.value += 1;
    markChanged();
  }

  const setField = <K extends keyof LabelsState>(field: K, value: LabelsState[K], key?: string): void =>
    change((d) => { d[field] = value; }, key ?? 'f:' + String(field));
  const setItem = (id: string, patch: Partial<Omit<LabelItem, 'id'>>, key?: string): void =>
    change((d) => { const item = d.items.find((i) => i.id === id); if (item) Object.assign(item, patch); }, key ?? 'i:' + id + ':' + Object.keys(patch).join(','));
  function addItem(): string | null {
    if (state.value.items.length >= MAX_ITEMS) { say('Limite de ' + MAX_ITEMS + ' itens por documento.'); return null; }
    const item = normalizeItem({ id: uid() });
    change((d) => { d.items.push(item); });
    return item.id;
  }
  /** Acrescenta (ou substitui) itens de uma lista colada numa única alteração, para desfazer de uma vez. */
  function addMany(rows: readonly BulkRow[], replace: boolean): number {
    if (!rows.length) return 0;
    let added = 0;
    let trimmed = false;
    change((d) => {
      const merged = mergeBulk(d.items, rows, replace);
      d.items = merged.items; added = merged.added; trimmed = merged.trimmed;
    });
    say(added + (added === 1 ? ' item adicionado.' : ' itens adicionados.') + (trimmed ? ' Lista limitada a ' + MAX_ITEMS + ' itens.' : ''));
    return added;
  }
  /** Aplica uma predefinição de layout (folha, colunas, tipografia) num único passo de desfazer; os itens ficam. */
  function applyLayout(layout: Partial<LabelsState>): void {
    change((d) => { for (const [k, v] of Object.entries(layout)) if (k !== 'name' && k !== 'items') (d as unknown as Record<string, unknown>)[k] = v; });
    say('Layout aplicado. Os itens não mudaram.');
  }
  function duplicateItem(id: string): string | null {
    if (state.value.items.length >= MAX_ITEMS) { say('Limite de ' + MAX_ITEMS + ' itens por documento.'); return null; }
    const source = state.value.items.find((i) => i.id === id);
    if (!source) return null;
    const copy = { ...source, id: uid() };
    change((d) => { d.items.splice(d.items.findIndex((i) => i.id === id) + 1, 0, copy); });
    return copy.id;
  }
  function moveItem(id: string, delta: -1 | 1): void {
    change((d) => {
      const index = d.items.findIndex((i) => i.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= d.items.length) return;
      const [moved] = d.items.splice(index, 1);
      if (moved) d.items.splice(target, 0, moved);
    });
  }
  function removeItem(id: string): void {
    change((d) => {
      if (d.items.length === 1) { Object.assign(d.items[0] as LabelItem, { code: '', description: '', copies: 1 }); say('Item limpo. O documento mantém ao menos um item.'); }
      else { d.items = d.items.filter((i) => i.id !== id); say('Item excluído.'); }
    });
  }
  const stepCopies = (id: string, delta: number): void => {
    const item = state.value.items.find((i) => i.id === id);
    if (item) setItem(id, { copies: clamp(item.copies + delta, 1, MAX_COPIES) }, '');
  };

  function undo(): void {
    const previous = history.undo();
    if (!previous) return;
    state.value = previous; historyTick.value += 1; markChanged(); say('Desfeito.');
  }
  function redo(): void {
    const next = history.redo();
    if (!next) return;
    state.value = next; historyTick.value += 1; markChanged(); say('Refeito.');
  }

  async function saveNow(): Promise<void> {
    clearTimeout(timer);
    if (inFlight) return inFlight;
    if (saveState.value === 'saved' || saveState.value === 'new' || saveState.value === 'conflict') return;
    inFlight = (async () => {
      do {
        const snapshot = cloneState(state.value);
        saveState.value = 'saving'; saveError.value = '';
        try {
          const record = baseRecord.value ? await api.save(baseRecord.value, snapshot) : await api.create(snapshot);
          const firstSave = !baseRecord.value;
          baseRecord.value = record; copyId.value = record.id; savedJson = json(snapshot); lastSavedAt.value = record.updatedAt;
          if (firstSave) options.onIdentified?.(record.id);
          // Mudanças feitas durante a gravação continuam pendentes: o indicador não mente.
          saveState.value = json(state.value) === savedJson ? 'saved' : 'pending';
          if (saveState.value === 'saved') say('Salvo neste aparelho.');
        } catch (err) {
          if (err instanceof RevisionConflict) {
            saveState.value = 'conflict';
            saveError.value = 'Este documento foi alterado em outra janela. Suas alterações não foram salvas e nada foi sobrescrito.';
          } else {
            saveState.value = 'error';
            saveError.value = 'Não foi possível salvar. ' + friendlyError(err);
          }
          say(saveError.value);
          return;
        }
      } while (saveState.value === 'pending');
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  /** Saída do conflito 1: descartar o que foi digitado e abrir a versão salva. */
  async function reloadSaved(): Promise<void> {
    if (!copyId.value) return;
    const id = copyId.value;
    await load(id);
    if (!loadError.value) say('Versão salva carregada. As alterações não salvas foram descartadas.');
  }
  /** Saída do conflito 2: guardar o que foi digitado como uma cópia nova, sem tocar na outra. */
  async function saveCopyOfConflict(): Promise<void> {
    saveState.value = 'saving';
    try {
      const record = await api.saveAsNew(cloneState(state.value));
      const opened = await api.open(record.id);
      adopt(opened.record, opened.state, true);
      lastSavedAt.value = opened.record.updatedAt;
      options.onIdentified?.(record.id);
      say('Suas alterações foram salvas como uma nova cópia.');
    } catch (err) {
      saveState.value = 'conflict';
      saveError.value = 'Não foi possível salvar a nova cópia. ' + friendlyError(err);
      say(saveError.value);
    }
  }

  // Se outra janela salvar enquanto nada está pendente aqui, mostramos a versão nova.
  const stop = watchCopies(() => {
    if (copyId.value && saveState.value === 'saved' && !inFlight) {
      const id = copyId.value;
      void api.open(id).then(({ record, state: opened }) => {
        if (record.revision !== baseRecord.value?.revision && saveState.value === 'saved') {
          adopt(record, opened, true); lastSavedAt.value = record.updatedAt; say('Documento atualizado: outra janela salvou uma versão nova.');
        }
      }).catch(() => { /* aviso é só conveniência; o salvamento continua protegido pela revisão */ });
    }
  });
  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (saveState.value === 'pending' || saveState.value === 'saving' || saveState.value === 'error' || saveState.value === 'conflict') { event.preventDefault(); event.returnValue = ''; }
  }
  function onHide(): void { if (document.visibilityState === 'hidden' && saveState.value === 'pending') void saveNow(); }
  function onPageHide(): void { if (saveState.value === 'pending') void saveNow(); }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
  }
  onBeforeUnmount(() => {
    stop(); clearTimeout(timer);
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  });

  return {
    state, copyId, saveState, saveError, dirty, loading, loadError, lastSavedAt, canUndo, canRedo,
    load, startNew, setField, setItem, addItem, addMany, applyLayout, duplicateItem, moveItem, removeItem, stepCopies,
    undo, redo, saveNow, reloadSaved, saveCopyOfConflict
  };
}
