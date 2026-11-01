#!/usr/bin/env bash
# Baixa as capturas de tela de um commit (artifact do workflow "Coding 2.0 capturas de tela").
# Uso: scripts/dev/shots-get.sh <sha> [pasta-destino]   → imagens em <pasta>/<aparelho>/<tema>/<tela>.png
set -eu
SHA=${1:?uso: shots-get.sh <sha> [pasta]}
DEST=${2:-/tmp/capturas-$SHA}
REPO=${GITHUB_REPOSITORY:-outbassed/Coding}
ID=$(gh api "repos/$REPO/actions/artifacts?name=capturas-$SHA&per_page=1" --jq '.artifacts[0].id // empty')
[ -n "$ID" ] || { echo "Sem artifact para $SHA (a execução ainda não terminou, ou expirou em 14 dias)."; exit 1; }
mkdir -p "$DEST"
gh api "repos/$REPO/actions/artifacts/$ID/zip" > "$DEST/capturas.zip"
unzip -q -o "$DEST/capturas.zip" -d "$DEST" && rm "$DEST/capturas.zip"
echo "Capturas em $DEST"; find "$DEST" -name '*.png' | wc -l
