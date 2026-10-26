import type { VersionRecord } from './versions';

/**
 * Histórico oficial de versões — ÚNICA fonte de dados da Central de Versões, de Ajustes → Sobre e dos Detalhes de cada app.
 *
 * Como lançar uma versão nova:
 *   1. rode `node scripts/stamp-build.mjs` para obter a compilação (DD.MM.AA.HHMMSS) e a data/hora atuais de São Paulo;
 *   2. acrescente UM registro abaixo (o mais recente pode ficar em qualquer posição: a lista é ordenada pela data de lançamento);
 *   3. escreva só as seções que tiverem conteúdo (novidades, melhorias, correções, alterações técnicas, problemas conhecidos);
 *   4. `npm run test:unit` valida o formato de versão, a compilação e as datas.
 * A versão principal muda apenas aqui, em um lançamento registrado — não a cada publicação. Cada app tem a sua própria linha do tempo.
 *
 * Os registros iniciais dos apps usam como compilação, data e hora o último commit que alterou o código de cada app no
 * repositório (America/Sao_Paulo); `commit` aponta para esse commit.
 */
export const versionRecords: readonly VersionRecord[] = [
  {
    target: 'launcher', version: '2.0.0', build: '25.10.26.232332', releaseDate: '2026-10-25', releaseTime: '23:23:32',
    novidades: [
      'Central de Versões em /versoes/, com o histórico do Launcher e de cada aplicativo.',
      'Ajustes organizados em abas: Geral, Aparência, Projetos, Offline, Atalhos, Avançado e Sobre.',
      'Início rápido, com busca, aplicativos e documentos recentes.',
      'Gerenciamento offline em cada aplicativo, na página de Detalhes.'
    ],
    melhorias: [
      'Os 15 aplicativos ficam sempre disponíveis: não é preciso ativar nem desativar nada.',
      'Instalar, atualizar, reparar e desinstalar o uso offline em um só lugar, sincronizado entre Detalhes e Ajustes.'
    ],
    alteracoesTecnicas: [
      'Versionamento independente: o Launcher e cada aplicativo têm versão (semver) e compilação (DD.MM.AA.HHMMSS) próprias.',
      'A preferência antiga de ativação é lida uma única vez e ignorada; nenhum outro dado é apagado.'
    ]
  },
  { target: 'labels', version: '1.0.0', build: '25.10.26.161502', releaseDate: '2026-10-25', releaseTime: '16:15:02', commit: 'eb7541c', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'texts', version: '1.0.0', build: '25.10.26.180914', releaseDate: '2026-10-25', releaseTime: '18:09:14', commit: '600c643',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Links em documentos e estrutura de títulos.']
  },
  { target: 'calc', version: '1.0.0', build: '25.10.26.162157', releaseDate: '2026-10-25', releaseTime: '16:21:57', commit: 'd63a665', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'images', version: '1.0.0', build: '25.10.26.162323', releaseDate: '2026-10-25', releaseTime: '16:23:23', commit: '61668ed', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'pdf', version: '1.0.0', build: '25.10.26.175018', releaseDate: '2026-10-25', releaseTime: '17:50:18', commit: 'badc025',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Anotações no PDF: desenho à mão livre e imagens.']
  },
  {
    target: 'codes', version: '1.0.0', build: '25.10.26.181535', releaseDate: '2026-10-25', releaseTime: '18:15:35', commit: 'c6ff909',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Assistente de conteúdo para códigos QR.']
  },
  {
    target: 'draw', version: '1.0.0', build: '25.10.26.180914', releaseDate: '2026-10-25', releaseTime: '18:09:14', commit: '600c643',
    novidades: ['Versão inicial registrada na Central de Versões.']
  },
  { target: 'split', version: '1.0.0', build: '24.10.26.112915', releaseDate: '2026-10-24', releaseTime: '11:29:15', commit: '8171e4d', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'calculator', version: '1.0.0', build: '25.10.26.004528', releaseDate: '2026-10-25', releaseTime: '00:45:28', commit: '627ad2c', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'colors', version: '1.0.0', build: '25.10.26.164408', releaseDate: '2026-10-25', releaseTime: '16:44:08', commit: '63add2d', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'zip', version: '1.0.0', build: '25.10.26.010744', releaseDate: '2026-10-25', releaseTime: '01:07:44', commit: '6709855', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'compare', version: '1.0.0', build: '25.10.26.010744', releaseDate: '2026-10-25', releaseTime: '01:07:44', commit: '6709855', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'code', version: '1.0.0', build: '25.10.26.172841', releaseDate: '2026-10-25', releaseTime: '17:28:41', commit: '78ac1f4', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'paint', version: '1.0.0', build: '25.10.26.170932', releaseDate: '2026-10-25', releaseTime: '17:09:32', commit: '74d1e39', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'viewer', version: '1.0.0', build: '25.10.26.174525', releaseDate: '2026-10-25', releaseTime: '17:45:25', commit: 'c93f2f3',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Visualização de imagens, áudio e vídeo.']
  }
];
