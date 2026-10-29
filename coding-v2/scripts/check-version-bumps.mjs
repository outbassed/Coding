/**
 * Proteção dos releases do Versos nos Pull Requests.
 * Se o código do aplicativo mudou, a versão E a compilação precisam mudar no registro central.
 * Isso impede um deploy "novo" que continua aparecendo como a versão antiga na Central de Versões.
 *
 * Em desenvolvimento local sem GITHUB_BASE_REF, o verificador não faz nada.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.GITHUB_BASE_REF;
if (!base) {
  console.log('Versões: verificação de PR dispensada (sem branch base).');
  process.exit(0);
}

const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (!/^[a-zA-Z0-9._/-]+$/.test(base) || base.startsWith('-') || base.includes('..')) {
  throw new Error('Branch base inválida.');
}

// Checkout de CI pode ter histórico raso: buscamos apenas a árvore atual da branch base.
git('fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/' + base);
const changed = git('diff', '--name-only', 'FETCH_HEAD', 'HEAD', '--', 'coding-v2/src/apps/versos/', 'coding-v2/apps/versos/');
if (!changed) {
  console.log('Versões: nenhum código do Versos alterado neste PR.');
  process.exit(0);
}

const path = 'coding-v2/src/shared/versions-data.ts';
const current = readFileSync(new URL('../src/shared/versions-data.ts', import.meta.url), 'utf8');
let previous = '';
try { previous = git('show', 'FETCH_HEAD:' + path); } catch { /* Primeiro registro do app. */ }
const meta = (source) => {
  const match = /target:\s*['"]versos['"]\s*,\s*version:\s*['"]([^'"]+)['"]\s*,\s*build:\s*['"]([^'"]+)['"]/.exec(source);
  return match ? { version: match[1], build: match[2] } : null;
};
const oldRelease = meta(previous);
const newRelease = meta(current);
if (!newRelease) throw new Error('Versos alterado sem registro em versions-data.ts.');
if (oldRelease && (newRelease.version === oldRelease.version || newRelease.build === oldRelease.build)) {
  throw new Error('Versos alterado, mas versão e compilação não foram ambas atualizadas. Anterior: ' +
    oldRelease.version + ' / ' + oldRelease.build + ', atual: ' + newRelease.version + ' / ' + newRelease.build + '.');
}
console.log('Versos: release registrado corretamente (' + newRelease.version + ' / ' + newRelease.build + ').');
