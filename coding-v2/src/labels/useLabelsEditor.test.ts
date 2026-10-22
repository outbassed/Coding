import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import type { CopyRecord } from '../storage/documents';
import { RevisionConflict } from '../storage/documents';
import { useLabelsEditor, type LabelsStoreApi } from './useLabelsEditor';
import { defaults, normalize, type LabelsState } from './model';

function record(id: string, revision: number, state: LabelsState): CopyRecord {
  return { id, legacyId: 'v2-labels-' + id, source: 'backup', label: state.name, revision, createdAt: 1, updatedAt: 1000 + revision,
    snapshot: { source: 'backup', doc: { id: 'v2-labels-' + id, type: 'labels', state: { ...state } }, images: [] } };
}
function fakeApi(over: Partial<LabelsStoreApi> = {}) {
  const calls = { create: 0, save: 0, saveAsNew: 0 };
  const api: LabelsStoreApi = {
    create: async (s) => { calls.create += 1; return record('c1', 1, s); },
    save: async (base, s) => { calls.save += 1; return record(base.id, base.revision + 1, s); },
    saveAsNew: async (s) => { calls.saveAsNew += 1; return record('c2', 1, s); },
    open: async (id) => ({ record: record(id, 1, normalize({ name: 'Aberto', items: [{ code: 'Z', copies: 2 }] })), state: normalize({ name: 'Aberto', items: [{ code: 'Z', copies: 2 }] }) }),
    ...over
  };
  return { api, calls };
}
function setup(api: LabelsStoreApi, extra: { onIdentified?: (id: string) => void } = {}) {
  let editor!: ReturnType<typeof useLabelsEditor>;
  const wrapper = mount(defineComponent({ setup() { editor = useLabelsEditor({ api, debounceMs: 50, ...extra }); return () => h('div'); } }));
  return { editor, wrapper };
}

describe('editor de Etiquetas: estado e salvamento', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('documento novo começa limpo e sem gravar nada', async () => {
    const { api, calls } = fakeApi();
    const { editor, wrapper } = setup(api);
    editor.startNew();
    expect(editor.saveState.value).toBe('new');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.create).toBe(0);
    wrapper.unmount();
  });
  it('editar marca pendente e só depois da confirmação do banco mostra salvo', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { api } = fakeApi({ create: async (s) => { await gate; return record('c1', 1, s); } });
    const identified: string[] = [];
    const { editor, wrapper } = setup(api, { onIdentified: (id) => identified.push(id) });
    editor.startNew();
    editor.setField('name', 'Estoque');
    expect(editor.saveState.value).toBe('pending');
    await vi.advanceTimersByTimeAsync(60);
    expect(editor.saveState.value).toBe('saving');
    release(); await vi.advanceTimersByTimeAsync(1);
    expect(editor.saveState.value).toBe('saved');
    expect(editor.copyId.value).toBe('c1');
    expect(identified).toEqual(['c1']);
    wrapper.unmount();
  });
  it('digitar muitas vezes grava uma vez (debounce) e usa a revisão confirmada', async () => {
    const { api, calls } = fakeApi();
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    for (const v of ['a', 'ab', 'abc']) editor.setItem(editor.state.value.items[0]!.id, { code: v });
    await vi.advanceTimersByTimeAsync(80);
    expect(calls.save).toBe(1);
    editor.setField('prefix', 'X');
    await vi.advanceTimersByTimeAsync(80);
    expect(calls.save).toBe(2);
    wrapper.unmount();
  });
  it('edição durante a gravação não é dada como salva', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let saves = 0;
    const { api } = fakeApi({ save: async (b, s) => { saves += 1; await gate; return record(b.id, b.revision + 1, s); } });
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    editor.setField('name', 'Um');
    await vi.advanceTimersByTimeAsync(60);
    expect(editor.saveState.value).toBe('saving');
    editor.setField('name', 'Dois');
    release(); await vi.advanceTimersByTimeAsync(5);
    expect(saves).toBeGreaterThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(saves).toBe(2);
    expect(editor.saveState.value).toBe('saved');
    wrapper.unmount();
  });
  it('falha de gravação vira erro verdadeiro, mantém o conteúdo e permite tentar de novo', async () => {
    let fail = true;
    const { api } = fakeApi({ save: async (b, s) => { if (fail) throw Object.assign(new Error('x'), { name: 'QuotaExceededError' }); return record(b.id, b.revision + 1, s); } });
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    editor.setField('name', 'Importante');
    await vi.advanceTimersByTimeAsync(80);
    expect(editor.saveState.value).toBe('error');
    expect(editor.saveError.value).toContain('cheio');
    expect(editor.state.value.name).toBe('Importante');
    fail = false;
    await editor.saveNow();
    expect(editor.saveState.value).toBe('saved');
    wrapper.unmount();
  });
  it('conflito de revisão: não sobrescreve, para o salvamento e oferece saídas', async () => {
    const { api, calls } = fakeApi({ save: async () => { throw new RevisionConflict(); } });
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    editor.setField('name', 'Minha versão');
    await vi.advanceTimersByTimeAsync(80);
    expect(editor.saveState.value).toBe('conflict');
    editor.setField('prefix', 'Y');
    await vi.advanceTimersByTimeAsync(500);
    expect(editor.saveState.value).toBe('conflict');
    await editor.saveCopyOfConflict();
    expect(calls.saveAsNew).toBe(1);
    expect(editor.copyId.value).toBe('c2');
    expect(editor.saveState.value).toBe('saved');
    wrapper.unmount();
  });
  it('descartar e reabrir a versão salva volta ao conteúdo do banco', async () => {
    const { api } = fakeApi({ save: async () => { throw new RevisionConflict(); } });
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    editor.setField('name', 'Perdida');
    await vi.advanceTimersByTimeAsync(80);
    await editor.reloadSaved();
    expect(editor.state.value.name).toBe('Aberto');
    expect(editor.saveState.value).toBe('saved');
    wrapper.unmount();
  });
  it('desfazer volta ao salvo (limpo) e refazer volta a pendente', async () => {
    const { api, calls } = fakeApi();
    const { editor, wrapper } = setup(api);
    await editor.load('c1');
    editor.setField('name', 'Novo nome');
    expect(editor.canUndo.value).toBe(true);
    editor.undo();
    expect(editor.state.value.name).toBe('Aberto');
    expect(editor.saveState.value).toBe('saved');
    await vi.advanceTimersByTimeAsync(200);
    expect(calls.save).toBe(0);
    editor.redo();
    expect(editor.saveState.value).toBe('pending');
    wrapper.unmount();
  });
  it('erro ao abrir mostra mensagem em português e não inventa documento', async () => {
    const { api } = fakeApi({ open: async () => { throw Object.assign(new Error('x'), { name: 'MissingCopy' }); } });
    const { editor, wrapper } = setup(api);
    await editor.load('sumiu');
    expect(editor.loadError.value).toContain('não existe mais');
    wrapper.unmount();
  });
  it('itens: adicionar, duplicar, mover, excluir e limite', () => {
    const { api } = fakeApi();
    const { editor, wrapper } = setup(api);
    editor.startNew();
    const first = editor.state.value.items[0]!.id;
    const added = editor.addItem()!;
    const dup = editor.duplicateItem(first)!;
    expect(editor.state.value.items.map((i) => i.id)).toEqual([first, dup, added]);
    editor.moveItem(added, -1);
    expect(editor.state.value.items.map((i) => i.id)).toEqual([first, added, dup]);
    editor.removeItem(added);
    expect(editor.state.value.items).toHaveLength(2);
    editor.removeItem(first); editor.removeItem(dup);
    expect(editor.state.value.items).toHaveLength(1);
    expect(editor.state.value.items[0]).toMatchObject({ code: '', description: '', copies: 1 });
    expect(defaults().items).toHaveLength(1);
    wrapper.unmount();
  });
  it('cópias: passos respeitam 1..500', () => {
    const { api } = fakeApi();
    const { editor, wrapper } = setup(api);
    editor.startNew();
    const id = editor.state.value.items[0]!.id;
    for (let i = 0; i < 10; i++) editor.stepCopies(id, -1);
    expect(editor.state.value.items[0]!.copies).toBe(1);
    editor.setItem(id, { copies: 499 }); editor.stepCopies(id, 5);
    expect(editor.state.value.items[0]!.copies).toBe(500);
    wrapper.unmount();
  });

  it('colar lista entra como uma única alteração e desfaz de uma vez', async () => {
    const { api } = fakeApi();
    const { editor } = setup(api);
    editor.startNew();
    const rows = [{ line: 1, code: 'A', description: 'x', copies: 2, notes: [] }, { line: 2, code: 'B', description: '', copies: 1, notes: [] }];
    expect(editor.addMany(rows, false)).toBe(2);
    expect(editor.state.value.items.map((i) => i.code)).toEqual(['123', 'A', 'B']);
    editor.undo();
    expect(editor.state.value.items.map((i) => i.code)).toEqual(['123']);
    editor.redo();
    editor.addMany(rows, true);
    expect(editor.state.value.items.map((i) => i.code)).toEqual(['A', 'B']);
    expect(editor.addMany([], false)).toBe(0);
  });
});
