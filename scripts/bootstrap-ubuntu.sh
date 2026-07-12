#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root: sudo bash scripts/bootstrap-ubuntu.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git nginx mysql-server redis-server build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

corepack enable
npm install -g pm2

systemctl enable nginx
systemctl enable mysql
systemctl enable redis-server
systemctl restart nginx
systemctl restart mysql
systemctl restart redis-server

echo "Base runtime is ready: Node $(node -v), npm $(npm -v)."
