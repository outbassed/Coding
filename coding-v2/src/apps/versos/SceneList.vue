<script setup lang="ts">
import NavIcon from '../../components/ui/NavIcon.vue';
import type { VersosView } from './controller';
import SceneThumb from './SceneThumb.vue';

/** Lista de cenas com miniaturas. Cada cena é independente; todas as operações têm botão e também atalho/menu de contexto. */
defineProps<{ v: VersosView }>();
</script>

<template>
  <div class="sl" data-area="scenes" data-testid="scene-panel">
    <div class="sl-actions">
      <button type="button" class="btn btn-app" data-testid="add-scene" @click="v.addScene()"><NavIcon name="plus" /> Nova cena</button>
      <button type="button" class="btn" data-testid="dup-scene" title="Duplicar a cena selecionada (Ctrl+D)" @click="v.duplicateScene()"><NavIcon name="duplicate" /> Duplicar</button>
      <button type="button" class="btn" data-testid="copy-scene" title="Copiar a cena selecionada (Ctrl+C)" @click="v.copySceneCmd()">Copiar</button>
      <button type="button" class="btn" data-testid="cut-scene" title="Recortar a cena selecionada (Ctrl+X)" @click="v.cutScene()">Recortar</button>
      <button type="button" class="btn" data-testid="paste-scene" :disabled="v.clipKind !== 'scenes'" title="Colar como nova cena (Ctrl+V)" @click="v.pasteScenes()">Colar</button>
    </div>
    <ol class="sl-list" data-testid="scene-list" aria-label="Cenas do projeto, em ordem">
      <li v-for="(s, i) in v.state.scenes" :key="s.id" class="sl-item" :class="{ on: s.id === v.sceneId }" :data-scene-id="s.id" data-testid="scene-item" :data-index="i">
        <button type="button" class="sl-pick" :aria-current="s.id === v.sceneId ? 'true' : undefined" :aria-label="'Cena ' + (i + 1) + ': ' + v.labelOf(s) + ', ' + s.width + ' por ' + s.height + ' pixels'" data-testid="scene-pick" @click="v.selectScene(s.id)">
          <SceneThumb :scene="s" :v="v" />
          <span class="sl-meta"><strong>{{ i + 1 }}</strong><span class="sl-name">{{ v.labelOf(s) }}</span><small>{{ s.width }} × {{ s.height }}</small></span>
        </button>
        <span class="sl-tools" role="group" :aria-label="'Ações da cena ' + (i + 1)">
          <button type="button" class="ib" :disabled="i === 0" :aria-label="'Mover a cena ' + (i + 1) + ' para cima'" title="Mover para cima" data-testid="scene-up" @click="v.moveScene(s.id, -1)"><NavIcon name="arrow-up" /></button>
          <button type="button" class="ib" :disabled="i === v.sceneCount - 1" :aria-label="'Mover a cena ' + (i + 1) + ' para baixo'" title="Mover para baixo" data-testid="scene-down" @click="v.moveScene(s.id, 1)"><NavIcon name="arrow-down" /></button>
          <button type="button" class="ib" :aria-label="'Duplicar a cena ' + (i + 1)" title="Duplicar" data-testid="scene-dup" @click="v.duplicateScene(s.id)"><NavIcon name="duplicate" /></button>
          <button type="button" class="ib" :aria-label="'Excluir a cena ' + (i + 1)" title="Excluir" data-testid="scene-del" @click="v.deleteScene(s.id)"><NavIcon name="trash" /></button>
        </span>
      </li>
    </ol>
    <p class="ed-hint">Colar sempre cria uma cena nova depois da selecionada. Ctrl+Z desfaz.</p>
  </div>
</template>

<style scoped>
.sl { display: grid; gap: 10px; min-width: 0; }
.sl-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.sl-actions .btn { min-height: 40px; padding: 6px 10px; font-size: 13px; }
.sl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sl-item { display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); min-width: 0; }
.sl-item.on { border-color: var(--app); box-shadow: inset 0 0 0 1px var(--app); background: color-mix(in srgb, var(--app) 9%, var(--surface)); }
.sl-pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 4px; border: 0; background: transparent; text-align: left; border-radius: 8px; }
.sl-meta { display: flex; flex-direction: column; min-width: 0; gap: 1px; font-size: 13px; }
.sl-meta strong { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
.sl-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-meta small { color: var(--muted); font-size: 11.5px; }
.sl-tools { display: grid; grid-template-columns: repeat(2, auto); gap: 0; flex: none; }
.sl-tools .ib { min-width: 40px; min-height: 40px; padding: 0 4px; }
@media (min-width: 600px) and (max-width: 899px) { .sl-tools { grid-template-columns: repeat(4, auto); } }
</style>
