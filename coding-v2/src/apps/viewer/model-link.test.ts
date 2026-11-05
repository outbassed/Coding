import { describe, expect, it } from 'vitest';
import { normalizeViewer } from './model';

describe('Visualizador: fontes externas no documento', () => {
  const linked = {
    id: 'f-link-1', name: 'foto.png', kind: 'image', mime: 'image/png',
    size: 0, blobId: '', sourceUrl: 'https://cdn.example.com/foto.png?rev=2'
  };

  it('preserva um link HTTPS sem criar um Blob falso', () => {
    const state = normalizeViewer({ name: 'Links', files: [linked], activeId: 'f-link-1' });
    expect(state.files).toHaveLength(1);
    expect(state.files[0]?.sourceUrl).toBe(linked.sourceUrl);
    expect(state.files[0]?.blobId).toBe('');
    expect(state.activeId).toBe('f-link-1');
    expect(normalizeViewer(state)).toEqual(state);
  });

  it('não aceita fontes perigosas nem tipos de arquivo sem suporte remoto', () => {
    for (const sourceUrl of ['javascript:alert(1)', 'http://cdn.example.com/foto.png', 'data:image/svg+xml,abc']) {
      expect(normalizeViewer({ files: [{ ...linked, sourceUrl }] }).files).toHaveLength(0);
    }
    expect(normalizeViewer({ files: [{ ...linked, kind: 'pdf' }] }).files).toHaveLength(0);
  });

  it('arquivos locais antigos continuam íntegros e não herdam um link inválido', () => {
    const local = { ...linked, blobId: 'viewer-1', sourceUrl: 'javascript:alert(1)' };
    const state = normalizeViewer({ files: [local] });
    expect(state.files[0]?.blobId).toBe('viewer-1');
    expect(state.files[0]?.sourceUrl).toBeUndefined();
  });
});
