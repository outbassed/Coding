<script setup lang="ts">
import NavIcon from '../../components/ui/NavIcon.vue';
import { MAX_COLS, MAX_GAP_MM, MIN_COLS, PAPER, toInt, type LabelsState, type Orientation } from '../model';
import type { LayoutInfo } from './LabelsPreview.vue';

const props = defineProps<{ state: LabelsState; layout: LayoutInfo }>();
const emit = defineEmits<{ field: [name: keyof LabelsState, value: LabelsState[keyof LabelsState]] }>();
const cols = Array.from({ length: MAX_COLS - MIN_COLS + 1 }, (_, i) => MIN_COLS + i);
const orientations: Array<{ id: Orientation; label: string }> = [{ id: 'portrait', label: 'Retrato' }, { id: 'landscape', label: 'Paisagem' }];
function gap(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.value.trim()) return;
  emit('field', 'gap', toInt(input.value, props.state.gap, 0, MAX_GAP_MM));
}
const settle = (event: Event): void => { (event.target as HTMLInputElement).value = String(props.state.gap); };
const bump = (delta: number): void => emit('field', 'gap', toInt(props.state.gap + delta, 1, 0, MAX_GAP_MM));
const dims = (o: Orientation): string => 'A4 · ' + PAPER[o].w + ' × ' + PAPER[o].h + ' mm';
</script>

<template>
  <div class="pg" data-testid="page-panel">
    <section class="grp">
      <div class="f">
        <label for="doc-name">Nome do documento</label>
        <input id="doc-name" type="text" :value="state.name" maxlength="80" autocomplete="off" @input="emit('field', 'name', ($event.target as HTMLInputElement).value)" />
      </div>
      <p class="info" data-testid="doc-count"><span class="muted">Conteúdo</span> <strong>{{ layout.labelCount }} {{ layout.labelCount === 1 ? 'etiqueta' : 'etiquetas' }} · {{ layout.itemCount }} {{ layout.itemCount === 1 ? 'item' : 'itens' }}</strong></p>
      <p class="info" data-testid="paper-dims"><span class="muted">Papel</span> <strong>{{ dims(state.orientation) }}</strong></p>
    </section>
    <section class="grp">
      <h2 id="orient-h">Orientação da folha</h2>
      <div class="seg" role="group" aria-labelledby="orient-h">
        <button v-for="o in orientations" :key="o.id" type="button" class="tg" :aria-pressed="state.orientation === o.id" @click="emit('field', 'orientation', o.id)">{{ o.label }}</button>
      </div>
    </section>
    <section class="grp">
      <h2 id="cols-h">Etiquetas por linha (colunas)</h2>
      <div class="seg" role="group" aria-labelledby="cols-h">
        <button v-for="n in cols" :key="n" type="button" class="tg" :aria-pressed="state.cols === n" :aria-label="n + (n === 1 ? ' coluna' : ' colunas')" @click="emit('field', 'cols', n)">{{ n }}</button>
      </div>
      <p class="muted small" data-testid="rows-info">As linhas são calculadas pelo conteúdo: a folha 1 tem {{ layout.rowsOnFirstPage }} {{ layout.rowsOnFirstPage === 1 ? 'linha' : 'linhas' }} de até {{ state.cols }} {{ state.cols === 1 ? 'etiqueta' : 'etiquetas' }}.</p>
    </section>
    <section class="grp">
      <div class="f">
        <label for="gap">Espaço entre etiquetas (mm)</label>
        <div class="stepper">
          <button type="button" class="st" aria-label="Diminuir espaço" :disabled="state.gap <= 0" @click="bump(-1)"><NavIcon name="minus" /></button>
          <input id="gap" type="number" :value="state.gap" min="0" :max="MAX_GAP_MM" step="1" inputmode="numeric" @input="gap" @change="settle" />
          <button type="button" class="st" aria-label="Aumentar espaço" :disabled="state.gap >= MAX_GAP_MM" @click="bump(1)"><NavIcon name="plus" /></button>
        </div>
      </div>
      <label class="sw"><input type="checkbox" :checked="state.border" @change="emit('field', 'border', ($event.target as HTMLInputElement).checked)" /><span><strong>Linha de corte</strong><small class="muted">Borda tracejada em volta de cada etiqueta</small></span></label>
    </section>
  </div>
</template>

<style scoped>
.pg { display: grid; gap: 14px; }
.grp { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 12px; display: grid; gap: 10px; }
h2 { font-size: 14px; margin: 0; }
.f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
label { font-size: 12.5px; font-weight: 700; }
input[type="text"], input[type="number"] { width: 100%; min-height: 44px; padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); }
input:focus { border-color: var(--accent); outline: 3px solid var(--accent); outline-offset: 1px; }
.info { margin: 0; font-size: 13.5px; }
.small { font-size: 12.5px; margin: 0; }
.seg { display: flex; flex-wrap: wrap; gap: 6px; }
.tg { min-width: 44px; min-height: 44px; padding: 0 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-weight: 700; }
.tg[aria-pressed="true"] { background: var(--app); border-color: var(--app); color: var(--ink); }
.stepper { display: flex; align-items: center; gap: 4px; }
.stepper input { text-align: center; padding: 8px 4px; }
.st { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.st:disabled { opacity: .4; }
.sw { display: flex; gap: 12px; align-items: flex-start; min-height: 44px; font-weight: 400; }
.sw input { width: 24px; height: 24px; margin: 8px 0 0; accent-color: var(--accent); flex: none; }
.sw span { display: flex; flex-direction: column; }
.sw small { font-size: 12.5px; }
</style>
