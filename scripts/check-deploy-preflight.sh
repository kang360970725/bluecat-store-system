#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf -- "$fixture"' EXIT
repo="$fixture/repo"
mkdir -p "$repo/scripts" "$fixture/bin" "$fixture/backup"
cp "$root"/scripts/{deploy-prod,deploy-upload,verify-release-backup}.sh "$repo/scripts/"
export PATH="$fixture/bin:$PATH"
export DEPLOY_BACKUP_DIR="$fixture/backup"
export DEPLOY_PREBUILT=true
export CALLS="$fixture/calls"
export ARCHIVE_LIST="$fixture/archive-list"
touch "$CALLS"

cat > "$fixture/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CALLS"
if [ "$*" = "--filter @bluecat/server storage:check" ] && [ "${FAIL_STORAGE_CHECK:-false}" = "true" ]; then
  exit 42
fi
if [ "$*" = "build" ]; then
  mkdir -p apps/server/dist apps/web/dist
  printf '%s\n' 'console.log("fixture");' > apps/server/dist/main.js
  printf '%s\n' '<html></html>' > apps/web/dist/index.html
fi
STUB
cat > "$fixture/bin/pm2" <<'STUB'
#!/usr/bin/env bash
printf 'pm2 %s\n' "$*" >> "$CALLS"
STUB
cat > "$fixture/bin/ssh" <<'STUB'
#!/usr/bin/env bash
if [[ "${*: -1}" == mktemp* ]]; then
  printf '%s\n' /tmp/bluecat-fixture-upload
else
  cat >/dev/null
fi
STUB
cat > "$fixture/bin/scp" <<'STUB'
#!/usr/bin/env bash
tar -tf "${@: -3:1}" > "$ARCHIVE_LIST"
STUB
chmod +x "$fixture/bin/"*

cd "$repo"
git init -q
git add scripts
git -c user.name=Fixture -c user.email=fixture@example.test commit -qm fixture
touch .env .env.production test-only.pem
bash scripts/deploy-upload.sh >/dev/null
grep -qx 'apps/server/dist/main.js' "$ARCHIVE_LIST"
grep -qx 'apps/web/dist/index.html' "$ARCHIVE_LIST"
if grep -Eq '(\.env|\.pem)$|\.env\.production$' "$ARCHIVE_LIST"; then
  echo 'Untracked secret fixture was included in the upload archive' >&2
  exit 1
fi

if bash scripts/deploy-prod.sh >/dev/null 2>&1; then
  echo 'Deployment unexpectedly accepted a missing backup' >&2
  exit 1
fi
(
  cd "$DEPLOY_BACKUP_DIR"
  mkdir -p apps/server/dist apps/web/dist
  touch apps/server/dist/main.js apps/web/dist/index.html
  tar -czf application.tar.gz apps
  printf '%s\n' 'CREATE TABLE `_prisma_migrations` (' '-- Dump completed on fixture' | gzip > database.sql.gz
  sha256sum application.tar.gz database.sql.gz > SHA256SUMS
)
if bash scripts/deploy-prod.sh >/dev/null 2>&1; then
  echo 'Deployment unexpectedly accepted missing artifacts' >&2
  exit 1
fi
if grep -qx 'prisma:deploy' "$CALLS"; then
  echo 'Migration ran before backup or artifact checks passed' >&2
  exit 1
fi

pnpm build
: > "$CALLS"
export FAIL_STORAGE_CHECK=true
if bash scripts/deploy-prod.sh >/dev/null 2>&1; then
  echo 'Deployment unexpectedly continued after storage preflight failure' >&2
  exit 1
fi
if grep -qx 'prisma:deploy' "$CALLS"; then
  echo 'Migration ran after storage preflight failure' >&2
  exit 1
fi
unset FAIL_STORAGE_CHECK
: > "$CALLS"
bash scripts/deploy-prod.sh >/dev/null
grep -qx -- '--filter @bluecat/server storage:check' "$CALLS"
grep -qx 'prisma:deploy' "$CALLS"
grep -qx 'pm2 startOrReload ecosystem.config.cjs --env production' "$CALLS"
storage_line="$(grep -n -m1 -x -- '--filter @bluecat/server storage:check' "$CALLS" | cut -d: -f1)"
migration_line="$(grep -n -m1 -x 'prisma:deploy' "$CALLS" | cut -d: -f1)"
if [ "$storage_line" -ge "$migration_line" ]; then
  echo 'Storage preflight did not run before database migration' >&2
  exit 1
fi
echo 'Deployment preflight regression checks passed'
