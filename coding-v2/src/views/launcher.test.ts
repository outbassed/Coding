import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { useOfflineStore } from '../stores/offline';
import { mountLauncher, violations } from '../test/helpers';
import { categories, tools } from '../shared/catalog';
import { latestOf } from '../shared/versions';
import { versionRecords } from '../shared/versions-data';
import { settingsTabs } from '../components/settings/tabs';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('Launcher · telas', () => {
  it('Início é um resumo: identidade, busca, painéis (favoritos, offline, sugestões, novidades) e um único h1', async () => {
    const { wrapper } = await mountLauncher('/');
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toBe('Coding Launcher');
    expect(wrapper.find('input[type="search"][aria-label="Buscar aplicativos"]').exists()).toBe(true);
    // a lista completa fica no Catálogo e em Meus apps; o Início só resume
    expect(wrapper.findAll('article.card')).toHaveLength(0);
    for (const id of ['home-favorites', 'home-device', 'home-discover', 'home-news']) expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="home-discover"] li')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="home-news"] li')).toHaveLength(3);
    // sem os números do topo nem os botões que repetem a navegação
    expect(wrapper.find('[data-testid="home-stats"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="home-actions"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/Prévia|Preview|Antigo|Coding atual|Novo Coding/);
    wrapper.unmount();
  });

  it('a busca do Início filtra os aplicativos ignorando acentos', async () => {
    const { wrapper } = await mountLauncher('/');
    await wrapper.get('#home-search').setValue('PLANILHÁ');
    expect(wrapper.findAll('article.card h3').map((h) => h.text())).toEqual(['Planilhas']);
    await wrapper.get('#home-search').setValue('zzzz');
    expect(wrapper.findAll('article.card')).toHaveLength(0);
    expect(wrapper.text()).toContain('Nenhum aplicativo combina com a busca');
    wrapper.unmount();
  });

  it('Catálogo lista todos, filtra e não tem filtro de ativação', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    expect(wrapper.findAll('article.card')).toHaveLength(tools.length);
    const labels = wrapper.findAll('button.f').map((b) => b.text());
    for (const gone of ['Ativados', 'Não ativados', 'Em breve', 'Todos']) expect(labels).not.toContain(gone);
    wrapper.unmount();
  });

  it('busca ignora acentos', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    await wrapper.get('#catalog-search').setValue('PLANILHÁ');
    const names = wrapper.findAll('article.card h3').map((h) => h.text());
    expect(names).toEqual(['Planilhas']);
    expect(names).not.toContain('Texto');
    wrapper.unmount();
  });

  it('Detalhes: sempre “Abrir editor”, versão e compilação do registro, histórico e seção offline', async () => {
    const { wrapper } = await mountLauncher('/app/labels');
    const open = wrapper.get('[data-testid="open-editor"]');
    expect(open.text()).toBe('Abrir editor');
    expect(open.attributes('href')).toBe('/apps/etiquetas/');
    const release = latestOf('labels', versionRecords)!;
    expect(wrapper.get('[data-testid="app-version"]').text()).toBe(release.version);
    expect(wrapper.get('[data-testid="app-build"]').text()).toBe(release.build);
    expect(wrapper.get('[data-testid="app-history-link"]').attributes('href')).toBe('/versoes/etiquetas/');
    expect(wrapper.find('[data-testid="app-offline"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/Ativar|Ativado|desativ|Disponibilidade e instalação/i);
    wrapper.unmount();
  });

  it('todo app tem o editor e o histórico de versões no endereço da própria pasta', async () => {
    for (const t of tools) {
      const { wrapper } = await mountLauncher('/app/' + t.id);
      expect(wrapper.get('[data-testid="open-editor"]').attributes('href')).toBe(t.path);
      expect(wrapper.get('[data-testid="app-history-link"]').attributes('href')).toBe('/versoes/' + t.path!.split('/')[2] + '/');
      expect(wrapper.find('[data-testid="ready-list"]').exists()).toBe(true);
      expect(wrapper.text()).not.toMatch(/Coding atual|Coding 2|Prévia/);
      wrapper.unmount();
    }
  });

  it('id inexistente mostra aviso, não quebra', async () => {
    const { wrapper } = await mountLauncher('/app/nada');
    expect(wrapper.text()).toContain('Aplicativo não encontrado');
    wrapper.unmount();
  });

  it('Documentos explica que a importação é somente leitura', async () => {
    const { wrapper } = await mountLauncher('/documentos');
    expect(wrapper.text()).toContain('somente leitura');
    expect(wrapper.text()).not.toMatch(/Coding 1\.0|Coding antigo|Coding atual/);
    wrapper.unmount();
  });

  it('rota desconhecida cai na página de não encontrado', async () => {
    const { wrapper } = await mountLauncher('/qualquer/coisa');
    expect(wrapper.text()).toContain('Página não encontrada');
    wrapper.unmount();
  });
});

describe('Launcher · aparência de loja', () => {
  it('Catálogo mostra cards reais com “Abrir”, o Início não inventa documentos recentes', async () => {
    const home = await mountLauncher('/');
    expect(home.wrapper.find('[data-testid="recent-docs"]').exists()).toBe(false);
    home.wrapper.unmount();
    const { wrapper } = await mountLauncher('/catalogo');
    const card = wrapper.find('article.card[data-tool="labels"]');
    expect(card.text()).toContain('Etiquetas');
    expect(card.text()).toContain('Editor funcional');
    expect(card.find('a[href="/apps/etiquetas/"]').text()).toBe('Abrir');
    wrapper.unmount();
  });

  it('favoritos aparecem no painel do Início, com link para o editor', async () => {
    localStorage.setItem('coding-v2-favorites', JSON.stringify(['paint']));
    const { wrapper } = await mountLauncher('/');
    const link = wrapper.get('[data-testid="home-favorites"] ul a');
    expect(link.text()).toBe('Pintar');
    expect(link.attributes('href')).toBe('/apps/pintar/');
    wrapper.unmount();
  });

  it('Catálogo filtra pela lista suspensa de categorias e combina com a busca', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    expect(wrapper.find('[data-testid="category-list"]').isVisible()).toBe(false);
    await wrapper.get('[data-testid="category-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="category-list"]').isVisible()).toBe(true);
    await wrapper.get('[data-category="labels"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="category-button"]').text()).toContain('Etiquetas e códigos');
    expect(wrapper.findAll('article.card h3').map((h) => h.text()).sort()).toEqual(['Etiquetas', 'QR / Barras']);
    await wrapper.get('#catalog-search').setValue('qr');
    expect(wrapper.findAll('article.card h3').map((h) => h.text())).toEqual(['QR / Barras']);
    await wrapper.get('#catalog-search').setValue('texto');
    expect(wrapper.findAll('article.card')).toHaveLength(0);
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('article.card')).toHaveLength(tools.length);
    wrapper.unmount();
  });

  it('cada card diz que o editor é funcional', async () => {
    const { wrapper } = await mountLauncher('/catalogo');
    const meta = Object.fromEntries(wrapper.findAll('article.card').map((c) => [c.find('h3').text(), c.find('[data-testid="card-meta"]').text()]));
    expect(Object.values(meta).every((m) => m.includes('Editor funcional'))).toBe(true);
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

  it('Meus apps sem suporte offline mostra todos os aplicativos, com um aviso, e sem ativar nem desativar nada', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    expect(wrapper.findAll('article.card')).toHaveLength(tools.length);
    expect(wrapper.get('[data-testid="myapps-offline-unsupported"]').text()).toContain('uso offline não está disponível');
    expect(wrapper.find('[data-testid="available-to-activate"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/ativar|ativado|desativ/i);
    wrapper.unmount();
  });
});

/** Simula um navegador com uso offline disponível e o registro do que está instalado já lido. */
async function withOffline(installed: string[], ready = true): Promise<void> {
  const store = useOfflineStore();
  store.supported = true;
  store.ready = ready;
  store.records = Object.fromEntries(installed.map((id) => [id, { id, name: id, version: 'v', files: [], bytes: 0, installedAt: 1 }]));
  await flushPromises();
}

describe('Launcher · Meus apps só com os instalados offline', () => {
  it('mostra apenas os instalados, ignora o Núcleo e não lista os demais', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    await withOffline(['core', 'labels', 'calc']);
    expect(wrapper.find('[data-testid="myapps-offline-unsupported"]').exists()).toBe(false);
    expect(wrapper.findAll('article.card').map((c) => c.attributes('data-tool')).sort()).toEqual(['calc', 'labels']);
    expect(wrapper.find('article.card[data-tool="texts"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('a busca e a ordem valem só dentro dos instalados', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    await withOffline(['labels', 'calc', 'zip']);
    await wrapper.get('#myapps-search').setValue('sorteio');
    expect(wrapper.findAll('article.card')).toHaveLength(0);
    expect(wrapper.text()).toContain('Nenhum aplicativo combina com a busca');
    await wrapper.get('#myapps-search').setValue('etiquetas');
    expect(wrapper.findAll('article.card').map((c) => c.attributes('data-tool'))).toEqual(['labels']);
    wrapper.unmount();
  });

  it('sem nenhum instalado: estado vazio que leva ao Catálogo, sem cartões', async () => {
    const { wrapper, router } = await mountLauncher('/meus-apps');
    await withOffline([]);
    expect(wrapper.findAll('article.card')).toHaveLength(0);
    expect(wrapper.text()).toContain('Nenhum aplicativo instalado ainda');
    const link = wrapper.get('[data-testid="myapps-empty-catalog"]');
    expect(link.attributes('href')).toBe('/catalogo');
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('catalog');
    wrapper.unmount();
  });

  it('enquanto o registro ainda é lido não diz que não há nada instalado', async () => {
    const { wrapper } = await mountLauncher('/meus-apps');
    await withOffline([], false);
    expect(wrapper.text()).toContain('Carregando');
    expect(wrapper.text()).not.toContain('Nenhum aplicativo instalado ainda');
    wrapper.unmount();
  });

  it('o Catálogo continua listando todos os aplicativos e o Início resume', async () => {
    const catalog = await mountLauncher('/catalogo');
    await withOffline([]);
    expect(catalog.wrapper.findAll('article.card')).toHaveLength(tools.length);
    expect(catalog.wrapper.findAll('[data-testid="catalog-shelves"] section')).toHaveLength(categories.filter((c) => tools.some((t) => t.category === c.id)).length);
    catalog.wrapper.unmount();
    const home = await mountLauncher('/');
    await withOffline([]);
    expect(home.wrapper.find('[data-testid="home-panels"]').exists()).toBe(true);
    home.wrapper.unmount();
  });
});

describe('Launcher · sem ativação de aplicativos', () => {
  it('nenhuma tela oferece ativar ou desativar, e nenhum diálogo de desativação existe', async () => {
    for (const path of ['/', '/meus-apps', '/catalogo', '/app/texts']) {
      const { wrapper } = await mountLauncher(path);
      expect(wrapper.findAll('button').filter((b) => /ativar|desativar/i.test(b.text() + (b.attributes('aria-label') ?? '')))).toHaveLength(0);
      expect(document.querySelector('dialog[open]')).toBeNull();
      wrapper.unmount();
    }
  });

  it('preferência antiga de ativação (coding-v2-apps) é ignorada e não é apagada', async () => {
    const old = JSON.stringify({ v: 2, known: ['labels'], enabled: ['labels'] });
    localStorage.setItem('coding-v2-apps', old);
    localStorage.setItem('coding-v2-favorites', JSON.stringify(['calc']));
    const { wrapper } = await mountLauncher('/meus-apps');
    expect(wrapper.findAll('article.card')).toHaveLength(tools.length);
    expect(localStorage.getItem('coding-v2-apps')).toBe(old);
    expect(localStorage.getItem('coding-v2-favorites')).toBe(JSON.stringify(['calc']));
    wrapper.unmount();
  });
});

describe('Launcher · Ajustes em abas', () => {
  it('tem as sete categorias e mostra só a atual', async () => {
    const { wrapper } = await mountLauncher('/ajustes');
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Geral', 'Aparência', 'Projetos', 'Offline', 'Atalhos', 'Avançado', 'Sobre']);
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Geral');
    expect(wrapper.find('[data-testid="general-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="offline-manager"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="about-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('cada aba abre o seu conteúdo e a escolha vai para o endereço', async () => {
    const expected: Record<string, string> = {
      geral: 'general-summary', aparencia: 'motion-option', projetos: 'doc-counts', offline: 'offline-manager', atalhos: 'shortcuts-panel', avancado: 'advanced-panel', sobre: 'about-panel'
    };
    for (const t of settingsTabs) {
      const { wrapper, router } = await mountLauncher('/ajustes?aba=' + t.id);
      await flushPromises();
      expect(wrapper.get('[data-testid="settings-panel"]').attributes('data-tab')).toBe(t.id);
      expect(wrapper.find('[data-testid="' + expected[t.id] + '"]').exists(), t.id).toBe(true);
      expect(router.currentRoute.value.query.aba).toBe(t.id);
      wrapper.unmount();
    }
  });

  it('clicar numa aba troca o painel, mantém o foco na aba e usa o seletor no celular', async () => {
    const { wrapper, router } = await mountLauncher('/ajustes');
    await wrapper.get('[data-testid="settings-tab-sobre"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.aba).toBe('sobre');
    expect(wrapper.find('[data-testid="about-panel"]').exists()).toBe(true);
    await wrapper.get('[data-testid="settings-picker"]').setValue('aparencia');
    await flushPromises();
    expect(router.currentRoute.value.query.aba).toBe('aparencia');
    expect(wrapper.find('[data-testid="motion-option"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('aba desconhecida volta para Geral', async () => {
    const { wrapper } = await mountLauncher('/ajustes?aba=nada');
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Geral');
    wrapper.unmount();
  });

  it('Sobre mostra Coding, versão, compilação e o link do histórico, lidos do registro', async () => {
    const { wrapper } = await mountLauncher('/ajustes?aba=sobre');
    const release = latestOf('launcher', versionRecords)!;
    expect(wrapper.get('[data-testid="about-name"]').text()).toBe('Coding');
    expect(wrapper.get('[data-testid="about-version"]').text()).toBe('Versão ' + release.version);
    expect(wrapper.get('[data-testid="about-build"]').text()).toBe(release.build);
    expect(wrapper.get('[data-testid="about-history"]').attributes('href')).toBe('/versoes/');
    expect(wrapper.get('[data-testid="about-panel"]').text()).not.toMatch(/Prévia|Preview|Coding atual|Antigo/);
    wrapper.unmount();
  });

  it('Atalhos usa a mesma lista do menu de contexto, sem inventar', async () => {
    const { wrapper } = await mountLauncher('/ajustes?aba=atalhos');
    expect(wrapper.findAll('details.app')).toHaveLength(tools.length);
    expect(wrapper.get('[data-testid="shortcuts-texts"]').text()).toContain('Ctrl+S');
    wrapper.unmount();
  });
});

describe('Launcher · acessibilidade (axe)', () => {
  const paths = ['/', '/meus-apps', '/catalogo', '/app/texts', '/app/calc', '/documentos', '/nada', ...settingsTabs.map((t) => '/ajustes?aba=' + t.id)];
  for (const path of paths) {
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
