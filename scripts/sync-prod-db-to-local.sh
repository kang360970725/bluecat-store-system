#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/allen/Downloads/bluecat_store.pem}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_HOST:-49.235.145.204}"
REMOTE_DIR="${REMOTE_DIR:-/opt/bluecat-store-system}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/database-backups}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-$ROOT_DIR/.env}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"
REMOTE_MYSQLDUMP_BIN="${REMOTE_MYSQLDUMP_BIN:-mysqldump}"
MODE="${1:-sync}"

if [ "$MODE" != "sync" ] && [ "$MODE" != "--dump-only" ]; then
  echo "Usage: bash scripts/sync-prod-db-to-local.sh [--dump-only]"
  exit 1
fi

if [ ! -f "$LOCAL_ENV_FILE" ]; then
  echo "Missing local env file: $LOCAL_ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$LOCAL_ENV_FILE"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-store_system_db}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
PROD_DUMP="$BACKUP_DIR/prod-${DB_NAME}-${TIMESTAMP}.sql"
LOCAL_BACKUP="$BACKUP_DIR/local-before-prod-sync-${DB_NAME}-${TIMESTAMP}.sql"

echo "Exporting production database to $PROD_DUMP..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" \
  "REMOTE_DIR='$REMOTE_DIR' REMOTE_MYSQLDUMP_BIN='$REMOTE_MYSQLDUMP_BIN' bash -s" > "$PROD_DUMP" <<'REMOTE'
set -euo pipefail

if [ ! -f "$REMOTE_DIR/.env" ]; then
  echo "Missing $REMOTE_DIR/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$REMOTE_DIR/.env"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-store_system_db}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

MYSQL_PWD="$DB_PASSWORD" "$REMOTE_MYSQLDUMP_BIN" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --no-tablespaces \
  --set-gtid-purged=OFF \
  "$DB_NAME"
REMOTE

echo "Production dump completed."

if [ "$MODE" = "--dump-only" ]; then
  echo "Dump-only mode completed: $PROD_DUMP"
  exit 0
fi

echo "Checking local MySQL connection..."
MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --protocol=TCP \
  --execute="SELECT 1;" >/dev/null

if command -v "$MYSQLDUMP_BIN" >/dev/null 2>&1; then
  echo "Backing up local database to $LOCAL_BACKUP..."
  MYSQL_PWD="$DB_PASSWORD" "$MYSQLDUMP_BIN" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --no-tablespaces \
    --set-gtid-purged=OFF \
    "$DB_NAME" > "$LOCAL_BACKUP"
else
  echo "Skipping local backup: mysqldump not found in PATH."
fi

echo "Recreating local database $DB_NAME..."
MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --protocol=TCP \
  --execute="DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Importing production dump into local database..."
MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --protocol=TCP \
  "$DB_NAME" < "$PROD_DUMP"

echo "Local database sync completed."
echo "Production dump: $PROD_DUMP"
if [ -f "$LOCAL_BACKUP" ]; then
  echo "Local pre-sync backup: $LOCAL_BACKUP"
fi
