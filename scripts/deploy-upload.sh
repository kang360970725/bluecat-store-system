#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/allen/Downloads/bluecat_store.pem}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_HOST:-49.235.145.204}"
REMOTE_DIR="${REMOTE_DIR:-/opt/bluecat-store-system}"
DEPLOY_BACKUP_DIR="${DEPLOY_BACKUP_DIR:?Set DEPLOY_BACKUP_DIR to the verified backup directory on the server}"
LOCAL_STAGE="$(mktemp -d)"
trap 'rm -rf -- "$LOCAL_STAGE"' EXIT
LOCAL_ARCHIVE="$LOCAL_STAGE/release.tar"
SSH_TARGET="$SSH_USER@$SSH_HOST"
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

cd "$ROOT_DIR"
echo "Building committed source off-host..."
git archive --format=tar HEAD > "$LOCAL_ARCHIVE"
mkdir "$LOCAL_STAGE/source"
tar -xf "$LOCAL_ARCHIVE" -C "$LOCAL_STAGE/source"
(
  cd "$LOCAL_STAGE/source"
  pnpm install --frozen-lockfile
  pnpm prisma:generate
  pnpm build
  test -s apps/server/dist/main.js
  test -s apps/web/dist/index.html
  node --check apps/server/dist/main.js
)

echo "Packing committed source and build artifacts..."
COPYFILE_DISABLE=1 tar -rf "$LOCAL_ARCHIVE" -C "$LOCAL_STAGE/source" apps/server/dist apps/web/dist
(cd "$LOCAL_STAGE" && shasum -a 256 release.tar > SHA256SUMS)

REMOTE_STAGE="$(ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" 'mktemp -d /tmp/bluecat-store-upload.XXXXXX')"
printf -v remote_command 'bash -s -- %q %q %q' "$REMOTE_DIR" "$REMOTE_STAGE" "$DEPLOY_BACKUP_DIR"
scp "${SSH_OPTIONS[@]}" "$LOCAL_ARCHIVE" "$LOCAL_STAGE/SHA256SUMS" "$SSH_TARGET:$REMOTE_STAGE/"

ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" "$remote_command" <<'REMOTE'
set -euo pipefail

remote_dir="$1"
stage="$2"
export DEPLOY_BACKUP_DIR="$3"
trap 'rm -rf -- "$stage"' EXIT

cd "$stage"
sha256sum --check --strict SHA256SUMS
mkdir source
tar -xf release.tar -C source
bash source/scripts/verify-release-backup.sh "$DEPLOY_BACKUP_DIR"
test -s source/apps/server/dist/main.js
test -s source/apps/web/dist/index.html
node --check source/apps/server/dist/main.js

cd "$remote_dir"
test -r .env
tar -xf "$stage/release.tar" -C "$remote_dir" --no-same-owner
DEPLOY_PREBUILT=true pnpm deploy:prod
REMOTE

echo "Upload deployment completed."
