/** Categorias de Ajustes. O id vai na barra de endereço (`#/ajustes?aba=offline`) para o link e o recarregamento voltarem à mesma aba. */
export const settingsTabs = [
  { id: 'geral', label: 'Geral' },
  { id: 'aparencia', label: 'Aparência' },
  { id: 'projetos', label: 'Projetos' },
  { id: 'offline', label: 'Offline' },
  { id: 'atalhos', label: 'Atalhos' },
  { id: 'avancado', label: 'Avançado' },
  { id: 'sobre', label: 'Sobre' }
] as const;
export type SettingsTab = (typeof settingsTabs)[number]['id'];
export const DEFAULT_TAB: SettingsTab = 'geral';

export function parseTab(value: unknown): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return settingsTabs.find((t) => t.id === raw)?.id ?? DEFAULT_TAB;
}
/** Aba vizinha para setas/Home/End no teclado (anda em círculo). */
export function neighborTab(current: SettingsTab, key: string): SettingsTab | null {
  const index = settingsTabs.findIndex((t) => t.id === current);
  const last = settingsTabs.length - 1;
  if (key === 'Home') return settingsTabs[0]!.id;
  if (key === 'End') return settingsTabs[last]!.id;
  if (key === 'ArrowDown' || key === 'ArrowRight') return settingsTabs[index >= last ? 0 : index + 1]!.id;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return settingsTabs[index <= 0 ? last : index - 1]!.id;
  return null;
}
