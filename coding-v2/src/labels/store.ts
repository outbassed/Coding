import {
  createCopy, getCopy, saveCopyRevision, MissingCopy,
  type CopyRecord, type LegacySnapshot
} from '../storage/documents';
import { normalize, uid, type LabelsState } from './model';

/**
 * Adaptador entre Etiquetas e o armazenamento v2 existente (cópias isoladas).
 * Nunca toca no banco legado e não altera src/storage.
 *
 * CONTRATO PENDENTE com o GPT-6: `Source` só aceita 'indexeddb' | 'localStorage' | 'backup'.
 * Documentos NOVOS criados na v2 usam 'backup' + legacyId com este prefixo, que a interface
 * reconhece como "criado na v2". Ideal: um quarto valor `'v2'` em `Source`.
 */
export const NEW_DOC_SOURCE = 'backup' as const;
export const NEW_DOC_PREFIX = 'v2-labels-';
export const isCreatedInV2 = (copy: { legacyId: string }): boolean => copy.legacyId.startsWith(NEW_DOC_PREFIX);

export class NotLabelsDocument extends Error {
  constructor() { super('Este documento não é de Etiquetas e não pode ser aberto aqui.'); this.name = 'NotLabelsDocument'; }
}
export const labelFor = (state: LabelsState): string => (state.name.trim() || 'Documento sem título').slice(0, 250);

function snapshotOf(base: LegacySnapshot, state: LabelsState): LegacySnapshot {
  return { ...base, doc: { ...base.doc, type: 'labels', updatedAt: Date.now(), state: { ...state } }, images: [] };
}
export function freshSnapshot(state: LabelsState): LegacySnapshot {
  const id = NEW_DOC_PREFIX + uid();
  return { source: NEW_DOC_SOURCE, doc: { id, type: 'labels', updatedAt: Date.now(), state: { ...state } }, images: [] };
}

export async function createLabelsDocument(state: LabelsState): Promise<CopyRecord> {
  const snapshot = freshSnapshot(state);
  const copy = await createCopy({ ...snapshot, doc: { ...snapshot.doc, state: { ...state, name: labelFor(state) } } });
  return copy;
}
export async function openLabelsDocument(copyId: string): Promise<{ record: CopyRecord; state: LabelsState }> {
  const record = await getCopy(copyId);
  if (!record) throw new MissingCopy();
  if (record.snapshot.doc.type !== 'labels') throw new NotLabelsDocument();
  return { record, state: normalize(record.snapshot.doc.state) };
}
/** Grava como nova revisão, comparando a revisão esperada (nunca sobrescreve em silêncio). */
export async function saveLabelsDocument(base: CopyRecord, state: LabelsState): Promise<CopyRecord> {
  return saveCopyRevision(base.id, base.revision, { label: labelFor(state), snapshot: snapshotOf(base.snapshot, state) });
}
/** Cria uma cópia independente com o conteúdo atual (saída do conflito). */
export async function saveAsNewLabelsDocument(state: LabelsState): Promise<CopyRecord> {
  return createLabelsDocument({ ...state, name: labelFor(state).slice(0, 70) + ' (cópia)' });
}
