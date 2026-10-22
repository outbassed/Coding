import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DocThumb from './DocThumb.vue';

const mock = vi.hoisted(() => ({
  calls: [] as string[],
  pending: new Map<string, (value: {kind:'text'; html:string}) => void>()
}));
vi.mock('../../previews/loader', () => ({
  cachedPreview: () => undefined,
  loadPreview: (key: {revision:number}) => {
    mock.calls.push(String(key.revision));
    return new Promise(resolve => { mock.pending.set(String(key.revision), resolve); });
  }
}));
beforeEach(() => { mock.calls.splice(0); mock.pending.clear(); });
describe('DocThumb · atualização em tempo real', () => {
  it('invalida revisões e ignora resultados atrasados da anterior', async () => {
    const w = mount(DocThumb, { props: { copy: {id:'same',revision:1,type:'texts'} } });
    expect(mock.calls).toEqual(['1']);
    await w.setProps({copy:{id:'same',revision:2,type:'texts'}});
    expect(mock.calls).toEqual(['1','2']);
    mock.pending.get('1')?.({kind:'text',html:'<p>Anterior</p>'});
    await flushPromises();
    expect(w.text()).not.toContain('Anterior');
    mock.pending.get('2')?.({kind:'text',html:'<p>Atual</p>'});
    await flushPromises();
    expect(w.html()).toContain('Atual');
    expect(w.attributes('data-state')).toBe('ready');
    w.unmount();
  });
});