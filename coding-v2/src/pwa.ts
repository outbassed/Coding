/**
 * Recurso de Preview: apenas builds/ambientes autorizados e isolados do Coding 1.0.
 * Nunca registra service worker nos domínios conhecidos do Coding 1.0.
 */
export const previewPwaEnabled = import.meta.env.VITE_CODING_PREVIEW_PWA === '1';
const productionHosts = new Set(['codingtxt.vercel.app', 'coding-seven-sigma.vercel.app']);
const isLocalHost = (host: string): boolean => host === 'localhost' || host === '127.0.0.1';
/** Ambientes de Preview do Coding 2.0 (Cloudflare Pages) e desenvolvimento local. */
const isPreviewHost = (host: string): boolean => host.endsWith('.pages.dev') || isLocalHost(host);

export type OfflineSupport = { ok: true } | { ok: false; reason: string };

/** Diz, com motivo legível, se a instalação offline pode funcionar aqui. */
export function offlineSupport(): OfflineSupport {
  if (typeof window === 'undefined' || typeof location === 'undefined') return { ok: false, reason: 'A instalação offline não está disponível fora do navegador.' };
  const host = location.hostname;
  if (productionHosts.has(host)) return { ok: false, reason: 'Este endereço é o do site já publicado. A instalação offline fica desligada aqui para não interferir nele.' };
  if (!previewPwaEnabled && !isPreviewHost(host)) return { ok: false, reason: 'A instalação offline só está disponível em ambientes de teste isolados (endereços *.pages.dev ou localhost) e em builds autorizados.' };
  if (!(location.protocol === 'https:' || isLocalHost(host))) return { ok: false, reason: 'A instalação offline exige uma conexão segura (HTTPS).' };
  if (!('serviceWorker' in navigator) || !('caches' in window)) return { ok: false, reason: 'Este navegador não oferece service worker e armazenamento de cache (isso é comum em modo privado ou em navegadores antigos).' };
  if (typeof indexedDB === 'undefined') return { ok: false, reason: 'Este navegador não permite o banco local necessário para registrar o que foi instalado.' };
  return { ok: true };
}
export const previewPwaSupported = (): boolean => offlineSupport().ok;

/** O manifesto de instalação como aplicativo (opcional) é separado do cache offline. */
export function exposePreviewManifest(): void {
  if (!previewPwaSupported() || document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);
}

/** Registra o service worker genérico (só depois de um clique de instalação). Ele não contém lista de arquivos. */
export async function registerOfflineWorker(): Promise<void> {
  const support = offlineSupport();
  if (!support.ok) throw new Error(support.reason);
  exposePreviewManifest();
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  const timeout = new Promise<never>((_resolve, reject) => { setTimeout(() => reject(new Error('O navegador não ativou o service worker a tempo. Tente de novo.')), 30_000); });
  await Promise.race([navigator.serviceWorker.ready, timeout]);
}
export async function unregisterOfflineWorker(): Promise<void> {
  try { const reg = await navigator.serviceWorker.getRegistration('/'); await reg?.unregister(); } catch { /* sem permissão */ }
}

/** Instalação do app no aparelho (PWA): só existe quando o navegador oferece, e é independente do cache offline. */
interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
export function watchInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredPrompt = event as InstallPromptEvent; listeners.forEach((fn) => fn()); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; listeners.forEach((fn) => fn()); });
}
export const deviceInstallAvailable = (): boolean => deferredPrompt !== null;
export function onInstallPromptChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export async function promptDeviceInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const p = deferredPrompt; if (!p) return 'unavailable';
  deferredPrompt = null; listeners.forEach((fn) => fn());
  await p.prompt();
  return (await p.userChoice).outcome;
}
