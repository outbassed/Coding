<script setup lang="ts">
import { computed, ref } from 'vue';
import { tools } from './shared/catalog';
import { useLauncherStore } from './stores/launcher';
import ToolCard from './components/ToolCard.vue';
import ToolIcon from './components/ToolIcon.vue';

type Page = 'home' | 'apps' | 'catalog' | 'docs' | 'settings';
const store = useLauncherStore();
const page = ref<Page>('home');
const search = ref('');
const tabs: { id: Page; label: string; glyph: string }[] = [
  { id: 'home', label: 'Início', glyph: '⌂' }, { id: 'apps', label: 'Meus apps', glyph: '▦' },
  { id: 'catalog', label: 'Catálogo', glyph: '＋' }, { id: 'docs', label: 'Documentos', glyph: '▤' },
  { id: 'settings', label: 'Ajustes', glyph: '⚙' }
];
const filtered = computed(() => tools.filter((tool) => (tool.name + ' ' + tool.description).toLocaleLowerCase('pt-BR').includes(search.value.toLocaleLowerCase('pt-BR'))));
function go(next: Page) { page.value = next; search.value = ''; }
</script>
<template>
  <div class="shell">
    <header class="topbar">
      <a href="/launcher/" class="brand"><span class="brand-mark">C</span><strong>Coding <span>Launcher</span></strong><sup>2.0</sup></a>
      <label class="global-search"><span aria-hidden="true">⌕</span><input v-model="search" type="search" aria-label="Buscar aplicativos" placeholder="Buscar aplicativos..." @focus="page = 'catalog'" /></label>
      <span class="beta-chip">BETA TÉCNICO</span>
    </header>
    <div class="body-shell">
      <aside class="side-nav" aria-label="Navegação principal">
        <nav>
          <button v-for="item in tabs" :key="item.id" class="nav-item" type="button" :aria-current="page === item.id ? 'page' : undefined" :class="{ selected: page === item.id }" @click="go(item.id)">
            <span class="nav-glyph" aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}
          </button>
        </nav>
        <div class="side-footer"><a href="https://codingtxt.vercel.app/" class="external">Abrir Coding atual ↗</a></div>
      </aside>
      <main class="content" id="conteudo">
        <div v-if="page === 'home'" class="page-view">
          <p class="eyebrow">Coding 2.0 · Fundação</p>
          <h1>Seu espaço de criação.</h1>
          <p class="lead">Uma central para todas as ferramentas, cada uma no seu lugar. Esta é a prévia técnica da nova arquitetura.</p>
          <div class="notice"><strong>Versão experimental.</strong> Os editores completos e os seus documentos continuam no <a href="https://codingtxt.vercel.app/">Coding atual</a>. Esta versão não modifica os dados existentes.</div>
          <div class="section-title"><h2>Meus aplicativos</h2><button class="text-action" @click="go('apps')">Gerenciar →</button></div>
          <div v-if="store.activeTools.length" class="cards">
            <ToolCard v-for="tool in store.activeTools" :key="tool.id" :tool="tool" :enabled="true" @toggle="store.toggle" />
            <button class="add-card" @click="go('catalog')"><span aria-hidden="true">＋</span><strong>Ver catálogo</strong><small>Conheça as nove ferramentas</small></button>
          </div>
          <div v-else class="empty"><h3>Nenhum app ativado.</h3><p>Escolha uma ferramenta disponível no catálogo.</p><button class="btn btn-primary" @click="go('catalog')">Abrir catálogo</button></div>
          <div class="section-title"><h2>Em preparação</h2><button class="text-action" @click="go('catalog')">Ver todas →</button></div>
          <div class="mini-tools">
            <div v-for="tool in tools.filter(t => !t.shellReady)" :key="tool.id" class="mini-tool"><span class="app-icon small" :style="{ '--app-color': tool.color }"><ToolIcon :id="tool.id" /></span>{{ tool.name }}</div>
          </div>
        </div>
        <div v-else-if="page === 'apps'" class="page-view">
          <p class="eyebrow">Sua área</p><h1>Meus apps</h1><p class="lead">Desativar remove apenas o atalho deste Launcher experimental, nunca seus documentos.</p>
          <div v-if="store.activeTools.length" class="cards"><ToolCard v-for="tool in store.activeTools" :key="tool.id" :tool="tool" :enabled="true" @toggle="store.toggle" /></div>
          <div v-else class="empty"><h3>Esta área está vazia.</h3><button class="btn btn-primary" @click="go('catalog')">Escolher aplicativo</button></div>
          <button class="btn btn-outline action-below" @click="go('catalog')">Adicionar aplicativos</button>
        </div>
        <div v-else-if="page === 'catalog'" class="page-view">
          <p class="eyebrow">Explorar</p><h1>Catálogo</h1><p class="lead">Etiquetas e Texto já têm entradas independentes nesta prévia. As outras ferramentas permanecem na versão atual até a migração.</p>
          <div class="cards"><ToolCard v-for="tool in filtered" :key="tool.id" :tool="tool" :enabled="store.isEnabled(tool.id)" @toggle="store.toggle" /></div>
          <p v-if="!filtered.length" class="empty">Nenhuma ferramenta encontrada para esta busca.</p>
        </div>
        <div v-else-if="page === 'docs'" class="page-view">
          <p class="eyebrow">Biblioteca</p><h1>Documentos</h1>
          <div class="empty"><h3>Seus documentos permanecem protegidos.</h3><p>A leitura e a migração do banco antigo ainda não foram habilitadas nesta fundação. Continue abrindo, editando e exportando no site estável.</p><a class="btn btn-primary" href="https://codingtxt.vercel.app/">Ir para o Coding atual ↗</a></div>
        </div>
        <div v-else class="page-view">
          <p class="eyebrow">Preferências</p><h1>Configurações</h1>
          <section class="settings-card"><h2>Aparência</h2><p class="muted">Escolha o tema do Launcher experimental.</p>
            <div class="theme-options" role="group" aria-label="Tema">
              <button v-for="t in [{id:'auto',label:'Automático'},{id:'light',label:'Claro'},{id:'dark',label:'Escuro'}] as const" :key="t.id" type="button" :aria-pressed="store.theme === t.id" :class="{active:store.theme === t.id}" @click="store.theme=t.id">{{ t.label }}</button>
            </div>
          </section>
          <section class="settings-card"><h2>Dados</h2><p class="muted">As preferências desta prévia são guardadas separadamente do IndexedDB atual. Nenhuma migração de documentos foi executada.</p></section>
        </div>
      </main>
    </div>
    <nav class="bottom-nav" aria-label="Navegação móvel">
      <button v-for="item in tabs.filter(t => t.id !== 'catalog')" :key="item.id" :aria-current="page === item.id ? 'page' : undefined" :class="{ selected: page === item.id }" @click="go(item.id)">
        <span aria-hidden="true">{{ item.glyph }}</span><small>{{ item.label }}</small>
      </button>
    </nav>
  </div>
</template>
