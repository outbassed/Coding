/**
 * Imprime a compilação (DD.MM.AA.HHMMSS) e a data/hora atuais no fuso America/Sao_Paulo, prontas para um registro
 * novo em src/shared/versions-data.ts. Uso: `node scripts/stamp-build.mjs [instante ISO]`.
 */
const date = process.argv[2] ? new Date(process.argv[2]) : new Date();
if (Number.isNaN(date.getTime())) { console.error('Instante inválido.'); process.exit(1); }
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
const g = (t) => parts.find((p) => p.type === t).value;
const build = `${g('day')}.${g('month')}.${g('year').slice(-2)}.${g('hour')}${g('minute')}${g('second')}`;
console.log(`build: '${build}', releaseDate: '${g('year')}-${g('month')}-${g('day')}', releaseTime: '${g('hour')}:${g('minute')}:${g('second')}'`);
