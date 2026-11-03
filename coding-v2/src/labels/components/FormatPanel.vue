<script setup lang="ts">
import NavIcon from '../../components/ui/NavIcon.vue';
import { FONTS, MAX_SIZE_PT, MIN_SIZE_PT, toInt, type Align, type LabelBarcode, type LabelsState } from '../model';

const props = defineProps<{ state: LabelsState }>();
const emit = defineEmits<{ field: [name: keyof LabelsState, value: LabelsState[keyof LabelsState]] }>();
type Part = 'code' | 'desc';
const parts: Array<{ id: Part; title: string }> = [{ id: 'code', title: 'Código' }, { id: 'desc', title: 'Descrição' }];
const keyOf = (part: Part, suffix: string): keyof LabelsState => (part + suffix) as keyof LabelsState;
const aligns: Array<{ id: Align; label: string }> = [{ id: 'left', label: 'À esquerda' }, { id: 'center', label: 'Centralizado' }, { id: 'right', label: 'À direita' }];
const get = (part: Part, suffix: string): unknown => props.state[keyOf(part, suffix)];
const num = (part: Part, suffix: string): number => Number(get(part, suffix));
const str = (part: Part, suffix: string): string => String(get(part, suffix));
const bool = (part: Part, suffix: string): boolean => get(part, suffix) === true;
const alg = (part: Part, suffix: string): Align => get(part, suffix) as Align;
function size(part: Part, event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.value.trim()) return;
  emit('field', keyOf(part, 'Size'), toInt(input.value, num(part, 'Size'), MIN_SIZE_PT, MAX_SIZE_PT));
}
const bump = (part: Part, delta: number): void => emit('field', keyOf(part, 'Size'), toInt(num(part, 'Size') + delta, 40, MIN_SIZE_PT, MAX_SIZE_PT));
const settle = (part: Part, event: Event): void => { (event.target as HTMLInputElement).value = String(num(part, 'Size')); };
</script>

<template>
  <div class="fmt" data-testid="format-panel">
    <section class="grp">
      <h2>Texto antes do código</h2>
      <div class="f">
        <label for="prefix">Prefixo (ex.: COD: )</label>
        <input id="prefix" type="text" :value="state.prefix" maxlength="30" autocomplete="off" spellcheck="false" @input="emit('field', 'prefix', ($event.target as HTMLInputElement).value)" />
      </div>
    </section>
    <section class="grp">
      <h2>Código gráfico</h2>
      <div class="f">
        <label for="barcode">QR ou código de barras do código</label>
        <select id="barcode" :value="state.barcode" data-testid="label-barcode" @change="emit('field', 'barcode', ($event.target as HTMLSelectElement).value as LabelBarcode)">
          <option value="none">Nenhum</option><option value="qr">QR code</option><option value="code128">Code 128</option><option value="ean13">EAN-13 (12 ou 13 dígitos)</option>
        </select>
      </div>
      <p class="hint">Gerado a partir do código de cada item. Códigos que não servem para o formato escolhido ficam sem gráfico.</p>
    </section>
    <section v-for="part in parts" :key="part.id" class="grp" :aria-labelledby="'fmt-' + part.id">
      <h2 :id="'fmt-' + part.id">{{ part.title }}</h2>
      <div class="f">
        <label :for="part.id + '-font'">Fonte do {{ part.title.toLowerCase() }}</label>
        <select :id="part.id + '-font'" :value="str(part.id, 'Font')" @change="emit('field', keyOf(part.id, 'Font'), ($event.target as HTMLSelectElement).value)">
          <option v-for="font in FONTS" :key="font" :value="font">{{ font }}</option>
        </select>
      </div>
      <div class="f">
        <label :for="part.id + '-size'">Tamanho do {{ part.title.toLowerCase() }} (pt)</label>
        <div class="stepper">
          <button type="button" class="st" :aria-label="'Diminuir tamanho do ' + part.title.toLowerCase()" :disabled="num(part.id, 'Size') <= MIN_SIZE_PT" @click="bump(part.id, -1)"><NavIcon name="minus" /></button>
          <input :id="part.id + '-size'" type="number" :value="num(part.id, 'Size')" :min="MIN_SIZE_PT" :max="MAX_SIZE_PT" step="1" inputmode="numeric" @input="size(part.id, $event)" @change="settle(part.id, $event)" />
          <button type="button" class="st" :aria-label="'Aumentar tamanho do ' + part.title.toLowerCase()" :disabled="num(part.id, 'Size') >= MAX_SIZE_PT" @click="bump(part.id, 1)"><NavIcon name="plus" /></button>
        </div>
      </div>
      <div class="row">
        <button type="button" class="tg bold" :aria-pressed="bool(part.id, 'Bold')" :aria-label="'Negrito do ' + part.title.toLowerCase()" @click="emit('field', keyOf(part.id, 'Bold'), !bool(part.id, 'Bold'))">B</button>
        <button type="button" class="tg italic" :aria-pressed="bool(part.id, 'Italic')" :aria-label="'Itálico do ' + part.title.toLowerCase()" @click="emit('field', keyOf(part.id, 'Italic'), !bool(part.id, 'Italic'))">I</button>
        <div class="seg" role="group" :aria-label="'Alinhamento do ' + part.title.toLowerCase()">
          <button v-for="a in aligns" :key="a.id" type="button" class="tg" :aria-pressed="alg(part.id, 'Align') === a.id" :aria-label="a.label + ' (' + part.title.toLowerCase() + ')'" @click="emit('field', keyOf(part.id, 'Align'), a.id)">{{ a.id === 'left' ? '⇤' : a.id === 'center' ? '↔' : '⇥' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fmt { display: grid; gap: 14px; }
.grp { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 12px; display: grid; gap: 10px; }
h2 { font-size: 14px; margin: 0; }
.f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
label { font-size: 12.5px; font-weight: 700; }
input[type="text"], input[type="number"], select { width: 100%; min-height: 44px; padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); }
input:focus, select:focus { border-color: var(--accent); outline: 3px solid var(--accent); outline-offset: 1px; }
.stepper { display: flex; align-items: center; gap: 4px; }
.stepper input { text-align: center; padding: 8px 4px; }
.st { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.st:disabled { opacity: .4; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: inline-flex; gap: 4px; }
.tg { min-width: 44px; min-height: 44px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-weight: 700; }
.tg[aria-pressed="true"] { background: var(--app); border-color: var(--app); color: var(--ink); }
.bold { font-weight: 900; }
.italic { font-style: italic; }
.hint { margin: 0; font-size: 12.5px; color: var(--muted); }
</style>
