import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { cid, defaultStyle, demoCodes, normalizeCodes, type CodesState } from './model';

export const codesKind: DocKind<CodesState> = { type: 'codes', prefix: 'v2-codes-', appName: 'QR / Barras', normalize: normalizeCodes, label: (s) => cleanLabel(s.name, 'Códigos') };
export const codesTemplates: DocTemplate<CodesState>[] = [
  { id: 'exemplo', name: 'Exemplos', description: 'QR, EAN-13 e Code 128 prontos', create: demoCodes },
  { id: 'wifi', name: 'QR de Wi-Fi', description: 'Conecta o celular à rede ao escanear', create: () => normalizeCodes({ name: 'Wi-Fi da loja', style: { ...defaultStyle(), module: 8 }, layout: { cols: 2, gapMm: 10 }, items: [{ id: cid(), kind: 'qr', value: 'WIFI:T:WPA;S:MinhaRede;P:senha123;;', caption: 'Rede: MinhaRede', copies: 4 }] }) },
  { id: 'produtos', name: 'Produtos (EAN-13)', description: 'Três produtos com código de barras', create: () => normalizeCodes({ name: 'Produtos', style: defaultStyle(), layout: { cols: 3, gapMm: 6 }, items: ['789100000001', '789100000002', '789100000003'].map((v) => ({ id: cid(), kind: 'ean13', value: v, caption: '', copies: 3 })) }) },
  { id: 'em-branco', name: 'Em branco', description: 'Um QR code vazio para preencher', create: () => normalizeCodes({ name: 'Novo código', style: defaultStyle(), items: [{ id: cid(), kind: 'qr', value: '', caption: '', copies: 1 }] }) }
];
