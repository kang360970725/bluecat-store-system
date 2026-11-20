#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/allen/Downloads/bluecat_store.pem}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_HOST:-49.235.145.204}"
REMOTE_DIR="${REMOTE_DIR:-/opt/bluecat-store-system}"
REMOTE_ARCHIVE="/tmp/bluecat-store-system-upload.tar"
LOCAL_ARCHIVE="/tmp/bluecat-store-system-upload-$(date +%Y%m%d%H%M%S).tar"

cd "$ROOT_DIR"

echo "Building and verifying artifacts off-host..."
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm build

echo "Packing project..."
COPYFILE_DISABLE=1 tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.corepack' \
  --exclude='.pnpm-store' \
  --exclude='.env' \
  --exclude='.idea' \
  --exclude='.DS_Store' \
  --exclude='database-backups' \
  --exclude='*.tsbuildinfo' \
  -cf "$LOCAL_ARCHIVE" .

echo "Uploading package to $SSH_USER@$SSH_HOST..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$LOCAL_ARCHIVE" \
  "$SSH_USER@$SSH_HOST:$REMOTE_ARCHIVE"

echo "Deploying on server..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" \
  "REMOTE_DIR='$REMOTE_DIR' REMOTE_ARCHIVE='$REMOTE_ARCHIVE' bash -s" <<'REMOTE'
set -euo pipefail

if [ ! -f "$REMOTE_DIR/.env" ]; then
  echo "Missing $REMOTE_DIR/.env. Create production env file before deploying."
  exit 1
fi

mkdir -p "$REMOTE_DIR"
cd "$REMOTE_DIR"

# Keep a recoverable server-side snapshot and overlay the new archive. Avoid
# broad pre-deploy deletion so production-only files cannot be lost silently.
BACKUP_ROOT="$REMOTE_DIR/.release-backups"
BACKUP_FILE="$BACKUP_ROOT/bluecat-store-system-before-$(date +%Y%m%d%H%M%S).tar.gz"
mkdir -p "$BACKUP_ROOT"
tar \
  --exclude='./node_modules' \
  --exclude='./.release-backups' \
  -czf "$BACKUP_FILE" .
test -s "$BACKUP_FILE"
gzip -t "$BACKUP_FILE"
echo "Created recoverable application snapshot: $BACKUP_FILE"

# Keep only this deployment's snapshot and the immediately preceding snapshot.
# Database backups live in the nested database directory and are intentionally
# managed separately.
mapfile -t OLD_APP_BACKUPS < <(
  find "$BACKUP_ROOT" -maxdepth 1 -type f \
    -name 'bluecat-store-system-before-*.tar.gz' -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n +3 \
    | cut -d' ' -f2-
)
for old_backup in "${OLD_APP_BACKUPS[@]}"; do
  rm -f -- "$old_backup"
done
echo "Retained the two most recent application snapshots."

# Historical releases may contain root-owned source files. Normalize only the
# versioned application paths, then extract as the runtime user. Dependencies,
# environment files, database dumps and release backups stay outside this fix.
# The release root itself can also be root-owned on older hosts, which prevents
# tar from atomically replacing top-level files even when those files are owned
# by the runtime user.
sudo chown "$(id -un):$(id -gn)" "$REMOTE_DIR"
for versioned_path in apps deploy docs packages prisma scripts .github; do
  if [ -e "$REMOTE_DIR/$versioned_path" ]; then
    sudo chown -R "$(id -un):$(id -gn)" "$REMOTE_DIR/$versioned_path"
  fi
done
sudo find "$REMOTE_DIR" -maxdepth 1 -type f \
  -exec chown "$(id -un):$(id -gn)" {} +
tar -xf "$REMOTE_ARCHIVE" -C "$REMOTE_DIR"
chmod 600 "$REMOTE_DIR/.env"
DEPLOY_PREBUILT=true pnpm deploy:prod
REMOTE

rm -f "$LOCAL_ARCHIVE"
echo "Upload deployment completed."
