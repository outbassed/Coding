import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { RevisionConflict, type CopyRecord, type LegacyImage } from '../storage/documents';
import type { SaveState } from '../components/editor/SaveStatus.vue';
import { friendlyError } from '../library/errors';
import { createDoc, openDoc, saveDoc, type DocKind } from './docs';
import { StateHistory } from './history';
import { findTemplate, type DocTemplate } from './templates';

export interface UseDocumentOptions<S> {
  kind: DocKind<S>;
  templates: readonly DocTemplate<S>[];
  /** Endereço do app (ex.: '/apps/planilhas/'). */
  path: string;
  /** Imagens/arquivos binários do documento (Blobs), quando o app usa. */
  withImages?: boolean;
  /** Atraso do salvamento automático. */
  delay?: number;
}

/**
 * Ciclo de vida de um documento: abre (?doc=), cria a partir de modelo (?modelo=),
 * salva automaticamente SÓ depois de alguma alteração, protege contra conflito de revisão
 * e nunca anuncia "Salvo" antes de a transação do IndexedDB terminar.
 */
export function useDocument<S>(options: UseDocumentOptions<S>) {
  const params = new URLSearchParams(location.search);
  const docId = params.get('doc');
  const template = findTemplate(options.templates, params.get('modelo')) ?? options.templates[0];
  if (!template) throw new Error('App sem modelo inicial.');
  const state = ref(template.create()) as Ref<S>;
  const images = shallowRef<LegacyImage[]>([]);
  const record = shallowRef<CopyRecord | null>(null);
  const status = ref<SaveState>('new');
  const error = ref('');
  const loadError = ref('');
  const loading = ref(Boolean(docId));
  const note = ref('');
  const history = new StateHistory<S>(state.value);
  const historyTick = ref(0);
  const canUndo = computed(() => { void historyTick.value; return history.canUndo; });
  const canRedo = computed(() => { void historyTick.value; return history.canRedo; });

  const signature = (): string => {
    const data = options.kind.normalize(state.value);
    return JSON.stringify(data) + '|' + images.value.map((i) => i.id + ':' + (i.blob?.size ?? 0)).join(',');
  };
  let committed = safeSignature();
  function safeSignature(): string { try { return signature(); } catch { return ''; } }
  const dirty = (): boolean => { try { return signature() !== committed; } catch { return true; } };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;
  let applyingHistory = false;
  let alive = true;

  function say(text: string): void { note.value = ''; queueMicrotask(() => { note.value = text; }); }

  function schedule(): void {
    if (loading.value || status.value === 'conflict' || status.value === 'unavailable') return;
    if (!dirty()) { clearTimeout(timer); if (!saving) status.value = record.value ? 'saved' : 'new'; return; }
    if (!saving) status.value = 'pending';
    clearTimeout(timer);
    timer = setTimeout(() => { void saveNow(); }, options.delay ?? 800);
  }

  async function saveNow(): Promise<void> {
    clearTimeout(timer);
    if (saving) { await saving; if (!dirty()) return; }
    if (loading.value || status.value === 'conflict' || status.value === 'unavailable' || !dirty()) return;
    saving = (async () => {
      while (dirty() && alive) {
        let data: S;
        try { data = options.kind.normalize(state.value); }
        catch (err) { status.value = 'error'; error.value = friendlyError(err); return; }
        const value = signature();
        const files = images.value;
        status.value = 'saving'; error.value = '';
        try {
          const first = !record.value;
          const saved = record.value
            ? await saveDoc(options.kind, record.value, data, options.withImages ? files : undefined)
            : await createDoc(options.kind, data, options.withImages ? files : []);
          record.value = saved;
          committed = value;
          if (first) { try { window.history.replaceState(null, '', options.path + '?doc=' + encodeURIComponent(saved.id)); } catch { /* sem URL */ } }
          status.value = dirty() ? 'pending' : 'saved';
          if (status.value === 'saved') say('Salvo neste aparelho.');
        } catch (err) {
          if (err instanceof RevisionConflict) {
            status.value = 'conflict';
            error.value = 'Outra janela alterou este documento. Suas alterações continuam na tela e nada foi sobrescrito.';
          } else { status.value = 'error'; error.value = friendlyError(err); }
          return;
        }
      }
    })();
    try { await saving; } finally { saving = null; }
  }

  /** Conflito: grava o que está na tela como um documento novo, sem tocar no original. */
  async function saveAsCopy(): Promise<void> {
    try {
      const data = options.kind.normalize(state.value);
      const named = { ...(data as object), name: options.kind.label(data) + ' (cópia)' } as S;
      const created = await createDoc(options.kind, named, options.withImages ? images.value : []);
      state.value = options.kind.normalize(created.snapshot.doc.state);
      record.value = created;
      committed = safeSignature();
      window.history.replaceState(null, '', options.path + '?doc=' + encodeURIComponent(created.id));
      status.value = 'saved'; error.value = '';
      say('Nova cópia salva. A versão da outra janela ficou intacta.');
    } catch (err) { status.value = 'error'; error.value = friendlyError(err); }
  }
  async function reloadSaved(): Promise<void> {
    if (!record.value) return;
    try {
      const opened = await openDoc(options.kind, record.value.id);
      applyingHistory = true;
      record.value = opened.record; state.value = opened.state; images.value = opened.record.snapshot.images ?? [];
      committed = safeSignature(); history.reset(state.value); historyTick.value++;
      status.value = 'saved'; error.value = '';
      say('Versão salva reaberta.');
    } catch (err) { error.value = friendlyError(err); }
    finally { queueMicrotask(() => { applyingHistory = false; }); }
  }
  function undo(): void {
    const prev = history.undo(); if (prev === null) return;
    applyingHistory = true; state.value = prev; historyTick.value++;
    queueMicrotask(() => { applyingHistory = false; }); say('Desfeito.');
  }
  function redo(): void {
    const next = history.redo(); if (next === null) return;
    applyingHistory = true; state.value = next; historyTick.value++;
    queueMicrotask(() => { applyingHistory = false; }); say('Refeito.');
  }
  /** Agrupa digitação contínua num passo só de desfazer. */
  let changeKey = '';
  function setChangeKey(key: string): void { changeKey = key; }

  watch(state, () => {
    if (!applyingHistory && history.record(state.value, changeKey)) historyTick.value++;
    changeKey = '';
    schedule();
  }, { deep: true });
  watch(images, () => schedule());

  function newFrom(templateId: string): void {
    if ((dirty() || saving || status.value === 'conflict' || status.value === 'error') && !confirm('Há alterações que podem não ter sido salvas. Abrir outro documento mesmo assim?')) return;
    location.assign(options.path + '?modelo=' + encodeURIComponent(templateId));
  }
  function beforeUnload(event: BeforeUnloadEvent): void {
    if (dirty() || saving || status.value === 'conflict') { event.preventDefault(); event.returnValue = ''; }
  }
  function keys(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); void saveNow(); return; }
    const t = event.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) return; // dentro de campos valem os atalhos nativos do campo
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
    else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
  }
  onMounted(async () => {
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keys);
    if (!docId) return;
    try {
      const opened = await openDoc(options.kind, docId);
      if (!alive) return;
      applyingHistory = true;
      record.value = opened.record; state.value = opened.state; images.value = opened.record.snapshot.images ?? [];
      committed = safeSignature(); history.reset(state.value); historyTick.value++;
      status.value = 'saved';
    } catch (err) { loadError.value = friendlyError(err); status.value = 'unavailable'; }
    finally { loading.value = false; queueMicrotask(() => { applyingHistory = false; }); }
  });
  onBeforeUnmount(() => {
    alive = false; clearTimeout(timer);
    window.removeEventListener('beforeunload', beforeUnload);
    window.removeEventListener('keydown', keys);
  });

  return {
    state, images, record, status, error, loadError, loading, note, canUndo, canRedo,
    saveNow, saveAsCopy, reloadSaved, undo, redo, newFrom, setChangeKey, say, template,
    isDirty: dirty
  };
}
export type DocumentController<S> = ReturnType<typeof useDocument<S>>;
