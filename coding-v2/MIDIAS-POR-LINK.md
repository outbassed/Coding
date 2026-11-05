# Mídias por link (Visualizador 1.1.0; interface atual na 2.0 — ver VISUALIZADOR.md)

## O que faz

Na **biblioteca** do Visualizador (botão de corrente), a pessoa cola um endereço HTTPS direto de uma mídia e clica em **Abrir link**. O tipo é identificado pela extensão, inclusive com parâmetros de URL; quando não há extensão, a pessoa escolhe **Imagem**, **Vídeo** ou **Áudio**.

- Imagens: PNG, JPG, GIF, WebP, AVIF, BMP, ICO e SVG; vídeos: MP4, WebM, MOV, M4V e OGV; áudios: MP3, WAV, OGG, M4A, AAC, FLAC e OPUS, respeitando o suporte do navegador.
- O link aparece ao lado dos arquivos locais, participa da navegação e da apresentação e fica salvo no documento.
- O navegador solicita a mídia diretamente ao servidor original. O Coding não copia o arquivo automaticamente nem envia o endereço para um backend próprio.
- Para reabrir é necessário internet; remover uma mídia por link remove apenas a referência, nunca o arquivo da origem.

## Limites e segurança

- Somente URLs HTTPS, sem credenciais no endereço. Não são aceitos protocolos de script, dados locais e arquivos.
- Link direto não equivale a página de streaming: páginas de redes sociais, DRM e streams específicos não são aceitos automaticamente.
- O servidor pode bloquear acesso externo, exigir login ou usar codecs não suportados.
- O link (inclusive seus parâmetros) fica salvo no projeto local. Um backup compartilhado também pode compartilhar esse endereço. Evite tokens privados.
- Baixar e imprimir mídia por link exigem abrir uma cópia local, sem contornar permissões entre origens.
- SVG remoto é apresentado no elemento de imagem do navegador, não como documento executável.
- PDF, texto e modelos 3D por URL não são suportados nesta primeira etapa.

## Expansão futura

O validador em src/shared/media-links.ts é separado do Visualizador para permitir a integração posterior em Imagens, Pintar, Versos e outros editores. Editar ou exportar mídia remota pode exigir importação explícita com permissões adequadas, diferentemente de apenas visualizar.

Testes: src/shared/media-links.test.ts, src/apps/viewer/model-link.test.ts e a seção mídia por link em e2e/visualizador.spec.ts (na 2.0 o formulário fica na biblioteca).
