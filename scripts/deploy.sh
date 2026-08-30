#!/usr/bin/env bash
# Executado NO SERVIDOR (via ssh pelo GitHub Actions ou a mao).
set -euo pipefail

cd /srv/financas

git fetch --prune origin
git reset --hard origin/main

docker compose up -d --build
docker image prune -f

echo "deploy ok: $(git rev-parse --short HEAD)"
