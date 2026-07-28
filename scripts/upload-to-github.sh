#!/usr/bin/env bash
set -euo pipefail

message="${1:-Update Aviator Live project}"
remote="https://github.com/aviatorbrew/aviatorlive.git"

git remote remove origin >/dev/null 2>&1 || true
git remote add origin "$remote"

npm run build

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$message"
fi

git branch -M main
git push -u origin main
