#!/usr/bin/env bash
# Baixa as capturas de tela da CI.
#   scripts/dev/shots-get.sh <número-do-pr> [pasta]  → clona a branch espelho `ci-capturas` (funciona onde artifacts são bloqueados)
#   scripts/dev/shots-get.sh <sha> [pasta]           → baixa o artifact `capturas-<sha>` (exige acesso ao armazenamento do GitHub)
# Imagens em <pasta>/<aparelho>/<tema>/<tela>.png
set -eu
ARG=${1:?uso: shots-get.sh <pr|sha> [pasta]}
DEST=${2:-/tmp/capturas-$ARG}
REPO=${GITHUB_REPOSITORY:-outbassed/Coding}
if [[ "$ARG" =~ ^[0-9]+$ ]]; then
  REMOTE=$(git remote get-url origin 2>/dev/null || echo "https://github.com/$REPO.git")
  TMP=$(mktemp -d)
  git clone --quiet --depth 1 --branch ci-capturas --single-branch "$REMOTE" "$TMP" 2>/dev/null || { echo "Branch ci-capturas não existe ainda (o workflow precisa ter rodado neste PR)."; exit 1; }
  [ -d "$TMP/pr-$ARG" ] || { echo "Sem capturas do PR #$ARG na branch ci-capturas."; exit 1; }
  rm -rf "$DEST"; mkdir -p "$DEST"; cp -r "$TMP/pr-$ARG/." "$DEST/"; rm -rf "$TMP"
  echo "Capturas do commit $(cat "$DEST/COMMIT") em $DEST"
else
  ID=$(gh api "repos/$REPO/actions/artifacts?name=capturas-$ARG&per_page=1" --jq '.artifacts[0].id // empty')
  [ -n "$ID" ] || { echo "Sem artifact para $ARG (ainda não terminou, ou expirou em 14 dias)."; exit 1; }
  mkdir -p "$DEST"
  gh api "repos/$REPO/actions/artifacts/$ID/zip" > "$DEST/capturas.zip"
  unzip -q -o "$DEST/capturas.zip" -d "$DEST" && rm "$DEST/capturas.zip"
  echo "Capturas em $DEST"
fi
find "$DEST" -name '*.png' | wc -l
