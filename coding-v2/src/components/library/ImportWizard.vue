<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import AppIcon from '../ui/AppIcon.vue';
import { documentName, estimateStorage, importLegacySnapshotsAtomic, inspectLegacy, type CopySummary, type LegacySnapshot } from '../../storage/documents';
import { friendlyError } from '../../library/errors';
import { formatBytes, imagesText, originLabels, toolIdForType, typeLabel } from '../../library/model';

const props = defineProps<{ open: boolean; existing: readonly Pick<CopySummary, 'source' | 'legacyId'>[] }>();
const emit = defineEmits<{ close: []; done: [created: number]; announce: [text: string] }>();

type Step = 'examine' | 'select' | 'confirm' | 'result';

const step = ref<Step>('examine');
const scanning = ref(false);
const running = ref(false);
const found = ref<LegacySnapshot[]>([]);
const notes = ref<string[]>([]);
const selected = ref<Set<string>>(new Set());
const error = ref('');
const outcome = ref<{ ok: boolean; message: string } | null>(null);
const spaceWarning = ref('');
const heading = ref<HTMLElement | null>(null);

const keyOf = (s: LegacySnapshot, index: number): string => s.source + ':' + s.doc.id + ':' + index;
const identity = (s: LegacySnapshot): string => JSON.stringify([s.source, s.doc.id]);
const existingIdentities = computed(() => new Set(props.existing.map((c) => JSON.stringify([c.source, c.legacyId]))));
const hasCopy = (s: LegacySnapshot): boolean => existingIdentities.value.has(identity(s));
// Identificadores repetidos no próprio Coding antigo derrubariam o lote inteiro; só o primeiro é importável.
const rows = computed(() => {
  const seen = new Set<string>();
  return found.value.map((snapshot, index) => {
    const id = identity(snapshot);
    const repeated = seen.has(id); seen.add(id);
    const reason = hasCopy(snapshot) ? 'já existe uma cópia' : repeated ? 'identificador repetido no Coding antigo' : '';
    return { snapshot, key: keyOf(snapshot, index), blocked: reason !== '', reason };
  });
});
const totalBytes = computed(() => chosen.value.reduce((sum, row) => sum + row.snapshot.images.reduce((s, img) => s + (img.blob?.size ?? 0), 0), 0));
const selectable = computed(() => rows.value.filter((row) => !row.blocked));
const chosen = computed(() => rows.value.filter((row) => !row.blocked && selected.value.has(row.key)));
const stepNumber = computed(() => ({ examine: 1, select: 2, confirm: 3, result: 3 })[step.value]);

watch(() => props.open, (isOpen) => {
  if (isOpen) { step.value = 'examine'; found.value = []; notes.value = []; selected.value = new Set(); error.value = ''; outcome.value = null; spaceWarning.value = ''; }
});
async function focusHeading(): Promise<void> { await nextTick(); heading.value?.focus(); }

async function examine(): Promise<void> {
  scanning.value = true; error.value = '';
  emit('announce', 'Examinando o Coding antigo. Nada será alterado.');
  try {
    const result = await inspectLegacy();
    found.value = result.snapshots; notes.value = result.notes;
    selected.value = new Set();
    step.value = 'select';
    emit('announce', result.snapshots.length + ' documento(s) encontrado(s) no Coding antigo.');
    await focusHeading();
  } catch (err) { error.value = friendlyError(err); emit('announce', error.value); }
  finally { scanning.value = false; }
}
function toggle(key: string, on: boolean): void {
  const next = new Set(selected.value);
  if (on) next.add(key); else next.delete(key);
  selected.value = next;
}
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every((row) => selected.value.has(row.key)));
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(selectable.value.map((row) => row.key));
}
async function goConfirm(): Promise<void> {
  step.value = 'confirm'; spaceWarning.value = '';
  await focusHeading();
  try { // aviso prévio: o tamanho das imagens é conhecido antes de gravar
    const estimate = await estimateStorage();
    if (estimate.quota !== null && estimate.usage !== null && totalBytes.value > 0.8 * (estimate.quota - estimate.usage)) {
      spaceWarning.value = 'Atenção: as imagens a copiar (' + formatBytes(totalBytes.value) + ') ocupam mais de 80% do espaço livre estimado. A gravação pode falhar; se falhar, nada será criado.';
    }
  } catch { /* estimativa indisponível: segue sem aviso */ }
}
async function goBack(): Promise<void> { step.value = 'select'; await focusHeading(); }

async function run(): Promise<void> {
  running.value = true; error.value = ''; outcome.value = null;
  const total = chosen.value.length;
  try {
    // Tudo ou nada: ou as cópias são criadas juntas, ou nenhuma é.
    const created = await importLegacySnapshotsAtomic(chosen.value.map((row) => toRaw(row.snapshot)));
    outcome.value = { ok: true, message: created + ' cópia(s) criada(s). Os documentos originais não foram alterados.' };
    emit('announce', created + ' cópia(s) criada(s).');
    emit('done', created);
  } catch (err) {
    outcome.value = { ok: false, message: friendlyError(err) + ' Nenhuma das ' + total + ' cópias foi criada.' };
    emit('announce', outcome.value.message);
  } finally {
    running.value = false;
    step.value = 'result';
    await focusHeading();
  }
}
</script>

<template>
  <ModalDialog :open="open" label="Importar do Coding antigo" variant="sheet" initial-focus="[data-wizard-heading]" @close="!running && emit('close')">
    <div class="wizard" data-testid="import-wizard">
      <p class="steps" aria-label="Etapas da importação">
        <span v-for="(label, i) in ['Examinar', 'Selecionar', 'Confirmar']" :key="label" class="dot" :class="{ on: stepNumber === i + 1, past: stepNumber > i + 1 }" :aria-current="stepNumber === i + 1 ? 'step' : undefined">{{ i + 1 }}. {{ label }}</span>
      </p>

      <section v-if="step === 'examine'" aria-labelledby="w-h1">
        <h2 id="w-h1" ref="heading" tabindex="-1" data-wizard-heading>Examinar o Coding antigo</h2>
        <p class="muted">A consulta é somente leitura. O banco antigo (<code>coding-db</code>) e o localStorage antigo nunca são alterados. Em seguida você escolhe quais documentos copiar.</p>
        <p class="err" role="alert" data-testid="wizard-error">{{ error }}</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="scanning" :aria-busy="scanning" @click="examine">{{ scanning ? 'Examinando…' : 'Examinar documentos antigos' }}</button>
        </div>
      </section>

      <section v-else-if="step === 'select'" aria-labelledby="w-h2">
        <h2 id="w-h2" ref="heading" tabindex="-1" data-wizard-heading>Escolha o que copiar</h2>
        <ul v-if="notes.length" class="notes"><li v-for="note in notes" :key="note">{{ note }}</li></ul>
        <p v-if="!found.length" class="empty" data-testid="wizard-none">Nenhum documento foi encontrado no Coding antigo deste navegador. Abra o Coding atual neste mesmo navegador e tente de novo, ou restaure um backup.</p>
        <template v-else>
          <p class="muted">{{ found.length }} documento(s) encontrado(s). Documentos que já têm cópia aparecem indisponíveis para não duplicar.</p>
          <button v-if="selectable.length > 1" type="button" class="btn btn-ghost small" @click="toggleAll">{{ allSelected ? 'Desmarcar todos' : 'Marcar todos os disponíveis' }}</button>
          <ul class="docs" data-testid="legacy-docs">
            <li v-for="row in rows" :key="row.key" class="row" :class="{ blocked: row.blocked }">
              <input :id="'imp-' + row.key" type="checkbox" :disabled="row.blocked" :checked="selected.has(row.key)" :aria-describedby="'imp-d-' + row.key" @change="toggle(row.key, ($event.target as HTMLInputElement).checked)" />
              <label :for="'imp-' + row.key">
                <AppIcon v-if="toolIdForType(row.snapshot.doc.type)" :id="toolIdForType(row.snapshot.doc.type)!" size="sm" />
                <span class="t"><strong>{{ documentName(row.snapshot.doc) }}</strong></span>
              </label>
              <span :id="'imp-d-' + row.key" class="d">{{ typeLabel(row.snapshot.doc.type) }} · {{ originLabels[row.snapshot.source] }} · {{ imagesText(row.snapshot.images.length) }}<template v-if="row.blocked"> · <b>Indisponível: {{ row.reason }}</b></template></span>
            </li>
          </ul>
        </template>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="!chosen.length" @click="goConfirm">Continuar ({{ chosen.length }})</button>
        </div>
      </section>

      <section v-else-if="step === 'confirm'" aria-labelledby="w-h3">
        <h2 id="w-h3" ref="heading" tabindex="-1" data-wizard-heading>Confirmar a criação das cópias</h2>
        <p>Serão criadas <strong>{{ chosen.length }}</strong> cópia(s) independente(s) na versão 2.0. Os documentos originais <strong>não serão alterados</strong>.</p>
        <ul class="plain"><li v-for="row in chosen" :key="row.key">{{ documentName(row.snapshot.doc) }}</li></ul>
        <p data-testid="import-size">Tamanho das imagens a copiar: <strong>{{ formatBytes(totalBytes) }}</strong>.</p>
        <p v-if="spaceWarning" class="err" role="alert" data-testid="space-warning">{{ spaceWarning }}</p>
        <p class="muted">As cópias são criadas todas juntas: se algo falhar, nenhuma é criada.</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" :disabled="running" @click="goBack">Voltar</button>
          <button type="button" class="btn btn-primary" :disabled="running" :aria-busy="running" data-testid="confirm-import" @click="run">{{ running ? 'Criando…' : 'Criar ' + chosen.length + ' cópia(s)' }}</button>
        </div>
      </section>

      <section v-else aria-labelledby="w-h4" data-testid="wizard-result">
        <h2 id="w-h4" ref="heading" tabindex="-1" data-wizard-heading>Resultado</h2>
        <p v-if="outcome" :class="outcome.ok ? 'okc' : 'errc'" data-testid="import-outcome">{{ outcome.message }}</p>
        <div class="actions"><button type="button" class="btn btn-primary" @click="emit('close')">Concluir</button></div>
      </section>
    </div>
  </ModalDialog>
</template>

<style scoped>
h2 { font-size: 20px; margin-bottom: 8px; }
h2:focus { outline: none; }
.steps { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; font-size: 12.5px; }
.dot { padding: 3px 10px; border-radius: 999px; background: var(--raised); color: var(--muted); font-weight: 700; }
.dot.on { background: var(--accent); color: var(--accent-ink); }
.dot.past { color: var(--text); }
.err { min-height: 1.4em; margin: 6px 0 0; color: var(--danger); font-weight: 600; font-size: 13.5px; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.small { min-height: 44px; margin: 4px 0 8px; }
.docs, .plain, .notes { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 8px; }
.notes { color: var(--warn); font-size: 13px; }
.row { display: grid; grid-template-columns: 28px 1fr; column-gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); min-height: 56px; }
.row input { width: 24px; height: 24px; margin: 0; accent-color: var(--accent); }
.row label { display: flex; align-items: center; gap: 10px; min-height: 44px; cursor: pointer; overflow-wrap: anywhere; }
.row .d { grid-column: 2; font-size: 12.5px; color: var(--muted); }
.row.blocked label { cursor: not-allowed; }
.okc { color: var(--ok); }
.errc { color: var(--danger); }
.empty { padding: 16px; border: 1px dashed var(--border); border-radius: 14px; }
@media (max-width: 599px) { .actions .btn { flex: 1 1 100%; } }
</style>
