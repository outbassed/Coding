import type { PrintPage } from '../../shared/print/print';
import type { IconName } from './icons';

/** Uma linha das propriedades do arquivo (rótulo e valor). */
export interface Detail { label: string; value: string }

/** Item do menu de contexto. `run` é a ação real: nada aqui é decorativo. */
export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  /** Marca de seleção (ex.: velocidade atual, quebra de linhas ligada). */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}
export interface MenuGroup { title?: string; items: MenuItem[] }

/** Ações que cada visualizador pede ao Visualizador principal (que é dono do projeto, da tela cheia e da impressão). */
export type ViewerAction = 'download' | 'print' | 'fullscreen' | 'properties' | 'open-code' | 'open-pdf' | 'remove' | 'next' | 'prev';

/** O que cada visualizador de formato oferece ao Visualizador principal (menu de contexto, atalhos e impressão). */
export interface ViewerHandle {
  /** Grupos do menu de contexto específicos do formato aberto, já com o estado atual (marcas e itens desabilitados). */
  menu(): MenuGroup[];
  /** Atalho de teclado do formato; devolve `true` quando tratou a tecla. */
  key(event: KeyboardEvent): boolean;
  /** Páginas para a impressão nativa (só o conteúdo). Lança erro com mensagem clara quando não dá. */
  printPages(): Promise<PrintPage[]>;
  /** Motivo pelo qual não dá para imprimir agora; vazio quando dá. */
  printReason(): string;
}
