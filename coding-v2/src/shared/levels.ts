import { type CodingTool, isPreviewTool } from './catalog';

/** Três conceitos distintos; nenhum deles implica o outro. */
export type LevelKey = 'activation' | 'offline' | 'install';
export type LevelState = 'on' | 'off' | 'unverified' | 'unproven' | 'unavailable';

export interface Level {
  key: LevelKey;
  title: string;
  state: LevelState;
  label: string;
  text: string;
}

export function levelsFor(tool: CodingTool, enabled: boolean): Level[] {
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
    {
      key: 'offline',
      title: 'Disponível offline',
      state: preview ? 'unverified' : 'unavailable',
      label: preview ? 'Não verificado' : 'Em breve',
      text: preview
        ? 'Esta prévia ainda não baixa arquivos para uso sem internet nem confere se estão completos. Só vamos dizer “disponível offline” depois de verificar de verdade.'
        : 'Disponível offline só será avaliado depois da migração do aplicativo.'
    },
    {
      key: 'install',
      title: 'Instalado como aplicativo',
      state: preview ? 'unproven' : 'unavailable',
      label: preview ? 'Não comprovado' : 'Em breve',
      text: preview
        ? 'Instalar no dispositivo é outra coisa e depende do navegador. Esta prévia não tem manifesto nem service worker, e o comportamento ainda não foi testado em aparelhos reais.'
        : 'A instalação no dispositivo será estudada depois da migração do aplicativo.'
    }
  ];
}
