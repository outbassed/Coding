import type { NavIconName } from '../ui/NavIcon.vue';

export interface NavItem { name: string; label: string; icon: NavIconName }

export const navItems: readonly NavItem[] = [
  { name: 'home', label: 'Início', icon: 'home' },
  { name: 'my-apps', label: 'Meus apps', icon: 'apps' },
  { name: 'catalog', label: 'Catálogo', icon: 'catalog' },
  { name: 'docs', label: 'Documentos', icon: 'docs' },
  { name: 'settings', label: 'Ajustes', icon: 'settings' }
];
