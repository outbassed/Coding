import type { ToolId } from '../shared/catalog';

/**
 * Identidade de cada editor dentro da casca comum (EditorShell). É moderada de propósito: os controles, atalhos,
 * salvamento e acessibilidade são os mesmos; muda a arrumação (lado do painel e largura) e o clima visual
 * (cabeçalho e fundo da área de trabalho). Aplicativos sem entrada aqui seguem o padrão do Etiquetas.
 * Só tons derivados de `--bg` e da cor do app entram no fundo, então o contraste do texto não muda.
 */
export type SideStyle = 'left' | 'right';
export type HeadStyle = 'line' | 'tint';
/** plain: liso · device: brilho do aparelho · checker: xadrez · dots: pontilhado · grid: quadriculado */
export type StageStyle = 'plain' | 'device' | 'checker' | 'dots' | 'grid';

export interface EditorIdentity { side: SideStyle; sidebar: number; head: HeadStyle; stage: StageStyle }

export const defaultIdentity: EditorIdentity = { side: 'left', sidebar: 356, head: 'line', stage: 'plain' };

/**
 * Lote 1: Calculadora, Estúdio de Cores, Compactador ZIP e Comparador de Arquivos organizam a própria tela
 * (EditorShell `layout="free"`), então aqui só entram o clima do cabeçalho e o fundo da área de trabalho.
 */
const identities: Partial<Record<ToolId, Partial<EditorIdentity>>> = {
  calculator: { head: 'tint', stage: 'device' },
  colors: { head: 'tint', stage: 'plain' },
  zip: { head: 'line', stage: 'dots' },
  compare: { head: 'line', stage: 'grid' }
};

export const identityOf = (app: ToolId): EditorIdentity => ({ ...defaultIdentity, ...identities[app] });
