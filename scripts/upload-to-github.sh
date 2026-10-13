#!/usr/bin/env bash
set -euo pipefail

message="${1:-Update AviatorBrew website}"
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
export GIT_TERMINAL_PROMPT=0

exec 9>"$(git rev-parse --git-path aviatorbrew-upload.lock)"
if ! flock -n 9; then
  echo "Another upload is already running."
  exit 0
fi

if [ "$(git branch --show-current)" != main ]; then
  echo "Upload requires the main branch." >&2
  exit 1
fi

if ! git diff --cached --quiet -- logs; then
  echo "Generated logs are staged. Unstage them before uploading." >&2
  exit 1
fi

case "$(git remote get-url --push origin)" in
  https://github.com/aviatorbrew/aviatorbrew.git|git@github.com:aviatorbrew/aviatorbrew.git) ;;
  *) echo "Upload requires origin to point to aviatorbrew/aviatorbrew." >&2; exit 1 ;;
esac

git fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Remote main has new commits. Synchronize this checkout before uploading." >&2
  exit 1
fi

if [ -z "$(git status --porcelain -- . ':(exclude)logs')" ] && [ "$(git rev-list --count origin/main..HEAD)" -eq 0 ]; then
  echo "No changes to upload."
  exit 0
fi

npm run build
echo "Verified build: $(cat .next/BUILD_ID)"

git add -A -- . ':(exclude)logs'

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$message"
fi

git push -u origin main
