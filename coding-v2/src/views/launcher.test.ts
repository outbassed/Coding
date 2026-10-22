import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountLauncher, violations } from '../test/helpers';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('Launcher · telas', () => {
  it('Início mostra os dois apps ativados e um único h1', async () => {
    const { wrapper } = await mountLauncher('/');
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.findAll('article.card')).toHaveLength(2);
    expect(wrapper.text()).toContain('Explorar o catálogo');
    wrapper.unmount();
  });

  it('Catálogo lista os nove e filtra', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    expect(wrapper.findAll('article.card')).toHaveLength(9);
    const soon = wrapper.findAll('button.f').find((b) => b.text() === 'Em breve');
    await soon?.trigger('click');
    expect(wrapper.findAll('article.card')).toHaveLength(7);
    await wrapper.findAll('button.f').find((b) => b.text() === 'Ativados')?.trigger('click');
    expect(wrapper.findAll('article.card')).toHaveLength(2);
    wrapper.unmount();
  });

  it('busca ignora acentos', async () => {
    const { wrapper, router } = await mountLauncher('/catalogo');
    await router.replace({ name: 'catalog', query: { q: 'planilha' } });
    await flushPromises();
    const names = wrapper.findAll('article.card h3').map((h) => h.text());
    expect(names).toEqual(expect.arrayContaining(['Planilhas', 'Planilha → Etiquetas']));
    expect(names).not.toContain('Texto');
    wrapper.unmount();
  });

  it('Detalhes separa os três níveis sem afirmar offline nem instalação', async () => {
    const { wrapper } = await mountLauncher('/app/labels');
    const levels = wrapper.findAll('li.level');
    expect(levels.map((l) => l.attributes('data-level'))).toEqual(['activation', 'offline', 'install']);
    expect(levels[0]?.text()).toContain('Ativado');
    expect(levels[1]?.text()).toContain('Não verificado');
    expect(levels[2]?.text()).toContain('Não comprovado');
    expect(wrapper.text()).not.toMatch(/disponível offline\s*(✓|ativo)/i);
    wrapper.unmount();
  });

  it('Detalhes de app planejado leva ao Coding atual e não oferece ativar', async () => {
    const { wrapper } = await mountLauncher('/app/images');
    expect(wrapper.findAll('main button').filter((b) => /Ativar|Desativar/.test(b.text()))).toHaveLength(0);
    const link = wrapper.findAll('a').find((a) => (a.attributes('href') ?? '').includes('#/imagens'));
    expect(link).toBeTruthy();
    wrapper.unmount();
  });

  it('id inexistente mostra aviso, não quebra', async () => {
    const { wrapper } = await mountLauncher('/app/nada');
    expect(wrapper.text()).toContain('Aplicativo não encontrado');
    wrapper.unmount();
  });

  it('Documentos não finge ler o banco antigo', async () => {
    const { wrapper } = await mountLauncher('/documentos');
    expect(wrapper.text()).toContain('O Coding 1.0 não é alterado');
    wrapper.unmount();
  });

  it('rota desconhecida cai na página de não encontrado', async () => {
    const { wrapper } = await mountLauncher('/qualquer/coisa');
    expect(wrapper.text()).toContain('Página não encontrada');
    wrapper.unmount();
  });
});

describe('Launcher · aparência de loja', () => {
  it('Início destaca o app funcional com ação real e não inventa documentos recentes', async () => {
    const { wrapper } = await mountLauncher('/');
    const hero = wrapper.find('[data-testid="featured"]');
    expect(hero.text()).toContain('Etiquetas');
    expect(hero.text()).toContain('Editor funcional');
    expect(hero.find('a[href="/apps/etiquetas/"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="recent-docs"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('2 editores disponíveis');
    wrapper.unmount();
  });

  it('Catálogo filtra por categoria e mostra o destaque só sem filtros', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    expect(wrapper.find('[data-testid="spotlight"]').exists()).toBe(true);
    await wrapper.findAll('button.cat').find((b) => b.text() === 'Etiquetas e códigos')?.trigger('click');
    expect(wrapper.findAll('article.card h3').map((h) => h.text()).sort()).toEqual(['Etiquetas', 'Planilha → Etiquetas', 'QR / Barras']);
    expect(wrapper.find('[data-testid="spotlight"]').exists()).toBe(false);
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('article.card')).toHaveLength(9);
    wrapper.unmount();
  });

  it('cada card diz o que de fato existe: funcional, prévia ou em breve', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    const meta = Object.fromEntries(wrapper.findAll('article.card').map((c) => [c.find('h3').text(), c.find('[data-testid="card-meta"]').text()]));
    expect(meta['Etiquetas']).toContain('Editor funcional');
    expect(meta['Texto']).toContain('Editor funcional');
    expect(meta['Planilhas']).toContain('Em breve');
    wrapper.unmount();
  });

  it('Detalhes de Etiquetas e Texto mostram os recursos entregues', async () => {
    const a = await mountLauncher('/app/labels');
    expect(a.wrapper.find('[data-testid="ready-list"]').text()).toContain('Imprimir e baixar PDF');
    a.wrapper.unmount();
    const b = await mountLauncher('/app/texts');
    expect(b.wrapper.find('[data-testid="ready-list"]').text()).toContain('Salvamento automático');
    b.wrapper.unmount();
  });

  it('Meus apps oferece ativar o que está desativado, sem instalar nada', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    expect(wrapper.find('[data-testid="available-to-activate"]').exists()).toBe(false);
    await wrapper.find('button[aria-label="Desativar Texto no Launcher"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('dialog button').find((b) => b.text() === 'Desativar atalho')?.trigger('click');
    await flushPromises();
    const box = wrapper.find('[data-testid="available-to-activate"]');
    expect(box.text()).toContain('Texto');
    expect(box.text()).toContain('não instala nada');
    await box.find('button[aria-label="Ativar Texto no Launcher"]').trigger('click');
    expect(wrapper.find('[data-testid="available-to-activate"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Launcher · ativação', () => {
  it('desativar pede confirmação, mantém documentos e avisa leitores de tela', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    const button = wrapper.find('button[aria-label="Desativar Etiquetas no Launcher"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    await flushPromises();
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    expect(wrapper.text()).toContain('Seus documentos não são apagados');
    const confirm = wrapper.findAll('dialog button').find((b) => b.text() === 'Desativar atalho');
    await confirm?.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('article.card')).toHaveLength(1);
    expect(wrapper.find('[data-testid="announcer"]').text()).toContain('Seus documentos não foram removidos');
    wrapper.unmount();
  });

  it('cancelar não altera nada', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    await wrapper.find('button[aria-label="Desativar Texto no Launcher"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('dialog button').find((b) => b.text() === 'Cancelar')?.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('article.card')).toHaveLength(2);
    wrapper.unmount();
  });

  it('ativar de novo é imediato e os botões têm nome acessível específico', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    await wrapper.find('button[aria-label="Desativar Texto no Launcher"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('dialog button').find((b) => b.text() === 'Desativar atalho')?.trigger('click');
    await flushPromises();
    const activate = wrapper.find('button[aria-label="Ativar Texto no Launcher"]');
    expect(activate.exists()).toBe(true);
    await activate.trigger('click');
    expect(wrapper.find('button[aria-label="Desativar Texto no Launcher"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Launcher · acessibilidade (axe)', () => {
  for (const path of ['/', '/meus-apps', '/catalogo', '/app/texts', '/app/calc', '/documentos', '/ajustes', '/nada']) {
    it('sem violações em ' + path, async () => {
      const { wrapper } = await mountLauncher(path);
      expect(await violations(wrapper.element)).toEqual([]);
      wrapper.unmount();
    });
  }
  it('tem link para pular e navegação com nomes', async () => {
    const { wrapper } = await mountLauncher('/');
    expect(wrapper.find('a.skip-link').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navegação principal"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navegação móvel"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
