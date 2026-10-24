import { describe, expect, it } from 'vitest';
import { StateHistory } from './history';
import { importedTimes } from '../storage/documents';

describe('desfazer genérico', () => {
  it('agrupa digitação e desfaz/refaz', () => {
    const h = new StateHistory({ v: 0 });
    h.record({ v: 1 }, 'k', 1000); h.record({ v: 2 }, 'k', 1500);
    h.record({ v: 3 }, '', 5000);
    expect(h.undo()).toEqual({ v: 2 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toEqual({ v: 2 });
    expect(h.record({ v: 2 })).toBe(false);
  });
});
describe('datas de importação', () => {
  it('preserva datas plausíveis e troca as impossíveis', () => {
    const now = 1_800_000_000_000;
    expect(importedTimes({ id: 'a', updatedAt: 1_700_000_000_000 }, now)).toEqual({ createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 });
    expect(importedTimes({ id: 'a', updatedAt: 5 }, now)).toEqual({ createdAt: now, updatedAt: now });
    expect(importedTimes({ id: 'a', updatedAt: now + 10 * 86_400_000 }, now).updatedAt).toBe(now);
    expect(importedTimes({ id: 'a', updatedAt: 1_700_000_000_000, createdAt: 1_600_000_000_000 } as never, now).createdAt).toBe(1_600_000_000_000);
  });
});
