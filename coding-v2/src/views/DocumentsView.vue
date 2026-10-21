<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SaveStatus, { type SaveState } from '../components/editor/SaveStatus.vue';
import { LEGACY_URL } from '../shared/links';
import {
  inspectLegacy, createCopy, listCopies, saveCopyRevision, watchCopies,
  documentName, errorText, RevisionConflict,
  type LegacySnapshot, type CopyRecord
} from '../storage/documents';
import { encodeBackup, downloadBackup, importBackupToCopies } from '../storage/archive';

const found = ref<LegacySnapshot[]>([]);
const notes = ref<string[]>([]);
const copies = ref<CopyRecord[]>([]);
const scanning = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const copiesChanged = ref(false);
const editId = ref<string | null>(null);
const editLabel = ref('');
const saveState = ref<SaveState>('preview');
const importInput = ref<HTMLInputElement | null>(null);
let stopWatching: (() => void) | undefined;

async function refreshCopies(): Promise<void> {
  copies.value = await listCopies();
  copiesChanged.value = false;
}
onMounted(() => {
  void refreshCopies().catch((err: unknown) => { error.value = 'Não foi possível abrir o armazenamento isolado: ' + errorText(err); });
  stopWatching = watchCopies(() => { copiesChanged.value = true; });
});
onUnmounted(() => stopWatching?.());

async function scan(): Promise<void> {
  scanning.value = true; error.value = ''; notice.value = '';
  try {
    const result = await inspectLegacy();
    found.value = result.snapshots;
    notes.value = result.notes;
    notice.value = 'Consulta somente leitura concluída. Nenhum documento antigo foi alterado.';
  } catch (err) { error.value = errorText(err); }
  finally { scanning.value = false; }
}
async function exportListed(): Promise<void> {
  busy.value = true; error.value = '';
  try {
    const text = await encodeBackup(found.value);
    downloadBackup(text, 'coding-legado-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    notice.value = 'Backup dos documentos listados gerado, incluindo imagens armazenadas no IndexedDB.';
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function exportCopies(): Promise<void> {
  busy.value = true; error.value = '';
  try {
    // Each saved copy carries the raw document and its associated image blobs.
    const text = await encodeBackup(copies.value.map((copy) => copy.snapshot));
    downloadBackup(text, 'coding-v2-copias-' + new Date().toISOString().slice(0, 10) + '.json');
    notice.value = 'Backup dos conteúdos das cópias v2 gerado.';
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function copy(snapshot: LegacySnapshot): Promise<void> {
  busy.value = true; saveState.value = 'saving'; error.value = '';
  try {
    await createCopy(snapshot);
    await refreshCopies();
    saveState.value = 'saved';
    notice.value = 'Cópia independente criada na v2. O documento original não foi alterado.';
  } catch (err) { saveState.value = 'error'; error.value = errorText(err); }
  finally { busy.value = false; }
}
function beginEdit(doc: CopyRecord): void {
  editId.value = doc.id; editLabel.value = doc.label; error.value = ''; notice.value = '';
  saveState.value = 'pending';
}
function cancelEdit(): void { editId.value = null; saveState.value = 'preview'; }
async function saveName(doc: CopyRecord): Promise<void> {
  busy.value = true; saveState.value = 'saving'; error.value = '';
  try {
    await saveCopyRevision(doc.id, doc.revision, { label: editLabel.value });
    await refreshCopies();
    editId.value = null;
    saveState.value = 'saved';
    notice.value = 'Nome da cópia salvo após confirmação do banco. O conteúdo original permanece intacto.';
  } catch (err) {
    saveState.value = 'error';
    error.value = err instanceof RevisionConflict
      ? 'Conflito de versão: outra janela alterou esta cópia. Sua edição não foi sobrescrita. Faça backup do nome e atualize a biblioteca.'
      : errorText(err);
  } finally { busy.value = false; }
}
async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  busy.value = true; saveState.value = 'saving'; error.value = '';
  try {
    const count = await importBackupToCopies(await file.text());
    await refreshCopies();
    notice.value = count + ' documento(s) importado(s) como cópias isoladas. Nada foi gravado no banco antigo.';
    saveState.value = 'saved';
  } catch (err) { saveState.value = 'error'; error.value = 'Importação não concluída: ' + errorText(err); }
  finally { busy.value = false; if (importInput.value) importInput.value.value = ''; }
}
function displayType(s: LegacySnapshot): string { return typeof s.doc.type === 'string' ? s.doc.type : 'tipo não definido'; }
</script>

<template>
  <PageHeader eyebrow="Biblioteca" title="Documentos" lead="Seus documentos antigos continuam protegidos. A v2 só os examina quando você pedir e trabalha com cópias isoladas." />
  <p class="intro">Nada nesta página abre, modifica ou exclui documentos no <code>coding-db</code>. Os motores de edição ainda estão na <a :href="LEGACY_URL">versão atual do Coding</a>.</p>

  <div class="storage-status" role="group" aria-label="Estado do salvamento">
    <SaveStatus :state="saveState" />
    <span class="muted">O status se refere apenas às cópias da versão 2.0, nunca ao banco antigo.</span>
  </div>
  <p v-if="error" class="message err" role="alert">{{ error }}</p>
  <p v-if="notice" class="message ok" role="status">{{ notice }}</p>

  <section aria-labelledby="legacy-heading" class="block">
    <div class="section-heading">
      <div><h2 id="legacy-heading">Consultar o Coding antigo</h2><p class="muted">Somente leitura, sem migração automática.</p></div>
      <button class="btn btn-primary" type="button" :disabled="scanning || busy" @click="scan">
        {{ scanning ? 'Consultando…' : 'Examinar documentos antigos' }}
      </button>
    </div>
    <ul v-if="notes.length" class="notes"><li v-for="note in notes" :key="note">{{ note }}</li></ul>
    <div v-if="found.length" class="items" data-testid="legacy-docs">
      <article v-for="(entry, index) in found" :key="entry.source + ':' + entry.doc.id + ':' + index" class="item">
        <div class="details">
          <h3>{{ documentName(entry.doc) }}</h3>
          <p class="muted">Origem: {{ entry.source === 'indexeddb' ? 'IndexedDB antigo' : 'localStorage antigo' }} · {{ displayType(entry) }} · {{ entry.images.length }} imagem(ns) vinculada(s)</p>
        </div>
        <button class="btn" type="button" :disabled="busy" :aria-label="'Criar cópia de ' + documentName(entry.doc)" @click="copy(entry)">Criar cópia na v2</button>
      </article>
    </div>
    <div v-else-if="!scanning" class="hint">A lista só aparece depois que você solicitar a leitura. Se a v2 estiver em outro domínio, não poderá acessar o armazenamento do Coding atual.</div>
    <div class="section-actions">
      <button class="btn" type="button" :disabled="busy || !found.length" @click="exportListed">Exportar backup dos documentos listados</button>
      <span class="muted">O JSON inclui os blobs das imagens. Guarde o arquivo em local seguro.</span>
    </div>
  </section>

  <section aria-labelledby="copies-heading" class="block">
    <div class="section-heading">
      <div><h2 id="copies-heading">Minhas cópias v2</h2><p class="muted">Banco separado: <code>coding-v2-documents</code>.</p></div>
      <button class="btn" type="button" :disabled="busy" @click="refreshCopies">Atualizar biblioteca</button>
    </div>
    <p v-if="copiesChanged" class="message" role="status">Uma cópia foi alterada em outra aba. Confira antes de salvar; atualize a biblioteca para ver a nova revisão.</p>
    <div v-if="copies.length" class="items" data-testid="v2-copies">
      <article v-for="doc in copies" :key="doc.id" class="item">
        <div class="details">
          <template v-if="editId === doc.id">
            <label :for="'rename-' + doc.id">Novo nome da cópia</label>
            <input :id="'rename-' + doc.id" v-model="editLabel" maxlength="250" class="name-input" autocomplete="off" @input="saveState = 'pending'" @keydown.enter.prevent="saveName(doc)" />
          </template>
          <template v-else><h3>{{ doc.label }}</h3></template>
          <p class="muted">Cópia independente · revisão {{ doc.revision }} · origem: {{ doc.source }} · imagens: {{ doc.snapshot.images.length }}</p>
        </div>
        <div class="row-actions">
          <template v-if="editId === doc.id">
            <button class="btn btn-primary" type="button" :disabled="busy || !editLabel.trim()" @click="saveName(doc)">Salvar nome</button>
            <button class="btn" type="button" :disabled="busy" @click="cancelEdit">Cancelar</button>
          </template>
          <button v-else class="btn" type="button" :disabled="busy || editId !== null" :aria-label="'Renomear cópia de ' + doc.label" @click="beginEdit(doc)">Renomear</button>
        </div>
      </article>
    </div>
    <div v-else class="hint">Nenhuma cópia criada ainda. Examine documentos antigos ou importe um backup para testar o armazenamento seguro.</div>
    <div class="section-actions">
      <button class="btn" type="button" :disabled="busy || !copies.length" @click="exportCopies">Exportar backup das cópias</button>
      <button class="btn" type="button" :disabled="busy" @click="importInput?.click()">Importar backup do Coding 2.0</button>
      <input ref="importInput" type="file" accept=".json,application/json" class="visually-hidden" aria-label="Escolher backup JSON do Coding 2.0" @change="importFile" />
    </div>
    <p class="muted note">Importar adiciona novas cópias; nunca substitui documentos existentes. O backup exporta conteúdo original e imagens, não os nomes ou números de revisão definidos apenas na v2.</p>
  </section>
</template>

<style scoped>
.intro { color: var(--muted); max-width: 76ch; line-height: 1.7; }
.intro a { color: var(--accent); font-weight: 700; }
.storage-status { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 20px 0; font-size: 13px; }
.block { margin: 24px 0; padding: clamp(14px, 2vw, 22px); border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.section-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; align-items: center; }
.section-heading h2 { margin: 0; font-size: 19px; }
.section-heading p { margin: 4px 0; }
.section-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
.section-actions .muted, .note { font-size: 12px; }
.items { display: grid; gap: 8px; margin-top: 15px; }
.item { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); padding: 13px; }
.details { flex: 1 1 180px; min-width: 0; }
.details h3 { font-size: 15px; margin: 0 0 5px; overflow-wrap: anywhere; }
.details p { font-size: 12px; margin: 0; overflow-wrap: anywhere; }
.row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.name-input { display: block; width: 100%; margin-top: 3px; min-height: 44px; border: 1px solid var(--border); padding: 8px 12px; border-radius: 10px; background: var(--surface); }
.details label { display: block; font-weight: 700; font-size: 12px; }
.hint { margin-top: 14px; padding: 18px; background: var(--panel); border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); }
.notes { color: var(--muted); margin: 12px 0; padding-left: 24px; }
.message { padding: 11px 15px; margin: 12px 0; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); }
.message.err { border-color: var(--danger); }
.message.ok { border-color: var(--ok); }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip: rect(0 0 0 0); overflow: hidden; white-space: nowrap; }
@media (max-width: 599px) { .section-heading > button, .section-actions > button { width: 100%; } .row-actions { width: 100%; } .row-actions .btn { flex: 1; } .item > button { flex: 1 1 100%; } }
</style>
