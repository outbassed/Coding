#!/usr/bin/env bash
# Espera as checagens de um commit terminarem. Uso: scripts/dev/ci-wait.sh <sha> [regex-do-nome]
# Por padrão espera "build" (testes) e "shots" (capturas). Imprime nome|status|conclusão.
set -u
SHA=${1:?uso: ci-wait.sh <sha> [regex]}
NAMES=${2:-^(build|shots)$}
REPO=${GITHUB_REPOSITORY:-outbassed/Coding}
for _ in $(seq 1 160); do
  out=$(gh api "repos/$REPO/commits/$SHA/check-runs" --jq ".check_runs[] | select(.name|test(\"$NAMES\")) | \"\(.name)|\(.status)|\(.conclusion)\"" 2>/dev/null)
  if [ -n "$out" ] && ! echo "$out" | grep -q "in_progress\|queued\|pending\|waiting"; then echo "$out"; exit 0; fi
  sleep 30
done
echo "tempo esgotado"; echo "$out"; exit 1
