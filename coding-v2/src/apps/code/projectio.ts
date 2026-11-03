import { extractEntry, listZip, ZipError } from '../zip/zip';
import { cleanPath, isAssetPath, isTextPath, MAX_ASSET_BYTES, MAX_FILE_CHARS, MAX_FILES } from './model';

export interface ImportedFile { path: string; text?: string; bytes?: Uint8Array }
export interface ZipImport { files: ImportedFile[]; skipped: string[] }

/** Se todos os caminhos começam pela mesma pasta (comum em ZIPs de projeto), tira essa pasta. */
export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0 || paths.some((p) => !p.includes('/'))) return paths;
  const first = paths[0]!.split('/')[0]!;
  return paths.every((p) => p.split('/')[0] === first) ? paths.map((p) => p.slice(first.length + 1)) : paths;
}

/** Lê um ZIP de projeto: aceita arquivos de texto e recursos conhecidos; o resto é listado como ignorado, com o motivo. */
export async function readProjectZip(bytes: Uint8Array): Promise<ZipImport> {
  const listing = listZip(bytes);
  const skipped: string[] = [];
  const picked: { entry: (typeof listing.entries)[number]; path: string }[] = [];
  const raw = listing.entries.filter((e) => !e.directory);
  const named = raw.map((e) => ({ entry: e, path: e.unsafe ? '' : e.name }));
  const stripped = stripCommonRoot(named.filter((n) => n.path).map((n) => n.path));
  let k = 0;
  for (const n of named) {
    if (!n.path) { skipped.push(n.entry.rawName + ': caminho inseguro'); continue; }
    const path = cleanPath(stripped[k++]!);
    if (!path) { skipped.push(n.entry.name + ': nome não aceito'); continue; }
    if (!isTextPath(path) && !isAssetPath(path)) { skipped.push(path + ': tipo de arquivo não suportado'); continue; }
    if (n.entry.size > (isTextPath(path) ? MAX_FILE_CHARS * 4 : MAX_ASSET_BYTES)) { skipped.push(path + ': arquivo grande demais'); continue; }
    if (picked.length >= MAX_FILES) { skipped.push(path + ': limite de ' + MAX_FILES + ' arquivos'); continue; }
    picked.push({ entry: n.entry, path });
  }
  const files: ImportedFile[] = [];
  for (const p of picked) {
    try {
      const data = await extractEntry(bytes, p.entry);
      if (isTextPath(p.path)) {
        const text = new TextDecoder('utf-8').decode(data);
        if (text.length > MAX_FILE_CHARS) { skipped.push(p.path + ': passa de ' + MAX_FILE_CHARS.toLocaleString('pt-BR') + ' caracteres'); continue; }
        files.push({ path: p.path, text });
      } else files.push({ path: p.path, bytes: data });
    } catch (e) { skipped.push(p.path + ': ' + (e instanceof ZipError ? e.message : 'não foi possível ler')); }
  }
  return { files, skipped };
}
