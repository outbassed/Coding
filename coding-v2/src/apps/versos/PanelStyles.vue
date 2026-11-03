<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { VersosView } from './controller';
import { preloadFonts, resolveFont } from './fonts';
import { STYLE_PRESETS } from './model';

/**
 * Aba "Estilos": estilos prontos, copiar/colar formatação, estilos do projeto e reaproveitar a aparência de outra cena.
 * Aplicar um estilo NUNCA troca o conteúdo, a posição, a largura nem a rotação do texto.
 */
const props = defineProps<{ v: VersosView }>();
const styleName = ref('');
const fromScene = ref('');
const fromText = ref('');

onMounted(() => preloadFonts(STYLE_PRESETS.map((p) => p.style.font)));
const others = computed(() => props.v.state.scenes.filter((s) => s.texts.length > 0));
watch(others, (list) => {
  if (!list.some((s) => s.id === fromScene.value)) fromScene.value = (list.find((s) => s.id !== props.v.sceneId) ?? list[0])?.id ?? '';
}, { immediate: true });
const sourceTexts = computed(() => props.v.state.scenes.find((s) => s.id === fromScene.value)?.texts ?? []);
watch(sourceTexts, (list) => { if (!list.some((t) => t.id === fromText.value)) fromText.value = list[0]?.id ?? ''; }, { immediate: true });
const sceneName = (id: string): string => { const i = props.v.state.scenes.findIndex((s) => s.id === id); return props.v.labelOf(props.v.state.scenes[i]!) + (id === props.v.sceneId ? ' (esta)' : ''); };

function saveCurrent(): void { props.v.saveStyle(styleName.value); styleName.value = ''; }
const hasText = computed(() => props.v.selectedText !== null);
</script>

<template>
  <div class="pst">
    <section class="ed-group" aria-labelledby="st-pre">
      <h2 id="st-pre">Estilos prontos</h2>
      <p v-if="!hasText" class="ed-hint">Selecione um texto na prévia ou na aba Textos para aplicar um estilo.</p>
      <div class="presets" role="group" aria-label="Estilos prontos">
        <button v-for="p in STYLE_PRESETS" :key="p.id" type="button" class="preset" :disabled="!hasText" :data-preset="p.id" :title="p.hint" @click="v.applyPreset(p.id)">
          <span class="preset-sample" :style="{ fontFamily: resolveFont(p.style.font).css, fontStyle: p.style.italic ? 'italic' : 'normal', fontWeight: p.style.weight ?? 400 }">Aa</span>
          <span class="preset-name">{{ p.name }}</span>
          <small>{{ p.hint }}</small>
        </button>
      </div>
      <p class="ed-hint">Opcional: você pode formatar do zero em Propriedades.</p>
    </section>

    <section class="ed-group" aria-labelledby="st-fmt">
      <h2 id="st-fmt">Copiar formatação</h2>
      <div class="ed-row">
        <button type="button" class="btn" :disabled="!hasText" data-testid="copy-format" @click="v.copyFormatCmd()">Copiar formatação</button>
        <button type="button" class="btn" :disabled="!hasText || v.clipKind !== 'format'" data-testid="paste-format" @click="v.pasteFormatCmd()">Colar formatação</button>
      </div>
      <p class="ed-hint">Copia só a aparência (fonte, tamanho, cor, contorno, sombra…) do texto selecionado e cola em outro, sem mudar o conteúdo.</p>
    </section>

    <section class="ed-group" aria-labelledby="st-proj">
      <h2 id="st-proj">Estilos do projeto</h2>
      <div class="ed-row">
        <label class="ed-field grow"><span class="ed-label">Nome do estilo</span><input v-model="styleName" class="inp" maxlength="60" placeholder="Ex.: Verso principal" data-testid="style-name" @keydown.enter="saveCurrent" /></label>
        <button type="button" class="btn" :disabled="!hasText" data-testid="save-style" @click="saveCurrent">Salvar do texto selecionado</button>
      </div>
      <ul v-if="v.state.styles.length" class="saved" data-testid="saved-styles">
        <li v-for="s in v.state.styles" :key="s.id" class="saved-item">
          <span class="saved-name" :style="{ fontFamily: resolveFont(s.style.font).css }">{{ s.name }}</span>
          <button type="button" class="btn small" :disabled="!hasText" data-testid="apply-saved" @click="v.applySaved(s.id)">Aplicar</button>
          <button type="button" class="btn small" :disabled="!v.scene.texts.length" data-testid="apply-saved-all" title="Aplicar a todos os textos desta cena" @click="v.applySaved(s.id, true)">A todos</button>
          <button type="button" class="ib" :aria-label="'Remover o estilo ' + s.name" title="Remover da lista" @click="v.deleteSaved(s.id)">✕</button>
        </li>
      </ul>
      <p v-else class="ed-hint">Nenhum estilo salvo. Os estilos ficam dentro do projeto e servem para repetir o mesmo visual em várias cenas.</p>
    </section>

    <section class="ed-group" aria-labelledby="st-other">
      <h2 id="st-other">Usar a aparência de outra cena</h2>
      <template v-if="others.length">
        <label class="ed-field"><span class="ed-label">Cena</span>
          <select v-model="fromScene" class="inp" data-testid="from-scene"><option v-for="s in others" :key="s.id" :value="s.id">{{ sceneName(s.id) }}</option></select>
        </label>
        <label class="ed-field"><span class="ed-label">Texto</span>
          <select v-model="fromText" class="inp" data-testid="from-text"><option v-for="(t, i) in sourceTexts" :key="t.id" :value="t.id">{{ v.textLabel(t, i) }}</option></select>
        </label>
        <div class="ed-row">
          <button type="button" class="btn" :disabled="!hasText || !fromText" data-testid="apply-from" @click="v.applyStyleFrom(fromScene, fromText)">Aplicar ao texto selecionado</button>
          <button type="button" class="btn" :disabled="!v.scene.texts.length || !fromText" data-testid="apply-from-all" @click="v.applyStyleFrom(fromScene, fromText, true)">Aplicar a todos os textos desta cena</button>
        </div>
        <p class="ed-hint">O conteúdo dos textos de destino não é substituído.</p>
      </template>
      <p v-else class="ed-hint">Quando houver textos em alguma cena, você poderá reaproveitar a aparência deles aqui.</p>
    </section>
  </div>
</template>

<style scoped>
.pst { display: grid; }
.presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
.preset { display: grid; gap: 2px; justify-items: start; text-align: left; min-height: 88px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.preset:hover:not(:disabled) { border-color: var(--app); }
.preset:disabled { opacity: .55; }
.preset-sample { font-size: 28px; line-height: 1.1; }
.preset-name { font-weight: 700; font-size: 13px; }
.preset small { color: var(--muted); font-size: 11.5px; line-height: 1.25; }
.grow { flex: 1 1 160px; }
.saved { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.saved-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.saved-name { flex: 1 1 100px; min-width: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.small { min-height: 40px; padding: 4px 10px; font-size: 13px; }
</style>
