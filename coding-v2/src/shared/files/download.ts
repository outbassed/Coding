/** Entrega um arquivo ao navegador. Pedir o download não prova que o arquivo foi salvo no aparelho. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename);
}
export function safeFileName(name: string, fallback = 'documento'): string {
  return name.normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/\s+/g, ' ').trim().replace(/^[-. ]+|[-. ]+$/g, '').slice(0, 80) || fallback;
}
