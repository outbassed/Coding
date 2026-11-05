import { describe, expect, it } from 'vitest';
import { cleanFileName, filterFiles, kindCounts, neighborAfterRemoval, sortFiles } from './library';
import type { ViewKind } from './kinds';
import type { ViewerFile } from './model';

const f = (id: string, name: string, kind: ViewKind, size = 0): ViewerFile => ({ id, name, kind, mime: '', size, blobId: 'b' + id });
const files = [f('1', 'Relatório.pdf', 'pdf', 900), f('2', 'foto10.png', 'image', 50), f('3', 'foto2.png', 'image', 700), f('4', 'música.mp3', 'audio', 300), f('5', 'filme.mp4', 'video', 5000)];

describe('Visualizador · biblioteca', () => {
  it('pesquisa sem diferenciar maiúsculas nem acentos', () => {
    expect(filterFiles(files, 'relatorio', new Set()).map((x) => x.id)).toEqual(['1']);
    expect(filterFiles(files, 'MUSICA', new Set()).map((x) => x.id)).toEqual(['4']);
  });
  it('pesquisa também pelo nome do tipo', () => {
    expect(filterFiles(files, 'video', new Set()).map((x) => x.id)).toEqual(['5']);
    expect(filterFiles(files, 'imagem', new Set()).map((x) => x.id)).toEqual(['2', '3']);
  });
  it('filtra por tipo e combina com a pesquisa', () => {
    expect(filterFiles(files, '', new Set<ViewKind>(['image'])).map((x) => x.id)).toEqual(['2', '3']);
    expect(filterFiles(files, 'foto2', new Set<ViewKind>(['image'])).map((x) => x.id)).toEqual(['3']);
    expect(filterFiles(files, '', new Set<ViewKind>(['text']))).toEqual([]);
  });
  it('ordena por nome com números naturais', () => {
    expect(sortFiles(files, 'nome', false).map((x) => x.name)).toEqual(['filme.mp4', 'foto2.png', 'foto10.png', 'música.mp3', 'Relatório.pdf']);
  });
  it('ordena por tamanho, formato e inverte', () => {
    expect(sortFiles(files, 'tamanho', false).map((x) => x.id)).toEqual(['2', '4', '3', '1', '5']);
    expect(sortFiles(files, 'tamanho', true).map((x) => x.id)).toEqual(['5', '1', '3', '4', '2']);
    expect(sortFiles(files, 'formato', false)[0]!.kind).toBe('audio');
  });
  it('"ordem" mantém a ordem do projeto e não altera a lista original', () => {
    const before = files.map((x) => x.id);
    expect(sortFiles(files, 'ordem', false).map((x) => x.id)).toEqual(before);
    expect(sortFiles(files, 'ordem', true).map((x) => x.id)).toEqual(before.slice().reverse());
    expect(files.map((x) => x.id)).toEqual(before);
  });
  it('conta os tipos presentes na ordem dos filtros', () => {
    expect(kindCounts(files)).toEqual([{ kind: 'image', count: 2 }, { kind: 'video', count: 1 }, { kind: 'audio', count: 1 }, { kind: 'pdf', count: 1 }]);
  });
  it('limpa o nome digitado', () => {
    expect(cleanFileName('  a/b\\c  .png ')).toBe('abc .png');
    expect(cleanFileName('   ')).toBe('');
    expect(cleanFileName('x'.repeat(300))).toHaveLength(160);
  });
  it('escolhe o vizinho depois de remover', () => {
    expect(neighborAfterRemoval(['a', 'b', 'c'], 1)).toBe('c');
    expect(neighborAfterRemoval(['a', 'b', 'c'], 2)).toBe('b');
    expect(neighborAfterRemoval(['a'], 0)).toBe('');
  });
});
