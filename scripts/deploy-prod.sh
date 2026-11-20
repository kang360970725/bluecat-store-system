#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.production.example to .env and fill production values first."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

echo "Installing dependencies..."
pnpm install --frozen-lockfile --prod=false

echo "Generating Prisma Client..."
pnpm prisma:generate

echo "Applying database migrations..."
pnpm prisma:deploy

if [ "${DEPLOY_PREBUILT:-false}" = "true" ]; then
  echo "Using verified off-host build artifacts..."
  test -f apps/server/dist/main.js
  test -f apps/web/dist/index.html
else
  echo "Building workspace sequentially..."
  pnpm --filter @bluecat/shared build
  pnpm --filter @bluecat/server build
  pnpm --filter @bluecat/web build
fi

echo "Reloading PM2 process..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "Deployment completed."
