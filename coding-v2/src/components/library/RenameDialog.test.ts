import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { violations } from '../../test/helpers';
import RenameDialog from './RenameDialog.vue';

const base = { open: true, modelValue: 'Meu nome', currentLabel: 'Nome da outra janela', currentRevision: 3, currentUpdatedAt: 1700000000000, error: '', busy: false };

describe('RenameDialog', () => {
  it('modo edição: campo rotulado, salvar e cancelar emitem eventos', async () => {
    const w = mount(RenameDialog, { props: { ...base, mode: 'edit' }, attachTo: document.body });
    expect(w.find('label').text()).toBe('Novo nome da cópia');
    await w.find('form').trigger('submit');
    expect(w.emitted('save')).toHaveLength(1);
    await w.findAll('button').find((b) => b.text() === 'Cancelar')!.trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(await violations(w.element as HTMLElement)).toEqual([]);
    w.unmount();
  });
  it('modo conflito: mostra os dois nomes e as três saídas, sem sobrescrever', async () => {
    const w = mount(RenameDialog, { props: { ...base, mode: 'conflict' }, attachTo: document.body });
    expect(w.get('[data-testid="conflict-mine"]').text()).toBe('Meu nome');
    expect(w.get('[data-testid="conflict-theirs"]').text()).toBe('Nome da outra janela');
    const labels = w.findAll('button').map((b) => b.text());
    expect(labels).toEqual(['Cancelar e não sobrescrever', 'Atualizar e usar o nome da outra janela', 'Salvar o meu nome como nova cópia']);
    await w.findAll('button')[2]!.trigger('click');
    expect(w.emitted('saveAsNew')).toHaveLength(1);
    expect(w.emitted('save')).toBeUndefined();
    w.unmount();
  });
  it('modo ausente: só oferece atualizar a lista', () => {
    const w = mount(RenameDialog, { props: { ...base, mode: 'missing' }, attachTo: document.body });
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Atualizar a lista']);
    w.unmount();
  });
});
