#!/usr/bin/env bash
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$repo"

if [ -z "$(git status --porcelain -- . ':(exclude)logs')" ] && [ "$(git rev-list --count origin/main..HEAD)" -eq 0 ]; then
  echo "$(date -Is) No changes to upload."
  exit 0
fi

echo "$(date -Is) Changes detected; running GitHub upload."
./scripts/upload-to-github.sh "Nightly Aviator Brew website update"
