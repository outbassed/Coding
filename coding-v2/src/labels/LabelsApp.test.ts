import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { clearViewport, stubViewport, violations } from '../test/helpers';
import LabelsApp from './LabelsApp.vue';

async function open(width = 1280) {
  stubViewport(width);
  setActivePinia(createPinia());
  const wrapper = mount(LabelsApp, { global: { plugins: [createPinia()] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}
afterEach(() => { clearViewport(); document.body.innerHTML = ''; });

describe('Etiquetas · editor real', () => {
  it('abre com o modelo inicial, sem aviso de prévia e com status honesto', async () => {
    const w = await open();
    expect(w.text()).not.toContain('Prévia ilustrativa');
    expect(w.get('[data-testid="save-status"]').text()).toBe('Novo · ainda não salvo');
    expect(w.get('[data-testid="sheet"]').text()).toContain('COD: 123');
    expect(w.get('[data-testid="sheet"]').text()).toContain('Sua descrição aqui');
    w.unmount();
  });
  it('digitar atualiza a folha e marca alterações pendentes', async () => {
    const w = await open();
    await w.get('#code-' + (w.get('[data-item]').attributes('data-item') as string)).setValue('XYZ-1');
    await flushPromises();
    expect(w.get('[data-testid="sheet"]').text()).toContain('COD: XYZ-1');
    expect(w.get('[data-testid="save-status"]').text()).toBe('Alterações pendentes');
    expect(w.get('[data-testid="undo"]').attributes('disabled')).toBeUndefined();
    w.unmount();
  });
  it('seções do painel trocam por clique e por setas', async () => {
    const w = await open();
    const tabs = w.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual(['Itens', 'Formato', 'Página', 'Modelos', 'Exportar']);
    await tabs[1]!.trigger('click');
    expect(w.find('[data-testid="format-panel"]').exists()).toBe(true);
    await w.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.find('[data-testid="page-panel"]').exists()).toBe(true);
    w.unmount();
  });
  it('colunas e orientação mudam o documento', async () => {
    const w = await open();
    await w.findAll('[role="tab"]')[2]!.trigger('click');
    await w.get('button[aria-label="3 colunas"]').trigger('click');
    expect(w.get('[data-testid="page-panel"]').find('button[aria-label="3 colunas"]').attributes('aria-pressed')).toBe('true');
    await w.findAll('button').find((b) => b.text() === 'Paisagem')!.trigger('click');
    expect(w.get('[data-testid="paper-dims"]').text()).toContain('297 × 210 mm');
    w.unmount();
  });
  it('celular: controles embaixo (faixa de ferramentas) e prévia no alto', async () => {
    const w = await open(390);
    expect(w.find('[data-testid="tool-strip"]').exists()).toBe(true);
    expect(w.find('[data-testid="bottom-sheet"]').exists()).toBe(true);
    expect(w.find('[data-testid="items-panel"]').exists()).toBe(true);
    expect(w.find('section.side').exists()).toBe(false);
    w.unmount();
  });
  it('sem violações de acessibilidade (computador e celular)', async () => {
    for (const width of [1280, 390]) {
      const w = await open(width);
      expect(await violations(w.element as HTMLElement)).toEqual([]);
      w.unmount();
    }
  });
});
