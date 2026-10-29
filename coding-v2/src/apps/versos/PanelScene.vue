<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VersosView } from './controller';
import { MAX_SIDE, MIN_SIDE, pixelCount, type BgFit } from './model';
import ColorField from './ColorField.vue';
import NumField from './NumField.vue';

/** Aba "Cena": fundo (imagem, cor ou transparente), proporção e resolução. Vale só para a cena selecionada. */
const props = defineProps<{ v: VersosView }>();
const fileInput = ref<HTMLInputElement | null>(null);
const bg = computed(() => props.v.scene.background);
const megapixels = computed(() => Math.round(pixelCount(props.v.scene) / 1e5) / 10);
const modes = [
  { id: 'color', label: 'Cor' }, { id: 'image', label: 'Imagem' }, { id: 'transparent', label: 'Transparente' }
] as const;
const fits: { id: BgFit; label: string }[] = [
  { id: 'cover', label: 'Preencher (corta o excesso)' }, { id: 'contain', label: 'Ajustar (mostra inteira)' }, { id: 'stretch', label: 'Esticar (deforma)' }
];

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await props.v.importBackground(file);
}
function setColor(value: string): void { props.v.doc.setChangeKey('bg-color'); props.v.scene.background.color = value; }
function setAlpha(percent: number): void { props.v.doc.setChangeKey('bg-alpha'); props.v.scene.background.alpha = percent / 100; }
function frame(key: 'x' | 'y' | 'zoom', value: number): void {
  const img = props.v.scene.background.image;
  if (!img) return;
  props.v.doc.setChangeKey('bg-frame-' + key);
  img[key] = key === 'zoom' ? value / 100 : value;
}
function setFit(event: Event): void {
  const img = props.v.scene.background.image;
  if (!img) return;
  props.v.doc.setChangeKey('bg-fit');
  img.fit = (event.target as HTMLSelectElement).value as BgFit;
}
function rename(event: Event): void { props.v.doc.setChangeKey('scene-name'); props.v.renameScene((event.target as HTMLInputElement).value); }
</script>

<template>
  <div class="ps">
    <section class="ed-group" aria-labelledby="ps-bg">
      <h2 id="ps-bg">Fundo da cena</h2>
      <div class="seg" role="radiogroup" aria-label="Tipo de fundo">
        <button v-for="m in modes" :key="m.id" type="button" role="radio" class="seg-b" :aria-checked="bg.mode === m.id" :data-testid="'bg-' + m.id" @click="v.setBackgroundMode(m.id)">{{ m.label }}</button>
      </div>

      <template v-if="bg.mode !== 'transparent'">
        <ColorField :model-value="bg.color" :label="bg.mode === 'image' ? 'Cor de apoio (atrás da imagem)' : 'Cor de fundo'" testid="bg-color-hex" @update:model-value="setColor" />
        <NumField :model-value="Math.round(bg.alpha * 100)" label="Opacidade do fundo" unit="%" :min="0" :max="100" slider testid="bg-alpha" @update:model-value="setAlpha" />
        <p v-if="bg.alpha < 1" class="ed-hint">Fundo semitransparente: a exportação completa mantém a transparência (a grade xadrez da prévia não é exportada).</p>
      </template>
      <p v-else class="ed-hint">Sem fundo. A grade xadrez aparece só aqui na tela; o PNG exportado fica realmente transparente.</p>

      <div class="ed-row">
        <button type="button" class="btn" :class="{ 'btn-app': !bg.image }" data-testid="bg-import" @click="fileInput?.click()">{{ bg.image ? 'Trocar imagem…' : 'Importar imagem…' }}</button>
        <input ref="fileInput" type="file" class="sr-only" accept="image/*" aria-label="Escolher imagem de fundo" data-testid="bg-input" @change="onFile" />
        <button v-if="bg.image" type="button" class="btn" data-testid="bg-remove" @click="v.removeBackgroundImage()">Remover imagem</button>
      </div>

      <template v-if="bg.image">
        <label class="ed-field"><span class="ed-label">Encaixe da imagem</span>
          <select class="inp" :value="bg.image.fit" data-testid="bg-fit" @change="setFit">
            <option v-for="f in fits" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
        </label>
        <NumField :model-value="bg.image.zoom * 100" label="Zoom" unit="%" :min="10" :max="800" slider testid="bg-zoom" @update:model-value="frame('zoom', $event)" />
        <NumField :model-value="bg.image.x" label="Posição horizontal" unit="%" :min="-100" :max="100" slider testid="bg-x" @update:model-value="frame('x', $event)" />
        <NumField :model-value="bg.image.y" label="Posição vertical" unit="%" :min="-100" :max="100" slider testid="bg-y" @update:model-value="frame('y', $event)" />
        <div class="ed-row"><button type="button" class="btn" data-testid="bg-reset" @click="v.resetFraming()">Centralizar e zoom 100%</button></div>
        <p class="ed-hint">Trocar ou remover o fundo nunca mexe nos textos da cena.</p>
      </template>
    </section>

    <section class="ed-group" aria-labelledby="ps-size">
      <h2 id="ps-size">Proporção e resolução</h2>
      <div class="seg wrap" role="radiogroup" aria-label="Proporção da cena">
        <button v-for="r in v.ratioOptions" :key="r.id" type="button" role="radio" class="seg-b" :aria-checked="v.scene.ratio === r.id" :title="v.ratioHint(r.id)" :data-testid="'ratio-' + r.id" @click="v.setRatio(r.id)">{{ r.label }}</button>
      </div>
      <div class="ed-row">
        <NumField :model-value="v.scene.width" label="Largura" unit="px" :min="MIN_SIDE" :max="MAX_SIDE" :live="false" :clamp="false" testid="scene-width" @update:model-value="v.setSide('width', $event)" />
        <NumField :model-value="v.scene.height" label="Altura" unit="px" :min="MIN_SIDE" :max="MAX_SIDE" :live="false" :clamp="false" testid="scene-height" @update:model-value="v.setSide('height', $event)" />
      </div>
      <p class="ed-hint" data-testid="scene-size-info">{{ v.scene.width }} × {{ v.scene.height }} px · {{ megapixels }} MP. A resolução é independente da proporção: use o mesmo formato em tamanhos diferentes.</p>
      <p v-if="v.sizeError" class="ed-error" role="alert" data-testid="size-error">{{ v.sizeError }}</p>
      <p v-else-if="v.sizeWarning(v.scene)" class="ed-hint warn" role="status" data-testid="size-warning">{{ v.sizeWarning(v.scene) }}</p>
      <label class="check"><input v-model="v.scaleContent" type="checkbox" data-testid="scale-content" /> Ajustar os textos ao novo tamanho</label>
      <p class="ed-hint">Cada cena tem a sua proporção e resolução. Mudar esta cena não altera as outras.</p>
    </section>

    <section class="ed-group" aria-labelledby="ps-name">
      <h2 id="ps-name">Nome da cena</h2>
      <label class="ed-field"><span class="sr-only">Nome da cena</span>
        <input class="inp" :value="v.scene.name" maxlength="80" :placeholder="'Cena ' + (v.sceneIndex + 1)" data-testid="scene-name" @input="rename" />
      </label>
    </section>
  </div>
</template>

<style scoped>
.ps { display: grid; }
.seg { display: inline-flex; gap: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel); width: fit-content; max-width: 100%; }
.seg.wrap { flex-wrap: wrap; border: 0; gap: 6px; background: transparent; overflow: visible; }
.seg-b { min-height: 44px; padding: 0 14px; border: 0; background: transparent; font-weight: 700; font-size: 13px; }
.seg.wrap .seg-b { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.seg-b[aria-checked="true"] { background: color-mix(in srgb, var(--app) 22%, var(--surface)); box-shadow: inset 0 -3px var(--app); }
.seg.wrap .seg-b[aria-checked="true"] { border-color: var(--app); }
.seg-b:hover:not([aria-checked="true"]) { background: var(--raised); }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; font-size: 14px; }
.check input { width: 20px; height: 20px; accent-color: var(--accent); }
.warn { color: var(--warn); font-weight: 600; }
</style>
