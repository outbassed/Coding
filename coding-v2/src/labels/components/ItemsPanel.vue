<script setup lang="ts">
import { nextTick } from 'vue';
import NavIcon from '../../components/ui/NavIcon.vue';
import { MAX_COPIES, MAX_ITEMS, toInt, type LabelItem } from '../model';

const props = defineProps<{ items: readonly LabelItem[] }>();
const emit = defineEmits<{
  code: [id: string, value: string]; description: [id: string, value: string]; copies: [id: string, value: number];
  step: [id: string, delta: number]; add: []; bulk: []; duplicate: [id: string]; move: [id: string, delta: -1 | 1]; remove: [id: string];
}>();

async function focusCode(id: string | null): Promise<void> {
  if (!id) return;
  await nextTick();
  document.getElementById('code-' + id)?.focus({ preventScroll: false });
}
defineExpose({ focusCode });

function onCopies(item: LabelItem, event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.value.trim()) return;
  emit('copies', item.id, toInt(input.value, item.copies, 1, MAX_COPIES));
}
function settle(item: LabelItem, event: Event): void { (event.target as HTMLInputElement).value = String(props.items.find((i) => i.id === item.id)?.copies ?? item.copies); }
</script>

<template>
  <div class="items" data-testid="items-panel">
    <ul class="list">
      <li v-for="(item, index) in items" :key="item.id" class="card" :data-item="item.id">
        <div class="head">
          <span class="num">Item {{ index + 1 }}</span>
          <button type="button" class="ib" :aria-label="'Subir item ' + (index + 1)" :disabled="index === 0" @click="emit('move', item.id, -1)"><NavIcon name="chevron-up" /></button>
          <button type="button" class="ib" :aria-label="'Descer item ' + (index + 1)" :disabled="index === items.length - 1" @click="emit('move', item.id, 1)"><NavIcon name="chevron-down" /></button>
          <button type="button" class="ib" :aria-label="'Duplicar item ' + (index + 1)" :disabled="items.length >= MAX_ITEMS" @click="emit('duplicate', item.id)"><NavIcon name="copy" /></button>
          <button type="button" class="ib danger" :aria-label="'Excluir item ' + (index + 1)" @click="emit('remove', item.id)"><NavIcon name="close" /></button>
        </div>
        <div class="fields">
          <div class="f">
            <label :for="'code-' + item.id">Código do item {{ index + 1 }}</label>
            <input :id="'code-' + item.id" type="text" :value="item.code" maxlength="160" autocomplete="off" spellcheck="false" placeholder="Ex.: 190847" @input="emit('code', item.id, ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="f copies">
            <label :for="'copies-' + item.id">Cópias do item {{ index + 1 }}</label>
            <div class="stepper">
              <button type="button" class="st" aria-label="Menos uma cópia" :disabled="item.copies <= 1" @click="emit('step', item.id, -1)"><NavIcon name="minus" /></button>
              <input :id="'copies-' + item.id" type="number" :value="item.copies" min="1" :max="MAX_COPIES" step="1" inputmode="numeric" @input="onCopies(item, $event)" @change="settle(item, $event)" />
              <button type="button" class="st" aria-label="Mais uma cópia" :disabled="item.copies >= MAX_COPIES" @click="emit('step', item.id, 1)"><NavIcon name="plus" /></button>
            </div>
          </div>
          <div class="f full">
            <label :for="'desc-' + item.id">Descrição do item {{ index + 1 }}</label>
            <textarea :id="'desc-' + item.id" rows="2" :value="item.description" maxlength="2000" spellcheck="false" placeholder="Descrição do produto (pode usar várias linhas)" @input="emit('description', item.id, ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
        </div>
      </li>
    </ul>
    <div class="adds">
      <button type="button" class="btn add" data-testid="add-item" :disabled="items.length >= MAX_ITEMS" @click="emit('add')">Adicionar item</button>
      <button type="button" class="btn add" data-testid="open-bulk" @click="emit('bulk')">Colar lista</button>
    </div>
    <p v-if="items.length >= MAX_ITEMS" class="muted lim">Limite de {{ MAX_ITEMS }} itens por documento.</p>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 10px; }
.card { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 10px 12px 12px; }
.head { display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
.num { flex: 1; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.ib { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; }
.ib:hover:not(:disabled) { background: var(--raised); }
.ib:disabled { opacity: .35; }
.danger { color: var(--danger); }
.fields { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.f { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.full { grid-column: 1 / -1; }
label { font-size: 12.5px; font-weight: 700; }
input[type="text"], input[type="number"], textarea { width: 100%; min-height: 44px; padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); }
textarea { resize: vertical; min-height: 72px; font-family: inherit; }
input:focus, textarea:focus { border-color: var(--accent); outline: 3px solid var(--accent); outline-offset: 1px; }
.stepper { display: flex; align-items: center; gap: 4px; }
.stepper input { width: 70px; text-align: center; padding: 8px 4px; }
.st { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.st:disabled { opacity: .4; }
.adds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.add { width: 100%; }
@media (max-width: 380px) { .adds { grid-template-columns: minmax(0, 1fr); } }
.lim { font-size: 12.5px; margin: 8px 0 0; }
@media (max-width: 380px) { .fields { grid-template-columns: minmax(0, 1fr); } .stepper input { flex: 1; } }
</style>
