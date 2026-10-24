/**
 * Offline experimental exclusivamente no deploy ISOLADO da Prévia.
 * O recurso não é registrado automaticamente e não toca no Coding 1.0.
 */
export const previewPwaEnabled = import.meta.env.VITE_CODING_PREVIEW_PWA === '1';

export function previewPwaSupported(): boolean {
  return previewPwaEnabled && typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator && 'caches' in window &&
    location.protocol === 'https:' || (
      previewPwaEnabled && typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator && 'caches' in window &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    );
}

/** Só instala depois de um gesto explícito do usuário nos Ajustes. */
export async function prepareOffline(): Promise<void> {
  if (!previewPwaSupported()) throw new Error('Acesso offline indisponível neste navegador ou Preview.');
  if (location.hostname === 'codingtxt.vercel.app' || location.hostname === 'coding-seven-sigma.vercel.app') {
    throw new Error('Instalação bloqueada: abra o Coding 2.0 em um domínio de Preview separado.');
  }
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  await registration.update();
  const ready = await navigator.serviceWorker.ready;
  if (!ready.active) throw new Error('Os arquivos offline ainda não estão prontos.');
  // O install só ativa depois de cache.addAll concluir sem falhas.
}
