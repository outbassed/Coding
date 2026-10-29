import { onBeforeUnmount, shallowRef, type ShallowRef } from 'vue';
import { MediaPlayer, browserEnv, type PlayerSnapshot } from './player';

/**
 * Instância ÚNICA do player por página. Fica fora de qualquer componente de cena: trocar, criar, duplicar, excluir ou
 * editar cenas não a recria, não a pausa e não a reinicia. A reprodução termina ao sair de /versos/, recarregar ou fechar
 * a aba (`pagehide`) e nunca é retomada sozinha.
 */
const VOLUME_KEY = 'coding-v2-versos-volume';
let player: MediaPlayer | null = null;
let hooked = false;

function savedVolume(): number {
  try { const n = Number(localStorage.getItem(VOLUME_KEY)); return Number.isFinite(n) && n >= 0 && n <= 1 && localStorage.getItem(VOLUME_KEY) !== null ? n : 1; } catch { return 1; }
}
export function saveVolume(v: number): void { try { localStorage.setItem(VOLUME_KEY, String(Math.round(v * 100) / 100)); } catch { /* sem armazenamento: tudo bem */ } }

export function getPlayer(): MediaPlayer {
  if (!player) player = new MediaPlayer(browserEnv(), savedVolume());
  if (!hooked && typeof window !== 'undefined') {
    hooked = true;
    const stop = (): void => { disposePlayer(); };
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeunload', stop);
  }
  return player;
}
export function disposePlayer(): void { player?.dispose(); player = null; }

export function usePlayer(): { player: MediaPlayer; snap: ShallowRef<PlayerSnapshot> } {
  const p = getPlayer();
  const snap = shallowRef<PlayerSnapshot>(p.snapshot);
  const off = p.subscribe(() => { snap.value = p.snapshot; });
  onBeforeUnmount(() => { off(); });
  return { player: p, snap };
}
