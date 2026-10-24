/**
 * Recurso experimental: apenas builds autorizados do Preview em domínio separado.
 * Nunca registra service worker no domínio conhecido do Coding 1.0.
 */
export const previewPwaEnabled = import.meta.env.VITE_CODING_PREVIEW_PWA === '1';
const productionHosts = new Set(['codingtxt.vercel.app', 'coding-seven-sigma.vercel.app']);

export function previewPwaSupported(): boolean {
  if (!previewPwaEnabled || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('caches' in window)) return false;
  const host = location.hostname;
  if (productionHosts.has(host)) return false;
  return location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
}

/** A instalação PWA é separada do cache offline e continua a cargo do navegador. */
export function exposePreviewManifest(): void {
  if (!previewPwaSupported() || document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);
}

/** Apenas um clique real nos Ajustes inicia o download. */
export async function prepareOffline(): Promise<void> {
  if (!previewPwaSupported()) throw new Error('Acesso offline indisponível: use um Preview isolado em HTTPS.');
  exposePreviewManifest();
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  // A promessa ready só resolve se uma instalação tiver concluído com sucesso.
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error('O preparo offline não terminou. Verifique a conexão e tente novamente.')), 90_000);
  });
  const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
  if (!ready.active) throw new Error('Os arquivos offline ainda não estão prontos.');
}
