import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { clearViewport, stubViewport, violations } from '../test/helpers';
import ProjectTabs from './ProjectTabs.vue';
import { useProjectTabs, type ProjectTabsController, type ProjectTabsOptions } from './projectTabs';
import { loadTabs, saveTabs } from '../workspace/prefs';

const saved = vi.hoisted(() => ({ counts: {} as Record<string, number> }));
vi.mock('../storage/documents', () => ({
  countSavedByApp: async () => saved.counts,
  getCopy: async () => null,
  saveCopyRevision: async () => { throw new Error('não deveria gravar'); }
}));

/** n abas na ordem d1..dn (as 5 primeiras visíveis); acesso = posição × 10. */
function seed(n: number, active: string | null = null): void {
  saveTabs('calc', { v: 1, open: Array.from({ length: n }, (_, i) => ({ id: 'd' + (i + 1), title: 'Projeto ' + (i + 1), accessedAt: (i + 1) * 10 })), active });
}

function host(overrides: Partial<ProjectTabsOptions> = {}, wide = true) {
  const nav = vi.fn();
  const current = ref<string | null>(null);
  let controller!: ProjectTabsController;
  const wrapper = mount(defineComponent({
    setup() {
      controller = useProjectTabs({
        type: 'calc', path: '/apps/planilhas/', currentId: () => current.value, canLeave: async () => true,
        renameCurrent: () => undefined, navigate: nav, ...overrides
      });
      return () => h(ProjectTabs, { projects: controller, wide });
    }
  }), { attachTo: document.body });
  return { wrapper, nav, current, controller: () => controller };
}

beforeEach(() => { localStorage.clear(); saved.counts = {}; stubViewport(1280); });
afterEach(() => { clearViewport(); document.body.innerHTML = ''; });

describe('abas de projeto · controlador', () => {
  it('mostra no máximo 5 abas e o contador +N (N = abertas − 5)', async () => {
    seed(8);
    const { wrapper } = host();
    await flushPromises();
    expect(wrapper.findAll('[data-testid="project-tab"]')).toHaveLength(5);
    expect(wrapper.get('[data-testid="tab-overflow"]').text()).toBe('+3');
    wrapper.unmount();
  });
  it('sem escondidas não mostra o +N', async () => {
    seed(5);
    const { wrapper } = host();
    await flushPromises();
    expect(wrapper.find('[data-testid="tab-overflow"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('escolher uma aba escondida troca a visível MENOS RECENTEMENTE ACESSADA e navega', async () => {
    seed(7, 'd5'); // d1..d7, acessos 10..70; visíveis d1..d5; d6 e d7 escondidas
    const { wrapper, nav, current } = host();
    current.value = 'd5';
    await flushPromises();
    await wrapper.get('[data-testid="tab-overflow"]').trigger('click');
    const rows = wrapper.findAll('[data-testid="tab-row"]');
    expect(rows.map((r) => r.text())).toEqual(expect.arrayContaining([expect.stringContaining('Projeto 6')]));
    await rows[0]!.get('.pt-row-open').trigger('click');
    await flushPromises();
    const s = loadTabs('calc');
    expect(s.active).toBe('d6');
    expect(s.open.slice(0, 5).map((t) => t.id)).toContain('d6');
    expect(s.open.slice(0, 5).map((t) => t.id)).not.toContain('d1'); // d1 era a menos acessada
    expect(s.open).toHaveLength(7);
    expect(nav).toHaveBeenCalledWith('/apps/planilhas/?doc=d6');
    wrapper.unmount();
  });
  it('fechar uma aba não apaga nada e, se for a aberta, vai para a mais recente', async () => {
    seed(3, 'd3');
    const { wrapper, nav, current } = host();
    current.value = 'd3';
    await flushPromises();
    await wrapper.findAll('[data-testid="tab-close"]')[2]!.trigger('click');
    await flushPromises();
    expect(loadTabs('calc').open.map((t) => t.id)).toEqual(['d1', 'd2']);
    expect(nav).toHaveBeenCalledWith('/apps/planilhas/?doc=d2');
    wrapper.unmount();
  });
  it('fechar a última aba abre um projeto novo em branco (?novo=1)', async () => {
    seed(1, 'd1');
    const { wrapper, nav, current } = host();
    current.value = 'd1';
    await flushPromises();
    await wrapper.get('[data-testid="tab-close"]').trigger('click');
    await flushPromises();
    expect(loadTabs('calc').open).toHaveLength(0);
    expect(nav).toHaveBeenCalledWith('/apps/planilhas/?novo=1');
    wrapper.unmount();
  });
  it('não navega quando canLeave recusa (alterações não salvas)', async () => {
    seed(2, 'd2');
    const { wrapper, nav, current } = host({ canLeave: async () => false });
    current.value = 'd2';
    await flushPromises();
    await wrapper.findAll('[data-testid="project-tab"]')[0]!.trigger('click');
    await flushPromises();
    expect(nav).not.toHaveBeenCalled();
    expect(loadTabs('calc').active).toBe('d2'); // nada mudou
    wrapper.unmount();
  });
  it('"+" cria projeto novo; no limite fica desativado com o motivo', async () => {
    saved.counts = { calc: 32 };
    localStorage.setItem('coding-v2-limits', JSON.stringify({ v: 1, mode: 'manual', tier: 32, overrides: {} }));
    const { wrapper, nav } = host();
    await flushPromises();
    const plus = wrapper.get('[data-testid="tab-new"]');
    expect(plus.attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="tab-limit"]').text()).toContain('Limite de 32 projetos');
    await plus.trigger('click');
    expect(nav).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('abaixo do limite o "+" navega para ?novo=1', async () => {
    saved.counts = { calc: 3 };
    const { wrapper, nav } = host();
    await flushPromises();
    await wrapper.get('[data-testid="tab-new"]').trigger('click');
    await flushPromises();
    expect(nav).toHaveBeenCalledWith('/apps/planilhas/?novo=1');
    wrapper.unmount();
  });
  it('1024 abas abertas: +1019, só 5 visíveis e a lista limita a renderização', async () => {
    seed(1024);
    const { wrapper } = host();
    await flushPromises();
    expect(wrapper.get('[data-testid="tab-overflow"]').text()).toBe('+1019');
    expect(wrapper.findAll('[data-testid="project-tab"]')).toHaveLength(5);
    await wrapper.get('[data-testid="tab-overflow"]').trigger('click');
    expect(wrapper.findAll('[data-testid="tab-row"]').length).toBeLessThanOrEqual(200);
    await wrapper.get('[data-testid="tab-search"]').setValue('Projeto 1024');
    expect(wrapper.findAll('[data-testid="tab-row"]')).toHaveLength(1);
    wrapper.unmount();
  });
  it('mobile: seletor mostra o projeto atual, a contagem e lista todas as abas', async () => {
    stubViewport(390);
    seed(6);
    const { wrapper, current } = host({}, false);
    current.value = 'd2';
    await flushPromises();
    expect(wrapper.get('[data-testid="tab-switcher"]').text()).toContain('Projeto 2');
    await wrapper.get('[data-testid="tab-switcher"]').trigger('click');
    expect(wrapper.findAll('[data-testid="tab-row"]')).toHaveLength(6);
    wrapper.unmount();
  });
  it('renomear a aba aberta usa o documento aberto; mensagem vazia é recusada', async () => {
    seed(2);
    const renameCurrent = vi.fn();
    const { wrapper, current, controller } = host({ renameCurrent });
    current.value = 'd1';
    await flushPromises();
    await controller().rename('d1', '  Novo nome  ');
    expect(renameCurrent).toHaveBeenCalledWith('Novo nome');
    expect(loadTabs('calc').open.find((t) => t.id === 'd1')?.title).toBe('Novo nome');
    await controller().rename('d1', '   ');
    expect(controller().message.value).toContain('vazio');
    wrapper.unmount();
  });
  it('sem violações de acessibilidade (desktop e lista aberta)', async () => {
    seed(7);
    const { wrapper, current } = host();
    current.value = 'd1';
    await flushPromises();
    expect(await violations(wrapper.element as HTMLElement)).toEqual([]);
    await wrapper.get('[data-testid="tab-overflow"]').trigger('click');
    await nextTick();
    expect(await violations(document.body)).toEqual([]);
    wrapper.unmount();
  });
});
