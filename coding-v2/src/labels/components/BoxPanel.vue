<script setup lang="ts">
import { computed, ref } from 'vue';
import { brasiliaFields, shopHeading } from '../boxes';
import { MAX_BLOCKS, toInt, uid, type BoxData, type BoxShop } from '../model';

const props = defineProps<{ boxes: BoxData; shops: BoxShop[]; documentName: string }>();
const emit = defineEmits<{ boxes: [value: BoxData]; shops: [value: BoxShop[]]; name: [value: string] }>();
const newName = ref('');
const newShort = ref('');
const editId = ref<string | null>(null);
const editName = ref('');
const editShort = ref('');
const error = ref('');

const selected = computed(() => new Set(props.boxes.stores.map((s) => s.id)));
const heading = computed(() => shopHeading(props.boxes));
function update(patch: Partial<BoxData>): void { emit('boxes', { ...props.boxes, ...patch }); }
function choose(shop: BoxShop, checked: boolean): void {
  const stores = checked
    ? [...props.boxes.stores.filter((s) => s.id !== shop.id), { ...shop }]
    : props.boxes.stores.filter((s) => s.id !== shop.id);
  update({ stores });
}
function move(index: number, delta: number): void {
  const stores = [...props.boxes.stores];
  const target = index + delta;
  if (target < 0 || target >= stores.length) return;
  const [shop] = stores.splice(index, 1);
  if (shop) stores.splice(target, 0, shop);
  update({ stores });
}
function addShop(): void {
  const name = newName.value.trim();
  const short = (newShort.value.trim() || name).toUpperCase();
  if (!name) { error.value = 'Informe o nome da loja.'; return; }
  const shop = { id: 'loja-' + uid(), name, short };
  emit('shops', [...props.shops, shop]);
  choose(shop, true);
  newName.value = ''; newShort.value = ''; error.value = '';
}
function startEdit(shop: BoxShop): void { editId.value = shop.id; editName.value = shop.name; editShort.value = shop.short; error.value = ''; }
function commitEdit(): void {
  if (!editId.value) return;
  const name = editName.value.trim();
  if (!name) { error.value = 'Informe o nome da loja.'; return; }
  const short = (editShort.value.trim() || name).toUpperCase();
  const id = editId.value;
  emit('shops', props.shops.map((s) => s.id === id ? { id, name, short } : s));
  update({ stores: props.boxes.stores.map((s) => s.id === id ? { id, name, short } : s) });
  editId.value = null; error.value = '';
}
function removeShop(shop: BoxShop): void {
  if (!confirm('Excluir ' + shop.name + ' do cadastro? Os documentos antigos continuarão com a loja gravada.')) return;
  emit('shops', props.shops.filter((s) => s.id !== shop.id));
  if (editId.value === shop.id) editId.value = null;
}
function nfInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const digits = input.value.replace(/[^0-9]/g, '').slice(0, 24);
  input.value = digits; update({ nf: digits });
}
function numberInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (value.trim() !== '') update({ total: toInt(value, props.boxes.total, 1, MAX_BLOCKS) });
}
function resetTotal(event: Event): void { (event.target as HTMLInputElement).value = String(props.boxes.total); }
function timeMode(mode: 'auto' | 'manual'): void {
  if (mode === 'auto') { update({ timeMode: 'auto' }); return; }
  const now = brasiliaFields(new Date());
  update({
    timeMode: 'manual',
    manualDate: props.boxes.manualDate || now.date,
    manualTime: props.boxes.manualTime || now.time
  });
}
</script>

<template>
  <div class="bx-panel" data-testid="boxes-panel">
    <section class="bx-group">
      <label class="bx-field">Nome do documento
        <input type="text" maxlength="80" :value="documentName" @input="emit('name', ($event.target as HTMLInputElement).value)" />
      </label>
    </section>

    <section class="bx-group">
      <h2>Lojas de destino</h2>
      <p class="bx-muted">Marque uma ou mais lojas. A ordem selecionada será a ordem do cabeçalho.</p>
      <div class="bx-store-list" role="group" aria-label="Selecionar lojas">
        <label v-for="shop in shops" :key="shop.id" class="bx-check">
          <input type="checkbox" :checked="selected.has(shop.id)" @change="choose(shop, ($event.target as HTMLInputElement).checked)" />
          <span>{{ shop.name }} <small v-if="shop.short.toUpperCase() !== shop.name.toUpperCase()">({{ shop.short }})</small></span>
        </label>
      </div>
      <div class="bx-selected">
        <strong class="bx-small">Ordem das lojas selecionadas</strong>
        <div v-for="(shop, i) in boxes.stores" :key="shop.id" class="bx-selected-row">
          <span>{{ shop.short }}</span>
          <button type="button" :aria-label="'Subir ' + shop.name" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button type="button" :aria-label="'Descer ' + shop.name" :disabled="i === boxes.stores.length - 1" @click="move(i, 1)">↓</button>
          <button type="button" :aria-label="'Desmarcar ' + shop.name" @click="choose(shop, false)">×</button>
        </div>
      </div>
      <p class="bx-heading" data-testid="boxes-heading">{{ heading || 'Selecione uma loja' }}</p>

      <details class="bx-manage">
        <summary>Gerenciar lojas cadastradas</summary>
        <p class="bx-muted">As alterações no cadastro ficam neste navegador. Documentos antigos preservam as lojas que foram salvas.</p>
        <form class="bx-add" @submit.prevent="addShop">
          <label class="bx-field">Nova loja
            <input v-model="newName" type="text" maxlength="100" placeholder="Nome completo" />
          </label>
          <label class="bx-field">Nome na etiqueta
            <input v-model="newShort" type="text" maxlength="100" placeholder="Opcional: nome abreviado" />
          </label>
          <button type="submit" class="btn">Adicionar loja</button>
        </form>
        <ul class="bx-managed">
          <li v-for="shop in shops" :key="shop.id">
            <template v-if="editId === shop.id">
              <label class="bx-field">Nome da loja<input v-model="editName" maxlength="100" /></label>
              <label class="bx-field">Nome na etiqueta<input v-model="editShort" maxlength="100" /></label>
              <div class="bx-actions">
                <button type="button" class="btn" @click="commitEdit">Salvar loja</button>
                <button type="button" class="btn" @click="editId = null">Cancelar</button>
              </div>
            </template>
            <template v-else>
              <span>{{ shop.name }}</span>
              <button type="button" :aria-label="'Editar ' + shop.name" @click="startEdit(shop)">Editar</button>
              <button type="button" :aria-label="'Excluir ' + shop.name" @click="removeShop(shop)">Excluir</button>
            </template>
          </li>
        </ul>
        <p v-if="error" class="bx-error" role="alert">{{ error }}</p>
      </details>
    </section>

    <section class="bx-group">
      <h2>Identificação das caixas</h2>
      <label class="bx-field">Número da NF
        <input data-testid="box-nf" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="24" autocomplete="off"
          :value="boxes.nf" @input="nfInput" />
      </label>
      <label class="bx-field">Quantidade de caixas
        <input data-testid="box-total" type="number" inputmode="numeric" min="1" :max="MAX_BLOCKS" step="1"
          :value="boxes.total" @input="numberInput" @change="resetTotal" />
      </label>
      <p class="bx-muted" data-testid="box-count">Numeração automática: 1/{{ boxes.total }} até {{ boxes.total }}/{{ boxes.total }}</p>
      <label class="bx-field">Nome
        <input data-testid="box-person" type="text" maxlength="120" :value="boxes.person" @input="update({ person: ($event.target as HTMLInputElement).value })" />
      </label>
    </section>

    <section class="bx-group">
      <h2>Data e hora da impressão</h2>
      <div class="bx-modes" role="group" aria-label="Modo de data e hora">
        <button type="button" :aria-pressed="boxes.timeMode === 'auto'" @click="timeMode('auto')">Automático</button>
        <button type="button" :aria-pressed="boxes.timeMode === 'manual'" @click="timeMode('manual')">Manual</button>
      </div>
      <p v-if="boxes.timeMode === 'auto'" class="bx-muted">Consulta o horário online no momento da impressão. Se estiver offline ou a consulta falhar, usa a hora do dispositivo (fuso de Brasília).</p>
      <template v-else>
        <label class="bx-field">Data da impressão
          <input data-testid="box-date" type="date" :value="boxes.manualDate" @input="update({ manualDate: ($event.target as HTMLInputElement).value })" />
        </label>
        <label class="bx-field">Hora da impressão
          <input data-testid="box-time" type="time" :value="boxes.manualTime" @input="update({ manualTime: ($event.target as HTMLInputElement).value })" />
        </label>
      </template>
    </section>
  </div>
</template>

<style scoped>
.bx-panel { display: grid; gap: 14px; }
.bx-group { display: grid; gap: 10px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 12px; }
.bx-group h2 { margin: 0; font-size: 14px; }
.bx-muted { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
.bx-small { font-size: 12px; }
.bx-field { display: grid; gap: 5px; font-size: 12.5px; font-weight: 700; }
.bx-field input { width: 100%; min-width: 0; min-height: 44px; padding: 8px 10px; font: 16px system-ui, sans-serif; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.bx-field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.bx-store-list { display: grid; max-height: 230px; overflow-y: auto; gap: 2px; }
.bx-check { display: flex; gap: 10px; align-items: center; min-height: 42px; font-size: 13.5px; }
.bx-check input { width: 20px; height: 20px; flex: none; accent-color: var(--accent); }
.bx-check small { color: var(--muted); }
.bx-selected { display: grid; gap: 4px; }
.bx-selected-row { display: flex; align-items: center; gap: 5px; padding: 3px 0; font-size: 13px; }
.bx-selected-row span { flex: 1; overflow-wrap: anywhere; }
.bx-selected-row button { width: 40px; height: 40px; flex: none; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 18px; }
.bx-selected-row button:disabled { opacity: .3; }
.bx-heading { padding: 9px; border-radius: 9px; background: var(--surface); text-align: center; font-weight: 800; font-size: 14px; overflow-wrap: anywhere; margin: 0; }
.bx-manage { border-top: 1px solid var(--border); padding-top: 10px; }
.bx-manage summary { cursor: pointer; font-size: 13px; font-weight: 700; padding: 7px 0; }
.bx-add { display: grid; gap: 8px; margin: 8px 0; }
.bx-managed { list-style: none; padding: 0; margin: 0; display: grid; gap: 7px; }
.bx-managed li { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0; border-top: 1px solid var(--border); }
.bx-managed li span { flex: 1; min-width: 100px; font-size: 13px; }
.bx-managed li button { min-height: 38px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 6px 10px; }
.bx-managed li .bx-field { width: 100%; }
.bx-actions { display: flex; gap: 8px; }
.bx-error { color: var(--danger); font-size: 13px; margin: 0; }
.bx-modes { display: flex; gap: 6px; }
.bx-modes button { flex: 1; min-height: 44px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-weight: 700; }
.bx-modes button[aria-pressed="true"] { background: var(--app); border-color: var(--app); color: var(--ink); }
</style>
