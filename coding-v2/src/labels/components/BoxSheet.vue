<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { shopHeading } from '../boxes';
import type { BoxData } from '../model';

export type BoxEditField = 'destination' | 'nf' | 'total' | 'person' | 'datetime';
const props = withDefaults(defineProps<{
  boxes: BoxData; numbers: number[]; stamp: string; editable?: boolean
}>(), { editable: false });
const emit = defineEmits<{ edit: [field: BoxEditField, value: string] }>();
const destination = computed(() => shopHeading(props.boxes));
const grid = computed(() => props.boxes.layout);
const editing = ref<{ number: number; field: BoxEditField } | null>(null);
const draft = ref('');
const paperStyle = computed(() => ({ padding: grid.value.marginMm + 'mm', fontFamily: grid.value.font + ', Arial, sans-serif' }));
const gridStyle = computed(() => ({
  gridTemplateColumns: 'repeat(' + grid.value.cols + ', minmax(0,1fr))',
  gridTemplateRows: 'repeat(' + grid.value.rows + ', minmax(0,1fr))',
  gap: grid.value.gapMm + 'mm'
}));
const titleStyle = computed(() => ({
  fontSize: grid.value.destSize + 'pt', textAlign: grid.value.destAlign,
  fontWeight: grid.value.destBold ? '900' : '400'
}));
const infoStyles = computed(() => ({
  nf: { fontSize: grid.value.nfSize + 'pt' },
  total: { fontSize: grid.value.boxesSize + 'pt' },
  person: { fontSize: grid.value.nameSize + 'pt' }
}));
const fieldStyle = computed(() => ({
  textAlign: grid.value.infoAlign, fontWeight: grid.value.infoBold ? '700' : '400'
}));
const dateStyle = computed(() => ({
  fontSize: grid.value.dateSize + 'pt', textAlign: grid.value.dateAlign
}));
function open(number: number, field: BoxEditField): void {
  if (!props.editable) return;
  editing.value = { number, field };
  draft.value = field === 'destination' ? destination.value
    : field === 'nf' ? props.boxes.nf
    : field === 'total' ? String(props.boxes.total)
    : field === 'person' ? props.boxes.person : props.stamp;
  void nextTick(() => { const el = document.querySelector<HTMLInputElement>('[data-testid="box-preview"] .box-edit'); el?.focus({ preventScroll: true }); el?.select(); });
}
function draftInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  let value = el.value;
  if (editing.value?.field === 'nf' || editing.value?.field === 'total') {
    value = value.replace(/[^0-9]/g, '').slice(0, editing.value.field === 'nf' ? 24 : 4);
    el.value = value;
  }
  draft.value = value;
}
function commit(): void {
  const what = editing.value;
  if (!what) return;
  editing.value = null;
  emit('edit', what.field, draft.value);
}
function isEditing(number: number, field: BoxEditField): boolean {
  return editing.value?.number === number && editing.value.field === field;
}
</script>

<template>
  <div class="box-paper" :style="paperStyle">
    <div class="box-grid" :style="gridStyle">
      <article v-for="number in numbers" :key="number" class="box-label"
        :style="{ border: grid.cutLines ? '1px dashed #777' : '1px solid transparent' }"
        data-testid="box-label">
        <div class="box-destination" :style="titleStyle">
          <input v-if="isEditing(number, 'destination')" class="box-edit" aria-label="Editar destino" :value="draft"
            maxlength="500" @input="draftInput" @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = null" @blur="commit" />
          <button v-else-if="editable" type="button" class="box-text box-editable" data-testid="box-edit-destination"
            aria-label="Editar destino na prévia" @click="open(number, 'destination')">{{ destination }}</button>
          <span v-else>{{ destination }}</span>
        </div>
        <div class="box-fields" :style="fieldStyle">
          <div :style="infoStyles.nf">
            <input v-if="isEditing(number, 'nf')" class="box-edit" aria-label="Editar NF" :value="draft"
              inputmode="numeric" @input="draftInput" @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = null" @blur="commit" />
            <button v-else-if="editable" type="button" class="box-text box-editable" data-testid="box-edit-nf"
              aria-label="Editar NF na prévia" @click="open(number, 'nf')">NF: {{ boxes.nf }}</button>
            <span v-else>NF: {{ boxes.nf }}</span>
          </div>
          <div :style="infoStyles.total">
            <input v-if="isEditing(number, 'total')" class="box-edit" aria-label="Editar quantidade de caixas"
              :value="draft" inputmode="numeric" @input="draftInput" @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = null" @blur="commit" />
            <button v-else-if="editable" type="button" class="box-text box-editable" data-testid="box-edit-total"
              aria-label="Editar quantidade de caixas na prévia" @click="open(number, 'total')">CAIXAS: {{ number }}/{{ boxes.total }}</button>
            <span v-else>CAIXAS: {{ number }}/{{ boxes.total }}</span>
          </div>
          <div :style="infoStyles.person">
            <input v-if="isEditing(number, 'person')" class="box-edit" aria-label="Editar nome"
              :value="draft" maxlength="120" @input="draftInput" @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = null" @blur="commit" />
            <button v-else-if="editable" type="button" class="box-text box-editable" data-testid="box-edit-person"
              aria-label="Editar nome na prévia" @click="open(number, 'person')">NOME: {{ boxes.person }}</button>
            <span v-else>NOME: {{ boxes.person }}</span>
          </div>
        </div>
        <div v-if="boxes.showDateTime" class="box-datetime" :style="dateStyle">
          <input v-if="isEditing(number, 'datetime')" class="box-edit" aria-label="Editar data e hora"
            :value="draft" placeholder="DD/MM/AAAA HH:MM" @input="draftInput" @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = null" @blur="commit" />
          <button v-else-if="editable" type="button" class="box-text box-editable" data-testid="box-edit-datetime"
            aria-label="Editar data e hora na prévia" @click="open(number, 'datetime')">{{ stamp }}</button>
          <span v-else>{{ stamp }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.box-paper { width: 100%; height: 100%; box-sizing: border-box; background: #fff; color: #111; overflow: hidden; }
.box-grid { display: grid; width: 100%; height: 100%; }
.box-label { box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-around; min-width: 0; min-height: 0; overflow: hidden; padding: 2mm; line-height: 1.17; }
.box-destination { line-height: 1.08; overflow-wrap: anywhere; }
.box-fields { display: grid; gap: .45em; overflow-wrap: anywhere; line-height: 1.16; }
.box-datetime { white-space: normal; overflow-wrap: anywhere; }
.box-text { color: inherit; font: inherit; font-weight: inherit; line-height: inherit; text-align: inherit; overflow-wrap: anywhere; }
button.box-text { display: block; width: 100%; border: 0; padding: 0; margin: 0; background: transparent; cursor: text; }
button.box-editable:hover { background: #eef4fc; outline: 1px dashed #579ce4; }
button.box-editable:focus-visible { outline: 2px solid #2463b2; }
.box-edit { width: 100%; min-width: 0; padding: 1px; border: 1px solid #2667b3; border-radius: 2px; background: #fff; color: #111; font: inherit; line-height: inherit; text-align: inherit; }
</style>
