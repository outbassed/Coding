import {
  createCopy, getCopy, saveCopyRevision, MissingCopy,
  type CopyRecord, type LegacyImage, type LegacySnapshot
} from '../storage/documents';

/**
 * Contrato genérico de documento do Coding 2.0 para os apps novos.
 * Cada app define o tipo gravado (o mesmo usado pelo Coding 1.0, para a biblioteca reconhecer),
 * um prefixo de id e uma normalização que NUNCA confia no que veio do banco.
 */
export interface DocKind<S> {
  type: string;
  /** Prefixo do legacyId de documentos criados na v2 (ex.: 'v2-calc-'). */
  prefix: string;
  /** Nome amigável do app para mensagens. */
  appName: string;
  normalize(raw: unknown): S;
  label(state: S): string;
}
export class WrongDocument extends Error {
  constructor(app: string) { super('Este documento não pertence ao app ' + app + '.'); this.name = 'WrongDocument'; }
}
export const cleanLabel = (name: unknown, fallback = 'Documento sem título'): string =>
  ((typeof name === 'string' ? name.trim() : '') || fallback).slice(0, 250);

function snapshotFor<S>(kind: DocKind<S>, state: S, images: LegacyImage[], id?: string): LegacySnapshot {
  const docId = id ?? kind.prefix + crypto.randomUUID();
  return {
    source: 'v2',
    doc: { id: docId, type: kind.type, updatedAt: Date.now(), state: { ...(state as object), name: kind.label(state) } },
    images: images.map((img) => ({ ...img, docId }))
  };
}
export async function createDoc<S>(kind: DocKind<S>, state: S, images: LegacyImage[] = []): Promise<CopyRecord> {
  return createCopy(snapshotFor(kind, kind.normalize(state), images));
}
export async function openDoc<S>(kind: DocKind<S>, id: string): Promise<{ record: CopyRecord; state: S }> {
  const record = await getCopy(id);
  if (!record) throw new MissingCopy();
  if (record.snapshot.doc.type !== kind.type) throw new WrongDocument(kind.appName);
  return { record, state: kind.normalize(record.snapshot.doc.state) };
}
/** Grava uma revisão nova; falha com RevisionConflict se outra janela gravou antes. */
export async function saveDoc<S>(kind: DocKind<S>, base: CopyRecord, state: S, images?: LegacyImage[]): Promise<CopyRecord> {
  if (base.snapshot.doc.type !== kind.type) throw new WrongDocument(kind.appName);
  const data = kind.normalize(state);
  const keep = images ?? base.snapshot.images ?? [];
  return saveCopyRevision(base.id, base.revision, {
    label: kind.label(data),
    snapshot: {
      ...base.snapshot,
      doc: { ...base.snapshot.doc, type: kind.type, updatedAt: Date.now(), state: { ...(data as object), name: kind.label(data) } },
      images: keep.map((img) => ({ ...img, docId: base.snapshot.doc.id }))
    }
  });
}
