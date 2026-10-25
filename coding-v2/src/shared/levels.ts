import { type CodingTool, isPreviewTool } from './catalog';
import { formatBytes } from './bytes';
import type { InstallState } from '../offline/types';

/** Três conceitos distintos; nenhum deles implica o outro. */
export type LevelKey = 'activation' | 'offline' | 'install';
export type LevelState = 'on' | 'off' | 'busy' | 'unverified' | 'unproven' | 'unavailable';

export interface Level {
  key: LevelKey;
  title: string;
  state: LevelState;
  label: string;
  text: string;
}

/** O que se sabe da instalação offline deste app neste navegador (vem do registro real, nunca de suposição). */
export interface OfflineInfo {
  supported: boolean;
  /** Motivo legível quando não há suporte. */
  reason?: string;
  state?: InstallState;
  /** Bytes que a instalação ocupa (registrada) ou ocuparia (manifesto). */
  bytes?: number | null;
}
const UNKNOWN_OFFLINE: OfflineInfo = { supported: true };

function offlineLevel(preview: boolean, info: OfflineInfo): Level {
  const base = { key: 'offline' as const, title: 'Disponível offline' };
  if (!preview) return { ...base, state: 'unavailable', label: 'Em breve', text: 'Disponível offline só será avaliado depois da migração do aplicativo.' };
  if (!info.supported) return { ...base, state: 'unavailable', label: 'Indisponível aqui', text: info.reason ?? 'Este navegador ou endereço não permite a instalação offline.' };
  const size = typeof info.bytes === 'number' ? ' (' + formatBytes(info.bytes) + ')' : '';
  switch (info.state) {
    case 'installed': return { ...base, state: 'on', label: 'Instalado offline', text: 'Os arquivos deste app estão guardados neste navegador' + size + ' e abrem sem internet. Isso vale só para este navegador e este aparelho. Para remover, use Ajustes.' };
    case 'update-available': return { ...base, state: 'busy', label: 'Atualização disponível', text: 'Há uma versão mais nova. Enquanto você não atualizar, a versão instalada continua funcionando offline. Atualize em Ajustes.' };
    case 'installing': case 'updating': return { ...base, state: 'busy', label: 'Instalando…', text: 'O download está em andamento. Acompanhe o progresso em Ajustes.' };
    case 'failed': return { ...base, state: 'off', label: 'Falhou', text: 'A instalação não foi concluída ou o navegador apagou arquivos. Use Ajustes para tentar de novo.' };
    case 'not-installed': return { ...base, state: 'off', label: 'Não instalado', text: 'Este app ainda não foi baixado para uso offline' + size + '. Instale em Ajustes, em “Uso sem internet”. Ativar o app no Launcher não faz esse download.' };
    default: return { ...base, state: 'unverified', label: 'Verificando…', text: 'Conferindo o que este navegador guardou.' };
  }
}

export function levelsFor(tool: CodingTool, enabled: boolean, offline: OfflineInfo = UNKNOWN_OFFLINE): Level[] {
  const preview = isPreviewTool(tool);
  return [
    {
      key: 'activation',
      title: 'Ativado no Launcher',
      state: !preview ? 'unavailable' : enabled ? 'on' : 'off',
      label: !preview ? 'Em breve' : enabled ? 'Ativado' : 'Não ativado',
      text: !preview
        ? 'Este aplicativo ainda não tem casca na versão 2.0. Ele continua disponível no Coding atual.'
        : enabled
          ? 'O atalho aparece em Meus apps. Desativar remove só o atalho, nunca seus documentos.'
          : 'Ativar coloca o atalho em Meus apps. É apenas uma preferência deste Launcher.'
    },
    offlineLevel(preview, offline),
    {
      key: 'install',
      title: 'Instalado como aplicativo',
      state: preview ? 'unproven' : 'unavailable',
      label: preview ? 'Opcional' : 'Em breve',
      text: preview
        ? 'Instalar o Coding 2.0 no aparelho (ícone na tela inicial) é opcional e decidido pelo navegador. É diferente de baixar o app para uso offline.'
        : 'A instalação no dispositivo será estudada depois da migração do aplicativo.'
    }
  ];
}
