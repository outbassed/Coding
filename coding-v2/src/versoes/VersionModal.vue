<script setup lang="ts">
import { computed } from 'vue';
import ModalDialog from '../components/library/ModalDialog.vue';
import { formatBuildDateTime, formatRelease, sectionsOf, targetName, type VersionRecord } from '../shared/versions';

/** Detalhes de uma versão: nome, versão, compilação, publicação e só as seções que existem. */
const props = defineProps<{ record: VersionRecord | null }>();
const emit = defineEmits<{ close: [] }>();
const name = computed(() => (props.record ? targetName(props.record.target) : ''));
const sections = computed(() => (props.record ? sectionsOf(props.record) : []));
</script>

<template>
  <ModalDialog :open="record !== null" :label="record ? name + ', versão ' + record.version : 'Versão'" backdrop-close initial-focus="[data-close]" @close="emit('close')">
    <article v-if="record" class="ver" data-testid="version-modal">
      <header class="head">
        <div class="titles">
          <p class="eyebrow">Versão</p>
          <h2 data-testid="modal-title">{{ name }}</h2>
        </div>
        <button type="button" class="x" data-close aria-label="Fechar detalhes da versão" data-testid="modal-close" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></svg>
        </button>
      </header>
      <dl class="meta">
        <div><dt>Versão</dt><dd data-testid="modal-version">{{ record.version }}</dd></div>
        <div><dt>Compilação</dt><dd data-testid="modal-build">{{ record.build }}</dd></div>
        <div><dt>Publicada em</dt><dd data-testid="modal-release">{{ formatRelease(record) }}</dd></div>
        <div><dt>Compilada em</dt><dd data-testid="modal-built-at">{{ formatBuildDateTime(record.build) }}</dd></div>
      </dl>
      <section v-for="s in sections" :key="s.key" class="sec" :data-testid="'modal-sec-' + s.key">
        <h3>{{ s.title }}</h3>
        <ul><li v-for="(item, i) in s.items" :key="i">{{ item }}</li></ul>
      </section>
      <p v-if="record.notes" class="note" data-testid="modal-notes">{{ record.notes }}</p>
      <p v-if="record.commit || record.prUrl" class="refs muted">
        <span v-if="record.commit">Commit <code>{{ record.commit }}</code></span>
        <a v-if="record.prUrl" :href="record.prUrl" target="_blank" rel="noopener noreferrer">Pull request</a>
      </p>
    </article>
  </ModalDialog>
</template>

<style scoped>
.ver { display: grid; gap: 14px; min-width: 0; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.titles { min-width: 0; }
.eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
h2 { margin: 0; font-size: 20px; line-height: 1.25; overflow-wrap: anywhere; }
.x { flex: none; display: grid; place-items: center; width: 44px; height: 44px; margin: -6px -8px 0 0; border: 0; border-radius: 12px; background: transparent; color: var(--muted); }
.x:hover { background: var(--panel); color: var(--text); }
.meta { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.meta > div { min-width: 0; padding: 9px 11px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
dt { font-size: 12px; font-weight: 700; color: var(--muted); }
dd { margin: 2px 0 0; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; font-size: 14px; }
.sec h3 { margin: 0 0 4px; font-size: 14px; }
.sec ul { margin: 0; padding-left: 20px; display: grid; gap: 3px; font-size: 14px; }
.note { margin: 0; font-size: 14px; }
.refs { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
code { font-size: 12.5px; }
@media (max-width: 420px) { .meta { grid-template-columns: minmax(0, 1fr); } }
</style>
