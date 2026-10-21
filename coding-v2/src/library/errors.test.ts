import { describe, expect, it } from 'vitest';
import { DuplicateCopy, MissingCopy, RevisionConflict } from '../storage/documents';
import { friendlyError } from './errors';

const named = (name: string, message = 'x'): Error => Object.assign(new Error(message), { name });

describe('mensagens de erro em português', () => {
  it('traduz os erros do armazenamento e diz que nada foi sobrescrito', () => {
    expect(friendlyError(new RevisionConflict())).toContain('Nada foi sobrescrito');
    expect(friendlyError(new DuplicateCopy())).toContain('Nada foi gravado');
    expect(friendlyError(new MissingCopy())).toContain('não existe mais');
  });
  it('cobre cota, pilha estourada (C1), versão e bloqueio do navegador', () => {
    expect(friendlyError(named('QuotaExceededError'))).toContain('cheio');
    expect(friendlyError(new RangeError('Maximum call stack size exceeded'))).toContain('anexo grande');
    expect(friendlyError(named('VersionError'))).toContain('Recarregue');
    expect(friendlyError(named('SecurityError'))).toContain('bloqueou');
    expect(friendlyError(named('AbortError'))).toContain('Nada foi alterado');
    expect(friendlyError(named('SyntaxError'))).toContain('não é um backup válido');
  });
  it('mantém mensagens já em português e não vaza inglês cru sem contexto', () => {
    expect(friendlyError(new Error('O backup está incompleto.'))).toBe('O backup está incompleto.');
    expect(friendlyError(new Error('boom'))).toMatch(/^Não foi possível concluir a operação/);
    expect(friendlyError('texto')).toMatch(/^Não foi possível/);
  });
});
