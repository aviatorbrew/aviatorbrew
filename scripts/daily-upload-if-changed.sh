#!/usr/bin/env bash
set -euo pipefail

repo="/home/skynet/aviatorbrew/aviatorbrew-new"

cd "$repo"

if [ -z "$(git status --short)" ]; then
  echo "$(date -Is) No changes to upload."
  exit 0
fi

echo "$(date -Is) Changes detected; running GitHub upload."
./scripts/upload-to-github.sh "Daily Aviator Live update"
