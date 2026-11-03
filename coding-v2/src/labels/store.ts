import {
  createCopy, getCopy, saveCopyRevision, MissingCopy,
  type CopyRecord, type LegacySnapshot
} from '../storage/documents';
import { normalize, uid, type LabelsState } from './model';

/** Adaptador de Etiquetas para cópias v2. Preserva a leitura de documentos antigos com source='backup'. */
export const NEW_DOC_SOURCE = 'v2' as const;
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
