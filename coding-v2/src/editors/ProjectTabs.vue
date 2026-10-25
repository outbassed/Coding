<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import NavIcon from '../components/ui/NavIcon.vue';
import { searchAll, searchOverflow, type TabMeta } from '../workspace/tabs';
import type { ProjectTabsController } from './projectTabs';

const props = defineProps<{ projects: ProjectTabsController; wide: boolean }>();
const p = props.projects;

const listOpen = ref(false);
const query = ref('');
const editing = ref<string | null>(null);
const draft = ref('');
const searchBox = ref<HTMLInputElement | null>(null);
let renameEl: HTMLInputElement | null = null;
function setRename(el: unknown): void { renameEl = el instanceof HTMLInputElement ? el : renameEl; }
const opener = ref<HTMLElement | null>(null);
const RENDER_MAX = 200;

const activeTab = computed(() => p.tabs.value.open.find((t) => t.id === p.activeId.value) ?? null);
const total = computed(() => p.tabs.value.open.length);
/** No desktop a lista só mostra o "+N"; no celular mostra todas as abas abertas. */
const listed = computed<TabMeta[]>(() => {
  return props.wide ? searchOverflow(p.tabs.value, query.value) : searchAll(p.tabs.value, query.value);
});
const shown = computed(() => listed.value.slice(0, RENDER_MAX));
const hiddenFromList = computed(() => Math.max(0, listed.value.length - RENDER_MAX));

async function openList(event?: Event): Promise<void> {
  opener.value = (event?.currentTarget as HTMLElement | undefined) ?? null;
  listOpen.value = true; query.value = '';
  await nextTick();
  searchBox.value?.focus();
}
function closeList(refocus = true): void {
  listOpen.value = false; editing.value = null;
  if (refocus) void nextTick(() => opener.value?.focus());
}
watch(() => props.wide, () => closeList(false));

async function pickFromList(id: string): Promise<void> { closeList(false); await p.select(id); }
async function closeFromList(id: string): Promise<void> { await p.close(id); }

async function startRename(tab: TabMeta): Promise<void> {
  editing.value = tab.id; draft.value = tab.title;
  await nextTick();
  renameEl?.focus(); renameEl?.select();
}
async function commitRename(): Promise<void> {
  const id = editing.value;
  if (!id) return;
  editing.value = null;
  const tab = p.tabs.value.open.find((t) => t.id === id);
  if (tab && draft.value.trim() && draft.value.trim() !== tab.title) await p.rename(id, draft.value);
}
function cancelRename(): void { editing.value = null; }

function onTabKey(event: KeyboardEvent, tab: TabMeta): void {
  if (event.key === 'F2' && tab.id === p.activeId.value) { event.preventDefault(); void startRename(tab); return; }
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  if (event.altKey) {
    p.move(tab.id, delta as 1 | -1);
    void nextTick(() => document.getElementById('pt-tab-' + tab.id)?.focus());
    return;
  }
  const list = p.visible.value;
  const i = list.findIndex((t) => t.id === tab.id);
  const next = list[(i + delta + list.length) % list.length];
  if (next) document.getElementById('pt-tab-' + next.id)?.focus();
}
function onPanelKey(event: KeyboardEvent): void { if (event.key === 'Escape') { event.stopPropagation(); closeList(); } }
const plusLabel = computed(() => (p.overflowCount.value > 0 ? '+' + p.overflowCount.value : ''));
</script>

<template>
  <div class="pt" :class="wide ? 'pt-wide' : 'pt-narrow'" data-testid="project-tabs" :data-open="total">
    <nav v-if="wide" class="pt-nav" aria-label="Projetos abertos neste app">
     <ul class="pt-strip">
      <li v-for="t in p.visible.value" :key="t.id" class="pt-tab" :class="{ active: t.id === p.activeId.value }" :data-tab-id="t.id">
        <input v-if="editing === t.id" :ref="setRename" v-model="draft" class="pt-rename" maxlength="250" aria-label="Novo nome do projeto" data-testid="tab-rename-input"
          @keydown.enter.prevent="commitRename" @keydown.esc.prevent="cancelRename" @blur="commitRename" />
        <button v-else :id="'pt-tab-' + t.id" type="button" class="pt-label" :aria-current="t.id === p.activeId.value ? 'true' : undefined"
          :title="t.title + (t.id === p.activeId.value ? ' (F2 para renomear)' : '')"
          data-testid="project-tab" @click="p.select(t.id)" @dblclick="t.id === p.activeId.value && startRename(t)" @keydown="onTabKey($event, t)">{{ t.title }}</button>
        <button type="button" class="pt-x" :aria-label="'Fechar a aba ' + t.title" title="Fechar a aba (o projeto continua salvo)" data-testid="tab-close" @click="p.close(t.id)"><NavIcon name="close" /></button>
      </li>
      <li v-if="p.overflowCount.value > 0" class="pt-item"><button type="button" class="pt-more" :aria-expanded="listOpen" aria-haspopup="dialog"
        :aria-label="p.overflowCount.value + ' projetos abertos escondidos. Abrir lista'" data-testid="tab-overflow" @click="openList($event)">{{ plusLabel }}</button></li>
      <li class="pt-item"><button type="button" class="pt-new" :disabled="!!p.blockedReason.value" :title="p.blockedReason.value || 'Novo projeto'"
        aria-label="Novo projeto" data-testid="tab-new" @click="p.create()"><NavIcon name="plus" /></button></li>
     </ul>
    </nav>

    <div v-else class="pt-mobile">
      <button type="button" class="pt-current" :title="activeTab?.title ?? 'Projeto novo'" aria-haspopup="dialog" :aria-expanded="listOpen" data-testid="tab-switcher" @click="openList($event)">
        <span class="pt-current-t">{{ activeTab?.title ?? 'Projeto novo' }}</span>
        <span class="pt-count" aria-hidden="true">{{ total }}</span>
        <span class="sr-only">{{ total }} projetos abertos. Abrir lista de projetos</span>
      </button>
      <button type="button" class="pt-new" :disabled="!!p.blockedReason.value" :title="p.blockedReason.value || 'Novo projeto'" aria-label="Novo projeto" data-testid="tab-new" @click="p.create()"><NavIcon name="plus" /></button>
    </div>

    <p v-if="p.blockedReason.value" class="pt-note" data-testid="tab-limit">{{ p.blockedReason.value }}</p>
    <p v-else-if="p.message.value" class="pt-note" role="status" data-testid="tab-message">{{ p.message.value }}</p>

    <template v-if="listOpen">
      <div v-if="!wide" class="pt-backdrop" @click="closeList()"></div>
      <section class="pt-panel" :class="{ 'pt-sheet': !wide }" role="dialog" aria-modal="false" :aria-label="wide ? 'Projetos abertos escondidos' : 'Projetos abertos'" data-testid="tab-list" @keydown="onPanelKey">
        <div class="pt-panel-head">
          <h2>{{ wide ? 'Outros projetos abertos' : 'Projetos abertos' }} <span class="pt-count">{{ wide ? p.overflowCount.value : total }}</span></h2>
          <button type="button" class="ib" aria-label="Fechar lista" @click="closeList()"><NavIcon name="close" /></button>
        </div>
        <label class="sr-only" for="pt-search">Buscar projeto aberto pelo nome</label>
        <input id="pt-search" ref="searchBox" v-model="query" type="search" class="pt-search" placeholder="Buscar pelo nome" autocomplete="off" data-testid="tab-search" />
        <ul class="pt-list">
          <li v-for="t in shown" :key="t.id" class="pt-row" :class="{ active: t.id === p.activeId.value }" data-testid="tab-row">
            <template v-if="editing === t.id">
              <input :ref="setRename" v-model="draft" class="pt-rename" maxlength="250" aria-label="Novo nome do projeto" data-testid="tab-rename-input"
                @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="cancelRename" @blur="commitRename" />
            </template>
            <template v-else>
              <button type="button" class="pt-row-open" :title="t.title" :aria-current="t.id === p.activeId.value ? 'true' : undefined" @click="pickFromList(t.id)">{{ t.title }}</button>
              <button type="button" class="pt-row-btn" :aria-label="'Renomear ' + t.title" @mousedown.prevent @click="startRename(t)">Renomear</button>
              <button type="button" class="pt-row-btn" :aria-label="'Fechar a aba ' + t.title" @click="closeFromList(t.id)">Fechar</button>
            </template>
          </li>
        </ul>
        <p v-if="!shown.length" class="pt-empty">{{ query ? 'Nenhum projeto aberto com esse nome.' : 'Nenhum outro projeto aberto.' }}</p>
        <p v-if="hiddenFromList" class="pt-empty">Mostrando {{ RENDER_MAX }} de {{ listed.length }}. Use a busca para achar os outros.</p>
        <p class="pt-help">Fechar uma aba não apaga o projeto: ele continua salvo na Biblioteca.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.pt { position: relative; flex: none; min-width: 0; background: var(--panel); border-bottom: 1px solid var(--border); }
.pt-strip { list-style: none; margin: 0; display: flex; align-items: stretch; gap: 2px; padding: 4px max(8px, var(--sa-r)) 0 max(8px, var(--sa-l)); overflow: visible; min-height: 38px; }
.pt-tab { display: flex; align-items: center; min-width: 0; max-width: 220px; flex: 0 1 200px; border: 1px solid var(--border); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--surface); opacity: .9; }
.pt-tab.active { background: var(--bg); border-top: 3px solid var(--app); opacity: 1; }
.pt-label { flex: 1; min-width: 0; min-height: 34px; padding: 0 6px 0 10px; border: 0; background: transparent; text-align: left; color: var(--text); font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-x { flex: none; width: 28px; min-height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--muted); border-radius: 6px; }
.pt-x :deep(svg) { width: 14px; height: 14px; }
.pt-x:hover, .pt-row-btn:hover { background: var(--panel); color: var(--text); }
.pt-rename { flex: 1; min-width: 0; min-height: 30px; margin: 2px; padding: 0 6px; border: 2px solid var(--accent); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 13px; }
.pt-item { display: flex; }
.pt-more { flex: none; min-width: 44px; padding: 0 10px; border: 1px solid var(--border); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--surface); color: var(--text); font-weight: 800; font-size: 13px; }
.pt-new { flex: none; width: 44px; min-height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--accent); border-radius: 8px; }
.pt-new:disabled { color: var(--muted); opacity: .6; cursor: not-allowed; }
.pt-new :deep(svg) { width: 18px; height: 18px; }
.pt-mobile { display: flex; align-items: center; gap: 4px; padding: 4px max(8px, var(--sa-r)) 4px max(8px, var(--sa-l)); }
.pt-current { flex: 1; min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; text-align: left; }
.pt-current-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-count { flex: none; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--app); color: var(--ink); font-size: 11px; font-weight: 800; text-align: center; }
.pt-note { margin: 0; padding: 4px 12px 6px; font-size: 12px; color: var(--muted); }
.pt-backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 35%); }
.pt-panel { position: absolute; z-index: 50; top: 100%; right: 8px; width: min(420px, calc(100vw - 16px)); max-height: min(70dvh, 520px); display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 12px 32px rgb(0 0 0 / 22%); }
.pt-sheet { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 80dvh; border-radius: 18px 18px 0 0; padding-bottom: calc(12px + var(--sa-b)); }
.pt-panel-head { display: flex; align-items: center; gap: 8px; }
.pt-panel-head h2 { flex: 1; margin: 0; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.pt-search { min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font-size: 14px; }
.pt-list { list-style: none; margin: 0; padding: 0; overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
.pt-row { display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); }
.pt-row.active { border-color: var(--app); box-shadow: inset 3px 0 0 var(--app); }
.pt-row-open { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border: 0; background: transparent; color: var(--text); text-align: left; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-row-btn { flex: none; min-height: 44px; padding: 0 10px; border: 0; background: transparent; color: var(--muted); font-size: 12px; font-weight: 700; border-radius: 8px; }
.pt-empty, .pt-help { margin: 0; font-size: 12px; color: var(--muted); }
</style>
