// Resumo das capturas para a página do GitHub Actions (job summary). Uso: node scripts/dev/shots-summary.mjs [pasta]
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'shots-out';
const file = dir + '/report.jsonl';
const rows = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const flagged = rows.filter((r) => r.issues.length > 0);
const lines = [
  '## Capturas de tela',
  '',
  rows.length + ' imagens (' + [...new Set(rows.map((r) => r.device))].join(', ') + '). Baixe o artifact desta execução para ver as imagens.',
  ''
];
if (flagged.length === 0) lines.push('Nenhum aviso de rolagem inesperada.');
else {
  lines.push('### Avisos de layout (' + flagged.length + ')', '', '| Tela | Aparelho | Tema | Aviso |', '| --- | --- | --- | --- |');
  for (const r of flagged) lines.push('| ' + r.route + ' | ' + r.device + ' | ' + r.scheme + ' | ' + r.issues.join('; ') + ' |');
}
const text = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
else process.stdout.write(text);
