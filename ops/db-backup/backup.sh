#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:=/backups}"
: "${BACKUP_PREFIX:=dashbo}"
: "${BACKUP_KEEP_DAYS:=14}"

if [[ -z "${PGHOST:-}" || -z "${PGUSER:-}" || -z "${PGPASSWORD:-}" || -z "${PGDATABASE:-}" ]]; then
  echo "Missing required PG* env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%d_%H%M%S)"
out="$BACKUP_DIR/${BACKUP_PREFIX}_${timestamp}.sql.gz"

echo "[db-backup] creating $out" >&2

# Plain SQL (gzipped) so restore is easy via psql.
pg_dump --no-owner --no-acl "$PGDATABASE" | gzip -9 > "$out"

# Best-effort retention: delete backups older than BACKUP_KEEP_DAYS
# (BusyBox find supports -mtime)
find "$BACKUP_DIR" -type f -name "${BACKUP_PREFIX}_*.sql.gz" -mtime "+${BACKUP_KEEP_DAYS}" -print -delete || true

echo "[db-backup] done" >&2
