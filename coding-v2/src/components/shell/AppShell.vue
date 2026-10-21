<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import TopBar from './TopBar.vue';
import SideNav from './SideNav.vue';
import BottomNav from './BottomNav.vue';
import DeactivateDialog from '../ui/DeactivateDialog.vue';
import { useAnnouncer } from '../../composables/useAnnouncer';

const route = useRoute();
const { message, say } = useAnnouncer();

function focusMain(): void { document.getElementById('conteudo')?.focus(); }

// Ao trocar de tela: foco no título, aviso para leitores de tela.
watch(() => route.fullPath, async (_new, old) => {
  await nextTick();
  const heading = document.getElementById('page-title');
  if (old !== undefined) heading?.focus();
  if (old !== undefined && heading?.textContent) void say(heading.textContent.trim());
});
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#conteudo" @click.prevent="focusMain">Pular para o conteúdo</a>
    <TopBar />
    <div class="body">
      <SideNav />
      <main id="conteudo" class="content" tabindex="-1">
        <div class="page"><RouterView /></div>
      </main>
    </div>
    <BottomNav />
    <DeactivateDialog />
    <div class="sr-only" role="status" aria-live="polite" data-testid="announcer">{{ message }}</div>
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; display: flex; flex-direction: column; }
.body { flex: 1; display: flex; min-height: 0; }
.content { flex: 1; min-width: 0; padding: 28px max(16px, var(--sa-r)) 32px max(16px, var(--sa-l)); }
.content:focus { outline: none; }
.page { margin: 0 auto; max-width: 1160px; }
@media (min-width: 600px) { .content { padding: 36px max(28px, var(--sa-r)) 48px 28px; } }
@media (min-width: 900px) { .content { padding: 44px max(40px, var(--sa-r)) 56px 40px; } }
@media (min-width: 1920px) { .page { max-width: 1480px; } }
</style>
