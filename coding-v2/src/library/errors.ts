/** Traduz falhas do armazenamento para português claro. Nunca esconde que nada foi gravado. */
export function friendlyError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (name === 'RevisionConflict') return 'Esta cópia foi alterada em outra janela. Nada foi sobrescrito.';
  if (name === 'DuplicateCopy') return 'Já existe uma cópia deste documento, ou o arquivo repete um documento. Nada foi gravado.';
  if (name === 'MissingCopy') return 'Esta cópia não existe mais neste aparelho. Atualize a lista.';
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return 'O armazenamento deste aparelho está cheio. Exporte um backup, libere espaço e tente de novo. Nada foi gravado.';
  }
  if (err instanceof RangeError && /call stack/i.test(message)) {
    return 'Este arquivo tem um anexo grande demais para o backup desta versão (limitação conhecida, em correção). Nada foi alterado.';
  }
  if (name === 'VersionError') return 'O banco de cópias foi atualizado por outra versão do Coding. Recarregue a página.';
  if (name === 'AbortError' || /transação cancelada/i.test(message)) return 'O navegador cancelou a gravação. Nada foi alterado; tente de novo.';
  if (name === 'DataCloneError') return 'Este documento tem dados que o navegador não consegue guardar.';
  if (name === 'SecurityError' || name === 'NotAllowedError' || /indexeddb indisponível/i.test(message)) {
    return 'O navegador bloqueou o armazenamento (modo privado ou permissão negada). Nada foi gravado.';
  }
  if (name === 'SyntaxError') return 'O arquivo não é um backup válido (o conteúdo está incompleto ou corrompido).';
  if (/[áéíóúãõçâêô]|nenhum|backup|cópia/i.test(message)) return message;
  return 'Não foi possível concluir a operação. Detalhe técnico: ' + message;
}
