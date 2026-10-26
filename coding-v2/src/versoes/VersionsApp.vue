<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '../components/ui/AppIcon.vue';
import VersionModal from './VersionModal.vue';
import { locate, type Located } from './route';
import { versionRecords } from '../shared/versions-data';
import { findTool } from '../shared/catalog';
import { LAUNCHER_PATH } from '../shared/links';
import {
  formatRelease, historyPath, LAUNCHER_NAME, pageOf, recordsFor, targetName, TARGET_ORDER, type VersionRecord, type VersionTarget
} from '../shared/versions';

const PAGE = 50;
const located = ref<Located>(locate(location.pathname));
const drawer = ref(false);
const selected = ref<VersionRecord | null>(null);
const shown = ref(PAGE);
const hamburger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const announce = ref('');

const target = computed<VersionTarget | null>(() => (located.value.kind === 'target' ? located.value.target : null));
const unknownSlug = computed(() => (located.value.kind === 'unknown' ? located.value.slug : ''));
const title = computed(() => (target.value ? targetName(target.value) : 'Histórico não encontrado'));
const all = computed(() => (target.value ? recordsFor(target.value, versionRecords) : []));
const page = computed(() => pageOf(all.value, shown.value));
const menuItems = TARGET_ORDER.map((t) => ({ target: t, name: targetName(t), href: historyPath(t), tool: t === 'launcher' ? null : findTool(t) }));

function syncTitle(): void { document.title = title.value + ' · Histórico de versões · Coding'; }

function go(next: VersionTarget, push = true): void {
  if (push && location.pathname !== historyPath(next)) history.pushState({}, '', historyPath(next));
  located.value = { kind: 'target', target: next, canonical: true };
  shown.value = PAGE;
  selected.value = null;
  closeDrawer(false);
  syncTitle();
  announce.value = 'Histórico de ' + targetName(next);
  void nextTick(() => { document.querySelector('main')?.scrollTo?.(0, 0); window.scrollTo(0, 0); heading.value?.focus({ preventScroll: true }); });
}
function onMenuClick(event: MouseEvent, next: VersionTarget): void {
  // Cliques com modificador (nova aba) seguem o link de verdade.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  go(next);
}
function onPop(): void {
  located.value = locate(location.pathname);
  shown.value = PAGE;
  selected.value = null;
  closeDrawer(false);
  syncTitle();
}

function openDrawer(): void {
  drawer.value = true;
  void nextTick(() => (menu.value?.querySelector<HTMLElement>('[aria-current="page"]') ?? menu.value?.querySelector<HTMLElement>('a'))?.focus());
}
function closeDrawer(restoreFocus = true): void {
  if (!drawer.value) return;
  drawer.value = false;
  if (restoreFocus) void nextTick(() => hamburger.value?.focus());
}
function onMenuKey(event: KeyboardEvent): void {
  if (!drawer.value) return;
  if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
  if (event.key !== 'Tab') return;
  const items = [...(menu.value?.querySelectorAll<HTMLElement>('a[href]') ?? [])];
  const first = items[0], last = items[items.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// Fundo sem rolagem enquanto a gaveta ou o modal estiverem abertos.
watch([drawer, selected], () => { document.documentElement.classList.toggle('scroll-lock', drawer.value || selected.value !== null); });
let media: MediaQueryList | null = null;
const onWide = (): void => { if (media?.matches) closeDrawer(false); };
onMounted(() => {
  const here = locate(location.pathname);
  if (here.kind === 'target' && !here.canonical) history.replaceState({}, '', historyPath(here.target));
  syncTitle();
  window.addEventListener('popstate', onPop);
  media = matchMedia('(min-width: 900px)');
  media.addEventListener?.('change', onWide);
});
onBeforeUnmount(() => { window.removeEventListener('popstate', onPop); media?.removeEventListener?.('change', onWide); document.documentElement.classList.remove('scroll-lock'); });
</script>

<template>
  <div class="page" :class="{ 'drawer-open': drawer }">
    <header class="top">
      <button ref="hamburger" type="button" class="burger" aria-controls="versoes-menu" :aria-expanded="drawer" aria-label="Abrir menu de versões" data-testid="menu-toggle" @click="drawer ? closeDrawer() : openDrawer()">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></svg>
      </button>
      <img class="mark" src="/legacy-icons/coding.svg" alt="" width="30" height="30" draggable="false" />
      <p class="brand"><strong>Coding</strong><span class="sep" aria-hidden="true"> · </span><span class="sub">Central de Versões</span></p>
    </header>

    <div v-if="drawer" class="backdrop" data-testid="menu-backdrop" aria-hidden="true" @click="closeDrawer()"></div>
    <aside id="versoes-menu" ref="menu" class="menu" :class="{ open: drawer }" :role="drawer ? 'dialog' : undefined" :aria-modal="drawer ? 'true' : undefined" aria-label="Menu da Central de Versões" data-testid="versions-menu" @keydown="onMenuKey">
      <div class="menu-head">
        <p>Histórico de versões</p>
        <button type="button" class="close" aria-label="Fechar menu" data-testid="menu-close" @click="closeDrawer()">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></svg>
        </button>
      </div>
      <nav class="scroller" aria-label="Aplicativos">
        <ul>
          <li v-for="item in menuItems" :key="item.target">
            <a :href="item.href" class="link" :aria-current="target === item.target ? 'page' : undefined" :data-testid="'menu-' + item.target" @click="onMenuClick($event, item.target)">
              <AppIcon v-if="item.tool" :id="item.tool.id" size="sm" />
              <img v-else class="lmark" src="/legacy-icons/coding.svg" alt="" width="32" height="32" draggable="false" />
              <span class="lname">{{ item.name }}</span>
            </a>
          </li>
        </ul>
      </nav>
      <div class="foot"><a :href="LAUNCHER_PATH" class="back" data-testid="back-to-launcher">← Voltar ao Launcher</a></div>
    </aside>

    <main id="conteudo" class="main" :inert="drawer" data-testid="versions-main">
      <h1 ref="heading" tabindex="-1" data-testid="versions-title">{{ title }}</h1>
      <template v-if="target">
        <p class="muted lead">Histórico de versões · mais recentes primeiro</p>
        <ul v-if="page.items.length" class="list" aria-label="Versões" data-testid="version-list">
          <li v-for="r in page.items" :key="r.version + r.build">
            <button type="button" class="row" aria-haspopup="dialog" :data-testid="'version-' + r.version" @click="selected = r">
              <span class="a"><strong>{{ target === 'launcher' ? LAUNCHER_NAME : title }}</strong> — <span class="ver">{{ r.version }}</span></span>
              <span class="b"><span class="bld">{{ r.build }}</span> — <span class="dt">{{ formatRelease(r) }}</span></span>
              <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
            </button>
          </li>
        </ul>
        <div v-else class="empty" data-testid="versions-empty">
          <p><strong>Nenhuma versão registrada para {{ title }} ainda.</strong></p>
          <p class="muted">Quando houver um lançamento, ele aparece aqui com versão, compilação e data.</p>
        </div>
        <button v-if="page.remaining > 0" type="button" class="btn more" data-testid="show-more" @click="shown += PAGE">Mostrar mais ({{ page.remaining }} restantes)</button>
      </template>
      <div v-else class="empty" data-testid="versions-not-found">
        <p>Não existe histórico para “{{ unknownSlug }}”.</p>
        <p><a :href="historyPath('launcher')" class="btn" @click="onMenuClick($event, 'launcher')">Ver o histórico do Coding Launcher</a></p>
      </div>
    </main>
    <p class="sr-only" role="status" aria-live="polite">{{ announce }}</p>
    <VersionModal :record="selected" @close="selected = null" />
  </div>
</template>

<style>
html.scroll-lock { overflow: hidden; }
</style>
<style scoped>
.page { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr; }
.top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 10px; min-height: calc(56px + var(--sa-t)); padding: var(--sa-t) max(12px, var(--sa-r)) 0 max(8px, var(--sa-l)); background: var(--surface); border-bottom: 1px solid var(--border); }
.burger { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border: 1px solid transparent; border-radius: 12px; background: transparent; color: var(--text); }
.burger:hover { background: var(--panel); border-color: var(--border); }
.mark { width: 30px; height: 30px; border-radius: 8px; flex: none; }
.brand { margin: 0; font-size: 16px; letter-spacing: -.01em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { color: var(--muted); }
.backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(8 12 20 / 55%); }
.menu { position: fixed; z-index: 50; top: 0; bottom: 0; left: 0; width: min(320px, 86vw); display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); padding-top: var(--sa-t); transform: translateX(-100%); visibility: hidden; transition: transform .2s ease, visibility 0s linear .2s; }
.menu.open { transform: none; visibility: visible; transition: transform .2s ease; }
@media (prefers-reduced-motion: reduce) { .menu, .menu.open { transition: none; } }
.menu-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--border); }
.menu-head p { margin: 0; font-weight: 750; }
.close { display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); }
.close:hover { background: var(--panel); color: var(--text); }
.scroller { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px; }
.scroller ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.link { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 4px 10px; border-radius: 12px; color: var(--muted); text-decoration: none; font-weight: 650; }
.link:hover { background: var(--panel); color: var(--text); }
.link[aria-current="page"] { color: var(--text); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); box-shadow: inset 3px 0 var(--accent); }
.lmark { width: 32px; height: 32px; border-radius: 8px; flex: none; }
.lname { min-width: 0; overflow-wrap: anywhere; }
.foot { padding: 8px 8px calc(8px + var(--sa-b)); border-top: 1px solid var(--border); }
.back { display: flex; align-items: center; min-height: 48px; padding: 0 12px; border-radius: 12px; font-weight: 700; text-decoration: none; border: 1px solid var(--border); background: var(--panel); }
.back:hover { border-color: var(--accent); }
.main { min-width: 0; padding: 20px max(16px, var(--sa-r)) calc(32px + var(--sa-b)) max(16px, var(--sa-l)); max-width: 880px; width: 100%; box-sizing: border-box; }
h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.2; overflow-wrap: anywhere; }
.lead { margin: 0 0 16px; font-size: 14px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 2px; width: 100%; min-height: 56px; box-sizing: border-box; padding: 9px 12px; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; content-visibility: auto; contain-intrinsic-size: auto 62px; }
.row:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: var(--panel); }
.a, .b { grid-column: 1; min-width: 0; }
.a { font-size: 15px; overflow-wrap: anywhere; }
.b { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.bld, .dt { white-space: nowrap; }
.chev { grid-column: 2; grid-row: 1 / span 2; color: var(--muted); }
.empty { padding: 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: 14px; }
.empty p { margin: 0 0 6px; }
.more { margin-top: 12px; }
@media (min-width: 900px) {
  .page { grid-template-columns: 280px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100dvh; }
  .top { grid-column: 1 / -1; position: static; }
  .burger, .close, .backdrop { display: none; }
  .menu { position: static; grid-row: 2; width: auto; transform: none; visibility: visible; min-height: 0; padding-top: 0; overflow: hidden; }
  .menu-head { padding: 14px 16px 8px; border-bottom: 0; }
  .main { grid-row: 2; grid-column: 2; overflow-y: auto; max-width: none; padding: 28px 40px 40px; }
  .main > * { max-width: 820px; }
}
@media (max-width: 599px) {
  h1 { font-size: 21px; }
  .a { font-size: 14.5px; }
  .b { font-size: 12.5px; }
}
</style>
