import { defaults, normalize, uid, type LabelsState } from './model';

/** Predefinição de layout: só formato (folha, colunas, espaçamento e tipografia), sem mexer nos itens. */
export type Layout = Omit<LabelsState, 'name' | 'items'>;
export interface LabelsTemplate { id: string; name: string; description: string; layout: Layout; sample: { code: string; description: string; copies: number }[] }
const base = (): Layout => { const { name: _n, items: _i, ...rest } = defaults(); void _n; void _i; return rest; };
const L = (patch: Partial<Layout>): Layout => ({ ...base(), ...patch });

export const LABEL_TEMPLATES: LabelsTemplate[] = [
  { id: 'padrao', name: 'Padrão (1 coluna)', description: 'Código grande e descrição, uma etiqueta por linha', layout: base(), sample: [{ code: '123', description: 'Sua descrição aqui', copies: 3 }] },
  { id: 'prateleira', name: 'Prateleira (2 colunas)', description: 'Endereços de estoque com borda tracejada', layout: L({ cols: 2, gap: 4, prefix: '', codeSize: 34, descSize: 14, border: true }), sample: [{ code: 'A-01', description: 'Corredor A · Nível 1', copies: 2 }, { code: 'A-02', description: 'Corredor A · Nível 2', copies: 2 }, { code: 'B-01', description: 'Corredor B · Nível 1', copies: 2 }] },
  { id: 'pequenas', name: 'Pequenas (3 colunas)', description: 'Muitas etiquetas por folha, texto compacto', layout: L({ cols: 3, gap: 2, prefix: '', codeSize: 20, descSize: 10, border: true, descAlign: 'center' }), sample: [{ code: 'PAR-08', description: 'Parafuso 8 mm', copies: 6 }, { code: 'POR-08', description: 'Porca 8 mm', copies: 6 }, { code: 'ARR-08', description: 'Arruela 8 mm', copies: 6 }] },
  { id: 'grande', name: 'Grande (paisagem)', description: 'Uma etiqueta por folha deitada, para caixas', layout: L({ orientation: 'landscape', cols: 1, gap: 0, prefix: '', codeSize: 96, descSize: 40, border: false }), sample: [{ code: 'CAIXA 01', description: 'Documentos fiscais 2026', copies: 1 }] },
  { id: 'produtos', name: 'Produtos (2 colunas, à esquerda)', description: 'Código em negrito e descrição alinhados à esquerda', layout: L({ cols: 2, gap: 5, prefix: 'REF ', codeSize: 22, descSize: 13, codeAlign: 'left', descAlign: 'left', descFont: 'Georgia' }), sample: [{ code: '7891001', description: 'Café torrado 500 g', copies: 2 }, { code: '7891002', description: 'Açúcar cristal 1 kg', copies: 2 }] }
];
export function stateFromTemplate(id: string | null): LabelsState | null {
  const t = LABEL_TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  return normalize({ ...t.layout, name: t.name.replace(/ \(.*\)$/, ''), items: t.sample.map((s) => ({ id: uid(), ...s })) });
}
