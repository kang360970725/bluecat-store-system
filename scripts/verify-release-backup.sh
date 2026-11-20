#!/usr/bin/env bash
set -euo pipefail

backup="${1:?Provide the verified application and database backup directory}"
cd "$backup"
for file in application.tar.gz database.sql.gz SHA256SUMS; do
  if [ ! -s "$file" ]; then
    echo "Missing or empty backup file: $file" >&2
    exit 1
  fi
done

if ! awk '
  NF == 2 && length($1) == 64 && $1 !~ /[^0-9a-f]/ &&
    ($2 == "application.tar.gz" || $2 == "database.sql.gz") {
      count[$2]++
      next
  }
  { invalid = 1 }
  END { exit !(count["application.tar.gz"] == 1 && count["database.sql.gz"] == 1 && !invalid) }
' SHA256SUMS; then
  echo "Invalid backup checksum manifest" >&2
  exit 1
fi
sha256sum --check --strict SHA256SUMS
gzip -t application.tar.gz database.sql.gz

if ! tar -tzf application.tar.gz | awk '
  { sub(/^\.\//, "") }
  $0 == "apps/server/dist/main.js" { server = 1 }
  $0 == "apps/web/dist/index.html" { web = 1 }
  END { exit !(server && web) }
'; then
  echo "Application backup is missing rollback artifacts" >&2
  exit 1
fi
if ! gzip -cd database.sql.gz | awk '
  /^CREATE TABLE .*_prisma_migrations/ { ledger = 1 }
  /^-- Dump completed on / { complete = 1 }
  END { exit !(ledger && complete) }
'; then
  echo "Database backup is missing the migration ledger or completion marker" >&2
  exit 1
fi
