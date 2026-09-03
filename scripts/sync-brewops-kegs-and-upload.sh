#!/usr/bin/env bash
set -euo pipefail

repo="${AVIATORBREW_REPO:-/home/skynet/aviatorbrew/aviatorbrew-new}"
message="${1:-Update BrewOps keg sale snapshot}"

cd "$repo"

node scripts/sync-brewops-kegs.mjs

if git diff --quiet -- public/data/kegs-for-sale.json; then
  echo "$(date -Is) BrewOps keg snapshot unchanged; nothing to upload."
  exit 0
fi

npm run build

git add public/data/kegs-for-sale.json

if git diff --cached --quiet; then
  echo "$(date -Is) No staged keg snapshot changes."
  exit 0
fi

git commit -m "$message"
git push origin main
