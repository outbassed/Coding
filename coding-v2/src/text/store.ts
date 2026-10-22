import { createCopy, getCopy, saveCopyRevision, MissingCopy, type CopyRecord, type LegacySnapshot } from '../storage/documents';
import { normalizedTextState, textLabel, type TextState } from './model';

export class NotTextDocument extends Error {
  constructor() { super('Este documento não pertence ao editor de Texto.'); this.name = 'NotTextDocument'; }
}
const snapshot = (state: TextState): LegacySnapshot => ({
  source: 'v2',
  doc: { id: 'v2-texts-' + crypto.randomUUID(), type: 'texts', updatedAt: Date.now(), state: { ...state } },
  images: []
});
export async function createTextDocument(state: TextState): Promise<CopyRecord> {
  const data = normalizedTextState(state);
  return createCopy(snapshot({ ...data, name: textLabel(data.name) }));
}
export async function openTextDocument(id: string): Promise<{ record: CopyRecord; state: TextState }> {
  const record = await getCopy(id);
  if (!record) throw new MissingCopy();
  if (record.snapshot.doc.type !== 'texts') throw new NotTextDocument();
  return { record, state: normalizedTextState(record.snapshot.doc.state) };
}
export async function saveTextDocument(base: CopyRecord, state: TextState): Promise<CopyRecord> {
  if (base.snapshot.doc.type !== 'texts') throw new NotTextDocument();
  const data = normalizedTextState(state);
  return saveCopyRevision(base.id, base.revision, {
    label: textLabel(data.name),
    snapshot: { ...base.snapshot, doc: {
      ...base.snapshot.doc, type: 'texts', updatedAt: Date.now(),
      state: { ...data, name: textLabel(data.name) }
    }, images: [] }
  });
}
