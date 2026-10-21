<script setup lang="ts">
import { computed } from 'vue';
import { getTool, type ToolId } from './shared/catalog';
import { useLauncherStore } from './stores/launcher';
import ToolIcon from './components/ToolIcon.vue';
const props = defineProps<{ appId: ToolId }>();
const tool = computed(() => getTool(props.appId));
useLauncherStore(); // Aplica o tema compartilhado entre entradas independentes.
const examples = [
  { code: 'A-001', description: 'Parafusos M6' },
  { code: 'A-002', description: 'Porcas M6' },
  { code: 'A-003', description: 'Arruelas' },
  { code: 'A-004', description: 'Organizadores' }
];
</script>
<template>
  <div class="editor-shell" :style="{ '--tool-accent': tool.color }">
    <header class="editor-top">
      <a href="/launcher/" class="back-link">← <span>Launcher</span></a>
      <span class="app-icon tiny-icon" :style="{ '--app-color':tool.color }"><ToolIcon :id="appId" /></span>
      <strong>{{ tool.name }}</strong><span class="beta-chip">CASCA EM TESTES</span>
    </header>
    <section class="editor-workspace">
      <aside class="editor-panel left-panel">
        <p class="eyebrow">Coding 2.0</p><h2>{{ tool.name }}</h2>
        <p>Primeira entrada HTML independente criada com Vue e TypeScript.</p>
        <div class="panel-note"><strong>Sem edição nesta etapa.</strong> Este painel comprova a estrutura visual. O motor original ainda não foi migrado.</div>
        <a class="btn btn-outline" href="https://codingtxt.vercel.app/">Usar ferramenta estável ↗</a>
      </aside>
      <main class="editor-canvas">
        <div class="preview-label">PRÉVIA ILUSTRATIVA · NÃO EDITÁVEL</div>
        <div v-if="appId === 'labels'" class="sheet-preview label-page">
          <div v-for="item in examples" :key="item.code" class="sample-label"><b>{{ item.code }}</b><span>{{ item.description }}</span></div>
        </div>
        <article v-else class="sheet-preview text-page">
          <h2>Carta de apresentação</h2>
          <p>Este é um modelo visual para testar a proporção da folha no desktop e no celular.</p>
          <p>O editor de texto original, com formatação e imagens, permanece disponível no site atual.</p>
        </article>
      </main>
      <aside class="editor-panel right-panel">
        <h3>Próximas integrações</h3>
        <p>Salvar com confirmação do IndexedDB, importar modelos existentes, comandos reais e exportação.</p>
        <p class="muted">Nenhum documento é lido, criado ou substituído por esta prévia.</p>
      </aside>
    </section>
    <footer class="editor-footer"><span>Estrutura independente</span><span>{{ tool.name }} · Coding 2.0</span></footer>
  </div>
</template>
