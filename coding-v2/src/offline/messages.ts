import type { InstallError } from './types';

/** Mensagens em português para o que pode dar errado, sem culpar a pessoa e dizendo o que fazer. */
export function friendlyInstallError(error: InstallError): string {
  switch (error.kind) {
    case 'network': return error.message + ' Nada foi deixado pela metade; você pode tentar de novo.';
    case 'integrity': return error.message + ' Nada foi instalado; tente de novo (se repetir, a versão publicada pode estar incompleta).';
    case 'quota': return 'O navegador não tem espaço para guardar os arquivos offline. Libere espaço no aparelho ou remova um app instalado e tente de novo.';
    case 'unsupported': return error.message;
    case 'cancelled': return 'Instalação cancelada.';
    default: return error.message || 'Não foi possível concluir a instalação.';
  }
}
