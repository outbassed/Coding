#!/usr/bin/env bash
# Endereços de pré-visualização (Cloudflare Pages / Vercel) de um PR, lidos dos comentários dos robôs.
# Uso: scripts/dev/preview-url.sh <número-do-pr>
set -u
PR=${1:?uso: preview-url.sh <pr>}
REPO=${GITHUB_REPOSITORY:-outbassed/Coding}
gh api "repos/$REPO/issues/$PR/comments" --paginate --jq '.[] | select(.user.login|test("cloudflare|vercel")) | .body' | grep -oE 'https://[A-Za-z0-9._-]+\.(pages\.dev|vercel\.app)[^ )"<]*' | sort -u
