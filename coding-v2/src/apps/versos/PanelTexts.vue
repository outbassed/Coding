<script setup lang="ts">
import { computed } from 'vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import type { VersosView } from './controller';
import { MAX_TEXTS } from './model';

/** Aba "Textos": todos os blocos da cena, do mais acima (desenhado por cima) para o mais abaixo. */
const props = defineProps<{ v: VersosView }>();
const rows = computed(() => props.v.scene.texts.map((t, i) => ({ t, i })).reverse());
</script>

<template>
  <div class="ed-group pt">
    <div class="ed-row">
      <button type="button" class="btn btn-app" data-testid="add-text" :disabled="v.scene.texts.length >= MAX_TEXTS" @click="v.addText()"><NavIcon name="plus" /> Adicionar texto</button>
      <button type="button" class="btn" data-testid="paste-text" :disabled="v.clipKind !== 'texts'" title="Colar texto copiado (Ctrl+V)" @click="v.pasteTexts()">Colar texto</button>
    </div>
    <ol v-if="rows.length" class="tl" data-testid="text-list" aria-label="Textos da cena, do mais acima para o mais abaixo">
      <li v-for="r in rows" :key="r.t.id" class="tl-item" :class="{ on: r.t.id === v.textId, off: !r.t.visible }" :data-text-id="r.t.id" data-testid="text-item">
        <button type="button" class="tl-pick" :aria-pressed="r.t.id === v.textId" data-testid="text-pick" @click="v.selectText(r.t.id)">
          <span class="tl-name">{{ v.textLabel(r.t, r.i) }}</span>
          <small class="muted">{{ r.t.font.label }} · {{ Math.round(r.t.size) }} px<template v-if="!r.t.visible"> · oculto</template></small>
        </button>
        <span class="tl-tools" role="group" :aria-label="'Ações do texto ' + (r.i + 1)">
          <button type="button" class="ib" :aria-label="(r.t.visible ? 'Ocultar' : 'Mostrar') + ' texto ' + (r.i + 1)" :aria-pressed="!r.t.visible" :title="r.t.visible ? 'Ocultar' : 'Mostrar'" data-testid="text-eye" @click="v.toggleText(r.t.id)"><NavIcon :name="r.t.visible ? 'eye' : 'eye-off'" /></button>
          <button type="button" class="ib" :disabled="r.i === v.scene.texts.length - 1" :aria-label="'Trazer o texto ' + (r.i + 1) + ' para frente'" title="Para frente (camada acima)" data-testid="text-up" @click="v.moveText(r.t.id, 1)"><NavIcon name="arrow-up" /></button>
          <button type="button" class="ib" :disabled="r.i === 0" :aria-label="'Enviar o texto ' + (r.i + 1) + ' para trás'" title="Para trás (camada abaixo)" data-testid="text-down" @click="v.moveText(r.t.id, -1)"><NavIcon name="arrow-down" /></button>
          <button type="button" class="ib" :aria-label="'Duplicar o texto ' + (r.i + 1)" title="Duplicar" data-testid="text-dup" @click="v.duplicateText(r.t.id)"><NavIcon name="duplicate" /></button>
          <button type="button" class="ib" :aria-label="'Excluir o texto ' + (r.i + 1)" title="Excluir" data-testid="text-del" @click="v.deleteText(r.t.id)"><NavIcon name="trash" /></button>
        </span>
      </li>
    </ol>
    <p v-else class="ed-hint" data-testid="texts-empty">Esta cena ainda não tem textos. Adicione um e edite o conteúdo e a aparência em Propriedades.</p>
    <p class="ed-hint">Clique no texto na prévia para selecioná-lo; arraste para mover. Tudo também pode ser digitado em Propriedades.</p>
  </div>
</template>

<style scoped>
.pt { gap: 10px; }
.tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.tl-item { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); min-width: 0; }
.tl-item.on { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); background: color-mix(in srgb, var(--app) 9%, var(--surface)); }
.tl-item.off .tl-name { text-decoration: line-through; opacity: .7; }
.tl-pick { flex: 1 1 140px; min-width: 0; display: grid; gap: 1px; min-height: 44px; padding: 2px 8px; border: 0; background: transparent; text-align: left; }
.tl-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-pick small { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-tools { display: flex; flex-wrap: wrap; }
.tl-tools .ib { min-width: 40px; min-height: 40px; padding: 0 4px; }
</style>
