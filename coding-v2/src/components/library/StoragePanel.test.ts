import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { violations } from '../../test/helpers';
import StoragePanel from './StoragePanel.vue';

function stubStorage(storage: unknown): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
}
afterEach(() => { Reflect.deleteProperty(navigator, 'storage'); });

describe('StoragePanel', () => {
  it('mostra uso e cota estimados com a ressalva de que não é espaço livre', async () => {
    stubStorage({ estimate: async () => ({ usage: 5 * 1048576, quota: 100 * 1048576 }), persisted: async () => false, persist: async () => false });
    const w = mount(StoragePanel, { props: { refreshKey: 0 }, attachTo: document.body });
    await flushPromises();
    expect(w.get('[data-testid="storage-usage"]').text()).toContain('5,0 MB');
    expect(w.get('[data-testid="storage-usage"]').text()).toContain('100,0 MB');
    expect(w.text()).toContain('Não é o espaço livre do aparelho');
    expect(w.get('[data-testid="storage-persisted"]').text()).toContain('não ativado');
    expect(await violations(w.element as HTMLElement)).toEqual([]);
    w.unmount();
  });
  it('só pede armazenamento persistente quando o usuário clica; negação vira texto, não erro', async () => {
    const persist = vi.fn(async () => false);
    stubStorage({ estimate: async () => ({ usage: 1, quota: 1000 }), persisted: async () => false, persist });
    const w = mount(StoragePanel, { props: { refreshKey: 0 }, attachTo: document.body });
    await flushPromises();
    expect(persist).not.toHaveBeenCalled();
    await w.get('[data-testid="ask-persist"]').trigger('click');
    await flushPromises();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(w.get('[data-testid="persist-message"]').text()).toContain('não concedeu');
    expect(w.emitted('announce')).toHaveLength(1);
    w.unmount();
  });
  it('concedido: esconde o botão e confirma', async () => {
    let persisted = false;
    stubStorage({ estimate: async () => ({ usage: 1, quota: 1000 }), persisted: async () => persisted, persist: async () => { persisted = true; return true; } });
    const w = mount(StoragePanel, { props: { refreshKey: 0 }, attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="ask-persist"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ask-persist"]').exists()).toBe(false);
    expect(w.get('[data-testid="persist-message"]').text()).toContain('ativado');
    w.unmount();
  });
  it('navegador sem API: explica e não oferece botão', async () => {
    const w = mount(StoragePanel, { props: { refreshKey: 0 }, attachTo: document.body });
    await flushPromises();
    expect(w.find('[data-testid="storage-unsupported"]').exists()).toBe(true);
    expect(w.find('[data-testid="ask-persist"]').exists()).toBe(false);
    w.unmount();
  });
  it('falha ao estimar: mensagem tranquila, sem quebrar', async () => {
    stubStorage({ estimate: async () => { throw new Error('boom'); }, persisted: async () => false });
    const w = mount(StoragePanel, { props: { refreshKey: 0 }, attachTo: document.body });
    await flushPromises();
    expect(w.get('[data-testid="storage-problem"]').text()).toContain('não informou');
    w.unmount();
  });
});
