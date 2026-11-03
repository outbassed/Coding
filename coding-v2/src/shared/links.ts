/** Endereço do Coding estável. Centralizado para facilitar troca de domínio. */
export const LEGACY_URL = 'https://codingtxt.vercel.app/';
export const LAUNCHER_PATH = '/launcher/';
export const legacyLink = (hash: string): string => LEGACY_URL + hash;
