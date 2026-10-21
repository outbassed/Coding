import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { clearViewport, mountEditor, stubViewport, violations } from './test/helpers';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; clearViewport(); });

describe('Editores · desktop', () => {
  for (const [id, name] of [['labels', 'Etiquetas'], ['texts', 'Texto']] as const) {
    it(name + ': prévia identificada, folha, faixa de comandos e painel', async () => {
      stubViewport(1280);
      const wrapper = await mountEditor(id);
      expect(wrapper.find('h1').text()).toBe(name);
      expect(wrapper.text()).toContain('Prévia ilustrativa');
      expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Prévia · nada é salvo');
      expect(wrapper.text()).not.toMatch(/\bSalvo\b/);
      expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="side-drawer"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="sheet"]').exists()).toBe(true);
      expect(wrapper.find('[data-layout="wide"]').exists()).toBe(true);
      wrapper.unmount();
    });
  }

  it('nenhum comando previsto está habilitado (sem botões decorativos)', async () => {
    stubViewport(1280);
    const wrapper = await mountEditor('labels');
    const commands = wrapper.findAll('.cmd');
    expect(commands.length).toBeGreaterThan(4);
    expect(commands.every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    wrapper.unmount();
  });

  it('abas trocam o conteúdo e setas navegam', async () => {
    stubViewport(1280);
    const wrapper = await mountEditor('texts');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');
    await tabs[1]?.trigger('click');
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Inserir');
    expect(wrapper.find('[role="tabpanel"]').text()).toContain('Imagem');
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Página');
    wrapper.unmount();
  });

  it('zoom funciona e respeita limites', async () => {
    stubViewport(1280);
    const wrapper = await mountEditor('labels');
    const plus = wrapper.find('button[aria-label="Aumentar zoom"]');
    await plus.trigger('click');
    expect(wrapper.find('.foot').text()).toContain('125%');
    for (let i = 0; i < 6; i++) await plus.trigger('click');
    expect(wrapper.find('.foot').text()).toContain('200%');
    expect(plus.attributes('disabled')).toBeDefined();
    await wrapper.find('button[aria-label="Voltar para 100%"]').trigger('click');
    expect(wrapper.find('.foot').text()).toContain('100%');
    wrapper.unmount();
  });

  it('painel lateral fecha e reabre pelo botão Propriedades', async () => {
    stubViewport(1280);
    const wrapper = await mountEditor('labels');
    await wrapper.find('button[aria-label="Fechar painel"]').trigger('click');
    expect(wrapper.find('[data-testid="side-drawer"]').exists()).toBe(false);
    await wrapper.find('button.toggle').trigger('click');
    expect(wrapper.find('[data-testid="side-drawer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('folha de etiquetas tem 24 posições; texto tem título', async () => {
    stubViewport(1280);
    const labels = await mountEditor('labels');
    expect(labels.findAll('[data-testid="labels-sheet"] .cell')).toHaveLength(24);
    labels.unmount();
    const texts = await mountEditor('texts');
    expect(texts.find('[data-testid="text-sheet"] h2').exists()).toBe(true);
    texts.unmount();
  });
});

describe('Editores · tablet e celular', () => {
  it('tablet: faixa de comandos e gaveta inferior, sem painel lateral', async () => {
    stubViewport(768);
    const wrapper = await mountEditor('texts');
    expect(wrapper.find('[data-layout="tablet"]').exists()).toBe(true);
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="side-drawer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('celular: prévia, barra de ferramentas e gaveta que abre, muda de altura e fecha', async () => {
    stubViewport(390);
    const wrapper = await mountEditor('labels');
    expect(wrapper.find('[data-layout="phone"]').exists()).toBe(true);
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(false);
    const chips = wrapper.findAll('[data-testid="tool-strip"] .chip');
    expect(chips).toHaveLength(4);
    await chips[1]?.trigger('click');
    const sheet = wrapper.find('[data-testid="bottom-sheet"]');
    expect(sheet.exists()).toBe(true);
    expect(sheet.classes()).toContain('snap-half');
    await sheet.find('button[aria-label^="Alterar altura"]').trigger('click');
    expect(wrapper.find('[data-testid="bottom-sheet"]').classes()).toContain('snap-full');
    await wrapper.find('button[aria-label="Fechar gaveta"]').trigger('click');
    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('celular: tocar de novo na ferramenta ativa fecha a gaveta', async () => {
    stubViewport(390);
    const wrapper = await mountEditor('texts');
    const chip = wrapper.findAll('[data-testid="tool-strip"] .chip')[0];
    await chip?.trigger('click');
    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(true);
    await chip?.trigger('click');
    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Editores · acessibilidade (axe)', () => {
  const cases: [string, number, 'labels' | 'texts'][] = [
    ['Etiquetas desktop', 1280, 'labels'], ['Texto desktop', 1280, 'texts'], ['Etiquetas tablet', 768, 'labels'],
    ['Texto celular', 390, 'texts'], ['Etiquetas celular', 390, 'labels']
  ];
  for (const [label, width, id] of cases) {
    it('sem violações: ' + label, async () => {
      stubViewport(width);
      const wrapper = await mountEditor(id);
      if (width < 600) { await wrapper.find('[data-testid="tool-strip"] .chip').trigger('click'); await flushPromises(); }
      expect(await violations(wrapper.element)).toEqual([]);
      wrapper.unmount();
    });
  }
});
