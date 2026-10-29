<script setup lang="ts">
import { computed, ref } from 'vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import type { VersosView } from './controller';
import {
  CATEGORY_LABEL, allFamilies, fontStatus, resolveFont, supportedWeights, supportsItalic, supportsWeight, type FontCategory
} from './fonts';
import type { Align, TextBlock } from './model';
import ColorField from './ColorField.vue';
import NumField from './NumField.vue';

/**
 * Propriedades do texto selecionado. Campos numéricos e botões são o caminho principal; arrastar na prévia é opcional.
 * A fonte escolhida é gravada com o nome ORIGINAL; se não existir neste aparelho, só a exibição usa a Arimo.
 */
const props = defineProps<{ v: VersosView }>();
const t = computed<TextBlock | null>(() => props.v.selectedText);
const contentEl = ref<HTMLTextAreaElement | null>(null);

function focusContent(): void { contentEl.value?.focus(); contentEl.value?.select(); }
defineExpose({ focusContent });

/** Aplica uma mudança agrupando ajustes seguidos do mesmo campo num único passo do desfazer. */
function put(field: string, apply: (block: TextBlock) => void): void {
  const block = t.value;
  if (!block) return;
  props.v.doc.setChangeKey(field + '-' + block.id);
  apply(block);
}
function onContent(event: Event): void { const value = (event.target as HTMLTextAreaElement).value; put('content', (b) => { b.text = value; }); }
function onName(event: Event): void { const value = (event.target as HTMLInputElement).value; put('name', (b) => { b.name = value.slice(0, 60); }); }

const families = computed(() => allFamilies());
const grouped = computed(() => {
  const order: FontCategory[] = ['sans', 'serif', 'display', 'script', 'handwriting'];
  return order.map((c) => ({ id: c, label: CATEGORY_LABEL[c], items: families.value.filter((f) => f.category === c) })).filter((g) => g.items.length);
});
const resolved = computed(() => (t.value ? resolveFont(t.value.font) : null));
const fontNote = computed(() => {
  void props.v.fontTick; // recalcula quando uma fonte termina de carregar
  const b = t.value, r = resolved.value;
  if (!b || !r) return '';
  if (r.substituted) return 'A fonte “' + b.font.label + '” não está disponível neste aparelho. A prévia e a exportação usam a Arimo; o nome original continua guardado no projeto.';
  const s = fontStatus(b.font);
  if (s === 'loading') return 'Carregando a fonte…';
  if (s === 'error') return 'Não foi possível carregar a fonte agora. Usando a Arimo até ela carregar.';
  return '';
});
const weights = computed(() => supportedWeights(resolved.value?.def ?? null));
const weightFixed = computed(() => !supportsWeight(resolved.value?.def ?? null));
const italicOk = computed(() => supportsItalic(resolved.value?.def ?? null));
const WEIGHT_NAME: Record<number, string> = { 100: 'Fino', 200: 'Extra leve', 300: 'Leve', 400: 'Normal', 500: 'Médio', 600: 'Seminegrito', 700: 'Negrito', 800: 'Extranegrito', 900: 'Preto' };

function onFont(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const fam = families.value.find((f) => f.id === id);
  if (fam) put('font', (b) => { b.font = { id: fam.id, label: fam.label }; });
}
function onWeight(event: Event): void { const w = Number((event.target as HTMLSelectElement).value); put('weight', (b) => { b.weight = w; }); }
const aligns: { id: Align; label: string; d: string }[] = [
  { id: 'left', label: 'Alinhar à esquerda', d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  { id: 'center', label: 'Centralizar', d: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { id: 'right', label: 'Alinhar à direita', d: 'M4 6h16M10 10h10M4 14h16M10 18h10' }
];
</script>

<template>
  <div v-if="t" class="tp" data-testid="text-props">
    <section class="grp" aria-labelledby="tp-content">
      <h3 id="tp-content">Conteúdo</h3>
      <label class="ed-field"><span class="sr-only">Texto</span>
        <textarea ref="contentEl" class="inp" rows="4" maxlength="5000" :value="t.text" data-testid="text-content" @input="onContent"></textarea>
      </label>
      <label class="ed-field"><span class="ed-label">Nome da camada (opcional)</span>
        <input class="inp" maxlength="60" :value="t.name" :placeholder="v.textLabel(t, v.scene.texts.indexOf(t))" data-testid="text-name" @input="onName" />
      </label>
      <div class="actions" role="group" aria-label="Ações do texto">
        <button type="button" class="ib" :aria-pressed="!t.visible" :aria-label="t.visible ? 'Ocultar texto' : 'Mostrar texto'" :title="t.visible ? 'Ocultar' : 'Mostrar'" data-testid="prop-eye" @click="v.toggleText()"><NavIcon :name="t.visible ? 'eye' : 'eye-off'" /></button>
        <button type="button" class="ib" aria-label="Trazer para frente" title="Para frente (camada acima)" data-testid="prop-up" @click="v.moveText(t.id, 1)"><NavIcon name="arrow-up" /></button>
        <button type="button" class="ib" aria-label="Enviar para trás" title="Para trás (camada abaixo)" data-testid="prop-down" @click="v.moveText(t.id, -1)"><NavIcon name="arrow-down" /></button>
        <button type="button" class="ib" aria-label="Duplicar texto" title="Duplicar" data-testid="prop-dup" @click="v.duplicateText()"><NavIcon name="duplicate" /></button>
        <button type="button" class="ib" aria-label="Excluir texto" title="Excluir" data-testid="prop-del" @click="v.deleteText()"><NavIcon name="trash" /></button>
      </div>
      <div class="ed-row">
        <button type="button" class="btn small" data-testid="prop-copy-format" @click="v.copyFormatCmd()">Copiar formatação</button>
        <button type="button" class="btn small" :disabled="v.clipKind !== 'format'" data-testid="prop-paste-format" @click="v.pasteFormatCmd()">Colar formatação</button>
      </div>
    </section>

    <section class="grp" aria-labelledby="tp-font">
      <h3 id="tp-font">Fonte</h3>
      <label class="ed-field"><span class="ed-label">Família</span>
        <select class="inp" :value="resolved?.def ? resolved.def.id : t.font.id" data-testid="text-font" @change="onFont">
          <option v-if="resolved?.substituted" :value="t.font.id">{{ t.font.label }} (indisponível aqui)</option>
          <optgroup v-for="g in grouped" :key="g.id" :label="g.label">
            <option v-for="f in g.items" :key="f.id" :value="f.id">{{ f.label }}</option>
          </optgroup>
        </select>
      </label>
      <p v-if="fontNote" class="ed-hint warn" role="status" data-testid="font-note">{{ fontNote }}</p>
      <div class="grid2">
        <NumField :model-value="t.size" label="Tamanho" unit="px" :min="1" :max="4000" :step="1" testid="text-size" @update:model-value="put('size', (b) => { b.size = $event; })" />
        <label class="ed-field"><span class="ed-label">Peso</span>
          <select class="inp" :value="Math.min(Math.max(t.weight, weights[0] ?? 400), weights[weights.length - 1] ?? 400)" :disabled="weightFixed" :title="weightFixed ? 'Esta fonte tem um peso só' : ''" data-testid="text-weight" @change="onWeight">
            <option v-for="w in weights" :key="w" :value="w">{{ WEIGHT_NAME[w] ?? w }}</option>
          </select>
        </label>
      </div>
      <div class="ed-row">
        <button type="button" class="ib b" :aria-pressed="t.italic && italicOk" :disabled="!italicOk" :title="italicOk ? 'Itálico' : 'Esta fonte não tem itálico'" aria-label="Itálico" data-testid="text-italic" @click="put('italic', (b) => { b.italic = !b.italic; })"><i>I</i></button>
        <div class="aligns" role="group" aria-label="Alinhamento do texto">
          <button v-for="a in aligns" :key="a.id" type="button" class="ib b" :aria-pressed="t.align === a.id" :aria-label="a.label" :title="a.label" :data-testid="'align-' + a.id" @click="put('align', (b) => { b.align = a.id; })">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path :d="a.d" /></svg>
          </button>
        </div>
      </div>
    </section>

    <section class="grp" aria-labelledby="tp-color">
      <h3 id="tp-color">Cor e opacidade</h3>
      <ColorField :model-value="t.color" label="Cor do texto" testid="text-color" @update:model-value="put('color', (b) => { b.color = $event; })" />
      <NumField :model-value="Math.round(t.opacity * 100)" label="Opacidade" unit="%" :min="0" :max="100" slider testid="text-opacity" @update:model-value="put('opacity', (b) => { b.opacity = $event / 100; })" />
    </section>

    <section class="grp" aria-labelledby="tp-space">
      <h3 id="tp-space">Espaçamento</h3>
      <NumField :model-value="t.letterSpacing" label="Entre letras" unit="px" :min="-50" :max="200" :step="0.5" slider testid="text-letter" @update:model-value="put('letter', (b) => { b.letterSpacing = $event; })" />
      <NumField :model-value="t.lineHeight" label="Entre linhas" unit="× o tamanho" :min="0.5" :max="4" :step="0.05" slider testid="text-line" @update:model-value="put('line', (b) => { b.lineHeight = $event; })" />
    </section>

    <section class="grp" aria-labelledby="tp-stroke">
      <h3 id="tp-stroke">Contorno</h3>
      <NumField :model-value="t.stroke.width" label="Espessura" unit="px" :min="0" :max="200" :step="0.5" slider testid="stroke-width" @update:model-value="put('stroke', (b) => { b.stroke.width = $event; })" />
      <ColorField :model-value="t.stroke.color" label="Cor do contorno" testid="stroke-color" @update:model-value="put('stroke-color', (b) => { b.stroke.color = $event; })" />
    </section>

    <section class="grp" aria-labelledby="tp-shadow">
      <h3 id="tp-shadow">Sombra</h3>
      <ColorField :model-value="t.shadow.color" label="Cor da sombra" testid="shadow-color" @update:model-value="put('shadow-color', (b) => { b.shadow.color = $event; })" />
      <NumField :model-value="Math.round(t.shadow.opacity * 100)" label="Intensidade" unit="%" :min="0" :max="100" slider testid="shadow-opacity" @update:model-value="put('shadow-opacity', (b) => { b.shadow.opacity = $event / 100; })" />
      <NumField :model-value="t.shadow.blur" label="Desfoque" unit="px" :min="0" :max="400" :step="0.5" slider testid="shadow-blur" @update:model-value="put('shadow-blur', (b) => { b.shadow.blur = $event; })" />
      <div class="grid2">
        <NumField :model-value="t.shadow.x" label="Deslocamento X" unit="px" :min="-1000" :max="1000" :step="1" testid="shadow-x" @update:model-value="put('shadow-x', (b) => { b.shadow.x = $event; })" />
        <NumField :model-value="t.shadow.y" label="Deslocamento Y" unit="px" :min="-1000" :max="1000" :step="1" testid="shadow-y" @update:model-value="put('shadow-y', (b) => { b.shadow.y = $event; })" />
      </div>
      <p class="ed-hint">Sem desfoque e sem deslocamento, não há sombra.</p>
    </section>

    <section class="grp" aria-labelledby="tp-pos">
      <h3 id="tp-pos">Posição e área</h3>
      <div class="grid2">
        <NumField :model-value="t.x" label="X (centro)" unit="px" :min="-30000" :max="30000" :step="1" testid="text-x" @update:model-value="put('x', (b) => { b.x = $event; })" />
        <NumField :model-value="t.y" label="Y (centro)" unit="px" :min="-30000" :max="30000" :step="1" testid="text-y" @update:model-value="put('y', (b) => { b.y = $event; })" />
      </div>
      <NumField :model-value="t.width" label="Largura da área de texto" unit="px" :min="1" :max="30000" :step="1" testid="text-width" @update:model-value="put('width', (b) => { b.width = $event; })" />
      <NumField :model-value="t.rotation" label="Rotação" unit="°" :min="-360" :max="360" :step="1" slider testid="text-rotation" @update:model-value="put('rotation', (b) => { b.rotation = $event; })" />
      <div class="ed-row">
        <button type="button" class="btn small" data-testid="center-h" @click="put('x', (b) => { b.x = Math.round(v.scene.width / 2); })">Centralizar na horizontal</button>
        <button type="button" class="btn small" data-testid="center-v" @click="put('y', (b) => { b.y = Math.round(v.scene.height / 2); })">Centralizar na vertical</button>
      </div>
      <p class="ed-hint">Textos fora da área visível continuam existindo e saem cortados na exportação, exatamente como na prévia.</p>
    </section>
  </div>
  <div v-else class="empty" data-testid="text-props-empty">
    <p><strong>Nenhum texto selecionado.</strong></p>
    <p class="ed-hint">Clique em um texto na prévia ou escolha um na aba Textos. Depois edite conteúdo, fonte, cor, contorno, sombra, posição e rotação aqui.</p>
    <button type="button" class="btn btn-app" data-testid="add-text-empty" @click="v.addText()"><NavIcon name="plus" /> Adicionar texto</button>
  </div>
</template>

<style scoped>
.tp { display: grid; gap: 4px; min-width: 0; }
.grp { display: grid; gap: 8px; padding: 10px 0 12px; border-bottom: 1px solid var(--border); min-width: 0; }
.grp:last-child { border-bottom: 0; }
.grp h3 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 0; }
.aligns { display: inline-flex; gap: 4px; }
.b { border: 1px solid var(--border); }
.small { min-height: 40px; padding: 4px 10px; font-size: 13px; }
.warn { color: var(--warn); font-weight: 600; }
.empty { display: grid; gap: 8px; justify-items: start; }
.empty p { margin: 0; }
textarea.inp { resize: vertical; min-height: 88px; font-size: 15px; line-height: 1.4; }
</style>
