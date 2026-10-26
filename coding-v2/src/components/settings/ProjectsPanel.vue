<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useCopyCounts } from '../../composables/useCopyCounts';
import AppIcon from '../ui/AppIcon.vue';
import StoragePanel from '../library/StoragePanel.vue';
import LimitsPanel from '../ui/LimitsPanel.vue';

const emit = defineEmits<{ announce: [text: string] }>();
const { copies, counts, perApp } = useCopyCounts();
</script>

<template>
  <LimitsPanel :counts="counts" @announce="emit('announce', $event)" />

  <section class="card" aria-labelledby="docs-h">
    <h2 id="docs-h">Documentos e armazenamento</h2>
    <p class="muted">Seus documentos ficam neste navegador, em um banco próprio. Backup, importação e exportação ficam na Biblioteca.</p>
    <p v-if="copies" class="total" data-testid="docs-total"><strong>{{ copies.length }}</strong> {{ copies.length === 1 ? 'documento salvo' : 'documentos salvos' }} neste navegador.</p>
    <ul v-if="copies" class="counts" data-testid="doc-counts">
      <li v-for="row in perApp" :key="row.tool.id"><AppIcon :id="row.tool.id" size="sm" /><span class="nm">{{ row.tool.name }}</span><strong>{{ row.count }}</strong></li>
    </ul>
    <p v-else class="muted">Não foi possível contar os documentos agora.</p>
    <StoragePanel :refresh-key="0" @announce="emit('announce', $event)" />
    <p><RouterLink :to="{ name: 'docs' }" class="btn" data-testid="open-library">Backup, importação e exportação na Biblioteca</RouterLink></p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.total { margin: 0 0 10px; }
.counts { list-style: none; margin: 0 0 12px; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 6px; }
.counts li { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 6px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.counts .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.counts strong { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
</style>
