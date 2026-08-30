#!/usr/bin/env bash
# Backup do SQLite do financas-casal. Instalar em /srv/backup-financas.sh
# e agendar no cron. Mesmo padrao do /srv/backup.sh (folha).
set -euo pipefail

DB="${DB:-/srv/financas/data/financas.db}"
DEST="${DEST:-/srv/backups/financas}"
RETENCAO_DIAS="${RETENCAO_DIAS:-30}"

mkdir -p "$DEST"
OUT="$DEST/financas-$(date +%Y-%m-%d_%H%M).db"

# .backup (e nao cp) eh a forma segura com o app rodando: respeita o lock do
# SQLite e nunca captura uma transacao pela metade.
sqlite3 "$DB" ".backup '$OUT'"

# Um backup corrompido que ninguem testou eh pior que backup nenhum.
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
	echo "ERRO: backup corrompido em $OUT" >&2
	exit 1
fi

gzip -f "$OUT"
find "$DEST" -name 'financas-*.db.gz' -mtime "+$RETENCAO_DIAS" -delete

echo "ok: ${OUT}.gz"
