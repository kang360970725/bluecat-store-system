#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.production.example to .env and fill production values first."
  exit 1
fi

bash scripts/verify-release-backup.sh "${DEPLOY_BACKUP_DIR:?Set DEPLOY_BACKUP_DIR to the verified production backup directory}"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

echo "Installing dependencies..."
CI=true pnpm install --frozen-lockfile --prod=false

echo "Generating Prisma Client..."
pnpm prisma:generate

echo "Checking private task evidence storage..."
pnpm --filter @bluecat/server storage:check

if [ "${DEPLOY_PREBUILT:-false}" != "true" ]; then
  echo "Building workspace sequentially..."
  pnpm --filter @bluecat/shared build
  pnpm --filter @bluecat/server build
  pnpm --filter @bluecat/web build
fi

echo "Validating release artifacts..."
test -s apps/server/dist/main.js
test -s apps/web/dist/index.html
node --check apps/server/dist/main.js

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "Applying database migrations..."
pnpm prisma:deploy

echo "Reloading PM2 process..."
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "Deployment completed."
