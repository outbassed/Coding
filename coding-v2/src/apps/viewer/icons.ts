import type { ViewKind } from './kinds';

/**
 * Ícones do Visualizador: traços SVG simples (24 × 24, contorno de 1,8) desenhados para este app.
 * Cada texto é uma lista de subcaminhos que começam com "M" e se separam por espaço.
 */
export const ICONS = {
  image: 'M4 5h16v14H4z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M4 17l5-5 4 4 3-3 4 4',
  svg: 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6.5 15.5L17.5 8.5 M5 5h4v4H5z',
  video: 'M3 6h13v12H3z M16 10l5-3v10l-5-3',
  audio: 'M9 18V6l10-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  pdf: 'M6 3h8l5 5v13H6z M14 3v5h5 M9 13h6 M9 17h6',
  text: 'M5 6h14 M5 10h14 M5 14h9 M5 18h12',
  file: 'M6 3h8l5 5v13H6z M14 3v5h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  sort: 'M7 4v16 M3 16l4 4 4-4 M17 20V4 M13 8l4-4 4 4',
  close: 'M6 6l12 12 M18 6L6 18',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5h.01',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 5h3v14H7z M14 5h3v14h-3z',
  prev: 'M6 5v14 M20 5L9 12l11 7z',
  next: 'M18 5v14 M4 5l11 7L4 19z',
  back10: 'M11 5L6 9l5 4 M6 9h7a5 5 0 0 1 0 10h-2',
  fwd10: 'M13 5l5 4-5 4 M18 9h-7a5 5 0 0 0 0 10h2',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6',
  repeat: 'M17 2l4 4-4 4 M3 11V9a3 3 0 0 1 3-3h15 M7 22l-4-4 4-4 M21 13v2a3 3 0 0 1-3 3H3',
  fullscreen: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  exitFullscreen: 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3 M11 8v6 M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3 M8 11h6',
  fit: 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M9 9h6v6H9z',
  actual: 'M5 5h14v14H5z M9.5 9.5l2-1v7',
  rotateLeft: 'M1 4v6h6 M3.5 15a9 9 0 1 0 2.1-9.4L1 10',
  rotateRight: 'M23 4v6h-6 M20.5 15a9 9 0 1 1-2.1-9.4L23 10',
  flipH: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  flipV: 'M3 12h18 M7 8l5-5 5 5z M7 16l5 5 5-5z',
  copy: 'M9 9h11v11H9z M15 9V4H4v11h5',
  print: 'M7 8V3h10v5 M7 17H4v-7h16v7h-3 M7 14h10v7H7z',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  panelLeft: 'M4 5h16v14H4z M9 5v14',
  panelRight: 'M4 5h16v14H4z M15 5v14',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  slideshow: 'M4 5h16v12H4z M10 8.5v5l4-2.5z M8 21h8',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10',
  checker: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  wrap: 'M4 6h16 M4 12h13a3 3 0 0 1 0 6h-4 M15 15l-3 3 3 3 M4 18h4',
  numbers: 'M10 6h11 M10 12h11 M10 18h11 M4 5l1-1v5 M3.5 14h2l-2 3h2.5',
  fontPlus: 'M4 19L9.5 5 15 19 M6 14h7 M18 5v6 M15 8h6',
  fontMinus: 'M4 19L9.5 5 15 19 M6 14h7 M15 8h6',
  json: 'M9 4c-3 0-3 2-3 4s0 3-2 4c2 1 2 2 2 4s0 4 3 4 M15 4c3 0 3 2 3 4s0 3 2 4c-2 1-2 2-2 4s0 4-3 4',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5H5V6h5',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  speed: 'M4 18a8 8 0 1 1 16 0 M12 18l4-6',
  playlist: 'M4 6h12 M4 11h12 M4 16h6 M20 13v6 M20 13l-3 1 M17 19a1.5 1.5 0 1 0 3 0',
  spin: 'M21 12a9 9 0 1 1-4-7.5 M21 4v5h-5',
  select: 'M4 4h16v16H4z M8 12.5l3 3 5-6',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  eye: 'M2.5 12C4 9 7.5 6 12 6s8 3 9.5 6c-1.5 3-5 6-9.5 6s-8-3-9.5-6z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z',
  paste: 'M9 4h6v3H9z M7 5H5v16h14V5h-2 M9 12h6 M9 16h6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5'
} as const;

export type IconName = keyof typeof ICONS;

/** Ícone de cada tipo de arquivo (biblioteca, propriedades e estados vazios). */
export const KIND_ICON: Record<ViewKind, IconName> = {
  image: 'image', svg: 'svg', video: 'video', audio: 'audio', model: 'model', pdf: 'pdf', text: 'text', unknown: 'file'
};

/** Subcaminhos de um ícone, prontos para `<path :d>`. */
export function iconPaths(name: IconName): string[] {
  return ICONS[name].split(' M').map((d, i) => (i === 0 ? d : 'M' + d));
}
