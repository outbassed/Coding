export const PAGE_SIZE = 24;
/** 1 is always present. The middle and last buttons adapt to the filtered page count. */
export const pageShortcuts = (total: number): number[] => {
  const last = Math.max(1, Math.floor(total));
  return [...new Set([1, Math.ceil(last / 2), last])];
};
export const boundedPage = (page: number, total: number): number => Math.max(1, Math.min(Math.max(1, Math.floor(total)), Number.isFinite(page) ? Math.floor(page) : 1));
export const pageCount = (items: number): number => Math.max(1, Math.ceil(items / PAGE_SIZE));
