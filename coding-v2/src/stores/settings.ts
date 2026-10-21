import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type Theme = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'coding-v2-theme';
const SURFACE = { light: '#ffffff', dark: '#171c24' } as const;

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'auto' || value === 'light' || value === 'dark') return value;
  } catch { /* armazenamento indisponível: tema automático */ }
  return 'auto';
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(choice: Theme): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const dark = choice === 'dark' || (choice === 'auto' && prefersDark());
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? SURFACE.dark : SURFACE.light);
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<Theme>(readTheme());
  watch(theme, (choice) => {
    applyTheme(choice);
    try { localStorage.setItem(THEME_KEY, choice); } catch { /* sessão volátil */ }
  }, { immediate: true });
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(theme.value));
  }
  function setTheme(choice: Theme): void { theme.value = choice; }
  return { theme, setTheme };
});
