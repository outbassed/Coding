import { ref } from 'vue';

/** Preferências de largura independentes por aplicativo; somente usado em layout desktop. */
export function useResizableSidebar(app: string, defaultWidth: number, min = 296, max = 460) {
  const key = 'coding-v2-sidebar-' + app;
  function read(): number {
    try {
      const raw = Number(localStorage.getItem(key));
      return raw >= min && raw <= max ? raw : defaultWidth;
    } catch { return defaultWidth; }
  }
  const width = ref(read());
  const dragging = ref(false);
  let startX = 0, startWidth = defaultWidth;
  function persist(): void {
    try { localStorage.setItem(key, String(width.value)); } catch { /* armazenamento opcional */ }
  }
  function start(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragging.value = true;
    startX = event.clientX;
    startWidth = width.value;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent): void {
    if (!dragging.value) return;
    width.value = Math.max(min, Math.min(max, startWidth + event.clientX - startX));
  }
  function end(event: PointerEvent): void {
    if (!dragging.value) return;
    dragging.value = false;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    persist();
  }
  function keys(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    width.value = Math.max(min, Math.min(max, width.value + (event.key === 'ArrowRight' ? 16 : -16)));
    persist();
  }
  function reset(): void { width.value = defaultWidth; persist(); }
  return { width, dragging, start, move, end, keys, reset, min, max };
}
