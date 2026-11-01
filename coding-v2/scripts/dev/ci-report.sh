#!/usr/bin/env bash
# Mostra o que a CI de um commit disse: passos que falharam e as anotações (resumo dos testes, avisos de layout).
# Uso: scripts/dev/ci-report.sh <sha>
set -u
SHA=${1:?uso: ci-report.sh <sha>}
REPO=${GITHUB_REPOSITORY:-outbassed/Coding}
gh api "repos/$REPO/commits/$SHA/check-runs" --jq '.check_runs[] | "\(.id)|\(.name)|\(.status)|\(.conclusion)"' | while IFS='|' read -r id name status conclusion; do
  echo "== $name: $status/$conclusion"
  case "$name" in build|shots)
    gh api "repos/$REPO/actions/jobs/$id" --jq '.steps[] | select(.conclusion!="success" and .conclusion!="skipped" and .conclusion!=null) | "  passo falhou: \(.number) \(.name) (\(.conclusion))"' 2>/dev/null
    gh api "repos/$REPO/check-runs/$id/annotations" --paginate --jq '.[] | select(.message|test("Node.js 20|ubuntu-latest")|not) | "  [\(.annotation_level)] \(.title // "") \(.message[0:3900])"' 2>/dev/null ;;
  esac
done
