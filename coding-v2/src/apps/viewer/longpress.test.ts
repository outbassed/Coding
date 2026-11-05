import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLongPress } from './longpress';

const ev = (o: Partial<PointerEvent>): PointerEvent => ({ pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 20, target: document.body, ...o }) as PointerEvent;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Visualizador · toque prolongado', () => {
  it('abre o menu depois de segurar o dedo parado', () => {
    const onOpen = vi.fn(), onFired = vi.fn();
    const p = createLongPress({ onOpen, onFired });
    p.down(ev({}));
    vi.advanceTimersByTime(300);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onOpen).toHaveBeenCalledWith(10, 20, document.body);
    expect(onFired).toHaveBeenCalledTimes(1);
    expect(p.recentlyOpened()).toBe(true);
  });
  it('soltar antes do tempo não abre', () => {
    const onOpen = vi.fn();
    const p = createLongPress({ onOpen });
    p.down(ev({}));
    vi.advanceTimersByTime(200);
    p.up();
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
    expect(p.recentlyOpened()).toBe(false);
  });
  it('mexer o dedo cancela', () => {
    const onOpen = vi.fn();
    const p = createLongPress({ onOpen });
    p.down(ev({}));
    p.move(ev({ clientX: 60, clientY: 20 }));
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
  });
  it('o mouse usa o botão direito, não o toque prolongado', () => {
    const onOpen = vi.fn();
    const p = createLongPress({ onOpen });
    p.down(ev({ pointerType: 'mouse' }));
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
