<script setup lang="ts">
import { computed, ref, watch, useId } from 'vue';
const props = withDefaults(defineProps<{ page: number; totalPages: number }>(), { page: 1, totalPages: 1 });
const emit = defineEmits<{ change: [page: number] }>();
const pageBound = (value: number, max: number): number => Math.max(1, Math.min(Math.max(1, max), Math.floor(Number.isFinite(value) ? value : 1)));
const last = computed(() => Math.max(1, props.totalPages));
const middle = computed(() => Math.ceil(last.value / 2));
const quick = computed(() => [...new Set([1, middle.value, last.value])]);
const typed = ref(String(props.page));
const inputId = useId();
watch(() => props.page, value => { typed.value = String(value); });
watch(last, value => { if (props.page > value) emit('change', value); });
const move = (value: number): void => { const n = pageBound(value, last.value); typed.value = String(n); if (n !== props.page) emit('change', n); };
function jump(): void {
  if (!/^\d+$/.test(typed.value) || Number(typed.value) < 1 || Number(typed.value) > last.value) { typed.value = String(props.page); return; }
  move(Number(typed.value));
}
</script>
<template>
  <nav v-if="totalPages > 1" class="pager" aria-label="Paginação dos documentos" data-testid="document-pagination">
    <button type="button" class="nav" aria-label="Página anterior" title="Voltar 1" :disabled="page <= 1" @click="move(page-1)">‹</button>
    <button type="button" class="nav" aria-label="Voltar cinco páginas" title="Voltar 5" :disabled="page <= 1" @click="move(page-5)">«</button>
    <label class="sr-only"  :for="inputId">Ir para a página</label>
    <input  :id="inputId" v-model="typed" class="number" type="number" min="1" :max="last" inputmode="numeric" aria-label="Ir para a página" @keydown.enter="jump" @blur="jump" />
    <button v-for="n in quick" :key="n" type="button" class="shortcut" :class="{ current: n === page }" :aria-label="'Ir para a página ' + n" :aria-current="n === page ? 'page' : undefined" @click="move(n)">{{ n }}</button>
    <button type="button" class="nav" aria-label="Avançar cinco páginas" title="Avançar 5" :disabled="page >= last" @click="move(page+5)">»</button>
    <button type="button" class="nav" aria-label="Próxima página" title="Avançar 1" :disabled="page >= last" @click="move(page+1)">›</button>
  </nav>
</template>
<style scoped>
.pager { display:flex; align-items:center; justify-content:center; gap:5px; max-width:100%; overflow-x:auto; padding:12px 2px; scrollbar-width:thin; }
button { border:1px solid var(--border); background:var(--surface); color:var(--text); border-radius:10px; min-width:34px; min-height:42px; padding:3px 6px; flex:none; font-weight:750; }
button:disabled { opacity:.4; }
button.current { background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
.nav { font-size:23px; line-height:1; }
.number { min-width:0; flex:0 0 49px; width:49px; height:42px; border-radius:10px; text-align:center; border:1px solid var(--border); background:var(--panel); font:inherit; color:var(--text); }
.number::-webkit-inner-spin-button { appearance:none; }
@media (max-width:359px) { .pager { gap:3px; } button { min-width:30px; font-size:12px; padding:2px 4px; } .nav { font-size:19px; } .number { flex-basis:42px; width:42px; } }
</style>