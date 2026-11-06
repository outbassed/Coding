<script setup lang="ts">
import { computed } from 'vue';
import { FONTS, type Align, type BoxData, type BoxPrintLayout } from '../model';

const props = defineProps<{ boxes: BoxData; page: number; pageCount: number }>();
const emit = defineEmits<{ boxes: [value: BoxData]; page: [index: number] }>();
const layout = computed(() => props.boxes.layout);
function set<K extends keyof BoxPrintLayout>(key: K, value: BoxPrintLayout[K]): void {
  emit('boxes', { ...props.boxes, layout: { ...props.boxes.layout, [key]: value } });
}
function numeric(key: keyof BoxPrintLayout, event: Event, min: number, max: number): void {
  const v = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(v)) set(key, Math.min(max, Math.max(min, Math.round(v))) as never);
}
const aligns: { label: string; value: Align }[] = [
  { label: 'Esquerda', value: 'left' }, { label: 'Centro', value: 'center' }, { label: 'Direita', value: 'right' }
];
</script>

<template>
  <div class="box-props" data-testid="box-properties">
    <section class="box-props-group">
      <h3>Navegação entre folhas</h3>
      <div class="box-pager" role="group" aria-label="Folhas">
        <button type="button" aria-label="Folha anterior" :disabled="page <= 0" @click="emit('page', page - 1)">‹</button>
        <strong data-testid="box-page-index">Folha {{ page + 1 }} de {{ pageCount }}</strong>
        <button type="button" aria-label="Próxima folha" :disabled="page + 1 >= pageCount" @click="emit('page', page + 1)">›</button>
      </div>
    </section>
    <section class="box-props-group">
      <h3>Página e cortes</h3>
      <label class="box-toggle"><input type="checkbox" data-testid="box-cut-lines" :checked="layout.cutLines" @change="set('cutLines', ($event.target as HTMLInputElement).checked)" /> Linha de corte</label>
      <div class="box-grid-fields">
        <label>Colunas
          <input data-testid="box-cols" type="number" inputmode="numeric" min="1" max="3" :value="layout.cols" @change="numeric('cols', $event, 1, 3)" />
        </label>
        <label>Linhas
          <input data-testid="box-rows" type="number" inputmode="numeric" min="1" max="8" :value="layout.rows" @change="numeric('rows', $event, 1, 8)" />
        </label>
      </div>
      <label>Orientação A4
        <select data-testid="box-orientation" :value="layout.orientation" @change="set('orientation', ($event.target as HTMLSelectElement).value as BoxPrintLayout['orientation'])">
          <option value="portrait">Retrato</option><option value="landscape">Paisagem</option>
        </select>
      </label>
      <div class="box-grid-fields">
        <label>Margem (mm)
          <input type="number" min="0" max="20" :value="layout.marginMm" @change="numeric('marginMm', $event, 0, 20)" />
        </label>
        <label>Espaçamento (mm)
          <input type="number" min="0" max="25" :value="layout.gapMm" @change="numeric('gapMm', $event, 0, 25)" />
        </label>
      </div>
    </section>
    <section class="box-props-group">
      <h3>Fonte e tamanhos</h3>
      <label>Fonte
        <select data-testid="box-font" :value="layout.font" @change="set('font', ($event.target as HTMLSelectElement).value)">
          <option v-for="font in FONTS" :key="font" :value="font">{{ font }}</option>
        </select>
      </label>
      <label>Destino (pt)
        <input data-testid="box-destination-size" type="number" min="8" max="96" :value="layout.destSize" @change="numeric('destSize', $event, 8, 96)" />
      </label>
      <label>NF (pt)
        <input data-testid="box-nf-size" type="number" min="8" max="96" :value="layout.nfSize" @change="numeric('nfSize', $event, 8, 96)" />
      </label>
      <label>Caixas (pt)
        <input data-testid="box-boxes-size" type="number" min="8" max="96" :value="layout.boxesSize" @change="numeric('boxesSize', $event, 8, 96)" />
      </label>
      <label>Nome (pt)
        <input data-testid="box-name-size" type="number" min="8" max="96" :value="layout.nameSize" @change="numeric('nameSize', $event, 8, 96)" />
      </label>
      <label v-if="boxes.showDateTime">Data e hora (pt)
        <input type="number" min="8" max="96" :value="layout.dateSize" @change="numeric('dateSize', $event, 8, 96)" />
      </label>
      <label class="box-toggle"><input type="checkbox" :checked="layout.destBold" @change="set('destBold', ($event.target as HTMLInputElement).checked)" /> Destino em negrito</label>
      <label class="box-toggle"><input type="checkbox" :checked="layout.infoBold" @change="set('infoBold', ($event.target as HTMLInputElement).checked)" /> Informações em negrito</label>
    </section>
    <section class="box-props-group">
      <h3>Alinhamento</h3>
      <label>Destino
        <select :value="layout.destAlign" @change="set('destAlign', ($event.target as HTMLSelectElement).value as Align)">
          <option v-for="a in aligns" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </label>
      <label>Informações
        <select :value="layout.infoAlign" @change="set('infoAlign', ($event.target as HTMLSelectElement).value as Align)">
          <option v-for="a in aligns" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </label>
      <label v-if="boxes.showDateTime">Data e hora
        <select :value="layout.dateAlign" @change="set('dateAlign', ($event.target as HTMLSelectElement).value as Align)">
          <option v-for="a in aligns" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </label>
    </section>
  </div>
</template>

<style scoped>
.box-props { display: grid; gap: 14px; align-content: start; }
.box-props-group { display: grid; gap: 9px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.box-props-group:last-child { border-bottom: 0; }
.box-props-group h3 { font-size: 13px; margin: 0; }
.box-props-group label { display: grid; gap: 5px; font-size: 12px; font-weight: 700; }
.box-props-group input:not([type="checkbox"]), .box-props-group select { width: 100%; min-width: 0; min-height: 42px; padding: 6px 8px; font-size: 15px; border: 1px solid var(--border); color: var(--text); background: var(--panel); border-radius: 9px; }
.box-props-group .box-toggle { display: flex; flex-direction: row; align-items: center; gap: 10px; min-height: 44px; }
.box-toggle input { width: 22px; height: 22px; accent-color: var(--accent); flex: none; }
.box-grid-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.box-pager { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.box-pager button { min-height: 42px; min-width: 44px; border-radius: 10px; background: var(--panel); color: var(--text); border: 1px solid var(--border); font-size: 24px; }
.box-pager button:disabled { opacity: .35; }
.box-pager strong { font-size: 13px; text-align: center; }
</style>
